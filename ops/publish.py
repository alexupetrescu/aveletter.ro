"""Publish tested commit-tagged images; produce the small deployment manifest."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent.parent


def package_visibility(owner, name):
    request = urllib.request.Request(f"https://api.github.com/users/{owner}/packages/container/{name}",
        headers={"Authorization": "Bearer " + os.environ["GITHUB_TOKEN"], "Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)["visibility"]
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        raise


def registry_reference(repository, tag):
    # Inspect the registry result, not Docker's optional local RepoDigests cache.
    value = json.loads(subprocess.check_output(["docker", "buildx", "imagetools", "inspect", tag,
                                               "--format", "{{json .Manifest}}"] ))
    digest = value.get("digest", "")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
        raise RuntimeError("The registry did not return an immutable manifest digest")
    return repository + "@" + digest


def main():
    cfg = json.loads((ROOT / "ops/project.json").read_text())
    sha = os.environ["GITHUB_SHA"]
    if os.environ["GITHUB_REPOSITORY"] != cfg["repository"] or os.environ["GITHUB_REF"] != "refs/heads/main" or \
            os.environ["GITHUB_EVENT_NAME"] not in {"push", "workflow_dispatch"} or not re.fullmatch("[0-9a-f]{40}", sha):
        raise RuntimeError("Publishing is restricted to this repository's main branch")
    owner = cfg["repository"].split("/")[0]
    names = {service: cfg["project"] + "-" + service for service in ("backend", "frontend")}
    for name in names.values():
        if package_visibility(owner, name) not in {None, "private"}:
            raise RuntimeError("Refusing to publish into an existing non-private package: " + name)
    subprocess.run(["docker", "login", "ghcr.io", "--username", owner, "--password-stdin"],
                   input=os.environ["GITHUB_TOKEN"].encode(), check=True)
    images = {}
    for service, name in names.items():
        repository = "ghcr.io/" + owner + "/" + name
        tag = repository + ":sha-" + sha
        subprocess.run(["docker", "push", tag], check=True)
        visibility = package_visibility(owner, name)
        if visibility != "private":
            raise RuntimeError("Private package verification failed for " + name + "; reported visibility=" + str(visibility) +
                               ". No further service images will be published.")
        images[service] = registry_reference(repository, tag)
    manifest = {"schema": 1, "project": cfg["project"], "repository": cfg["repository"], "commit": sha,
                "images": images, "target_ipv4": "152.228.219.231", "workflow_run_id": os.environ["GITHUB_RUN_ID"],
                "runtime_sha256": {name: hashlib.sha256((ROOT / "ops" / name).read_bytes()).hexdigest() for name in
                                   ["production_settings.py", "production_middleware.py", "production_urls.py"]},
                "built_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    (ROOT / ".release/release.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
