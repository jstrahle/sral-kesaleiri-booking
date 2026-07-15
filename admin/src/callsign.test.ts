import { describe, expect, it } from 'vitest';
import { isValidCallsign, nextGuestCallsign, normalizeCallsign } from './callsign.ts';

describe('normalizeCallsign', () => {
  it('ei valita kirjainkoosta eika valilyonneista', () => {
    expect(normalizeCallsign(' oh2abc ')).toBe('OH2ABC');
    expect(normalizeCallsign('OH 2 ABC')).toBe('OH2ABC');
    expect(normalizeCallsign('oh-2-abc')).toBe('OH2ABC');
  });

  it('sailyttaa kauttaviivapaatteen eri henkilona', () => {
    expect(normalizeCallsign('oh2abc/p')).toBe('OH2ABC/P');
    expect(normalizeCallsign('OH2ABC/XYL')).not.toBe(normalizeCallsign('OH2ABC'));
  });
});

describe('isValidCallsign', () => {
  it('hyvaksyy kutsut ja vieraskutsut', () => {
    expect(isValidCallsign('OH2ABC')).toBe(true);
    expect(isValidCallsign('OH2ABC/M')).toBe(true);
    expect(isValidCallsign('VIERAS12')).toBe(true);
  });

  it('hylkaa tyhjan ja kelvottomat merkit', () => {
    expect(isValidCallsign('')).toBe(false);
    expect(isValidCallsign('OH2 ABC')).toBe(false);
    expect(isValidCallsign('OH2ABC/')).toBe(false);
  });
});

describe('nextGuestCallsign', () => {
  it('jatkaa suurimmasta kaytossa olevasta numerosta', () => {
    expect(nextGuestCallsign('VIERAS', [])).toBe('VIERAS1');
    expect(nextGuestCallsign('VIERAS', ['VIERAS1', 'VIERAS7', 'OH2ABC'])).toBe('VIERAS8');
  });
});
