import hashlib
import json
import os
import re
import subprocess
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse, unquote

PREFIX = 'yoru/daily/'

def expired_keys(objects, now, retention_days):
    cutoff = now - timedelta(days=retention_days)
    return [item['Key'] for item in objects if re.fullmatch(r'yoru/daily/\d{8}T\d{6}Z-[a-f0-9]{12}\.dump', item['Key']) and item['LastModified'] < cutoff]

def main():
    import boto3
    from botocore.config import Config
    retention = int(os.environ.get('BACKUP_RETENTION_DAYS', '14'))
    if not 7 <= retention <= 90:
        raise ValueError('Retention must be between 7 and 90 days')
    url = urlparse(os.environ['DATABASE_URL'])
    env = {**os.environ, 'PGHOST': url.hostname, 'PGPORT': str(url.port or 5432), 'PGUSER': unquote(url.username or ''), 'PGPASSWORD': unquote(url.password or ''), 'PGDATABASE': unquote(url.path.lstrip('/')), 'PGCONNECT_TIMEOUT': '30', 'PGOPTIONS': '-c statement_timeout=1800000'}
    s3 = boto3.client('s3', endpoint_url=os.environ['BACKUP_S3_ENDPOINT'], region_name=os.environ.get('BACKUP_S3_REGION', 'auto'), aws_access_key_id=os.environ['BACKUP_S3_ACCESS_KEY'], aws_secret_access_key=os.environ['BACKUP_S3_SECRET_KEY'], config=Config(signature_version='s3v4', s3={'addressing_style': os.environ.get('BACKUP_S3_URL_STYLE', 'virtual')}, retries={'max_attempts': 4, 'mode': 'standard'}, request_checksum_calculation='when_required', response_checksum_validation='when_required'))
    bucket = os.environ['BACKUP_S3_BUCKET']
    with tempfile.TemporaryDirectory(prefix='yoru-backup-') as directory:
        path = Path(directory) / 'database.dump'
        subprocess.run(['pg_dump', '--format=custom', '--no-owner', '--no-acl', '--lock-wait-timeout=30s', '--file=' + str(path)], env=env, check=True, capture_output=True, timeout=1800)
        subprocess.run(['pg_restore', '--list', str(path)], check=True, capture_output=True, timeout=60)
        size = path.stat().st_size
        if size < 100:
            raise ValueError('Empty dump')
        with path.open('rb') as source:
            digest = hashlib.file_digest(source, 'sha256').hexdigest()
        key = PREFIX + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + digest[:12] + '.dump'
        with path.open('rb') as body:
            s3.put_object(Bucket=bucket, Key=key, Body=body, ContentType='application/octet-stream', Metadata={'sha256': digest})
        # Verify the bytes by downloading, not just HEAD/ETag metadata.
        downloaded = s3.get_object(Bucket=bucket, Key=key)
        actual = hashlib.sha256()
        length = 0
        for chunk in downloaded['Body'].iter_chunks(chunk_size=1048576):
            actual.update(chunk)
            length += len(chunk)
        downloaded['Body'].close()
        if length != size or actual.hexdigest() != digest:
            raise ValueError('Uploaded backup checksum mismatch')
        deleted = 0
        for page in s3.get_paginator('list_objects_v2').paginate(Bucket=bucket, Prefix=PREFIX):
            for old in expired_keys(page.get('Contents', []), datetime.now(timezone.utc), retention):
                if old != key:
                    s3.delete_object(Bucket=bucket, Key=old)
                    deleted += 1
        print(json.dumps({'event': 'backup_uploaded_verified', 'key': key, 'bytes': size, 'sha256': digest, 'retention_days': retention, 'deleted_old_backups': deleted}), flush=True)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Errors from database/SDK may contain credentials. Keep raw messages out of logs.
        print(json.dumps({'event': 'backup_failed', 'type': type(error).__name__}), flush=True)
        raise SystemExit(1)
