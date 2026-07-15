#!/bin/sh
# Hallinnan tietokannan varmuuskopio. Ajetaan backup-kontissa tunnin valein.
set -eu

STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="/backups/admin-${STAMP}.sql.gz"

pg_dump -h admin-db -U "${ADMIN_DB_USER}" -d "${ADMIN_DB_NAME}" --clean --if-exists \
  | gzip -9 > "${TARGET}.tmp"
mv "${TARGET}.tmp" "${TARGET}"

echo "$(date -Iseconds) varmuuskopio: ${TARGET}"

# Vanhojen siivous
find /backups -name 'admin-*.sql.gz' -mtime "+${BACKUP_RETENTION_DAYS}" -delete
