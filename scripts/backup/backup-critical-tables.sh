#!/bin/bash
# ============================================================
# Backup Critical Tables
# Brief 33: Backup critical tables to S3
# ============================================================
#
# Usage: ./backup-critical-tables.sh [output_dir]
#
# Environment variables required:
#   DATABASE_URL - PostgreSQL connection string
#   AWS_ACCESS_KEY_ID - AWS credentials
#   AWS_SECRET_ACCESS_KEY - AWS credentials
#   S3_BACKUP_BUCKET - S3 bucket name (default: glimad-backups)
#
# Critical tables backed up:
#   - core_ledger (financial transactions)
#   - core_wallets (user balances)
#   - users (authentication)
#   - projects (core entity)
#   - core_subscriptions (billing)
#   - core_payments (payment records)
# ============================================================

set -e

# Configuration
OUTPUT_DIR="${1:-/tmp/glimad-backups}"
S3_BUCKET="${S3_BACKUP_BUCKET:-glimad-backups}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DATE_PATH=$(date +%Y/%m/%d)
BACKUP_FILE="critical-backup-${TIMESTAMP}.dump"

# Critical tables
CRITICAL_TABLES=(
  "core_ledger"
  "core_wallets"
  "users"
  "projects"
  "core_subscriptions"
  "core_payments"
)

echo "============================================"
echo "Glimad Critical Tables Backup"
echo "============================================"
echo "Timestamp: ${TIMESTAMP}"
echo "Output: ${OUTPUT_DIR}/${BACKUP_FILE}"
echo "S3 Target: s3://${S3_BUCKET}/critical/${DATE_PATH}/"
echo ""

# Verify environment
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set"
  exit 1
fi

# Create output directory
mkdir -p "${OUTPUT_DIR}"

# Build table arguments
TABLE_ARGS=""
for table in "${CRITICAL_TABLES[@]}"; do
  TABLE_ARGS="${TABLE_ARGS} --table=${table}"
done

echo "Backing up tables: ${CRITICAL_TABLES[*]}"
echo ""

# Run pg_dump
echo "Running pg_dump..."
pg_dump \
  "${DATABASE_URL}" \
  ${TABLE_ARGS} \
  --format=custom \
  --verbose \
  --file="${OUTPUT_DIR}/${BACKUP_FILE}"

# Get file size
BACKUP_SIZE=$(stat -f%z "${OUTPUT_DIR}/${BACKUP_FILE}" 2>/dev/null || stat -c%s "${OUTPUT_DIR}/${BACKUP_FILE}")
echo ""
echo "Backup file size: $(numfmt --to=iec-i --suffix=B ${BACKUP_SIZE} 2>/dev/null || echo "${BACKUP_SIZE} bytes")"

# Upload to S3 (if AWS credentials are set)
if [ -n "$AWS_ACCESS_KEY_ID" ] && [ -n "$AWS_SECRET_ACCESS_KEY" ]; then
  echo ""
  echo "Uploading to S3..."
  aws s3 cp \
    "${OUTPUT_DIR}/${BACKUP_FILE}" \
    "s3://${S3_BUCKET}/critical/${DATE_PATH}/${BACKUP_FILE}" \
    --storage-class STANDARD_IA
  
  echo "Uploaded to: s3://${S3_BUCKET}/critical/${DATE_PATH}/${BACKUP_FILE}"
else
  echo ""
  echo "WARNING: AWS credentials not set, skipping S3 upload"
fi

# Cleanup old local backups (keep last 48 hours)
echo ""
echo "Cleaning up local backups older than 48 hours..."
find "${OUTPUT_DIR}" -name "critical-backup-*.dump" -mmin +2880 -delete 2>/dev/null || true

echo ""
echo "============================================"
echo "Backup completed successfully!"
echo "============================================"
