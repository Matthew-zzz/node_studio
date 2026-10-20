"""Exercise real Git publication, activation and rollback without network/root."""

import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest


spec = importlib.util.spec_from_file_location(
    "deployment", Path(__file__).resolve().parents[2] / "scripts/deploy/deployment.py",
)
deployment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deployment)


def git(directory, *arguments):
    return subprocess.run(
        ["git", "-C", str(directory), *arguments], check=True,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    ).stdout.decode().strip()


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.remote = self.root / "origin.git"
        self.remote.mkdir()
        git(self.remote, "init", "--bare", "--initial-branch=main")
        self.source = self.root / "source"
        self.source.mkdir()
        git(self.source, "init", "--initial-branch=main")
        git(self.source, "config", "user.name", "Deployment test")
        git(self.source, "config", "user.email", "test@example.invalid")
        git(self.source, "remote", "add", "origin", str(self.remote))
        self.dist = self.root / "dist"
        self.dist.mkdir()
        self.state = self.root / "state"
        self.webroot = self.root / "www"
        self.commit = self.advance("initial")
        self.export("first")

    def advance(self, content):
        (self.source / "source.txt").write_text(content)
        git(self.source, "add", ".")
        git(self.source, "commit", "-m", content)
        git(self.source, "push", "origin", "main")
        return git(self.source, "rev-parse", "HEAD")

    def export(self, content):
        for relative in deployment.ENTRYPOINTS:
            path = self.dist / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content + relative)
        assets = self.dist / "_next/static/chunks"
        assets.mkdir(parents=True, exist_ok=True)
        (assets / f"{content}.js").write_text(f"console.log('{content}')")

    def publish(self):
        return deployment.publish(self.source, self.dist, self.commit)

    def sync(self, check=lambda release: None):
        return deployment.synchronize(self.state, self.webroot, str(self.remote), check)

    def test_publication_keeps_checkout_and_index_unchanged(self):
        index_before = (self.source / ".git/index").read_bytes()
        published = self.publish()
        self.assertEqual(git(self.source, "rev-parse", "HEAD"), self.commit)
        self.assertEqual((self.source / ".git/index").read_bytes(), index_before)
        self.assertEqual(git(self.source, "status", "--porcelain"), "")
        manifest = json.loads(git(self.remote, "show", "production:deployment.json"))
        self.assertEqual(manifest["source_sha"], self.commit)
        self.assertEqual(git(self.remote, "rev-parse", "production"), published)
        self.assertNotIn("source.txt", git(self.remote, "ls-tree", "--name-only", "production"))

    def test_stale_source_cannot_publish(self):
        self.publish()
        previous = git(self.remote, "rev-parse", "production")
        stale = self.commit
        self.advance("newer")
        git(self.source, "checkout", "--detach", stale)
        self.assertIsNone(deployment.publish(self.source, self.dist, stale))
        self.assertEqual(git(self.remote, "rev-parse", "production"), previous)

    def test_update_is_fast_forward_and_old_assets_are_retained(self):
        first = self.publish()
        checks = []
        self.assertTrue(self.sync(lambda release: checks.append(release)))
        self.assertEqual((self.webroot / "current").resolve().name, first)
        self.assertFalse(self.sync(lambda release: self.fail("Unchanged release was reactivated")))
        self.commit = self.advance("second")
        self.export("second")
        (self.dist / "_next/static/chunks/first.js").unlink()
        second = self.publish()
        self.assertEqual(git(self.remote, "rev-parse", f"{second}^"), first)
        self.assertTrue(self.sync())
        self.assertEqual((self.webroot / "current/index.html").read_text(), "secondindex.html")
        for name in ("first.js", "second.js"):
            self.assertTrue((self.webroot / "shared/_next/static/chunks" / name).is_file())

    def test_failed_health_restores_previous_release(self):
        self.publish()
        self.sync()
        previous = (self.webroot / "current").readlink()
        self.commit = self.advance("broken")
        self.export("broken")
        self.publish()

        def fail(release):
            self.assertEqual((self.webroot / "current").resolve(), release)
            raise ValueError("Nginx health check failed")

        with self.assertRaisesRegex(ValueError, "Nginx health"):
            self.sync(fail)
        self.assertEqual((self.webroot / "current").readlink(), previous)
        self.assertEqual((self.webroot / "current/index.html").read_text(), "firstindex.html")

    def test_failed_first_release_leaves_no_current(self):
        self.publish()
        with self.assertRaises(ValueError):
            self.sync(lambda release: (_ for _ in ()).throw(ValueError("unhealthy")))
        self.assertFalse((self.webroot / "current").is_symlink())

    def test_modified_export_and_symlinks_are_rejected(self):
        self.publish()
        (self.dist / "index.html").write_text("tampered")
        with self.assertRaisesRegex(ValueError, "checksums"):
            deployment.validate(self.dist)
        (self.dist / "linked.html").symlink_to(self.dist / "index.html")
        with self.assertRaisesRegex(ValueError, "Unsafe export"):
            deployment.inventory(self.dist)

    def test_immutable_asset_collision_leaves_current_unchanged(self):
        self.publish()
        self.sync()
        previous = (self.webroot / "current").readlink()
        self.commit = self.advance("collision")
        (self.dist / "_next/static/chunks/first.js").write_text("different bytes, same URL")
        self.publish()
        with self.assertRaisesRegex(ValueError, "Immutable asset"):
            self.sync()
        self.assertEqual((self.webroot / "current").readlink(), previous)

    def test_archive_path_traversal_and_links_are_rejected(self):
        for name, kind in (("../escape", tarfile.REGTYPE), ("/escape", tarfile.REGTYPE),
                           ("link", tarfile.SYMTYPE), ("hardlink", tarfile.LNKTYPE)):
            with self.subTest(name=name):
                archive = self.root / "unsafe.tar"
                with tarfile.open(archive, "w") as bundle:
                    entry = tarfile.TarInfo(name)
                    entry.type = kind
                    entry.linkname = "/etc/passwd" if kind != tarfile.REGTYPE else ""
                    bundle.addfile(entry, io.BytesIO())
                with self.assertRaisesRegex(ValueError, "Unsafe archive"):
                    deployment.extract(archive, self.root / "extracted")


if __name__ == "__main__":
    unittest.main()
