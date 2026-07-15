import type { Session } from 'fastify';
import { pool } from './db.ts';

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000; // 12 h - riittaa leiripaivaksi

type Callback = (error?: unknown) => void;
type SessionCallback = (error: unknown, session?: Session | null) => void;

function expiresAt(session: Session): Date {
  const expires = session.cookie.expires;
  return expires ? new Date(expires) : new Date(Date.now() + DEFAULT_TTL_MS);
}

/**
 * Istuntovarasto Postgresissa. Muistivarasto katoaisi kontin uudelleen-
 * kaynnistyksessa ja kirjaisi kaikki ilmoittautumispisteet ulos kesken paivan.
 */
export const postgresSessionStore = {
  set(sid: string, session: Session, callback: Callback): void {
    pool
      .query(
        `INSERT INTO sessions (sid, data, expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (sid) DO UPDATE SET data = EXCLUDED.data, expires_at = EXCLUDED.expires_at`,
        [sid, JSON.stringify(session), expiresAt(session)],
      )
      .then(() => {
        callback();
      })
      .catch((error: unknown) => {
        callback(error);
      });
  },

  get(sid: string, callback: SessionCallback): void {
    pool
      .query<{ data: Session }>('SELECT data FROM sessions WHERE sid = $1 AND expires_at > now()', [
        sid,
      ])
      .then((result) => {
        callback(null, result.rows[0]?.data ?? null);
      })
      .catch((error: unknown) => {
        callback(error, null);
      });
  },

  destroy(sid: string, callback: Callback): void {
    pool
      .query('DELETE FROM sessions WHERE sid = $1', [sid])
      .then(() => {
        callback();
      })
      .catch((error: unknown) => {
        callback(error);
      });
  },
};

/** Siivoaa vanhentuneet istunnot. Ajetaan ajastetusti serverista. */
export async function purgeExpiredSessions(): Promise<number> {
  const result = await pool.query('DELETE FROM sessions WHERE expires_at <= now()');
  return result.rowCount ?? 0;
}
