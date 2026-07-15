/**
 * CSRF-suojauksen ydinlogiikka ilman Fastify-riippuvuutta, jotta se on
 * testattavissa. Palauttaa true, jos pyynto saa jatkaa.
 *
 * Idea: muuttava pyynto hyvaksytaan vain, jos sen Origin/Referer-isantanimi
 * tasmaa palvelun omaan isantanimeen. Yhdessa SameSite=strict-evasteen kanssa
 * tama estaa toisen sivuston tekemat pyynnot.
 */

/** Poimii pelkan isantanimen. Sietaa protokollan, portin, polun ja kauttaviivat. */
export function hostOf(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === 'null') return null;

  // Kokeillaan ensin tayta URL:ia (Origin ja Referer ovat yleensa tallaisia).
  try {
    return new URL(trimmed).host.toLowerCase();
  } catch {
    // Ei ollut URL. Voi olla pelkka isantanimi, ehka protokollalla tai polulla.
    const stripped = trimmed
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .toLowerCase();
    return stripped === '' ? null : stripped;
  }
}

export type OriginDecision = 'allow' | 'no_origin' | 'mismatch';

/**
 * @param method        pyynnon HTTP-metodi
 * @param originHeader  Origin-otsake. Osa selaimista lahettaa 'null' (esim.
 *                      tiukan referrer-politiikan alla) - silloin pudotaan
 *                      Refereriin.
 * @param refererHeader Referer-otsake, varalahde kun Origin puuttuu tai on 'null'
 * @param hostHeader    pyynnon Host-otsake
 * @param configuredHost  ADMIN_DOMAIN, jos asetettu
 */
export function checkOrigin(
  method: string,
  originHeader: string | undefined,
  refererHeader: string | undefined,
  hostHeader: string | undefined,
  configuredHost: string | undefined,
): OriginDecision {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return 'allow';

  // 'Origin: null' ja puuttuva Origin kasitellaan samoin: kokeillaan Refereria.
  const origin = hostOf(originHeader) ?? hostOf(refererHeader);
  if (!origin) return 'no_origin';

  // Sallitut isantanimet: ADMIN_DOMAIN ja pyynnon oma Host. Kumpi tahansa kelpaa,
  // joten guard ei kaadu vaikka ADMIN_DOMAIN olisi jaanyt asettamatta tai siina
  // olisi ylimaarainen protokolla/kauttaviiva.
  const allowed = new Set<string>();
  const configured = hostOf(configuredHost);
  if (configured) allowed.add(configured);
  const host = hostOf(hostHeader);
  if (host) allowed.add(host);

  return allowed.has(origin) ? 'allow' : 'mismatch';
}
