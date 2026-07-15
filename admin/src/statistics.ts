import { pool } from './db.ts';

/**
 * Tilastot (spec 13).
 *
 * TARKEA PERIAATE: maksukertyma lasketaan AINA rekisterointien fee_cents-
 * snapshoteista, EI osallistujatyyppien nykyhinnoista. Nain:
 *   - "Ei kohdistettu" -rivin oma summa (esim. 28 e) nakyy kertymassa, vaikka
 *     tyypin hinta on 0 e
 *   - tyypin hinnanmuutos kesken leirin ei muuta jo kirjattuja summia
 * Luku vastaa siis sita, mita kassaan oikeasti tuli.
 *
 * Kaikki lasketaan elavista riveista (deleted_at IS NULL).
 */

export interface TotalStats {
  count: number;
  feeCents: number;
  today: number;
  todayFeeCents: number;
}

export interface TypeStats {
  typeId: string;
  typeName: string;
  isSystem: boolean;
  count: number;
  feeCents: number;
}

export interface UserStats {
  userId: string | null;
  displayName: string;
  count: number;
}

export interface RangeStats {
  count: number;
  feeCents: number;
}

/** Kokonaismaara ja -kertyma seka tama paiva (Suomen aikaa). */
export async function totals(): Promise<TotalStats> {
  const result = await pool.query<{
    count: string;
    fee_cents: string;
    today: string;
    today_fee_cents: string;
  }>(
    `SELECT
       count(*)::text AS count,
       coalesce(sum(fee_cents), 0)::text AS fee_cents,
       count(*) FILTER (
         WHERE registered_at >= date_trunc('day', now() AT TIME ZONE 'Europe/Helsinki')
               AT TIME ZONE 'Europe/Helsinki'
       )::text AS today,
       coalesce(sum(fee_cents) FILTER (
         WHERE registered_at >= date_trunc('day', now() AT TIME ZONE 'Europe/Helsinki')
               AT TIME ZONE 'Europe/Helsinki'
       ), 0)::text AS today_fee_cents
     FROM registrations
     WHERE deleted_at IS NULL`,
  );

  const row = result.rows[0];
  return {
    count: Number(row?.count ?? 0),
    feeCents: Number(row?.fee_cents ?? 0),
    today: Number(row?.today ?? 0),
    todayFeeCents: Number(row?.today_fee_cents ?? 0),
  };
}

/**
 * Ryhmittely osallistujatyypeittain. "Ei kohdistettu" on mukana omana rivinaan,
 * ja sen summa on todellinen kertynyt summa (rivien fee_cents-snapshotit
 * yhteenlaskettuna) - ei tyypin nimellishinta 0 e.
 *
 * Mukana myos tyypit, joihin ei ole yhtaan rekisterointia (LEFT JOIN).
 */
export async function byType(): Promise<TypeStats[]> {
  const result = await pool.query<{
    type_id: string;
    type_name: string;
    is_system: boolean;
    count: string;
    fee_cents: string;
  }>(
    `SELECT
       t.id AS type_id,
       t.name AS type_name,
       t.is_system,
       count(r.id)::text AS count,
       coalesce(sum(r.fee_cents), 0)::text AS fee_cents
     FROM participant_types t
     LEFT JOIN registrations r
       ON r.participant_type_id = t.id AND r.deleted_at IS NULL
     GROUP BY t.id, t.name, t.is_system, t.sort_order
     ORDER BY t.sort_order, lower(t.name)`,
  );

  return result.rows.map((row) => ({
    typeId: row.type_id,
    typeName: row.type_name,
    isSystem: row.is_system,
    count: Number(row.count),
    feeCents: Number(row.fee_cents),
  }));
}

/** Kayttajakohtaiset rekisterointimaarat: kuka kirjasi montako. */
export async function byUser(): Promise<UserStats[]> {
  const result = await pool.query<{
    user_id: string | null;
    display_name: string | null;
    count: string;
  }>(
    `SELECT
       r.registered_by AS user_id,
       u.display_name,
       count(*)::text AS count
     FROM registrations r
     LEFT JOIN users u ON u.id = r.registered_by
     WHERE r.deleted_at IS NULL
     GROUP BY r.registered_by, u.display_name
     ORDER BY count(*) DESC`,
  );

  return result.rows.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name ?? 'Massatuonti tai poistettu käyttäjä',
    count: Number(row.count),
  }));
}

/**
 * Aikavalin rekisteroinnit ja kertyma. Rajat tulkitaan Suomen aikana ja
 * kasitellaan inklusiivisina paivina (from 00:00 - to 23:59:59).
 */
export async function byRange(fromDate: string, toDate: string): Promise<RangeStats> {
  const result = await pool.query<{ count: string; fee_cents: string }>(
    `SELECT
       count(*)::text AS count,
       coalesce(sum(fee_cents), 0)::text AS fee_cents
     FROM registrations
     WHERE deleted_at IS NULL
       AND registered_at >= ($1::date) AT TIME ZONE 'Europe/Helsinki'
       AND registered_at <  (($2::date) + 1) AT TIME ZONE 'Europe/Helsinki'`,
    [fromDate, toDate],
  );

  const row = result.rows[0];
  return { count: Number(row?.count ?? 0), feeCents: Number(row?.fee_cents ?? 0) };
}
