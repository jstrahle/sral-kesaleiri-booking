import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Synkronointipyyntojen allekirjoitus. Sama toteutus molemmilla puolilla.
 *
 * Allekirjoitetaan aikaleima JA runko, jotta kaapattua pyyntoa ei voi toistaa
 * myohemmin: vanhentunut aikaleima hylataan.
 */

/** Vanhempi kuin tama (sekunteina) hylataan toistohyokkayksena. */
export const MAX_CLOCK_SKEW_SECONDS = 300;

export function sign(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export type VerifyResult = 'ok' | 'bad_signature' | 'expired' | 'malformed';

export function verify(
  secret: string,
  timestamp: string | undefined,
  signature: string | undefined,
  body: string,
  now: number = Date.now(),
): VerifyResult {
  if (!timestamp || !signature) return 'malformed';

  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return 'malformed';

  if (Math.abs(now / 1000 - sent) > MAX_CLOCK_SKEW_SECONDS) return 'expired';

  const expected = Buffer.from(sign(secret, timestamp, body), 'utf8');
  const actual = Buffer.from(signature, 'utf8');

  if (expected.length !== actual.length) return 'bad_signature';
  return timingSafeEqual(expected, actual) ? 'ok' : 'bad_signature';
}
