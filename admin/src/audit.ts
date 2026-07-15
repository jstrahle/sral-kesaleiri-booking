import { pool, type Queryable } from './db.ts';

export interface AuditEntry {
  userId?: string | undefined;
  username?: string | undefined;
  action: string;
  entity?: string | undefined;
  entityId?: string | undefined;
  details?: Record<string, unknown> | undefined;
  ip?: string | undefined;
}

/**
 * Kirjaa tapahtuman auditointilokiin (spec 14).
 *
 * Anna `client`, kun kirjaus kuuluu samaan transaktioon kuin itse muutos -
 * silloin loki ja muutos joko molemmat tallentuvat tai kumpikaan ei tallennu.
 * Tietokanta estaa lokirivien muuttamisen ja poistamisen triggerilla.
 */
export async function audit(entry: AuditEntry, client?: Queryable): Promise<void> {
  const executor: Queryable = client ?? pool;

  await executor.query(
    `INSERT INTO audit_log (user_id, username, action, entity, entity_id, details, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.userId ?? null,
      entry.username ?? null,
      entry.action,
      entry.entity ?? null,
      entry.entityId ?? null,
      entry.details ? JSON.stringify(entry.details) : null,
      entry.ip ?? null,
    ],
  );
}
