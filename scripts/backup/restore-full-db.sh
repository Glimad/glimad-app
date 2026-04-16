#!/bin/bash
# ============================================================
# Full Database Restore
# Brief 33: Complete database restoration from backup
# ============================================================
#
# Usage: ./restore-full-db.sh <backup_date>
#
# Example:
#   ./restore-full-db.sh 2024-01-15
#
# This script will:
# 1. Enable maintenance mode
# 2. Download backup from S3
# 3. Restore entire database
# 4. Verify critical tables
# 5. Disable maintenance mode
#
# Environment variables required:
#   DATABASE_URL - PostgreSQL connection string
#   AWS_ACCESS_KEY_ID - AWS credentials
#   AWS_SECRET_ACCESS_KEY - AWS credentials
#   S3_BACKUP_BUCKET - S3 bucket name
#   API_URL - API URL for maintenance mode
#   ADMIN_TOKEN - Admin API token
#
# WARNING: This will REPLACE ALL DATA in the database!
# ============================================================

set -e

# Arguments
BACKUP_DATE="$1"

# Validate arguments
if [ -z "$BACKUP_DATE" ]; then
  echo "Usage: $0 <backup_date>"
  echo ""
  echo "Example:"
  echo "  $0 2024-01-15"
  exit 1
fi

# Configuration
S3_BUCKET="${S3_BACKUP_BUCKET:-glimad-backups}"
LOCAL_BACKUP="/tmp/restore-full-${BACKUP_DATE}.dump"

echo "============================================"
echo "⚠️  FULL DATABASE RESTORE"
echo "============================================"
echo "Backup Date: ${BACKUP_DATE}"
echo "S3 Bucket: ${S3_BUCKET}"
echo ""
echo "This will REPLACE ALL DATA with backup from ${BACKUP_DATE}"
echo ""

# Triple confirmation for full restore
read -p "Type 'yes' to confirm you understand this will replace all data: " CONFIRM1
if [ "$CONFIRM1" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

read -p "Type the backup date again to confirm (${BACKUP_DATE}): " CONFIRM2
if [ "$CONFIRM2" != "$BACKUP_DATE" ]; then
  echo "Date mismatch. Aborted."
  exit 0
fi

read -p "Final confirmation - type 'RESTORE' in caps: " CONFIRM3
if [ "$CONFIRM3" != "RESTORE" ]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "Starting full database restore..."
echo ""

# Step 1: Enable maintenance mode
echo "Step 1/5: Enabling maintenance mode..."
if [ -n "$API_URL" ] && [ -n "$ADMIN_TOKEN" ]; then
  curl -s -X POST "${API_URL}/api/admin/maintenance-mode" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"enabled": true, "reason": "Database restoration in progress", "message": "We are performing scheduled maintenance. Please check back in a few minutes."}'
  echo "Maintenance mode enabled"
else
  echo "WARNING: API_URL or ADMIN_TOKEN not set, skipping maintenance mode"
fi

# Step 2: Download backup from S3
echo ""
echo "Step 2/5: Downloading backup from S3..."
BACKUP_PATH="s3://${S3_BUCKET}/daily/${BACKUP_DATE}/full-backup.dump"
echo "Downloading: ${BACKUP_PATH}"
aws s3 cp "${BACKUP_PATH}" "${LOCAL_BACKUP}"
echo "Download complete"

# Step 3: Restore database
echo ""
echo "Step 3/5: Restoring database..."
echo "This may take several minutes depending on database size..."
pg_restore \
  --clean \
  --if-exists \
  --dbname="${DATABASE_URL}" \
  --verbose \
  "${LOCAL_BACKUP}" 2>&1 | tee /tmp/restore-log-${BACKUP_DATE}.txt

# Step 4: Verify critical tables
echo ""
echo "Step 4/5: Verifying critical tables..."
echo ""
echo "Table row counts:"
psql "${DATABASE_URL}" -c "
SELECT 'users' as table_name, COUNT(*) as row_count FROM users
UNION ALL SELECT 'projects', COUNT(*) FROM projects
UNION ALL SELECT 'core_ledger', COUNT(*) FROM core_ledger
UNION ALL SELECT 'core_wallets', COUNT(*) FROM core_wallets
UNION ALL SELECT 'core_subscriptions', COUNT(*) FROM core_subscriptions;
"

# Check for orphaned projects
echo ""
echo "Checking referential integrity..."
ORPHANED=$(psql "${DATABASE_URL}" -t -c "
SELECT COUNT(*) FROM projects p 
LEFT JOIN users u ON p.user_id = u.id 
WHERE u.id IS NULL;
" | tr -d ' ')

if [ "$ORPHANED" != "0" ]; then
  echo "⚠️  WARNING: Found ${ORPHANED} orphaned projects"
else
  echo "✅ No orphaned projects found"
fi

# Step 5: Disable maintenance mode
echo ""
echo "Step 5/5: Disabling maintenance mode..."
if [ -n "$API_URL" ] && [ -n "$ADMIN_TOKEN" ]; then
  curl -s -X POST "${API_URL}/api/admin/maintenance-mode" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"enabled": false}'
  echo "Maintenance mode disabled"
fi

# Cleanup
rm -f "${LOCAL_BACKUP}"

echo ""
echo "============================================"
echo "✅ Full database restore complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "1. Verify the application is working correctly"
echo "2. Check logs for any errors"
echo "3. Monitor for any data inconsistencies"
echo ""
echo "Restore log saved to: /tmp/restore-log-${BACKUP_DATE}.txt"
