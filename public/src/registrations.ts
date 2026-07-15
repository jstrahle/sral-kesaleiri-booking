import { pool } from './db.ts';

/**
 * Julkinen luettelo. Taalla on VAIN kutsumerkki ja rekisterointihetki -
 * nimia, osallistujatyyppeja, maksuja tai piilotettuja osallistujia ei ole
 * olemassakaan tassa tietokannassa.
 */

export interface PublicRegistration {
  id: string;
  callsign: string;
  registered_at: Date;
}

export type SortKey = 'aika' | 'kutsu';

export interface ListOptions {
  query: string;
  sort: SortKey;
  page: number;
  perPage: number;
}

export interface ListResult {
  rows: PublicRegistration[];
  page: number;
  pages: number;
  total: number;
}

function normalize(input: string): string {
  return input.toUpperCase().replace(/[\s\-.]/g, '');
}

export async function list(options: ListOptions): Promise<ListResult> {
  const query = options.query.trim();
  const pattern = query === '' ? null : `${normalize(query)}%`;

  const countResult = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM registrations
     WHERE $1::text IS NULL OR callsign_normalized LIKE $1`,
    [pattern],
  );

  const total = Number(countResult.rows[0]?.count ?? 0);
  const pages = Math.max(1, Math.ceil(total / options.perPage));
  const page = Math.min(Math.max(1, options.page), pages);

  const orderBy =
    options.sort === 'kutsu' ? 'callsign_normalized ASC' : 'registered_at DESC, callsign ASC';

  const rows = await pool.query<PublicRegistration>(
    `SELECT id, callsign, registered_at FROM registrations
     WHERE $1::text IS NULL OR callsign_normalized LIKE $1
     ORDER BY ${orderBy}
     LIMIT $2 OFFSET $3`,
    [pattern, options.perPage, (page - 1) * options.perPage],
  );

  return { rows: rows.rows, page, pages, total };
}

/** Uusimmat kutsumerkit seinanaytolle. */
export async function latest(limit = 12): Promise<PublicRegistration[]> {
  const result = await pool.query<PublicRegistration>(
    `SELECT id, callsign, registered_at FROM registrations
     ORDER BY registered_at DESC
     LIMIT $1`,
    [limit],
  );
  return result.rows;
}

/**
 * Kavijalaskuri. Sisaltaa myos piilotetut osallistujat: luku vastaa kysymykseen
 * "kuinka monta kavijaa leirilla on". Piilotetut eivat silti nay luettelossa.
 */
export async function totalCount(): Promise<number> {
  const result = await pool.query<{ value: string }>(
    "SELECT value::text AS value FROM stats WHERE key = 'total_count'",
  );
  return Number(result.rows[0]?.value ?? 0);
}

/** Tietosuojaselosteen sisalto julkiselle sivulle (vapaa teksti). */
export async function privacyPolicy(): Promise<string> {
  const result = await pool.query<{ content: string }>(
    'SELECT content FROM privacy_policy WHERE id = 1',
  );
  return result.rows[0]?.content ?? '';
}
