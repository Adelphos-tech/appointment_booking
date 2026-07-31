#!/bin/bash
# Slotcare automated PostgreSQL backup script
# Keeps last 7 days of backups + weekly backups for 4 weeks

BACKUP_DIR="/var/backups/slotcare"
DB_NAME="slotcare"
DB_USER="postgres"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/slotcare_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

# Create backup
PGPASSWORD="" pg_dump -U "$DB_USER" -h 127.0.0.1 "$DB_NAME" 2>/dev/null | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ] && [ -s "$BACKUP_FILE" ]; then
  echo "[$(date)] Backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
else
  echo "[$(date)] ERROR: Backup failed!" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Cleanup: keep last 7 daily backups
find "$BACKUP_DIR" -name "slotcare_*.sql.gz" -mtime +7 -delete 2>/dev/null

# Create weekly snapshot (every Sunday)
if [ $(date +%u) -eq 7 ]; then
  WEEKLY_FILE="$BACKUP_DIR/slotcare_weekly_$(date +%Y%m%d).sql.gz"
  cp "$BACKUP_FILE" "$WEEKLY_FILE"
  # Keep last 4 weekly backups
  find "$BACKUP_DIR" -name "slotcare_weekly_*.sql.gz" -mtime +28 -delete 2>/dev/null
fi

echo "[$(date)] Backup complete"
