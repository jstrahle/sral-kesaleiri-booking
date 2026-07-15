/**
 * Kutsumerkin normalisointi duplikaattitarkistusta varten (spec 9).
 *
 * Saannot:
 *   - kirjainkoko ei merkitse:            oh2abc  -> OH2ABC
 *   - valilyonnit ja valiviivat poistuvat: OH 2 ABC -> OH2ABC
 *   - kauttaviivapaate SAILYY:            OH2ABC/P /= OH2ABC
 *
 * Kauttaviivapaatteet sailytetaan tietoisesti: leirilla /P, /M ja epaviralliset
 * paatteet kuten /XYL voivat tarkoittaa eri henkiloa.
 */
export function normalizeCallsign(input: string): string {
  return input
    .toUpperCase()
    .normalize('NFKC')
    .replace(/[\s\-.]/g, '')
    .trim();
}

const CALLSIGN_PATTERN = /^[A-Z0-9]+(\/[A-Z0-9]+)*$/;

export function isValidCallsign(normalized: string): boolean {
  return normalized.length >= 2 && normalized.length <= 32 && CALLSIGN_PATTERN.test(normalized);
}

/** Seuraava vapaa vieraskutsu, esim. VIERAS1, VIERAS2, ... */
export function nextGuestCallsign(prefix: string, existing: readonly string[]): string {
  const upper = prefix.toUpperCase();
  const pattern = new RegExp(`^${upper}(\\d+)$`);
  let highest = 0;
  for (const call of existing) {
    const match = pattern.exec(call);
    if (match?.[1]) highest = Math.max(highest, Number(match[1]));
  }
  return `${upper}${highest + 1}`;
}
