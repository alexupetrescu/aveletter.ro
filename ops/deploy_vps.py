#!/usr/bin/python3
"""Operator-run image releases for the migrated VPS. Never restores a database."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import socket
import ssl
import subprocess
import sys
import time

TARGET = "152.228.219.231"
PROJECTS = {"avestudio": ("avestudio", "avestudio_db"), "aveletter": ("aveletter.ro", "aveletter"), "lunador": ("lunador.ro", "lunador")}
STATE = Path("/var/lib/avestudio-deploy")
INSTALL_PATH = Path("/usr/local/sbin/avestudio-deploy")
PUBLIC_DOCKER_CONFIG = STATE / "public-registry"
APP_ROOT = Path("/srv")
BACKUP_STATE = Path("/var/lib/avestudio-production-backup/status.json")
NGINX = Path("/etc/nginx/sites-available/avestudio-staging")
MARKERS = Path("/run/avestudio-maintenance")
LOG = None
PG = ["docker", "compose", "--project-name", "avestudio-postgres", "--env-file", "/etc/avestudio-infra/postgres/image.env",
      "--file", "/srv/postgres/compose.yml", "exec", "-T", "--user", "postgres", "postgres"]


def atomic(path, body, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".new-" + secrets.token_hex(12))
    fd = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, "wb") as out:
        os.fchmod(out.fileno(), mode)
        out.write(body if isinstance(body, bytes) else body.encode()); out.flush(); os.fsync(out.fileno())
    os.replace(temporary, path)


def run(args, *, data=None, output=None, check=True, timeout=300):
    result = subprocess.run(args, input=data, stdout=output or subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if result.returncode and check:
        if LOG:
            with LOG.open("ab") as log:
                log.write(("Command: " + " ".join(args) + "\n").encode())
                log.write((result.stdout or b"") + result.stderr + b"\n")
        raise RuntimeError("A release command failed; see the root-only log")
    return result


def compose(project, *args, file=None):
    return ["docker", "compose", "--project-name", project + "-staging", "--project-directory", "/srv/" + project,
            "--env-file", f"/etc/avestudio-infra/{project}-staging/release.env", "--file",
            str(file or Path("/srv") / project / "staging.compose.yml"), *args]


def guard():
    if os.geteuid() != 0 or socket.gethostname() != "avestudio-ro":
        raise RuntimeError("Run with sudo on the new production VPS")
    rows = json.loads(run(["ip", "-j", "address", "show", "dev", "ens3"]).stdout)
    if TARGET not in {a["local"] for row in rows for a in row.get("addr_info", [])}:
        raise RuntimeError("Wrong VPS address")
    authority = json.loads(Path("/etc/avestudio-infra/operations/authority.json").read_text())
    if not all(authority.get(flag) is True for flag in ["authoritative", "source_web_frozen", "source_email_worker_stopped", "mail_outbound_ready"]):
        raise RuntimeError("Production authority is incomplete")


def manifest(path, project):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 32768:
        raise ValueError("Unexpected release manifest")
    value = json.loads(path.read_text())
    repository = "alexupetrescu/" + PROJECTS[project][0]
    if value.get("schema") != 1 or value.get("image_visibility") != "public" or value.get("project") != project or value.get("repository") != repository or \
            value.get("target_ipv4") != TARGET or not re.fullmatch(r"[0-9a-f]{40}", value.get("commit", "")) or \
            set(value.get("images", {})) != {"frontend", "backend"}:
        raise ValueError("Release project/repository/commit differs")
    for service, reference in value["images"].items():
        if not re.fullmatch(r"ghcr\.io/alexupetrescu/" + project + "-production-" + service + r"@sha256:[0-9a-f]{64}", reference):
            raise ValueError("An image is not an immutable digest in the expected registry package")
    return value


def fresh_backup():
    value = json.loads(BACKUP_STATE.read_text())
    success = value.get("last_success", {})
    age = dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(success["completed_at_utc"])
    if not dt.timedelta(0) <= age <= dt.timedelta(hours=26) or not re.fullmatch(r"[0-9a-f]{8,64}", success.get("snapshot_id", "")):
        raise RuntimeError("A successful off-host production backup within 26 hours is required")


def image_checks(reference, release):
    data = json.loads(run(["docker", "image", "inspect", reference]).stdout)[0]
    labels = data["Config"].get("Labels") or {}
    if labels.get("org.opencontainers.image.revision") != release["commit"] or \
            labels.get("org.opencontainers.image.source") != "https://github.com/" + release["repository"]:
        raise ValueError("Image source/revision labels differ from the release")
    return data["Id"]


def desired_config(project, release, services, before):
    value = json.loads(before)
    if "backend" not in value["services"] or "frontend" not in value["services"]:
        raise ValueError("Expected the existing production services")
    for service in services:
        value["services"][service]["image"] = release["images"][service]
    if project == "aveletter" and "backend" in services:
        if "email-worker" not in value["services"]:
            raise ValueError("The existing single email worker is missing")
        value["services"]["email-worker"]["image"] = release["images"]["backend"]
    return value


def runtime_matches(value, release):
    expected = release.get("runtime_sha256", {})
    names = {"production_settings.py", "production_middleware.py", "production_urls.py"}
    if set(expected) != names:
        raise ValueError("The release is missing its production adapter hashes")
    roots = [row["source"] for row in value["services"]["backend"].get("volumes", [])
             if isinstance(row, dict) and row.get("type") == "bind" and row.get("target") == "/run/production-runtime"]
    if len(roots) != 1:
        raise ValueError("The existing production adapter mount is missing")
    for name, digest in expected.items():
        if hashlib.sha256((Path(roots[0]) / name).read_bytes()).hexdigest() != digest:
            raise RuntimeError("A production adapter update needs a separate reviewed configuration release")


def worker_running(project):
    if project != "aveletter":
        return False
    ids = run(compose(project, "--profile", "outbound", "ps", "-q", "email-worker")).stdout.decode().split()
    if len(ids) > 1:
        raise RuntimeError("More than one order email worker is running; inspect before releasing")
    return len(ids) == 1


def verify_worker(project):
    ids = run(compose(project, "--profile", "outbound", "ps", "-q", "email-worker")).stdout.decode().split()
    if len(ids) != 1:
        raise RuntimeError("The order email worker did not return as a single running container")
    row = json.loads(run(["docker", "inspect", ids[0]]).stdout)[0]
    backend = run(compose(project, "ps", "-q", "backend")).stdout.decode().strip()
    expected = json.loads(run(["docker", "inspect", backend]).stdout)[0]["Image"]
    if not row["State"]["Running"] or row["State"].get("OOMKilled") or row["Image"] != expected:
        raise RuntimeError("The order worker is not running the accepted backend image")


def photo_jobs_idle(project):
    if project == "avestudio":
        count = run([*PG, "psql", "-XAt", "-U", "postgres", "-d", "avestudio_db", "-c",
                     "SELECT count(*) FROM public.schools_facejob WHERE status IN ('pending','queued','running');"]).stdout.decode().strip()
        if count != "0":
            raise RuntimeError("Photo processing is active; deploy the backend after jobs finish")


def verify_web(project):
    host = project + ".ro"
    for path in ("/", "/api/health/"):
        deadline = time.monotonic() + 40
        while True:
            try:
                with socket.create_connection(("127.0.0.1", 443), timeout=6) as sock, \
                        ssl.create_default_context().wrap_socket(sock, server_hostname=host) as connection:
                    connection.sendall(f"GET {path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n".encode())
                    header = connection.recv(8192)
                    if int(header.split(b" ", 2)[1]) == 200:
                        break
            except (OSError, ValueError, IndexError):
                pass
            if time.monotonic() >= deadline:
                raise RuntimeError("Production HTTPS/health check failed")
            time.sleep(1)


def maintenance(project, enabled):
    marker = MARKERS / project
    MARKERS.mkdir(mode=0o755, parents=True, exist_ok=True)
    MARKERS.chmod(0o755)
    if enabled:
        # Match each host independently even when an HTTP server block is shared.
        mapping = "map $host $avestudio_maintenance_file {\n    default /run/avestudio-maintenance/disabled;\n"
        for p in PROJECTS:
            hosts = [p + ".ro", "www." + p + ".ro"]
            hosts += ["api.avestudio.ro", "admin.avestudio.ro"] if p == "avestudio" else []
            hosts += ["new.aveletter.ro"] if p == "aveletter" else []
            for host in hosts:
                mapping += f"    {host} /run/avestudio-maintenance/{p};\n"
        mapping += "}\n"
        mapfile = Path("/etc/nginx/conf.d/avestudio-release-maintenance.conf")
        check = "    if (-f $avestudio_maintenance_file) { return 503; }"
        before = NGINX.read_bytes(); prior_map = mapfile.read_bytes() if mapfile.exists() else None
        text = before.decode()
        if "$avestudio_maintenance_file" not in text:
            lines = []
            for line in text.splitlines():
                lines.append(line)
                if line.strip().startswith("server_name "):
                    lines.append(check)
            if len(lines) == len(text.splitlines()):
                raise RuntimeError("Nginx server declarations need review")
            text = "\n".join(lines) + "\n"
        atomic(mapfile, mapping, 0o644); atomic(NGINX, text, 0o644)
        try:
            run(["nginx", "-t"]); run(["systemctl", "reload", "nginx"])
        except BaseException:
            atomic(NGINX, before, 0o644)
            if prior_map is None:
                mapfile.unlink()
            else:
                atomic(mapfile, prior_map, 0o644)
            raise
        atomic(marker, "maintenance\n", 0o644)
    elif marker.exists():
        marker.unlink()


def start(project, services, worker):
    for service in ("backend", "frontend"):
        if service in services:
            run(compose(project, "up", "-d", "--no-deps", "--wait", "--wait-timeout", "180", service), timeout=240)
    if worker and "backend" in services:
        run(compose(project, "--profile", "outbound", "up", "-d", "--no-deps", "email-worker"))
        verify_worker(project)


def restore_static(project, folder):
    archive = folder / "static-before.tar.gz"
    if archive.exists():
        run(["tar", "--extract", "--gzip", "--file", str(archive), "--directory",
             str(APP_ROOT / project / "shared/static"), "--no-overwrite-dir"])


def deploy(args):
    global LOG
    project = args.project
    root = STATE / project; root.mkdir(parents=True, exist_ok=True); root.chmod(0o700)
    with (STATE / "lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        release = manifest(Path(args.release), project)
        services = ["backend", "frontend"] if args.service == "all" else [args.service]
        active = APP_ROOT / project / "staging.compose.yml"
        original = active.read_bytes()
        if (MARKERS / project).exists():
            raise RuntimeError("This project is already in release maintenance; inspect the prior failed migration")
        runid = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + secrets.token_hex(4)
        folder = root / runid; folder.mkdir(mode=0o700); LOG = folder / "release.log"
        atomic(LOG, "Release " + release["commit"] + "\n")
        atomic(folder / "previous.compose.yml", original)
        atomic(folder / "release.json", json.dumps(release, indent=2) + "\n")
        if shutil.disk_usage(root).free < 8 * 1024**3:
            raise RuntimeError("Less than 8 GiB free before image download")
        for service in services:
            print("Downloading and checking " + project + "/" + service, flush=True)
            run(["docker", "--config", str(PUBLIC_DOCKER_CONFIG), "pull", release["images"][service]], timeout=1200)
            image_checks(release["images"][service], release)
        before = run(compose(project, "--profile", "outbound", "config", "--no-env-resolution", "--format", "json")).stdout
        value = desired_config(project, release, services, before)
        if "backend" in services:
            runtime_matches(value, release)
        desired = folder / "candidate.compose.json"
        atomic(desired, json.dumps(value, indent=2) + "\n")
        run(compose(project, "--profile", "outbound", "config", "--quiet", file=desired))
        pending = False
        if "backend" in services:
            check = compose(project, "run", "--rm", "--no-deps", "-T", "-e", "RUNTIME_EMAIL_ENABLED=0", "-e", "RUNTIME_BILLING_ENABLED=0",
                            "-e", "RUNTIME_DRIVE_ENABLED=0", "--entrypoint", "python", "backend", "manage.py", file=desired)
            run([*check, "check", "--deploy"])
            status = run([*check, "migrate", "--check"], check=False)
            if status.returncode not in (0, 1):
                raise RuntimeError("Migration readiness check failed")
            pending = status.returncode == 1
            if pending:
                plan = run([*check, "migrate", "--plan"]).stdout
                print(plan.decode()[:20000])
        if args.plan:
            print(json.dumps({"status": "release-plan-ready", "project": project, "commit": release["commit"],
                              "services": services, "schema_migrations_pending": pending, "production_changed": False}, indent=2))
            return
        if pending and not args.migrate:
            raise RuntimeError("Review the migration plan, then explicitly use --migrate for a schema release")
        fresh_backup()
        if shutil.disk_usage(root).free < 8 * 1024**3:
            raise RuntimeError("Image download left less than 8 GiB headroom")
        if "backend" in services:
            photo_jobs_idle(project)
        database = PROJECTS[project][1]
        if "backend" in services:
            with (folder / "before.postgres.dump").open("wb") as output:
                run([*PG, "pg_dump", "-U", "postgres", "--format=custom", "--dbname=" + database], output=output)
            static = APP_ROOT / project / "shared/static"
            if static.is_dir():
                run(["tar", "--create", "--gzip", "--file", str(folder / "static-before.tar.gz"), "--directory", str(static), "."])
        worker = worker_running(project)
        journal = {"status": "applying", "project": project, "commit": release["commit"], "services": services,
                   "worker_was_running": worker, "migration_started": False, "run_id": runid}
        def save():
            atomic(folder / "status.json", json.dumps(journal, indent=2) + "\n")
        save()
        try:
            if worker and "backend" in services:
                run(compose(project, "--profile", "outbound", "stop", "email-worker"))
            if pending:
                maintenance(project, True)
                run(compose(project, "stop", "backend", "frontend"))
                atomic(active, desired.read_bytes())
                journal["migration_started"] = True; save()
                print("Applying the explicitly requested schema migrations under maintenance", flush=True)
                run([*check, "migrate", "--noinput"], timeout=1200)
            else:
                atomic(active, desired.read_bytes())
            if "backend" in services:
                run([*check, "collectstatic", "--noinput"], timeout=300)
            start(project, services, False)
            maintenance(project, False)
            verify_web(project)
            if worker and "backend" in services:
                run(compose(project, "--profile", "outbound", "up", "-d", "--no-deps", "email-worker"))
                verify_worker(project)
            journal.update(status="deployed", active_compose_sha256=hashlib.sha256(active.read_bytes()).hexdigest(),
                           completed_at_utc=dt.datetime.now(dt.timezone.utc).isoformat())
            save(); atomic(root / "current.json", json.dumps(journal, indent=2) + "\n")
            print("DEPLOYED " + project + " " + release["commit"])
        except BaseException:
            if not journal["migration_started"]:
                atomic(active, original)
                restore_static(project, folder)
                start(project, services, worker)
                journal["status"] = "previous-images-restored"
                save()
                print("The prior images/configuration were restored; current database and media retained.", file=sys.stderr)
            else:
                maintenance(project, True)
                journal["status"] = "schema-release-needs-repair"; save()
                print("Schema release stopped. Keep this project in maintenance; inspect " + str(LOG), file=sys.stderr)
            raise


def rollback(project):
    global LOG
    root = STATE / project
    with (STATE / "lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        current = json.loads((root / "current.json").read_text())
        if current["status"] != "deployed" or current.get("migration_started") or not re.fullmatch(r"[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}", current["run_id"]):
            raise RuntimeError("Automatic image rollback is available only for the most recent code-only release")
        LOG = root / current["run_id"] / "rollback.log"
        atomic(LOG, "Operator image rollback\n")
        active = APP_ROOT / project / "staging.compose.yml"
        if hashlib.sha256(active.read_bytes()).hexdigest() != current["active_compose_sha256"]:
            raise RuntimeError("The active configuration changed since this release")
        if "backend" in current["services"]:
            photo_jobs_idle(project)
        if current["worker_was_running"] and "backend" in current["services"]:
            run(compose(project, "--profile", "outbound", "stop", "email-worker"))
        atomic(active, (root / current["run_id"] / "previous.compose.yml").read_bytes())
        restore_static(project, root / current["run_id"])
        start(project, current["services"], current["worker_was_running"])
        verify_web(project)
        current["status"] = "rolled-back"
        atomic(root / "current.json", json.dumps(current, indent=2) + "\n")
        print("ROLLED BACK images for " + project + "; current database/media retained")


def install():
    # Windows checkouts may use CRLF; the installed Linux shebang needs LF.
    atomic(INSTALL_PATH, Path(__file__).read_bytes().replace(b"\r\n", b"\n"), 0o755)
    STATE.mkdir(parents=True, exist_ok=True); STATE.chmod(0o700)
    PUBLIC_DOCKER_CONFIG.mkdir(parents=True, exist_ok=True); PUBLIC_DOCKER_CONFIG.chmod(0o700)
    atomic(PUBLIC_DOCKER_CONFIG / "config.json", '{"auths":{}}\n')
    print("DEPLOYMENT HELPER INSTALLED. Public images need no registry token; production images are unchanged.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--install", action="store_true")
    parser.add_argument("--project", choices=list(PROJECTS))
    parser.add_argument("--release")
    parser.add_argument("--plan", action="store_true")
    parser.add_argument("--migrate", action="store_true")
    parser.add_argument("--rollback", action="store_true")
    parser.add_argument("--service", choices=["all", "frontend", "backend"], default="all")
    args = parser.parse_args()
    guard()
    def interrupted(number, frame):
        raise RuntimeError("Operator connection interrupted during release")
    for number in (signal.SIGHUP, signal.SIGTERM):
        signal.signal(number, interrupted)
    os.umask(0o077)
    if args.install:
        install()
    elif args.project and args.rollback:
        rollback(args.project)
    elif args.project and args.release:
        deploy(args)
    else:
        parser.error("Use --install or select a project and release/rollback")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("DEPLOYMENT STOPPED: " + str(error), file=sys.stderr)
        if LOG:
            print("Root-only log: " + str(LOG), file=sys.stderr)
        sys.exit(1)
