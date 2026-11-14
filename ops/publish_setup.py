"""One-time, user-run publication of the reviewed setup files into a GitHub PR."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
GIT = ["git", "-c", "safe.directory=" + ROOT.as_posix(), "--literal-pathspecs", "-C", str(ROOT)]
BRANCH = "ops/github-releases-20261114"


def output(*args):
    return subprocess.check_output([*GIT, *args]).decode().strip()


def main():
    if not shutil.which("gh"):
        raise RuntimeError("Install GitHub CLI and sign in first; see ops/README.md")
    # Use a privacy-preserving repository-local identity only when Git has none.
    configured = {}
    for key in ["user.name", "user.email"]:
        result = subprocess.run([*GIT, "config", "--get", key], capture_output=True, text=True)
        configured[key] = result.stdout.strip()
    if not all(configured.values()):
        profile = json.loads(subprocess.check_output(["gh", "api", "user"]))
        defaults = {"user.name": profile["login"],
                    "user.email": str(profile["id"]) + "+" + profile["login"] + "@users.noreply.github.com"}
        for key, value in defaults.items():
            if not configured[key]:
                subprocess.run([*GIT, "config", "--local", key, value], check=True)
    setup = json.loads((ROOT / "ops/setup.json").read_text())
    project = json.loads((ROOT / "ops/project.json").read_text())
    if output("branch", "--show-current") != "main":
        raise RuntimeError("Run the initial setup from main; existing work must be preserved")
    for relative, digest in setup["files"].items():
        path = ROOT / relative
        if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise RuntimeError("A prepared file changed since verification: " + relative)
    files = [*setup["files"], "ops/setup.json"]
    staged = set(output("diff", "--cached", "--name-only").splitlines())
    if staged - set(files):
        raise RuntimeError("Other work is staged. Finish that commit first; this helper will not alter it")
    subprocess.run([*GIT, "fetch", "origin", "main"], check=True)
    if subprocess.run([*GIT, "merge-base", "--is-ancestor", "origin/main", "HEAD"], capture_output=True).returncode:
        raise RuntimeError("Update main before publishing")
    subprocess.run([*GIT, "add", "--", *files], check=True)
    changed = subprocess.run([*GIT, "diff", "--cached", "--quiet", "--", *files]).returncode
    if changed:
        subprocess.run([*GIT, "commit", "--only", "-m", "Add tested Docker image releases and operator deployment", "--", *files], check=True)
    subprocess.run([*GIT, "push", "origin", "HEAD:refs/heads/" + BRANCH], check=True)
    existing = subprocess.run(["gh", "pr", "view", BRANCH, "--repo", project["repository"], "--json", "url"], capture_output=True, text=True)
    if existing.returncode == 0:
        print(json.loads(existing.stdout)["url"])
    else:
        body = "Build and test versioned backend/frontend images, publish private packages on main, and deploy by explicit operator command with backups, health checks and code-only rollback.\n\nProduction is unchanged by this pull request. Local image/application and deployment recovery tests were run; the PR workflow verifies the committed source again.\n"
        cache = ROOT / ".deploy"; cache.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=cache, prefix="pr-") as temp:
            path = Path(temp) / "body.md"; path.write_text(body)
            subprocess.run(["gh", "pr", "create", "--repo", project["repository"], "--base", "main", "--head", BRANCH,
                            "--title", "Add Docker releases and operator deployment", "--body-file", str(path)], check=True)
    print("Review/check this PR, then merge with --merge so local main can fast-forward. See ops/README.md.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.SubprocessError) as error:
        print("SETUP PUBLICATION STOPPED: " + str(error), file=sys.stderr)
        sys.exit(1)
