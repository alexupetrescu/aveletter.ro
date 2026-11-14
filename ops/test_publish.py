"""Synthetic registry publication gates; no tokens or registry writes."""
import importlib.util
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("publication", Path(__file__).with_name("publish.py"))
publication = importlib.util.module_from_spec(spec); spec.loader.exec_module(publication)
require_public_repository = publication.require_public_repository


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "ops").mkdir(); (self.root / ".release").mkdir()
        (self.root / "ops/project.json").write_text(json.dumps({"project": "lunador", "repository": "alexupetrescu/lunador.ro", "image_visibility": "public"}))
        for name in ["production_settings.py", "production_middleware.py", "production_urls.py"]:
            (self.root / "ops" / name).write_text("fixture")
        self.patches = [patch.object(publication, "ROOT", self.root), patch.object(publication, "require_public_repository"), patch.dict(os.environ, {
            "GITHUB_SHA": "a" * 40, "GITHUB_REPOSITORY": "alexupetrescu/lunador.ro", "GITHUB_REF": "refs/heads/main",
            "GITHUB_EVENT_NAME": "push", "GITHUB_TOKEN": "disposable-ci-only", "GITHUB_RUN_ID": "123"})]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.temp.cleanup()

    def test_existing_private_package_stops_before_login_or_push(self):
        with patch.object(publication, "package_visibility", return_value="private"), patch.object(publication.subprocess, "run") as run:
            with self.assertRaises(RuntimeError):
                publication.main()
            run.assert_not_called()

    def test_private_result_stops_before_frontend_publication(self):
        with patch.object(publication, "package_visibility", side_effect=["public", "public", "private"]), \
                patch.object(publication.subprocess, "run") as run:
            with self.assertRaisesRegex(RuntimeError, "reported visibility=private"):
                publication.main()
            pushes = [c.args[0] for c in run.call_args_list if c.args[0][:2] == ["docker", "push"]]
            self.assertEqual(len(pushes), 1)
            self.assertIn("lunador-production-backend", pushes[0][-1])
            self.assertFalse((self.root / ".release/release.json").exists())

    def test_public_release_uses_matching_anonymous_and_registry_digests(self):
        with patch.object(publication, "package_visibility", return_value="public"), patch.object(publication.subprocess, "run"), \
                patch.object(publication, "anonymous_manifest_digest", return_value="sha256:" + "b" * 64) as anonymous, \
                patch.object(publication.subprocess, "check_output", return_value=json.dumps({"digest": "sha256:" + "b" * 64}).encode()) as inspect:
            publication.main()
            self.assertEqual(anonymous.call_count, 2)
            self.assertTrue(all(c.args[0][:4] == ["docker", "buildx", "imagetools", "inspect"] for c in inspect.call_args_list))
        data = json.loads((self.root / ".release/release.json").read_text())
        self.assertEqual(data["image_visibility"], "public")
        self.assertEqual(set(data["images"]), {"backend", "frontend"})
        self.assertTrue(all(reference.endswith("@sha256:" + "b" * 64) for reference in data["images"].values()))

    def test_unpinned_registry_result_is_rejected(self):
        with patch.object(publication.subprocess, "check_output", return_value=b'{"digest":"latest"}'):
            with self.assertRaises(RuntimeError):
                publication.registry_reference("ghcr.io/alexupetrescu/lunador-production-backend", "fixture")

    def test_uninitialized_destination_stops_before_application_push(self):
        with patch.object(publication, "package_visibility", return_value=None), patch.object(publication.subprocess, "run") as run:
            with self.assertRaises(RuntimeError):
                publication.main()
            run.assert_not_called()

    def test_new_destinations_initialized_with_marker_images_only(self):
        with patch.object(publication, "package_visibility", side_effect=[None, None, "public", "public"]), \
                patch.object(publication, "create_marker_image") as marker, \
                patch.object(publication, "anonymous_manifest_digest") as anonymous, patch.object(publication.subprocess, "run") as run:
            publication.prepare_registry()
            self.assertEqual(marker.call_count, 2)
            self.assertEqual(anonymous.call_count, 2)
            pushes = [c.args[0] for c in run.call_args_list if c.args[0][:2] == ["docker", "push"]]
            self.assertEqual(len(pushes), 2)
            self.assertTrue(all(c[-1].endswith(":registry-access-check") for c in pushes))
            self.assertFalse((self.root / ".release/release.json").exists())

    def test_private_marker_stops_before_second_destination(self):
        with patch.object(publication, "package_visibility", side_effect=[None, None, "private"]), \
                patch.object(publication, "create_marker_image") as marker, patch.object(publication.subprocess, "run"):
            with self.assertRaisesRegex(RuntimeError, "reported visibility=private"):
                publication.prepare_registry()
            self.assertEqual(marker.call_count, 1)

    def test_marker_context_contains_no_application_files(self):
        seen = []
        def build(command, **kwargs):
            root = Path(command[-1]); seen.append(command)
            self.assertEqual({p.name for p in root.iterdir()}, {"Dockerfile", "marker"})
            self.assertEqual((root / "Dockerfile").read_text(), "FROM scratch\nCOPY marker /registry-access-check.txt\n")
            self.assertIn("--network=none", command)
        with patch.object(publication.subprocess, "run", side_effect=build):
            publication.create_marker_image("fixture:registry-access-check", {"repository": "alexupetrescu/lunador.ro"}, "a" * 40)
        self.assertEqual(len(seen), 1)

    def test_anonymous_token_request_denied_blocks_public_release(self):
        error = urllib.error.HTTPError("https://ghcr.io/token", 403, "denied", {}, None)
        with patch.object(publication.urllib.request, "urlopen", side_effect=error):
            with self.assertRaises(urllib.error.HTTPError):
                publication.anonymous_manifest_digest("alexupetrescu", "lunador-production-backend", "registry-access-check")

    def test_anonymous_token_without_pull_permission_blocks_public_release(self):
        token = io.BytesIO(b'{"token":"anonymous-fixture"}')
        denied = urllib.error.HTTPError("https://ghcr.io/v2/fixture", 401, "denied", {}, None)
        with patch.object(publication.urllib.request, "urlopen", side_effect=[token, denied]):
            with self.assertRaises(urllib.error.HTTPError):
                publication.anonymous_manifest_digest("alexupetrescu", "lunador-production-backend", "registry-access-check")

    def test_anonymously_readable_manifest_bytes_are_hashed(self):
        body = b'{"schemaVersion":2,"config":{},"layers":[]}'
        with patch.object(publication.urllib.request, "urlopen", side_effect=[io.BytesIO(b'{"token":"anonymous-fixture"}'), io.BytesIO(body)]) as open_url:
            digest = publication.anonymous_manifest_digest("alexupetrescu", "lunador-production-backend", "registry-access-check")
        self.assertEqual(digest, "sha256:" + hashlib.sha256(body).hexdigest())
        self.assertIsNone(open_url.call_args_list[0].args[0].get_header("Authorization"))

    def test_registry_outage_blocks_public_release(self):
        error = urllib.error.HTTPError("https://ghcr.io/token", 503, "unavailable", {}, None)
        with patch.object(publication.urllib.request, "urlopen", side_effect=error):
            with self.assertRaises(urllib.error.HTTPError):
                publication.anonymous_manifest_digest("alexupetrescu", "lunador-production-backend", "registry-access-check")

    def test_source_repository_becoming_private_blocks_publication(self):
        body = b'{"full_name":"alexupetrescu/lunador.ro","private":true,"visibility":"private"}'
        with patch.object(publication.urllib.request, "urlopen", return_value=io.BytesIO(body)):
            with self.assertRaises(RuntimeError):
                require_public_repository("alexupetrescu/lunador.ro")

    def test_publication_requires_explicit_public_policy(self):
        file = self.root / "ops/project.json";cfg = json.loads(file.read_text());del cfg["image_visibility"]
        file.write_text(json.dumps(cfg))
        with patch.object(publication.subprocess, "run") as run:
            with self.assertRaises(RuntimeError):
                publication.main()
            run.assert_not_called()

    def test_digest_disagreement_does_not_create_release_artifact(self):
        with patch.object(publication, "package_visibility", return_value="public"), patch.object(publication.subprocess, "run"), \
                patch.object(publication, "anonymous_manifest_digest", return_value="sha256:" + "b" * 64), \
                patch.object(publication.subprocess, "check_output", return_value=json.dumps({"digest": "sha256:" + "c" * 64}).encode()):
            with self.assertRaisesRegex(RuntimeError, "digests differ"):
                publication.main()
        self.assertFalse((self.root / ".release/release.json").exists())


if __name__ == "__main__":
    unittest.main()
