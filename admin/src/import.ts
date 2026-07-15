import { createHash } from 'node:crypto';
import { audit } from './audit.ts';
import { pool, withTransaction } from './db.ts';
import {
  markInternalDuplicates,
  parseImport,
  type ParsedRow,
} from './import-parser.ts';
import { emitTotalCount, emitUpsert } from './outbox.ts';
import { matchTypeByFee, unassignedTypeId } from './participant-types.ts';

/**
 * Massatuonti. Kaksi vaihetta: esikatselu (preview) nayttaa mita tapahtuisi,
 * tallennus (commit) tekee sen idempotentisti.
 */

export type RowStatus = 'new' | 'error' | 'duplicate_internal' | 'duplicate_db';

export interface PreviewRow {
  lineNumber: number;
  callsign: string;
  name: string;
  feeCents: number;
  consent: boolean;
  status: RowStatus;
  /** Kohdistettu tyyppi ja onko se "Ei kohdistettu". */
  typeId: string;
  typeName: string;
  assigned: boolean;
  errors: string[];
}

export interface Preview {
  rows: PreviewRow[];
  summary: {
    total: number;
    toImport: number;
    errors: number;
    duplicates: number;
    unassigned: number;
  };
}

/**
 * Idempotenssiavain: sama rivi samasta aineistosta ei luo toista rekisterointia,
 * vaikka tuonti ajettaisiin vahingossa uudelleen (spec 11). Avain johdetaan
 * normalisoidusta kutsumerkista - se yksiloi henkilon.
 */
function importKey(callsignNormalized: string): string {
  return 'imp:' + createHash('sha256').update(callsignNormalized).digest('hex').slice(0, 24);
}

interface TypeInfo {
  id: string;
  name: string;
  assigned: boolean;
}

/** Kohdistaa rivin tyyppiin summan perusteella, tai "Ei kohdistettu". */
async function resolveType(feeCents: number, unassigned: { id: string; name: string }): Promise<TypeInfo> {
  const matchedId = await matchTypeByFee(feeCents);
  if (matchedId) {
    const result = await pool.query<{ name: string }>(
      'SELECT name FROM participant_types WHERE id = $1',
      [matchedId],
    );
    return { id: matchedId, name: result.rows[0]?.name ?? '', assigned: true };
  }
  return { id: unassigned.id, name: unassigned.name, assigned: false };
}

/** Rakentaa esikatselun ilman tallennusta. */
export async function preview(text: string): Promise<Preview> {
  const parsed = parseImport(text);
  const internalDups = markInternalDuplicates(parsed.rows);

  const unassignedId = await unassignedTypeId();
  const unassigned = { id: unassignedId, name: 'Ei kohdistettu' };

  // Kutsumerkit, jotka jo ovat tietokannassa (elavina).
  const validCallsigns = parsed.rows
    .filter((r) => r.errors.length === 0)
    .map((r) => r.callsignNormalized);

  const existing = new Set<string>();
  if (validCallsigns.length > 0) {
    const result = await pool.query<{ callsign_normalized: string }>(
      `SELECT callsign_normalized FROM registrations
       WHERE deleted_at IS NULL AND callsign_normalized = ANY($1::text[])`,
      [validCallsigns],
    );
    for (const row of result.rows) existing.add(row.callsign_normalized);
  }

  // Aineiston sisaisista kaksoiskappaleista vain ENSIMMAINEN esiintyma tuodaan.
  const seenInBatch = new Set<string>();

  const rows: PreviewRow[] = [];
  for (const row of parsed.rows) {
    const type = await resolveType(row.feeCents, unassigned);
    let status: RowStatus;

    if (row.errors.length > 0) {
      status = 'error';
    } else if (existing.has(row.callsignNormalized)) {
      status = 'duplicate_db';
    } else if (seenInBatch.has(row.callsignNormalized)) {
      status = 'duplicate_internal';
    } else {
      status = 'new';
      seenInBatch.add(row.callsignNormalized);
    }

    rows.push({
      lineNumber: row.lineNumber,
      callsign: row.callsign,
      name: row.name,
      feeCents: row.feeCents,
      consent: row.consent,
      status,
      typeId: type.id,
      typeName: type.name,
      assigned: type.assigned,
      errors: row.errors,
    });
  }

  const toImport = rows.filter((r) => r.status === 'new');

  return {
    rows,
    summary: {
      total: rows.length,
      toImport: toImport.length,
      errors: rows.filter((r) => r.status === 'error').length,
      duplicates: rows.filter(
        (r) => r.status === 'duplicate_db' || r.status === 'duplicate_internal',
      ).length,
      unassigned: toImport.filter((r) => !r.assigned).length,
    },
  };
}

export interface CommitResult {
  added: number;
  skipped: number;
}

/**
 * Tallentaa vain 'new'-rivit. Idempotentti: jos sama aineisto tuodaan
 * uudelleen, import_key-uniikkirajoite ja duplikaattitarkistus estavat
 * kahdennuksen (spec 11, hyvaksymiskriteeri 5).
 */
export async function commit(
  text: string,
  actor: { userId: string; username: string; ip?: string | undefined },
): Promise<CommitResult> {
  const view = await preview(text);
  const toImport = view.rows.filter((r) => r.status === 'new');

  let added = 0;

  await withTransaction(async (client) => {
    for (const row of toImport) {
      const key = importKey(row.callsign);

      // hidden = ei suostumusta. import_key tekee tallennuksesta idempotentin:
      // ON CONFLICT DO NOTHING sivuuttaa jo tuodun rivin.
      const inserted = await client.query<{
        id: string;
        callsign: string;
        callsign_normalized: string;
        registered_at: Date;
        version: string;
        hidden: boolean;
      }>(
        `INSERT INTO registrations
           (name, callsign, callsign_normalized, participant_type_id, hidden,
            registered_by, fee_cents, import_key)
         VALUES ($1, $2, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (import_key) WHERE import_key IS NOT NULL AND deleted_at IS NULL
           DO NOTHING
         RETURNING id, callsign, callsign_normalized, registered_at, version::text AS version, hidden`,
        [row.name, row.callsign, row.typeId, !row.consent, actor.userId, row.feeCents, key],
      );

      const reg = inserted.rows[0];
      if (!reg) continue; // jo tuotu -> ohitetaan

      added += 1;

      // Vain julkaistavat (suostumus annettu) menevat julkiselle puolelle.
      if (!reg.hidden) {
        await emitUpsert(client, reg);
      }
    }

    if (added > 0) await emitTotalCount(client);

    await audit(
      {
        userId: actor.userId,
        username: actor.username,
        action: 'registration.import',
        entity: 'registration',
        details: { added, offered: toImport.length },
        ip: actor.ip,
      },
      client,
    );
  });

  return { added, skipped: toImport.length - added };
}

export type { ParsedRow };
