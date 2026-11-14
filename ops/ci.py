"""Run candidate images against disposable PostgreSQL and HTTP/native-library probes."""
import argparse
import json
from pathlib import Path
import re
import secrets
import subprocess
import time
import urllib.request
import urllib.parse

ROOT = Path(__file__).resolve().parent.parent


def docker(*args, **kwargs):
    return subprocess.run(["docker", *args], check=True, **kwargs)


def main():
    cfg = json.loads((ROOT / "ops/project.json").read_text())
    p = argparse.ArgumentParser(); p.add_argument("service", choices=["backend", "frontend"]); p.add_argument("image")
    p.add_argument("--backend-image")
    args = p.parse_args()
    token = "ci-" + secrets.token_hex(6); network = token + "-network"; container = token + "-app"; database = token + "-db"
    created = []
    try:
        docker("network", "create", "--internal", network, stdout=subprocess.DEVNULL)
        if args.service == "backend":
            docker("run", "-d", "--name", database, "--network", network, "--network-alias", "ci-db", "--user", "postgres",
                   "--memory=512m", "--cpus=1", "--pids-limit=128", "--tmpfs", "/tmp:size=256m,mode=1777",
                   "--tmpfs", "/var/run/postgresql:size=8m,mode=3777", "-e", "PGDATA=/tmp/pgdata",
                   "-e", "POSTGRES_USER=ci", "-e", "POSTGRES_DB=ci", "-e", "POSTGRES_PASSWORD=disposable-ci-only",
                   cfg["postgres_image"], stdout=subprocess.DEVNULL)
            created.append(database)
            for _ in range(60):
                ready = subprocess.run(["docker", "exec", database, "pg_isready", "-U", "ci"], capture_output=True)
                if ready.returncode == 0:
                    break
                time.sleep(1)
            else:
                raise RuntimeError("Disposable PostgreSQL did not become ready")
            created.append(container)
            docker("run", "--name", container, "--network", network, "--read-only", "--memory=3g", "--cpus=2", "--pids-limit=256",
                   "--cap-drop=ALL", "--security-opt=no-new-privileges:true", "--tmpfs", "/tmp:size=384m,mode=1777,exec",
                   "-e", "DJANGO_SETTINGS_MODULE=ci_settings", "-e", "CI_DATABASE_HOST=ci-db", "-e", "RUNTIME_PROJECT=" + cfg["project"],
                   "-e", "SECRET_KEY=ci-only-disposable-key-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ",
                   "-e", "DJANGO_SECRET_KEY=ci-only-disposable-key-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ", "-e", "DEBUG=False",
                   "-e", "PYTHONPATH=/tmp/test-dependencies:/app/ops:/app", "-e", "OMP_NUM_THREADS=2", "-e", "MKL_NUM_THREADS=2",
                   "--mount", "type=bind,src=" + str(ROOT / ".release/test-wheels") + ",dst=/test-wheels,readonly",
                   "--entrypoint", "python", args.image, "/app/ops/ci_backend.py")
        else:
            # SSR needs a working backend. Use a fresh, empty CI database and
            # the just-tested candidate image, never production data or URLs.
            backend_image = args.backend_image or args.image.replace("-frontend:", "-backend:")
            if backend_image == args.image:
                raise ValueError("Select the matching --backend-image for this frontend")
            docker("run", "-d", "--name", database, "--network", network, "--network-alias", "ci-db", "--user", "postgres",
                   "--memory=512m", "--cpus=1", "--pids-limit=128", "--tmpfs", "/tmp:size=256m,mode=1777",
                   "--tmpfs", "/var/run/postgresql:size=8m,mode=3777", "-e", "PGDATA=/tmp/pgdata",
                   "-e", "POSTGRES_USER=ci", "-e", "POSTGRES_DB=ci", "-e", "POSTGRES_PASSWORD=disposable-ci-only",
                   cfg["postgres_image"], stdout=subprocess.DEVNULL)
            created.append(database)
            for _ in range(60):
                ready = subprocess.run(["docker", "exec", database, "pg_isready", "-U", "ci"], capture_output=True)
                if ready.returncode == 0:
                    break
                time.sleep(1)
            else:
                raise RuntimeError("Disposable PostgreSQL did not become ready")
            subnet = json.loads(subprocess.check_output(["docker", "network", "inspect", network]))[0]["IPAM"]["Config"][0]["Subnet"]
            server = token + "-backend"; created.append(server)
            wsgi = "backend.wsgi:application" if cfg["project"] == "avestudio" else "config.wsgi:application"
            serve = "import django,os;django.setup();from django.core.management import call_command;call_command('migrate',interactive=False,verbosity=0);os.execvp('gunicorn',['gunicorn'," + repr(wsgi) + ",'--bind','0.0.0.0:" + str(cfg["backend_port"]) + "','--workers','1','--threads','2'])"
            docker("run", "-d", "--name", server, "--network", network, "--network-alias", "backend", "--read-only",
                   "--memory=1g", "--cpus=1", "--pids-limit=128", "--cap-drop=ALL", "--security-opt=no-new-privileges:true",
                   "--tmpfs", "/tmp:size=128m,mode=1777", "-e", "DJANGO_SETTINGS_MODULE=ci_settings", "-e", "CI_DATABASE_HOST=ci-db",
                   "-e", "CI_HTTP_SUBNET=" + subnet, "-e", "RUNTIME_PROJECT=" + cfg["project"],
                   "-e", "DATABASE_URL=postgresql://ci:disposable-ci-only@ci-db:5432/ci",
                   "-e", "SECRET_KEY=ci-only-disposable-key-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ",
                   "-e", "DJANGO_SECRET_KEY=ci-only-disposable-key-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ",
                   "-e", "PYTHONPATH=/app/ops:/app", "--entrypoint", "python", backend_image, "-c", serve, stdout=subprocess.DEVNULL)
            for _ in range(60):
                ready = subprocess.run(["docker", "exec", server, "python", "-c", "import socket;socket.create_connection(('127.0.0.1'," + str(cfg["backend_port"]) + "),timeout=1).close()"], capture_output=True)
                if ready.returncode == 0:
                    break
                time.sleep(1)
            else:
                raise RuntimeError("Disposable HTTP backend did not become ready")
            created.append(container)
            docker("run", "-d", "--name", container, "--network", network, "--memory=768m", "--cpus=1", "--pids-limit=128",
                   "--cap-drop=ALL", "--security-opt=no-new-privileges:true", "--tmpfs", "/tmp:size=64m,mode=1777",
                   args.image, stdout=subprocess.DEVNULL)
            probe = r'''const base='http://127.0.0.1:__PORT__';
(async()=>{const r=await fetch(base);if(r.status!==200)throw Error('Homepage HTTP '+r.status);
const text=await r.text();const m=text.match(/(?:src|href)=["']([^"']*\/_next\/static\/[^"']+\.js[^"']*)/);
if(!m)throw Error('JavaScript asset is absent');const a=await fetch(new URL(m[1],base));
if(a.status!==200||!(await a.arrayBuffer()).byteLength)throw Error('Asset HTTP check failed');
console.log('Frontend HTTP and JavaScript asset smoke passed')})().catch(e=>{console.error(e.message);process.exit(1)});
'''.replace("__PORT__", str(cfg["frontend_port"]))
            for _ in range(80):
                check = subprocess.run(["docker", "exec", container, "node", "-e", probe], capture_output=True, timeout=20)
                if check.returncode == 0:
                    print(check.stdout.decode().strip())
                    break
                if subprocess.check_output(["docker", "inspect", container, "--format", "{{.State.Running}}"]).decode().strip() != "true":
                    raise RuntimeError("Frontend exited before readiness: " + check.stderr.decode()[:500])
                time.sleep(1)
            else:
                raise RuntimeError("Frontend HTTP smoke did not become ready")
            docker("exec", container, "node", "-e", "const s=require('sharp');s({create:{width:8,height:8,channels:3,background:'#123456'}}).webp().toBuffer().then(b=>{if(!b.length)process.exit(1);console.log('Native Sharp image smoke passed')}).catch(()=>process.exit(1))")
    finally:
        for name in reversed(created):
            # Only names generated by this invocation; never prune other containers/data.
            subprocess.run(["docker", "rm", "-f", "-v", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["docker", "network", "rm", network], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


if __name__ == "__main__":
    main()
