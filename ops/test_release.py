"""Synthetic release-policy and recovery tests; no Docker socket or production files."""
import copy
import datetime as dt
import importlib.util
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("deployment", HERE / "deploy_vps.py")
deployment = importlib.util.module_from_spec(spec); spec.loader.exec_module(deployment)
spec = importlib.util.spec_from_file_location("context", HERE / "build_context.py")
context = importlib.util.module_from_spec(spec); spec.loader.exec_module(context)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.state = self.root / "state"; self.state.mkdir()
        self.app = self.root / "srv"; (self.app / "avestudio").mkdir(parents=True)
        self.active = self.app / "avestudio/staging.compose.yml"
        self.original = {"services": {"backend": {"image": "old-backend", "volumes": ["/srv/avestudio/shared/media:/app/media"]},
                                       "frontend": {"image": "old-frontend"}}}
        self.active.write_text(json.dumps(self.original))
        self.release = {"schema": 1, "project": "avestudio", "repository": "alexupetrescu/avestudio", "target_ipv4": deployment.TARGET,
                        "commit": "a" * 40, "images": {s: "ghcr.io/alexupetrescu/avestudio-production-" + s + "@sha256:" + "b" * 64 for s in ["backend", "frontend"]}}
        self.path = self.root / "release.json"; self.path.write_text(json.dumps(self.release))
        self.patches = [patch.object(deployment, "STATE", self.state), patch.object(deployment, "APP_ROOT", self.app),
                        patch.object(deployment, "MARKERS", self.root / "markers")]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        deployment.LOG = None
        self.temp.cleanup()

    def test_manifest_requires_expected_package_digest(self):
        self.assertEqual(deployment.manifest(self.path, "avestudio")["commit"], "a" * 40)
        for image in ["ghcr.io/alexupetrescu/avestudio-backend:latest", "example.com/image@sha256:" + "b" * 64,
                      "ghcr.io/alexupetrescu/lunador-production-backend@sha256:" + "b" * 64,
                      "ghcr.io/alexupetrescu/avestudio-backend@sha256:" + "b" * 64]:
            row = copy.deepcopy(self.release); row["images"]["backend"] = image
            self.path.write_text(json.dumps(row))
            with self.assertRaises(ValueError):
                deployment.manifest(self.path, "avestudio")

    def test_worker_and_backend_updated_together_and_mounts_preserved(self):
        row = {"services": {"backend": {"image": "old", "env_file": [{"path": "/private.env", "format": "raw"}], "volumes": ["/srv/media:/app/media"]},
                            "frontend": {"image": "unchanged"}, "email-worker": {"image": "old", "profiles": ["outbound"]}}}
        release = {"images": {"backend": "new"}}
        result = deployment.desired_config("aveletter", release, ["backend"], json.dumps(row))
        self.assertEqual(result["services"]["email-worker"]["image"], "new")
        self.assertEqual(result["services"]["backend"]["volumes"], row["services"]["backend"]["volumes"])
        self.assertEqual(result["services"]["backend"]["env_file"], row["services"]["backend"]["env_file"])
        self.assertEqual(result["services"]["frontend"], row["services"]["frontend"])

    def test_duplicate_workers_block_a_release(self):
        with patch.object(deployment, "run", return_value=subprocess.CompletedProcess([], 0, b"one\ntwo\n", b"")):
            with self.assertRaises(RuntimeError):
                deployment.worker_running("aveletter")

    def test_missing_stale_and_future_backup_rejected(self):
        file = self.root / "backup.json"
        with patch.object(deployment, "BACKUP_STATE", file):
            for hours, valid in [(2, True), (27, False), (-1, False)]:
                stamp = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=hours)
                file.write_text(json.dumps({"last_success": {"completed_at_utc": stamp.isoformat(), "snapshot_id": "b" * 64}}))
                if valid:
                    deployment.fresh_backup()
                else:
                    with self.assertRaises(RuntimeError):
                        deployment.fresh_backup()

    def test_private_context_excludes_data_and_credentials(self):
        for path in ["backend/.env", "backend/media/photo.jpg", "backup/secret.json", "frontend/.env.production.local",
                     "backend/db.sqlite3", "ops/private.key", "frontend/node_modules/module/index.js"]:
            self.assertFalse(context.allowed(path), path)
        self.assertTrue(context.allowed("schools/models.py"))
        self.assertTrue(context.allowed("frontend/src/app/page.tsx"))

    def test_changed_host_adapter_blocks_backend_activation(self):
        adapter = self.root / "adapter"; adapter.mkdir()
        release = {"runtime_sha256": {}}
        for name in ["production_settings.py", "production_middleware.py", "production_urls.py"]:
            (adapter / name).write_text("fixture")
            release["runtime_sha256"][name] = hashlib.sha256(b"fixture").hexdigest()
        config = {"services": {"backend": {"volumes": [{"type": "bind", "source": str(adapter), "target": "/run/production-runtime"}]}}}
        deployment.runtime_matches(config, release)
        (adapter / "production_settings.py").write_text("changed")
        with self.assertRaises(RuntimeError):
            deployment.runtime_matches(config, release)

    def test_atomic_mode_and_preexisting_temporary_symlink(self):
        victim = self.root / "victim"; victim.write_text("unchanged")
        path = self.root / "target"; path.with_name("target.new").symlink_to(victim)
        previous = os.umask(0o077)
        try:
            deployment.atomic(path, "public", 0o644)
        finally:
            os.umask(previous)
        self.assertEqual(victim.read_text(), "unchanged")
        self.assertEqual(path.stat().st_mode & 0o777, 0o644)

    def exercise_failure(self, migrations):
        commands = []
        def run(args, *, output=None, **kwargs):
            commands.append(args)
            body = b""
            if "config" in args and "--format" in args:
                body = json.dumps(self.original).encode()
            elif "migrate" in args and "--check" in args:
                return subprocess.CompletedProcess(args, 1 if migrations else 0, b"", b"")
            elif "migrate" in args and "--noinput" in args:
                raise RuntimeError("Synthetic schema failure")
            elif "pg_dump" in args:
                output.write(b"PGDMP synthetic")
            return subprocess.CompletedProcess(args, 0, body, b"")
        disk = SimpleNamespace(free=20 * 1024**3)
        args = SimpleNamespace(project="avestudio", release=str(self.path), service="all", plan=False, migrate=migrations)
        with patch.object(deployment, "run", side_effect=run), patch.object(deployment, "image_checks"), \
                patch.object(deployment, "runtime_matches"), \
                patch.object(deployment, "fresh_backup"), patch.object(deployment, "photo_jobs_idle"), \
                patch.object(deployment, "worker_running", return_value=False), patch.object(deployment, "maintenance") as maintenance, \
                patch.object(deployment, "start") as start, patch.object(deployment.shutil, "disk_usage", return_value=disk), \
                patch.object(deployment, "verify_web", side_effect=RuntimeError("Synthetic health failure")):
            with self.assertRaises(RuntimeError):
                deployment.deploy(args)
        self.assertFalse(any("pg_restore" in c or "dropdb" in c for c in commands))
        journal = json.loads(next(p for p in self.state.rglob("status.json")).read_text())
        return journal, maintenance, start

    def test_code_failure_restores_images_without_database_restore(self):
        journal, _, start = self.exercise_failure(migrations=False)
        self.assertEqual(journal["status"], "previous-images-restored")
        self.assertEqual(json.loads(self.active.read_text()), self.original)
        self.assertEqual(start.call_count, 2)

    def test_schema_failure_preserves_candidate_and_holds_maintenance(self):
        journal, maintenance, start = self.exercise_failure(migrations=True)
        self.assertTrue(journal["migration_started"])
        self.assertEqual(journal["status"], "schema-release-needs-repair")
        self.assertEqual(json.loads(self.active.read_text())["services"]["backend"]["image"], self.release["images"]["backend"])
        self.assertEqual(maintenance.call_args.args, ("avestudio", True))
        start.assert_not_called()


if __name__ == "__main__":
    unittest.main()
