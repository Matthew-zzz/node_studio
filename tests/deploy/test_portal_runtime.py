import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('portal_runtime', Path(__file__).resolve().parents[2] / 'scripts/deploy/portal_runtime.py')
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


def bundle(entries):
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode='w') as archive:
        for name, content in entries:
            member = tarfile.TarInfo(name)
            data = content.encode()
            member.size = len(data)
            archive.addfile(member, io.BytesIO(data))
    return stream.getvalue()


class PortalRuntimeTests(unittest.TestCase):
    def test_only_complete_source_is_accepted(self):
        with tempfile.TemporaryDirectory() as temporary:
            runtime.extract_source(bundle([(name, '{}') for name in runtime.REQUIRED]), Path(temporary))
            self.assertTrue((Path(temporary) / 'server/main.ts').is_file())

    def test_rejects_path_traversal_and_unrelated_files(self):
        for name in ['../outside.ts', '/tmp/outside.ts', 'public/secret.env', 'server/../../etc/file']:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temporary:
                with self.assertRaises(ValueError):
                    runtime.extract_source(bundle([(name, '{}')]), Path(temporary))

    def test_rejects_links_and_incomplete_source(self):
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w') as archive:
            member = tarfile.TarInfo('server/main.ts')
            member.type = tarfile.SYMTYPE
            member.linkname = '/etc/passwd'
            archive.addfile(member)
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaises(ValueError):
                runtime.extract_source(stream.getvalue(), Path(temporary))
            with self.assertRaises(ValueError):
                runtime.extract_source(bundle([('server/main.ts', '{}')]), Path(temporary))

    def test_source_identity_comes_from_verified_frontend_manifest(self):
        with tempfile.TemporaryDirectory() as temporary:
            manifest = Path(temporary) / 'deployment.json'
            manifest.write_text(json.dumps({'repository': 'Matthew-zzz/node_studio', 'source_sha': 'a' * 40}))
            self.assertEqual(runtime.desired(manifest), 'a' * 40)
            manifest.write_text(json.dumps({'repository': 'other/repo', 'source_sha': 'a' * 40}))
            with self.assertRaises(ValueError):
                runtime.desired(manifest)
