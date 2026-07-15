/**
 * Tilin lukituksen saannot. Omassa moduulissaan ilman tietokantariippuvuutta,
 * jotta logiikka on testattavissa ilman ymparistomuuttujia ja tietokantaa.
 */

/** Tili lukitaan taman monen epaonnistuneen yrityksen jalkeen. */
export const MAX_FAILED_LOGINS = 5;

/** Lukituksen kesto minuutteina. */
export const LOCKOUT_MINUTES = 15;

/** Onko tili talla hetkella lukittu? */
export function isLocked(user: { locked_until: Date | null }, now: Date = new Date()): boolean {
  return user.locked_until !== null && user.locked_until.getTime() > now.getTime();
}

/** Lukitaanko tili taman epaonnistuneen yrityksen jalkeen? */
export function shouldLock(failedLogins: number): boolean {
  return failedLogins + 1 >= MAX_FAILED_LOGINS;
}
