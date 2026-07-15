import { normalizeCallsign, nextGuestCallsign } from './callsign.ts';
import { pool, withTransaction } from './db.ts';
import { audit } from './audit.ts';
import { emitRemove, emitTotalCount, emitUpsert } from './outbox.ts';
import { guestCallsignPrefix } from './settings.ts';

export interface Registration {
  id: string;
  name: string;
  callsign: string;
  callsign_normalized: string;
  participant_type_id: string;
  hidden: boolean;
  registered_by: string | null;
  registered_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  fee_cents: number;
  version: string;
}

export interface RegistrationRow extends Registration {
  type_name: string;
  registered_by_name: string | null;
}

const LIST_COLUMNS = `
  r.*,
  t.name AS type_name,
  u.display_name AS registered_by_name
`;

/** Elava rekisterointi kutsumerkilla - duplikaattitarkistuksen ydin (spec 9). */
export async function findByCallsign(callsign: string): Promise<RegistrationRow | null> {
  const result = await pool.query<RegistrationRow>(
    `SELECT ${LIST_COLUMNS}
     FROM registrations r
     JOIN participant_types t ON t.id = r.participant_type_id
     LEFT JOIN users u ON u.id = r.registered_by
     WHERE r.callsign_normalized = $1 AND r.deleted_at IS NULL`,
    [normalizeCallsign(callsign)],
  );
  return result.rows[0] ?? null;
}

export async function findById(id: string): Promise<RegistrationRow | null> {
  const result = await pool.query<RegistrationRow>(
    `SELECT ${LIST_COLUMNS}
     FROM registrations r
     JOIN participant_types t ON t.id = r.participant_type_id
     LEFT JOIN users u ON u.id = r.registered_by
     WHERE r.id = $1 AND r.deleted_at IS NULL`,
    [id],
  );
  return result.rows[0] ?? null;
}

