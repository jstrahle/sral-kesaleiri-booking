import { describe, expect, it } from 'vitest';
import { detectDelimiter, mapColumns, markInternalDuplicates, parseImport } from './import-parser.ts';

const SAMPLE = `Kutsu\tNimi\tKorttimaksu\tKäteinen\tSuostumus
OH3EX\tJorma Heinonen\t\t0\tx
OH3WTF\tJarkko Stråhle\t35\t\tx
OH2LRD\tMarko\t\t0\tx`;

describe('detectDelimiter', () => {
  it('tunnistaa tabin, puolipisteen ja pilkun', () => {
    expect(detectDelimiter('a\tb\tc')).toBe('\t');
    expect(detectDelimiter('a;b;c')).toBe(';');
    expect(detectDelimiter('a,b,c')).toBe(',');
  });
});

describe('mapColumns', () => {
  it('tunnistaa suomalaiset otsikot', () => {
    const m = mapColumns(['Kutsu', 'Nimi', 'Korttimaksu', 'Käteinen', 'Suostumus']);
    expect(m.hasHeader).toBe(true);
    expect(m.columns).toEqual(['callsign', 'name', 'card', 'cash', 'consent']);
  });

  it('olettaa jarjestyksen kun otsikkoa ei ole', () => {
    const m = mapColumns(['OH3EX', 'Jorma', '', '0', 'x']);
    expect(m.hasHeader).toBe(false);
    expect(m.columns[0]).toBe('callsign');
  });
});

describe('parseImport', () => {
  it('jasentaa esimerkkiaineiston', () => {
    const result = parseImport(SAMPLE);
    expect(result.rows).toHaveLength(3);

    const [ex, wtf, lrd] = result.rows;
    expect(ex?.callsign).toBe('OH3EX');
    expect(ex?.feeCents).toBe(0);
    expect(ex?.consent).toBe(true);

    expect(wtf?.callsign).toBe('OH3WTF');
    expect(wtf?.feeCents).toBe(3500);

    expect(lrd?.name).toBe('Marko');
    expect(lrd?.errors).toHaveLength(0);
  });

  it('yhdistaa kortti- ja kateismaksun', () => {
    const result = parseImport('Kutsu\tKorttimaksu\tKäteinen\nOH1ABC\t20\t5');
    expect(result.rows[0]?.feeCents).toBe(2500);
  });

  it('merkitsee suostumuksen puuttumisen (tyhja = ei julkaista)', () => {
    const result = parseImport('Kutsu\tSuostumus\nOH1ABC\t\nOH2DEF\tx');
    expect(result.rows[0]?.consent).toBe(false);
    expect(result.rows[1]?.consent).toBe(true);
  });

  it('merkitsee virheellisen kutsumerkin', () => {
    const result = parseImport('Kutsu\tKäteinen\n\t0');
    expect(result.rows[0]?.errors.length).toBeGreaterThan(0);
  });
});

describe('markInternalDuplicates', () => {
  it('loytaa aineiston sisaiset kaksoiskappaleet', () => {
    const result = parseImport('Kutsu\tKäteinen\nOH1ABC\t0\nOH1ABC\t0\nOH2DEF\t0');
    const dups = markInternalDuplicates(result.rows);
    expect(dups.has('OH1ABC')).toBe(true);
    expect(dups.has('OH2DEF')).toBe(false);
  });

  it('pitaa /P ja perusmuodon eri henkiloina', () => {
    const result = parseImport('Kutsu\tKäteinen\nOH1ABC\t0\nOH1ABC/P\t0');
    const dups = markInternalDuplicates(result.rows);
    expect(dups.size).toBe(0);
  });
});
