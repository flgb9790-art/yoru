import importlib.util
import io
import os
import subprocess
import sys
import types
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('backup', Path(__file__).with_name('backup.py'))
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)

class FakeS3:
    def __init__(self, corrupt=False):
        self.corrupt = corrupt
        self.deleted = []
        self.data = b''
    def put_object(self, **kw):
        self.data = kw['Body'].read()
    def get_object(self, **kw):
        data = b'bad' if self.corrupt else self.data
        return {'Body': types.SimpleNamespace(iter_chunks=lambda **_: [data], close=lambda: None)}
    def get_paginator(self, *_):
        now = datetime.now(timezone.utc)
        return types.SimpleNamespace(paginate=lambda **_: [{'Contents': [
            {'Key': 'yoru/daily/20200101T030000Z-abcdef012345.dump', 'LastModified': now - timedelta(days=100)},
            {'Key': 'yoru/verified-drills/keep.dump', 'LastModified': now - timedelta(days=100)}]}])
    def delete_object(self, **kw):
        self.deleted.append(kw['Key'])

class BackupTests(unittest.TestCase):
    def test_retention_only_deletes_named_old_daily_archives(self):
        now = datetime.now(timezone.utc)
        old = now - timedelta(days=15)
        objects = [{'Key': key, 'LastModified': date} for key, date in [
            ('yoru/daily/20200101T030000Z-abcdef012345.dump', old),
            ('yoru/daily/20200102T030000Z-abcdef012345.dump', now),
            ('yoru/daily/readme.txt', old), ('other/20200101T030000Z-abcdef012345.dump', old)]]
        self.assertEqual(backup.expired_keys(objects, now, 14), ['yoru/daily/20200101T030000Z-abcdef012345.dump'])
    def run_backup(self, s3, fail_dump=False):
        def run(args, **kw):
            if fail_dump:
                raise subprocess.CalledProcessError(1, 'pg_dump')
            if args[0] == 'pg_dump':
                Path(next(a[7:] for a in args if a.startswith('--file='))).write_bytes(b'PGDMP' + b'x' * 1000)
        env = {'DATABASE_URL': 'postgresql://u:p@localhost/db', 'BACKUP_S3_ENDPOINT': 'https://test.example', 'BACKUP_S3_ACCESS_KEY': 'a', 'BACKUP_S3_SECRET_KEY': 'b', 'BACKUP_S3_BUCKET': 'bucket', 'BACKUP_RETENTION_DAYS': '14'}
        modules = {'boto3': types.SimpleNamespace(client=lambda *a, **kw: s3), 'botocore': types.ModuleType('botocore'), 'botocore.config': types.SimpleNamespace(Config=lambda **kw: None)}
        with patch.dict(sys.modules, modules), patch.dict(os.environ, env), patch.object(backup.subprocess, 'run', side_effect=run), patch('sys.stdout', new=io.StringIO()):
            backup.main()
    def test_success_prunes_only_after_upload_readback(self):
        s3 = FakeS3()
        self.run_backup(s3)
        self.assertEqual(s3.deleted, ['yoru/daily/20200101T030000Z-abcdef012345.dump'])
    def test_corrupt_upload_does_not_prune_previous_backups(self):
        s3 = FakeS3(corrupt=True)
        with self.assertRaises(ValueError):
            self.run_backup(s3)
        self.assertEqual(s3.deleted, [])
    def test_dump_failure_does_not_upload_or_prune(self):
        s3 = FakeS3()
        with self.assertRaises(subprocess.CalledProcessError):
            self.run_backup(s3, fail_dump=True)
        self.assertEqual(s3.data, b'')
        self.assertEqual(s3.deleted, [])

if __name__ == '__main__':
    unittest.main()
