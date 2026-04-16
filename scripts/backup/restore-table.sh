#!/bin/bash
# ============================================================
# Restore Single Table
# Brief 33: Restore a specific table from backup
# ============================================================
#
# Usage: ./restore-table.sh <table_name> <backup_file>
#
# Example:
#   ./restore-table.sh core_wallets /tmp/backup.dump
#   ./restore-table.sh users s3://glimad-backups/critical/2024/01/15/critical-backup-20240115-120000.dump
#
# Environment variables required:
#   DATABASE_URL - PostgreSQL connection string
#   AWS_ACCESS_KEY_ID - AWS credentials (if using S3)
#   AWS_SECRET_ACCESS_KEY - AWS credentials (if using S3)
#
# WARNING: This will replace all data in the specified table!
# ============================================================

set -e

# Arguments
TABLE_NAME="$1"
BACKUP_FILE="$2"

# Validate arguments
if [ -z "$TABLE_NAME" ] || [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <table_name> <backup_file>"
  echo ""
  echo "Example:"
  echo "  $0 core_wallets /tmp/backup.dump"
  echo "  $0 users s3://glimad-backups/critical/2024/01/15/backup.dump"
  exit 1
fi

# Verify environment
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set"
  exit 1
fi

echo "============================================"
echo "Glimad Table Restoration"
echo "============================================"
echo "Table: ${TABLE_NAME}"
echo "Backup: ${BACKUP_FILE}"
echo ""

# Confirmation
echo "⚠️  WARNING: This will REPLACE all data in '${TABLE_NAME}'"
read -p "Are you sure? Type 'yes' to continue: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

# Download from S3 if needed
LOCAL_BACKUP="/tmp/restore-${TABLE_NAME}-$(date +%s).dump"

if [[ "$BACKUP_FILE" == s3://* ]]; then
  echo ""
  echo "Downloading backup from S3..."
  aws s3 cp "${BACKUP_FILE}" "${LOCAL_BACKUP}"
else
  LOCAL_BACKUP="${BACKUP_FILE}"
fi

# Get current row count
echo ""
echo "Current row count in ${TABLE_NAME}:"
CURRENT_COUNT=$(psql "${DATABASE_URL}" -t -c "SELECT COUNT(*) FROM ${TABLE_NAME};" | tr -d ' ')
echo "  ${CURRENT_COUNT} rows"

# Rename existing table as backup
echo ""
echo "Renaming existing table to ${TABLE_NAME}_old..."
psql "${DATABASE_URL}" -c "DROP TABLE IF EXISTS ${TABLE_NAME}_old CASCADE;"
psql "${DATABASE_URL}" -c "ALTER TABLE ${TABLE_NAME} RENAME TO ${TABLE_NAME}_old;"

# Restore table from backup
echo ""
echo "Restoring table from backup..."
pg_restore \
  --dbname="${DATABASE_URL}" \
  --table="${TABLE_NAME}" \
  --verbose \
  "${LOCAL_BACKUP}"

# Verify restoration
echo ""
echo "Verifying restoration..."
RESTORED_COUNT=$(psql "${DATABASE_URL}" -t -c "SELECT COUNT(*) FROM ${TABLE_NAME};" | tr -d ' ')
echo "Restored row count: ${RESTORED_COUNT}"

# Compare counts
echo ""
if [ "$RESTORED_COUNT" -eq "0" ]; then
  echo "⚠️  WARNING: Restored table has 0 rows!"
  echo "You may want to restore from ${TABLE_NAME}_old"
  echo ""
  echo "To restore the old table:"
  echo "  psql \$DATABASE_URL -c \"DROP TABLE ${TABLE_NAME};\""
  echo "  psql \$DATABASE_URL -c \"ALTER TABLE ${TABLE_NAME}_old RENAME TO ${TABLE_NAME};\""
else
  echo "✅ Restoration successful!"
  echo ""
  echo "Old table backed up as: ${TABLE_NAME}_old"
  echo "To remove old table: psql \$DATABASE_URL -c \"DROP TABLE ${TABLE_NAME}_old;\""
fi

# Cleanup downloaded file
if [[ "$BACKUP_FILE" == s3://* ]]; then
  rm -f "${LOCAL_BACKUP}"
fi

echo ""
echo "============================================"
echo "Restoration complete"
echo "============================================"
