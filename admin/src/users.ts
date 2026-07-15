import { pool, type Queryable } from './db.ts';
import { LOCKOUT_MINUTES, shouldLock } from './lockout.ts';
import { hashPassword } from './password.ts';

export type UserRole = 'admin' | 'staff';

export interface User {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
  failed_logins: number;
  locked_until: Date | null;
  last_login_at: Date | null;
  created_at: Date;
}

// Lukituksen saannot ovat lockout.ts:ssa, jotta ne ovat testattavissa ilman
// tietokantayhteytta. Uudelleenvienti pitaa kutsupaikat ennallaan.
export { isLocked, LOCKOUT_MINUTES, MAX_FAILED_LOGINS, shouldLock } from './lockout.ts';

export async function findByUsername(username: string): Promise<User | null> {
  const result = await pool.query<User>('SELECT * FROM users WHERE username = $1', [username]);
  return result.rows[0] ?? null;
}

export async function findById(id: string): Promise<User | null> {
  const result = await pool.query<User>('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

export async function listUsers(): Promise<User[]> {
  const result = await pool.query<User>('SELECT * FROM users ORDER BY username');
  return result.rows;
}

export async function countUsers(): Promise<number> {
  const result = await pool.query<{ count: string }>('SELECT count(*) AS count FROM users');
  return Number(result.rows[0]?.count ?? 0);
}

export async function createUser(
  input: { username: string; displayName: string; password: string; role: UserRole },
  client?: Queryable,
): Promise<User> {
  const executor: Queryable = client ?? pool;
  const passwordHash = await hashPassword(input.password);

  const result = await executor.query<User>(
    `INSERT INTO users (username, display_name, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.username, input.displayName, passwordHash, input.role],
  );

  const user = result.rows[0];
  if (!user) throw new Error('Kayttajan luonti epaonnistui');
  return user;
}

export async function setPassword(userId: string, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  await pool.query(
    `UPDATE users
     SET password_hash = $2, failed_logins = 0, locked_until = NULL, updated_at = now()
     WHERE id = $1`,
    [userId, passwordHash],
  );
}

export async function updateUser(
  userId: string,
  input: { displayName: string; role: UserRole; isActive: boolean },
): Promise<void> {
  await pool.query(
    `UPDATE users
     SET display_name = $2, role = $3, is_active = $4, updated_at = now()
     WHERE id = $1`,
    [userId, input.displayName, input.role, input.isActive],
  );
}

/** Nollaa lukituksen ja epaonnistuneet yritykset (adminin "avaa tili" -toiminto). */
export async function unlockUser(userId: string): Promise<void> {
  await pool.query(
    'UPDATE users SET failed_logins = 0, locked_until = NULL, updated_at = now() WHERE id = $1',
    [userId],
  );
}

export async function recordSuccessfulLogin(userId: string): Promise<void> {
  await pool.query(
    `UPDATE users
     SET failed_logins = 0, locked_until = NULL, last_login_at = now(), updated_at = now()
     WHERE id = $1`,
    [userId],
  );
}

/** Kasvattaa epaonnistuneiden laskuria ja lukitsee tilin tarvittaessa. */
export async function recordFailedLogin(user: User): Promise<{ locked: boolean }> {
  const locked = shouldLock(user.failed_logins);

  await pool.query(
    `UPDATE users
     SET failed_logins = failed_logins + 1,
         locked_until = CASE WHEN $2 THEN now() + ($3 || ' minutes')::interval ELSE locked_until END,
         updated_at = now()
     WHERE id = $1`,
    [user.id, locked, String(LOCKOUT_MINUTES)],
  );

  return { locked };
}