/** Haku kutsumerkilla tai nimella. Tyhja haku palauttaa uusimmat. */
export async function search(query: string, limit = 50): Promise<RegistrationRow[]> {
  const trimmed = query.trim();

  if (trimmed === '') {
    const result = await pool.query<RegistrationRow>(
      `SELECT ${LIST_COLUMNS}
       FROM registrations r
       JOIN participant_types t ON t.id = r.participant_type_id
       LEFT JOIN users u ON u.id = r.registered_by
       WHERE r.deleted_at IS NULL
       ORDER BY r.registered_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  const result = await pool.query<RegistrationRow>(
    `SELECT ${LIST_COLUMNS}
     FROM registrations r
     JOIN participant_types t ON t.id = r.participant_type_id
     LEFT JOIN users u ON u.id = r.registered_by
     WHERE r.deleted_at IS NULL
       AND (r.callsign_normalized LIKE $1 || '%' OR lower(r.name) LIKE '%' || $2 || '%')
     ORDER BY r.registered_at DESC
     LIMIT $3`,
    [normalizeCallsign(trimmed), trimmed.toLowerCase(), limit],
  );
  return result.rows;
}

export interface Counts {
  total: number;
  today: number;
}

/** Laskurit ilmoittautumispisteen nakymaan. Sisaltaa myos piilotetut. */
export async function counts(): Promise<Counts> {
  const result = await pool.query<{ total: string; today: string }>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (
              WHERE registered_at >= date_trunc('day', now() AT TIME ZONE 'Europe/Helsinki')
                    AT TIME ZONE 'Europe/Helsinki'
            )::text AS today
     FROM registrations
     WHERE deleted_at IS NULL`,
  );

  const row = result.rows[0];
  return { total: Number(row?.total ?? 0), today: Number(row?.today ?? 0) };
}

/** Seuraava vapaa vieraskutsu osallistujalle, jolla ei ole omaa kutsumerkkia. */
export async function suggestGuestCallsign(): Promise<string> {
  const prefix = await guestCallsignPrefix();
  const result = await pool.query<{ callsign_normalized: string }>(
    `SELECT callsign_normalized FROM registrations
     WHERE deleted_at IS NULL AND callsign_normalized LIKE $1 || '%'`,
    [prefix.toUpperCase()],
  );

  return nextGuestCallsign(
    prefix,
    result.rows.map((row) => row.callsign_normalized),
  );
}

export interface CreateInput {
  name: string;
  callsign: string;
  participantTypeId: string;
  hidden: boolean;
  userId: string;
  username: string;
  ip?: string | undefined;
  importKey?: string | undefined;
}

export type CreateResult =
  | { status: 'created'; registration: Registration }
  | { status: 'duplicate'; existing: RegistrationRow };

/**
 * Rekisteroi osallistujan. Rekisterointi, auditointi ja outbox-tapahtumat
 * kirjoitetaan yhdessa transaktiossa: joko kaikki tallentuu tai ei mitaan.
 *
 * Maksu tallennetaan snapshotina: myohempi hinnanmuutos ei muuta jo kirjattuja.
 */
export async function create(input: CreateInput): Promise<CreateResult> {
  const existing = await findByCallsign(input.callsign);
  if (existing) return { status: 'duplicate', existing };

  const normalized = normalizeCallsign(input.callsign);

  return withTransaction(async (client) => {
    const inserted = await client.query<Registration>(
      `INSERT INTO registrations
         (name, callsign, callsign_normalized, participant_type_id, hidden, registered_by,
          fee_cents, import_key)
       SELECT $1, $2, $3, t.id, $4, $5, t.fee_cents, $6
       FROM participant_types t
       WHERE t.id = $7
       RETURNING *`,
      [
        input.name,
        normalized,
        normalized,
        input.hidden,
        input.userId,
        input.importKey ?? null,
        input.participantTypeId,
      ],
    );

    const registration = inserted.rows[0];
    if (!registration) throw new Error('Osallistujatyyppia ei loytynyt');

    // Piilotettu osallistuja ei paady julkiselle puolelle - ei upsert-tapahtumaa.
    if (!registration.hidden) {
      await emitUpsert(client, registration);
    }
    await emitTotalCount(client);

    await audit(
      {
        userId: input.userId,
        username: input.username,
        action: 'registration.create',
        entity: 'registration',
        entityId: registration.id,
        details: { callsign: registration.callsign, hidden: registration.hidden },
        ip: input.ip,
      },
      client,
    );

    return { status: 'created', registration };
  });
}

export interface UpdateInput {
  name: string;
  callsign: string;
  participantTypeId: string;
  hidden: boolean;
  userId: string;
  username: string;
  ip?: string | undefined;
}

export type UpdateResult =
  | { status: 'updated' }
  | { status: 'duplicate'; existing: RegistrationRow };

/**
 * Korjaa rekisterointia. Nimenkorjaus ei tuota julkiselle puolelle mitaan
 * (nimea ei siella ole), kutsumerkin korjaus paivittaa julkisen rivin paikallaan,
 * ja piilotuksen paalle kytkeminen poistaa rivin julkiselta puolelta.
 */
export async function update(id: string, input: UpdateInput): Promise<UpdateResult> {
  const current = await findById(id);
  if (!current) throw new Error('Rekisterointia ei loytynyt');

  const normalized = normalizeCallsign(input.callsign);

  if (normalized !== current.callsign_normalized) {
    const clash = await findByCallsign(normalized);
    if (clash && clash.id !== id) return { status: 'duplicate', existing: clash };
  }

  await withTransaction(async (client) => {
    const updated = await client.query<Registration>(
      `UPDATE registrations
       SET name = $2, callsign = $3, callsign_normalized = $3, participant_type_id = $4, hidden = $5
       WHERE id = $1
       RETURNING *`,
      [id, input.name, normalized, input.participantTypeId, input.hidden],
    );

    const registration = updated.rows[0];
    if (!registration) throw new Error('Rekisterointia ei loytynyt');

    if (registration.hidden) {
      await emitRemove(client, registration);
    } else {
      await emitUpsert(client, registration);
    }
    await emitTotalCount(client);

    await audit(
      {
        userId: input.userId,
        username: input.username,
        action: 'registration.update',
        entity: 'registration',
        entityId: id,
        details: {
          before: { callsign: current.callsign, name: current.name, hidden: current.hidden },
          after: { callsign: registration.callsign, name: registration.name, hidden: registration.hidden },
        },
        ip: input.ip,
      },
      client,
    );
  });

  return { status: 'updated' };
}

/**
 * Poisto on pehmea: rivi jaa tietokantaan deleted_at-leimalla, jotta auditointi
 * ja tilastot sailyvat. Kutsumerkki vapautuu uudelleen rekisteroitavaksi, koska
 * uniikkirajoite koskee vain elavia riveja.
 */
export async function remove(
  id: string,
  actor: { userId: string; username: string; ip?: string | undefined },
): Promise<void> {
  await withTransaction(async (client) => {
    const deleted = await client.query<Registration>(
      `UPDATE registrations
       SET deleted_at = now()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id],
    );

    const registration = deleted.rows[0];
    if (!registration) return;

    await emitRemove(client, registration);
    await emitTotalCount(client);

    await audit(
      {
        userId: actor.userId,
        username: actor.username,
        action: 'registration.delete',
        entity: 'registration',
        entityId: id,
        details: { callsign: registration.callsign },
        ip: actor.ip,
      },
      client,
    );
  });
}
