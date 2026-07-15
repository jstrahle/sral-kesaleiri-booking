/**
 * Osallistumismaksujen kasittely. Rahasummat sailytetaan kokonaislukuina
 * (sentteina) - liukuluvut aiheuttavat pyoristysvirheita summissa.
 *
 * Ei tietokantariippuvuutta, jotta testattavissa ilman ymparistomuuttujia.
 */

/** Suurin sallittu maksu (100 000 e) - suojaa nappailyonneilta. */
const MAX_CENTS = 10_000_000;

/**
 * Lukee kayttajan syottaman summan sentteina.
 * Hyvaksyy suomalaisen pilkun ja pisteen: "12", "12,50", "12.5", "12,50 e".
 * Palauttaa null, jos syote ei kelpaa.
 */
export function parseFeeToCents(input: string): number | null {
  const cleaned = input
    .replace(/\u20ac/g, '')
    .replace(/e$/i, '')
    .replace(/\s/g, '')
    .replace(',', '.')
    .trim();

  if (cleaned === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const cents = Math.round(Number(cleaned) * 100);
  if (!Number.isFinite(cents) || cents < 0 || cents > MAX_CENTS) return null;

  return cents;
}

/** Muotoilee sentit naytettavaksi: 1250 -> "12,50 EUR" */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat('fi-FI', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

/** Muotoilee sentit lomakekenttaan: 1250 -> "12,50" */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}
