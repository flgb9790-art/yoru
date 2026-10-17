FROM postgres:18.6
RUN apt-get update && apt-get install -y --no-install-recommends python3-boto3 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /backup
COPY backup.py .
ENTRYPOINT ["python3", "-u", "/backup/backup.py"]
