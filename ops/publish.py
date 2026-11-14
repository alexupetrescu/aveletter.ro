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


def require_public_repository(repository):
    request = urllib.request.Request("https://api.github.com/repos/" + repository,
        headers={"Authorization": "Bearer " + os.environ["GITHUB_TOKEN"], "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        value = json.load(response)
    if value.get("full_name") != repository or value.get("private") is not False or value.get("visibility") != "public":
        raise RuntimeError("Public image publication requires the expected source repository to remain public")


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
    if cfg.get("image_visibility") != "public":
        raise RuntimeError("Public image publication requires an explicit project policy")
    require_public_repository(cfg["repository"])
    names = {service: cfg["project"] + "-production-" + service for service in ("backend", "frontend")}
    return cfg, sha, owner, names


def login(owner):
    subprocess.run(["docker", "login", "ghcr.io", "--username", owner, "--password-stdin"],
                   input=os.environ["GITHUB_TOKEN"].encode(), check=True)


def require_public(owner, name, *, wait=False):
    for attempt in range(10 if wait else 1):
        visibility = package_visibility(owner, name)
        if visibility == "public":
            return
        if visibility is None and wait and attempt < 9:
            time.sleep(2)
            continue
        raise RuntimeError("Public package verification failed for " + name + "; reported visibility=" + str(visibility) +
                           ". No application images will be published to this destination.")


def anonymous_manifest_digest(owner, name, tag):
    """Hash the public manifest fetched independently of Docker's login."""
    query = urllib.parse.urlencode({"service": "ghcr.io", "scope": "repository:" + owner + "/" + name + ":pull"})
    request = urllib.request.Request("https://ghcr.io/token?" + query, headers={"Cache-Control": "no-cache"})
    with urllib.request.urlopen(request, timeout=30) as response:
        token = json.load(response).get("token")
    if not token:
        raise RuntimeError("Unexpected anonymous registry token response")
    request = urllib.request.Request("https://ghcr.io/v2/" + owner + "/" + name + "/manifests/" + tag,
        headers={"Authorization": "Bearer " + token, "Cache-Control": "no-cache",
                 "Accept": "application/vnd.oci.image.manifest.v1+json,application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.v2+json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read(1024 * 1024 + 1)
    if len(body) > 1024 * 1024:
        raise RuntimeError("Unexpected public registry manifest size")
    value = json.loads(body)
    if value.get("schemaVersion") != 2 or not ("config" in value or "manifests" in value):
        raise RuntimeError("The anonymous registry response is not an image manifest")
    return "sha256:" + hashlib.sha256(body).hexdigest()


def create_marker_image(tag, cfg, sha):
    # Only these two generated files enter this context. No application source.
    with tempfile.TemporaryDirectory(prefix="registry-access-") as temporary:
        root = Path(temporary)
        (root / "Dockerfile").write_text("FROM scratch\nCOPY marker /registry-access-check.txt\n")
        (root / "marker").write_text("Registry access check; no application source or credentials.\n")
        subprocess.run(["docker", "build", "--network=none", "--provenance=false", "--tag", tag,
                        "--label", "org.opencontainers.image.source=https://github.com/" + cfg["repository"],
                        "--label", "org.opencontainers.image.revision=" + sha, str(root)], check=True)


def prepare_registry():
    cfg, sha, owner, names = context()
    for name in names.values():
        if package_visibility(owner, name) not in {None, "public"}:
            raise RuntimeError("Refusing to reuse a package outside the approved public policy: " + name)
    login(owner)
    for name in names.values():
        marker = "registry-access-check"
        tag = "ghcr.io/" + owner + "/" + name + ":" + marker
        create_marker_image(tag, cfg, sha)
        subprocess.run(["docker", "push", tag], check=True)
        require_public(owner, name, wait=True)
        anonymous_manifest_digest(owner, name, marker)
        print("Public package and anonymous pull verified: " + name, flush=True)


def main():
    cfg, sha, owner, names = context()
    # Preparation must have verified both destinations before source publication.
    for name in names.values():
        require_public(owner, name)
    login(owner)
    images = {}
    for service, name in names.items():
        repository = "ghcr.io/" + owner + "/" + name
        tag = repository + ":sha-" + sha
        subprocess.run(["docker", "push", tag], check=True)
        require_public(owner, name)
        images[service] = registry_reference(repository, tag)
        if anonymous_manifest_digest(owner, name, "sha-" + sha) != images[service].split("@", 1)[1]:
            raise RuntimeError("Anonymous and authenticated manifest digests differ; no release artifact will be created")
    manifest = {"schema": 1, "project": cfg["project"], "repository": cfg["repository"], "commit": sha,
                "images": images, "image_visibility": "public", "target_ipv4": "152.228.219.231", "workflow_run_id": os.environ["GITHUB_RUN_ID"],
                "runtime_sha256": {name: hashlib.sha256((ROOT / "ops" / name).read_bytes()).hexdigest() for name in
                                   ["production_settings.py", "production_middleware.py", "production_urls.py"]},
                "built_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    (ROOT / ".release/release.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepare-registry", action="store_true", help="Verify source-free public destinations before application builds")
    args = parser.parse_args()
    prepare_registry() if args.prepare_registry else main()
