"""Publish tested commit-tagged images; produce the small deployment manifest."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
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


def context():
    cfg = json.loads((ROOT / "ops/project.json").read_text())
    sha = os.environ["GITHUB_SHA"]
    if os.environ["GITHUB_REPOSITORY"] != cfg["repository"] or os.environ["GITHUB_REF"] != "refs/heads/main" or \
            os.environ["GITHUB_EVENT_NAME"] not in {"push", "workflow_dispatch"} or not re.fullmatch("[0-9a-f]{40}", sha):
        raise RuntimeError("Publishing is restricted to this repository's main branch")
    owner = cfg["repository"].split("/")[0]
    if cfg["project"] not in {"avestudio", "aveletter", "lunador"} or owner != "alexupetrescu":
        raise RuntimeError("Unexpected production registry owner or project")
    names = {service: cfg["project"] + "-production-" + service for service in ("backend", "frontend")}
    return cfg, sha, owner, names


def login(owner):
    subprocess.run(["docker", "login", "ghcr.io", "--username", owner, "--password-stdin"],
                   input=os.environ["GITHUB_TOKEN"].encode(), check=True)


def require_private(owner, name, *, wait=False):
    for attempt in range(10 if wait else 1):
        visibility = package_visibility(owner, name)
        if visibility == "private":
            return
        if visibility is None and wait and attempt < 9:
            time.sleep(2)
            continue
        raise RuntimeError("Private package verification failed for " + name + "; reported visibility=" + str(visibility) +
                           ". No application images will be published to this destination.")


def anonymous_access_denied(owner, name, tag):
    """Check with an anonymous registry token, independent of Docker's login."""
    query = urllib.parse.urlencode({"service": "ghcr.io", "scope": "repository:" + owner + "/" + name + ":pull"})
    request = urllib.request.Request("https://ghcr.io/token?" + query, headers={"Cache-Control": "no-cache"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            token = json.load(response).get("token")
        if not token:
            raise RuntimeError("Unexpected anonymous registry token response")
        request = urllib.request.Request("https://ghcr.io/v2/" + owner + "/" + name + "/manifests/" + tag,
            headers={"Authorization": "Bearer " + token, "Cache-Control": "no-cache",
                     "Accept": "application/vnd.oci.image.manifest.v1+json,application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.v2+json"})
        with urllib.request.urlopen(request, timeout=30) as response:
            response.read(1)
        raise RuntimeError("Registry permitted anonymous access to " + name + "; private publication is stopped")
    except urllib.error.HTTPError as error:
        if error.code in {401, 403, 404}:
            return
        raise


def create_marker_image(tag, cfg, sha):
    # Only these two generated files enter this context. No application source.
    with tempfile.TemporaryDirectory(prefix="registry-access-") as temporary:
        root = Path(temporary)
        (root / "Dockerfile").write_text("FROM scratch\nCOPY marker /registry-access-check.txt\n")
        (root / "marker").write_text("Private registry access check; no application source or credentials.\n")
        subprocess.run(["docker", "build", "--network=none", "--provenance=false", "--tag", tag,
                        "--label", "org.opencontainers.image.source=https://github.com/" + cfg["repository"],
                        "--label", "org.opencontainers.image.revision=" + sha, str(root)], check=True)


def prepare_registry():
    cfg, sha, owner, names = context()
    for name in names.values():
        if package_visibility(owner, name) not in {None, "private"}:
            raise RuntimeError("Refusing to publish into an existing non-private package: " + name)
    login(owner)
    for name in names.values():
        marker = "registry-access-check"
        tag = "ghcr.io/" + owner + "/" + name + ":" + marker
        create_marker_image(tag, cfg, sha)
        subprocess.run(["docker", "push", tag], check=True)
        require_private(owner, name, wait=True)
        anonymous_access_denied(owner, name, marker)
        print("Private package and anonymous-access rejection verified: " + name, flush=True)


def main():
    cfg, sha, owner, names = context()
    # Preparation must have verified both destinations before source publication.
    for name in names.values():
        require_private(owner, name)
    login(owner)
    images = {}
    for service, name in names.items():
        repository = "ghcr.io/" + owner + "/" + name
        tag = repository + ":sha-" + sha
        subprocess.run(["docker", "push", tag], check=True)
        require_private(owner, name)
        anonymous_access_denied(owner, name, "sha-" + sha)
        images[service] = registry_reference(repository, tag)
    manifest = {"schema": 1, "project": cfg["project"], "repository": cfg["repository"], "commit": sha,
                "images": images, "target_ipv4": "152.228.219.231", "workflow_run_id": os.environ["GITHUB_RUN_ID"],
                "runtime_sha256": {name: hashlib.sha256((ROOT / "ops" / name).read_bytes()).hexdigest() for name in
                                   ["production_settings.py", "production_middleware.py", "production_urls.py"]},
                "built_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    (ROOT / ".release/release.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepare-registry", action="store_true", help="Verify source-free private destinations before application builds")
    args = parser.parse_args()
    prepare_registry() if args.prepare_registry else main()
