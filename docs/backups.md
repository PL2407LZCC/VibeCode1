# Backup and Recovery Guide

This document outlines how to back up and restore the two pieces of persistent state used by VibeCode1:

1. **PostgreSQL database** (`db` service).
2. **Uploaded assets** (files under `server/uploads/`, mounted at `/usr/src/app/uploads` in production).

## Database Backups

### Ad-hoc backup (manual)

Run the following from a machine that can reach the production database:

```bash
PGUSER=postgres \
PGPASSWORD=<postgres-password> \
PGHOST=<db-host> \
PGPORT=5432 \
PGDATABASE=vibecode1 \
pg_dump --format=custom --file=vibecode1_$(date +%Y%m%d%H%M).dump
```

- The `custom` format supports parallel restore and selective table recovery.
- Store the dump in secure object storage (e.g., S3 bucket with lifecycle rules).

### Scheduled backups (cron example)

Create `/etc/cron.d/vibecode-backup` on the server that can reach the database:

```
0 2 * * * postgres PGUSER=postgres PGPASSWORD=<postgres-password> PGHOST=db PGDATABASE=vibecode1 pg_dump --format=custom --file=/backups/vibecode1_$(date +\%Y\%m\%d).dump
```

- Adjust the schedule (`0 2 * * *`) to suit your retention policy.
- Write dumps to a mounted volume (e.g., `/backups`) that is synced to remote storage.
- Rotate files with `find /backups -type f -mtime +7 -delete` to keep the last week by default.

### Restore procedure

```bash
pg_restore --clean --create --dbname=postgres vibecode1_YYYYMMDDHHMM.dump
```

- `--clean` drops existing objects before recreating them.
- Use `--table=<table>` to restore specific tables.
- After restore, redeploy the API service so Prisma picks up the data.

## Uploaded Assets Backups

### Ad-hoc backup

If the uploads directory is mounted on the host (default in `docker-compose.production.yml`):

```bash
tar czf uploads_$(date +%Y%m%d%H%M).tar.gz -C /var/lib/docker/volumes/uploads_data_prod/_data .
```

Adjust the path to match your Docker volume location if different.

### Scheduled sync to object storage

Example using AWS S3 (requires AWS CLI configured with suitable credentials):

```bash
aws s3 sync /var/lib/docker/volumes/uploads_data_prod/_data s3://<bucket-name>/vibecode/uploads/ --storage-class STANDARD_IA
```

Run the sync nightly (e.g., via cron). The `storage-class` parameter controls cost vs access speed.

## Combined Disaster Recovery Checklist

1. **Stop traffic**: Disable the load balancer or put the site into maintenance mode.
2. **Restore database**: Run `pg_restore` against the most recent dump.
3. **Restore uploads**: Extract the archived uploads into the mounted uploads volume.
4. **Restart services**: `docker compose -f docker-compose.production.yml up -d`.
5. **Verify**: Hit `/health`, check admin login, view product images.
6. **Re-enable traffic**: Bring the load balancer back online.

## Automation Tips

- Use infrastructure automation (GitHub Actions, cron container, or managed backup services) to run the commands above on a schedule.
- Store credentials (database password, AWS keys) in a secure secrets manager, inject via environment variables at runtime.
- Monitor backup jobs; alert when a job fails or no new backup appears.
- Periodically run a test restore into a staging environment to prove backups are valid.
