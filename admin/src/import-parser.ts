import { isValidCallsign, normalizeCallsign } from './callsign.ts';
import { parseFeeToCents } from './money.ts';

/**
 * Massatuonnin jasennin. Tietokantariippumaton, jotta testattavissa.
 *
 * Kasittelee Excelista kopioidun (tab-erotellun) tai CSV-muotoisen tekstin.
 * Ei tiedostojen latausta eika .xlsx-jasennysta: leikepoydan teksti on sama
 * jokaisesta Excel-versiosta.
 */

/** Sarakkeet, jotka jasennin osaa tunnistaa otsikkoriviltal. */
export type ColumnKind = 'callsign' | 'name' | 'card' | 'cash' | 'consent' | 'ignore';

const HEADER_ALIASES: Record<string, ColumnKind> = {
  kutsu: 'callsign',
  kutsumerkki: 'callsign',
  call: 'callsign',
  callsign: 'callsign',
  nimi: 'name',
  name: 'name',
  korttimaksu: 'card',
  kortti: 'card',
  card: 'card',
  kateinen: 'cash',
  käteinen: 'cash',
  cash: 'cash',
  suostumus: 'consent',
  lupa: 'consent',
  consent: 'consent',
};

/** Tunnistaa erottimen: tab, puolipiste vai pilkku (suomalainen Excel: usein ;). */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  if (firstLine.includes('\t')) return '\t';
  if (firstLine.includes(';')) return ';';
  return ',';
}

function splitLine(line: string, delimiter: string): string[] {
  return line.split(delimiter).map((cell) => cell.trim());
}

/** Normalisoi otsikon avainmuotoon (pienet kirjaimet, ilman valilyonteja). */
function headerKey(cell: string): string {
  return cell.toLowerCase().replace(/\s+/g, '');
}

export interface ColumnMapping {
  /** Sarakeindeksi -> merkitys. */
  columns: ColumnKind[];
  hasHeader: boolean;
}

/**
 * Tunnistaa otsikkorivin ja kartoittaa sarakkeet. Jos ensimmainen rivi ei
 * nayta otsikolta, oletetaan jarjestys: kutsu, nimi, korttimaksu, kateinen,
 * suostumus.
 */
export function mapColumns(headerCells: string[]): ColumnMapping {
  const recognized = headerCells.map((cell) => HEADER_ALIASES[headerKey(cell)]);
  const looksLikeHeader = recognized.some((kind) => kind !== undefined);

  if (looksLikeHeader) {
    return {
      columns: recognized.map((kind) => kind ?? 'ignore'),
      hasHeader: true,
    };
  }

  // Ei otsikkoa: oletusjarjestys.
  const fallback: ColumnKind[] = ['callsign', 'name', 'card', 'cash', 'consent'];
  return {
    columns: headerCells.map((_, i) => fallback[i] ?? 'ignore'),
    hasHeader: false,
  };
}

export interface ParsedRow {
  lineNumber: number;
  callsign: string;
  callsignNormalized: string;
  name: string;
  feeCents: number;
  /** true = 'x' suostumussarakkeessa -> julkaistaan. Muuten hidden. */
  consent: boolean;
  errors: string[];
}

export interface ParseResult {
  mapping: ColumnMapping;
  rows: ParsedRow[];
}

function cellAt(cells: string[], columns: ColumnKind[], kind: ColumnKind): string {
  const index = columns.indexOf(kind);
  return index >= 0 ? (cells[index] ?? '') : '';
}

/**
 * Yhdistaa korttimaksun ja kateisen yhdeksi summaksi. Ne ovat toisensa
 * poissulkevia, mutta jos molemmat on taytetty, ne lasketaan yhteen.
 * Tyhja tai '0' tarkoittaa nollaa, joka on validi maksu.
 */
function combineFees(card: string, cash: string): number | null {
  const cardCents = card.trim() === '' ? 0 : parseFeeToCents(card);
  const cashCents = cash.trim() === '' ? 0 : parseFeeToCents(cash);

  if (cardCents === null || cashCents === null) return null;
  return cardCents + cashCents;
}

export function parseImport(text: string): ParseResult {
  const delimiter = detectDelimiter(text);
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');

  if (lines.length === 0) {
    return { mapping: { columns: [], hasHeader: false }, rows: [] };
  }

  const mapping = mapColumns(splitLine(lines[0] ?? '', delimiter));
  const dataLines = mapping.hasHeader ? lines.slice(1) : lines;
  const headerOffset = mapping.hasHeader ? 2 : 1;

  const rows: ParsedRow[] = dataLines.map((line, i) => {
    const cells = splitLine(line, delimiter);
    const errors: string[] = [];

    const rawCallsign = cellAt(cells, mapping.columns, 'callsign');
    const callsignNormalized = normalizeCallsign(rawCallsign);
    if (!isValidCallsign(callsignNormalized)) {
      errors.push('Kutsumerkki puuttuu tai on virheellinen');
    }

    const card = cellAt(cells, mapping.columns, 'card');
    const cash = cellAt(cells, mapping.columns, 'cash');
    const feeCents = combineFees(card, cash);
    if (feeCents === null) {
      errors.push('Maksukentta on virheellinen');
    }

    const consentCell = cellAt(cells, mapping.columns, 'consent').toLowerCase();
    // Vain 'x' julkaisee. Tyhja tai mika tahansa muu -> ei julkaista.
    const consent = consentCell === 'x';

    return {
      lineNumber: i + headerOffset,
      callsign: callsignNormalized,
      callsignNormalized,
      name: cellAt(cells, mapping.columns, 'name'),
      feeCents: feeCents ?? 0,
      consent,
      errors,
    };
  });

  return { mapping, rows };
}

/** Merkitsee aineiston sisaiset kaksoiskappaleet (sama normalisoitu kutsumerkki). */
export function markInternalDuplicates(rows: ParsedRow[]): Map<string, number[]> {
  const seen = new Map<string, number[]>();
  for (const row of rows) {
    if (row.errors.length > 0) continue;
    const list = seen.get(row.callsignNormalized) ?? [];
    list.push(row.lineNumber);
    seen.set(row.callsignNormalized, list);
  }

  const duplicates = new Map<string, number[]>();
  for (const [callsign, lineNumbers] of seen) {
    if (lineNumbers.length > 1) duplicates.set(callsign, lineNumbers);
  }
  return duplicates;
}
