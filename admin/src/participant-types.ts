import { pool } from './db.ts';

export interface ParticipantType {
  id: string;
  name: string;
  description: string | null;
  fee_cents: number;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface ParticipantTypeWithUsage extends ParticipantType {
  /** Montako rekisterointia tahan tyyppiin viittaa (myos poistetut). */
  registration_count: number;
}

/** Kaikki tyypit kayttoliittymaa varten, kayttomaarineen. */
export async function listTypes(): Promise<ParticipantTypeWithUsage[]> {
  const result = await pool.query<ParticipantTypeWithUsage>(
    `SELECT t.*, count(r.id)::int AS registration_count
     FROM participant_types t
     LEFT JOIN registrations r ON r.participant_type_id = t.id
     WHERE t.is_system = false
     GROUP BY t.id
     ORDER BY t.sort_order, lower(t.name)`,
  );
  return result.rows;
}

/** Vain aktiiviset tyypit - naita tarjotaan rekisterointilomakkeella. */
export async function listActiveTypes(): Promise<ParticipantType[]> {
  const result = await pool.query<ParticipantType>(
    `SELECT * FROM participant_types
     WHERE is_active = true AND is_system = false
     ORDER BY sort_order, lower(name)`,
  );
  return result.rows;
}

export async function findType(id: string): Promise<ParticipantType | null> {
  const result = await pool.query<ParticipantType>('SELECT * FROM participant_types WHERE id = $1', [
    id,
  ]);
  return result.rows[0] ?? null;
}

export interface TypeInput {
  name: string;
  description: string | null;
  feeCents: number;
  isActive: boolean;
  sortOrder: number;
}

export async function createType(input: TypeInput): Promise<ParticipantType> {
  const result = await pool.query<ParticipantType>(
    `INSERT INTO participant_types (name, description, fee_cents, is_active, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [input.name, input.description, input.feeCents, input.isActive, input.sortOrder],
  );

  const type = result.rows[0];
  if (!type) throw new Error('Osallistujatyypin luonti epaonnistui');
  return type;
}

/** Kohdistamaton-jarjestelmatyypin id (massatuonnin oletus). */
export async function unassignedTypeId(): Promise<string> {
  const result = await pool.query<{ id: string }>(
    "SELECT id FROM participant_types WHERE is_system = true AND name = 'Ei kohdistettu' LIMIT 1",
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('Jarjestelmatyyppia "Ei kohdistettu" ei loydy - aja migraatiot');
  return id;
}

/**
 * Kartoittaa summan (sentteina) osallistujatyyppiin.
 * Palauttaa tyypin id:n VAIN jos tasmalleen yksi nakyva tyyppi on sen hintainen.
 * Muuten (nolla tai useampi tasmaavaa) palauttaa null -> kutsuja kohdistaa
 * rivin "Ei kohdistettu" -tyyppiin.
 */
export async function matchTypeByFee(feeCents: number): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM participant_types
     WHERE is_active = true AND is_system = false AND fee_cents = $1`,
    [feeCents],
  );
  return result.rows.length === 1 ? (result.rows[0]?.id ?? null) : null;
}

export async function updateType(id: string, input: TypeInput): Promise<void> {
  await pool.query(
    `UPDATE participant_types
     SET name = $2, description = $3, fee_cents = $4, is_active = $5, sort_order = $6,
         updated_at = now()
     WHERE id = $1`,
    [id, input.name, input.description, input.feeCents, input.isActive, input.sortOrder],
  );
}

export type DeleteResult = 'deleted' | 'in_use';

/**
 * Poistaa tyypin vain, jos siihen ei viittaa yksikaan rekisterointi.
 * Kaytossa oleva tyyppi jatetaan koskematta (spec 7: poistaminen ei saa rikkoa
 * aiempia rekisterointeja) - se merkitaan sen sijaan ei-aktiiviseksi.
 */
export async function deleteType(id: string): Promise<DeleteResult> {
  try {
    // Jarjestelmatyyppia ei voi poistaa
    const deleted = await pool.query(
      'DELETE FROM participant_types WHERE id = $1 AND is_system = false',
      [id],
    );
    if ((deleted.rowCount ?? 0) === 0) return 'in_use';
    return 'deleted';
  } catch (error) {
    // 23503 = viiteavainrajoite: tyyppiin viittaa rekisterointeja
    if ((error as { code?: string }).code === '23503') return 'in_use';
    throw error;
  }
}

export async function setActive(id: string, isActive: boolean): Promise<void> {
  await pool.query(
    'UPDATE participant_types SET is_active = $2, updated_at = now() WHERE id = $1',
    [id, isActive],
  );
}
