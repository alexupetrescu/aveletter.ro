"""Create small Docker contexts from tracked source; never copy a working tree wholesale."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parent.parent


def allowed(relative):
    p = Path(relative)
    return not any(part in {".git", "node_modules", ".next", "venv", ".venv", "__pycache__", "media", "staticfiles", "backup", "backups"}
                   or part.startswith(".env") for part in p.parts) and p.suffix.lower() not in {".pem", ".key", ".pfx", ".sqlite3", ".dump"}


def prepare():
    cfg = json.loads((ROOT / "ops/project.json").read_text())
    paths = subprocess.check_output(["git", "-c", "safe.directory=" + ROOT.as_posix(), "-C", str(ROOT), "ls-files", "-z"]).decode().split("\0")
    destination = ROOT / ".release"
    if destination.exists():
        raise RuntimeError(".release already exists; use a fresh checkout or move the prior build directory first")
    for kind in ("backend", "frontend"):
        (destination / kind).mkdir(parents=True)
    for name in filter(None, paths):
        if not allowed(name):
            continue
        path = ROOT / name
        if path.is_symlink() or not path.is_file():
            raise ValueError("Build input must be a regular tracked file: " + name)
        first = Path(name).parts[0]
        if first == "frontend":
            target = destination / "frontend" / Path(name).relative_to("frontend")
        elif first in cfg["backend_roots"]:
            relative = Path(name).relative_to("backend") if cfg["nested_backend"] else Path(name)
            target = destination / "backend" / relative
        elif first == "ops":
            target = destination / "backend" / name
        else:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
    if not (destination / "backend/manage.py").exists() or not (destination / "frontend/package-lock.json").exists():
        raise RuntimeError("Backend source or frontend dependency lock is missing")
    wheels = destination / "test-wheels"; wheels.mkdir()
    for row in cfg.get("test_wheels", []):
        req = urllib.request.Request(row["url"], headers={"User-Agent": "AveStudio-CI"})
        body = urllib.request.urlopen(req, timeout=90).read()
        if hashlib.sha256(body).hexdigest() != row["sha256"]:
            raise RuntimeError("Test-only wheel checksum differs")
        (wheels / row["file"]).write_bytes(body)
    print("Prepared tracked-source Docker contexts; production secrets/data are excluded")


if __name__ == "__main__":
    prepare()
