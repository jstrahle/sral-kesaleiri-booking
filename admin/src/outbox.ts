import type { Queryable } from './db.ts';

/**
 * Outbox on ainoa tie julkiselle puolelle (docs/ARCHITECTURE.md).
 *
 * Tapahtumat kirjoitetaan AINA samassa transaktiossa kuin itse muutos, joten
 * ei voi syntya tilannetta, jossa rekisterointi tallentuu mutta julkaisu katoaa.
 * Erillinen tyontaja (vaihe 3) lahettaa rivit julkiselle palvelulle.
 */

export interface PublishableRegistration {
  id: string;
  callsign: string;
  callsign_normalized: string;
  registered_at: Date;
  version: string | number;
}

/** Julkaistava rekisterointi: julkiselle puolelle menee vain kutsumerkki ja aika. */
export async function emitUpsert(client: Queryable, row: PublishableRegistration): Promise<void> {
  await client.query(
    `INSERT INTO outbox (type, payload) VALUES ('registration.upsert', $1::jsonb)`,
    [
      JSON.stringify({
        id: row.id,
        callsign: row.callsign,
        callsign_normalized: row.callsign_normalized,
        registered_at: row.registered_at,
        version: String(row.version),
      }),
    ],
  );
}

/** Poisto tai piilotus: rivi katoaa julkiselta puolelta ja saa hautakiven. */
export async function emitRemove(
  client: Queryable,
  row: { id: string; version: string | number },
): Promise<void> {
  await client.query(
    `INSERT INTO outbox (type, payload) VALUES ('registration.remove', $1::jsonb)`,
    [JSON.stringify({ id: row.id, version: String(row.version) })],
  );
}

/**
 * Kavijalaskuri. Sisaltaa MYOS piilotetut osallistujat: luku vastaa kysymykseen
 * "kuinka monta kavijaa leirilla on", eika se ole henkilotietoa. Piilotettu
 * osallistuja ei silti nay julkisessa luettelossa eika haussa.
 */
export async function emitTotalCount(client: Queryable): Promise<number> {
  const result = await client.query<{ total: string; version: string }>(
    `SELECT (SELECT count(*) FROM registrations WHERE deleted_at IS NULL)::text AS total,
            nextval('version_seq')::text AS version`,
  );

  const row = result.rows[0];
  if (!row) throw new Error('Laskurin lukeminen epaonnistui');

  await client.query(`INSERT INTO outbox (type, payload) VALUES ('stats.set', $1::jsonb)`, [
    JSON.stringify({ key: 'total_count', value: Number(row.total), version: row.version }),
  ]);

  return Number(row.total);
}

/**
 * Tietosuojaseloste julkiselle puolelle. Versioidaan samasta sekvenssista kuin
 * muutkin tapahtumat, joten myohastynyt vanha versio ei yliaja uudempaa.
 */
export async function emitPrivacyPolicy(client: Queryable, content: string): Promise<void> {
  const result = await client.query<{ version: string }>(
    `SELECT nextval('version_seq')::text AS version`,
  );
  const version = result.rows[0]?.version;
  if (!version) throw new Error('Version luku epaonnistui');

  await client.query(`INSERT INTO outbox (type, payload) VALUES ('privacy.set', $1::jsonb)`, [
    JSON.stringify({ content, version }),
  ]);
}
