"""Run application tests with disposable data; no production credentials or model downloads."""
import json
import importlib
import os
from pathlib import Path
import subprocess
import sys

cfg = json.loads(Path("/app/ops/project.json").read_text())
assert os.environ.get("DJANGO_SETTINGS_MODULE") == "ci_settings"
assert os.environ.get("CI_DATABASE_HOST") == "ci-db"
if cfg.get("test_wheels"):
    subprocess.run([sys.executable, "-m", "pip", "install", "--no-index", "--no-cache-dir", "--no-deps",
                    "--find-links=/test-wheels", "--require-hashes", "--requirement=/app/ops/test-requirements.lock",
                    "--target=/tmp/test-dependencies"], check=True)
    sys.path.insert(0, "/tmp/test-dependencies")
    importlib.invalidate_caches()
    import pymupdf
    assert pymupdf.VersionBind
import django
django.setup()
from django.core.management import call_command
call_command("check")
call_command("makemigrations", check=True, dry_run=True, verbosity=1)
labels = ["portfolio", "clients", "schools", "ops.tests.test_private_delivery"] if cfg["project"] == "avestudio" else []
call_command("test", *labels, interactive=False, verbosity=1)
if cfg["project"] == "avestudio":
    import torch
    from facenet_pytorch import InceptionResnetV1
    assert torch.version.cuda is None
    torch.set_num_threads(2)
    model = InceptionResnetV1(pretrained=None).eval()
    with torch.no_grad():
        result = model(torch.zeros((1, 3, 160, 160)))
    assert result.shape == (1, 512) and torch.isfinite(result).all()
    print("CPU photo-library smoke passed with random weights; no photos or model downloads")
print("Synthetic backend application tests passed")
