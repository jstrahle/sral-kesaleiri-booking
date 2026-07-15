import { pool, withTransaction } from './db.ts';

/**
 * Saapuvien tapahtumien soveltaminen.
 *
 * Toimitus on vahintaan kerran: sama tapahtuma voi saapua kahdesti, ja
 * verkkovirheiden jalkeen tapahtumat voivat saapua eri jarjestyksessa kuin ne
 * syntyivat. Siksi jokainen tapahtuma kantaa versionumeroa, ja vanhempi versio
 * ei koskaan yliaja uudempaa.
 */

export interface SyncEvent {
  seq: string;
  event_id: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface ApplyResult {
  lastSeq: string;
  /** Julkiselle puolelle lisatyt tai paivitetyt kutsumerkit (SSE-lahetysta varten). */
  upserted: { id: string; callsign: string; registered_at: string }[];
  removed: string[];
  total: number | null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

export async function applyEvents(events: SyncEvent[]): Promise<ApplyResult> {
  const result: ApplyResult = { lastSeq: '0', upserted: [], removed: [], total: null };

  await withTransaction(async (client) => {
    for (const event of events) {
      const payload = event.payload;

      if (event.type === 'registration.upsert') {
        const id = asString(payload.id);
        const version = asString(payload.version);

        // Hautakivi voittaa: poistettua rivia ei herateta henkiin myohastyneella
        // upsertilla.
        const upserted = await client.query<{ id: string; callsign: string; registered_at: string }>(
          `INSERT INTO registrations (id, callsign, callsign_normalized, registered_at, version)
           SELECT $1::uuid, $2, $3, $4::timestamptz, $5::bigint
           WHERE NOT EXISTS (
             SELECT 1 FROM tombstones WHERE id = $1::uuid AND version >= $5::bigint
           )
           ON CONFLICT (id) DO UPDATE
             SET callsign = EXCLUDED.callsign,
                 callsign_normalized = EXCLUDED.callsign_normalized,
                 registered_at = EXCLUDED.registered_at,
                 version = EXCLUDED.version
             WHERE registrations.version < EXCLUDED.version
           RETURNING id, callsign, registered_at::text AS registered_at`,
          [
            id,
            asString(payload.callsign),
            asString(payload.callsign_normalized),
            asString(payload.registered_at),
            version,
          ],
        );

        const row = upserted.rows[0];
        if (row) result.upserted.push(row);
      } else if (event.type === 'registration.remove') {
        const id = asString(payload.id);
        const version = asString(payload.version);

        await client.query(
          `INSERT INTO tombstones (id, version) VALUES ($1::uuid, $2::bigint)
           ON CONFLICT (id) DO UPDATE SET version = GREATEST(tombstones.version, EXCLUDED.version)`,
          [id, version],
        );

        const deleted = await client.query(
          'DELETE FROM registrations WHERE id = $1::uuid AND version <= $2::bigint',
          [id, version],
        );

        if ((deleted.rowCount ?? 0) > 0) result.removed.push(id);
      } else if (event.type === 'stats.set') {
        const key = asString(payload.key);
        const value = Number(payload.value);
        const version = asString(payload.version);

        const updated = await client.query<{ value: string }>(
          `INSERT INTO stats (key, value, version) VALUES ($1, $2::bigint, $3::bigint)
           ON CONFLICT (key) DO UPDATE
             SET value = EXCLUDED.value, version = EXCLUDED.version
             WHERE stats.version < EXCLUDED.version
           RETURNING value::text AS value`,
          [key, value, version],
        );

        const row = updated.rows[0];
        if (row && key === 'total_count') result.total = Number(row.value);
      } else if (event.type === 'privacy.set') {
        const content = asString(payload.content);
        const version = asString(payload.version);

        await client.query(
          `UPDATE privacy_policy
           SET content = $1, version = $2::bigint, updated_at = now()
           WHERE id = 1 AND version < $2::bigint`,
          [content, version],
        );
      }
      // Tuntemattomat tapahtumatyypit ohitetaan hiljaisesti, jotta vanha julkinen
      // palvelu ei kaadu, kun hallintapuoli paivitetaan ensin.

      result.lastSeq = event.seq;
    }

    if (events.length > 0) {
      await client.query(
        `UPDATE sync_cursor
         SET last_seq = GREATEST(last_seq, $1::bigint), updated_at = now()
         WHERE id = 1`,
        [result.lastSeq],
      );
    }
  });

  return result;
}

/** Kursori kerrotaan hallintapuolelle synkronointipyynnon VASTAUKSESSA. */
export async function currentCursor(): Promise<string> {
  const result = await pool.query<{ last_seq: string }>(
    'SELECT last_seq::text AS last_seq FROM sync_cursor WHERE id = 1',
  );
  return result.rows[0]?.last_seq ?? '0';
}
