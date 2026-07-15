import { pool } from './db.ts';

/**
 * Vieraskutsujen etuliite osallistujille, joilla ei ole omaa kutsumerkkia
 * (esim. VIERAS1, VIERAS2).
 */
export async function guestCallsignPrefix(): Promise<string> {
  const result = await pool.query<{ value: unknown }>(
    "SELECT value FROM settings WHERE key = 'guest_callsign_prefix'",
  );
  const value = result.rows[0]?.value;
  return typeof value === 'string' ? value : 'VIERAS';
}

/** Tietosuojaselosteen nykyinen sisalto (vapaa teksti). */
export async function getPrivacyPolicy(): Promise<string> {
  const result = await pool.query<{ value: unknown }>(
    "SELECT value FROM settings WHERE key = 'privacy_policy'",
  );
  const value = result.rows[0]?.value;
  return typeof value === 'string' ? value : '';
}
