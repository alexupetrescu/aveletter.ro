"""Windows release controller. All privileged actions run in the operator's SSH terminal."""
import argparse
import base64
import json
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
OPS = ROOT / "ops"
REMOTE = "/home/alejandro/avestudio-deploy"
SSH = ["ssh", "-F", str(OPS / "ssh.conf"), "avestudio-production"]


def upload(name, content):
    if not re.fullmatch(r"(?:deploy_vps\.py|[0-9a-f]{40}\.json)", name):
        raise ValueError("Unexpected upload filename")
    code = "import pathlib,base64,os\nroot=pathlib.Path(" + repr(REMOTE) + ")\n"
    code += "root.mkdir(mode=0o700,parents=True,exist_ok=True)\nroot.chmod(0o700)\n"
    code += "p=root/" + repr(name) + "\nt=p.with_name(p.name+'.upload')\n"
    code += "t.write_bytes(base64.b64decode(" + repr(base64.b64encode(content).decode()) + "))\n"
    code += "t.chmod(0o600)\nos.replace(t,p)\n"
    subprocess.run([*SSH, "python3 -"], input=code.encode(), check=True)


def operator(*args):
    command = "sudo -- /usr/local/sbin/avestudio-deploy " + " ".join(shlex.quote(str(a)) for a in args)
    subprocess.run([*SSH[:1], "-tt", *SSH[1:], command], check=True)


def release(cfg, commit):
    if not shutil.which("gh"):
        raise RuntimeError("Install GitHub CLI and run gh auth login; see ops/README.md")
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("Use a full 40-character commit SHA")
    runs = json.loads(subprocess.check_output(["gh", "run", "list", "--repo", cfg["repository"], "--workflow", "release.yml",
        "--commit", commit, "--limit", "20", "--json", "databaseId,headSha,headBranch,event,conclusion"]))
    matches = [r for r in runs if r["headSha"] == commit and r["headBranch"] == "main" and r["conclusion"] == "success"
               and r["event"] in {"push", "workflow_dispatch"}]
    if not matches:
        raise RuntimeError("No successful published main-branch release exists for this commit; check GitHub Actions")
    selected = matches[0]
    cache = ROOT / ".deploy"; cache.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=cache, prefix="artifact-") as temporary:
        subprocess.run(["gh", "run", "download", str(selected["databaseId"]), "--repo", cfg["repository"],
                        "--name", "release-" + cfg["project"], "--dir", temporary], check=True)
        paths = list(Path(temporary).iterdir())
        if len(paths) != 1 or paths[0].name != "release.json" or paths[0].is_symlink() or paths[0].stat().st_size > 32768:
            raise ValueError("Unexpected GitHub release artifact")
        content = paths[0].read_bytes(); value = json.loads(content)
    if value.get("commit") != commit or value.get("repository") != cfg["repository"] or value.get("project") != cfg["project"] or \
            str(value.get("workflow_run_id")) != str(selected["databaseId"]) or value.get("target_ipv4") != "152.228.219.231":
        raise ValueError("GitHub run and release artifact differ")
    if set(value.get("images", {})) != {"backend", "frontend"}:
        raise ValueError("Incomplete image release")
    for service, image in value["images"].items():
        if not re.fullmatch(r"ghcr\.io/alexupetrescu/" + cfg["project"] + "-production-" + service + r"@sha256:[0-9a-f]{64}", image):
            raise ValueError("Unexpected registry image reference")
    (cache / (commit + ".json")).write_bytes(content)
    upload(commit + ".json", content)
    return REMOTE + "/" + commit + ".json"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["setup", "plan", "deploy", "rollback"])
    parser.add_argument("--commit", help="Full release commit; defaults to this checkout's HEAD")
    parser.add_argument("--service", choices=["all", "frontend", "backend"], default="all")
    parser.add_argument("--migrate", action="store_true", help="Explicitly permit reviewed database migrations under maintenance")
    parser.add_argument("--login", action="store_true", help="Prompt for a replacement registry read token during setup")
    args = parser.parse_args()
    cfg = json.loads((OPS / "project.json").read_text())
    if args.action == "setup":
        upload("deploy_vps.py", (OPS / "deploy_vps.py").read_bytes())
        command = "sudo -- python3 " + shlex.quote(REMOTE + "/deploy_vps.py") + " --install" + (" --login" if args.login else "")
        subprocess.run([*SSH[:1], "-tt", *SSH[1:], command], check=True)
    elif args.action == "rollback":
        operator("--project", cfg["project"], "--rollback")
    else:
        if args.commit:
            commit = args.commit
        else:
            dirty = subprocess.check_output(["git", "-c", "safe.directory=" + ROOT.as_posix(), "-C", str(ROOT), "status", "--porcelain", "--untracked-files=no"]).decode().strip()
            if dirty:
                raise RuntimeError("Tracked changes are uncommitted. Commit/push first, or explicitly select a published --commit")
            commit = subprocess.check_output(["git", "-c", "safe.directory=" + ROOT.as_posix(), "-C", str(ROOT), "rev-parse", "HEAD"]).decode().strip()
        remote = release(cfg, commit)
        flags = ["--project", cfg["project"], "--release", remote, "--service", args.service]
        if args.action == "plan":
            flags += ["--plan"]
        elif args.migrate:
            flags += ["--migrate"]
        print("Selected " + cfg["project"] + " release " + commit, flush=True)
        operator(*flags)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, subprocess.SubprocessError) as error:
        print("RELEASE CONTROLLER STOPPED: " + str(error), file=sys.stderr)
        sys.exit(1)
