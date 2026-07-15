import { describe, expect, it } from 'vitest';
import { centsToInput, parseFeeToCents } from './money.ts';

describe('parseFeeToCents', () => {
  it('hyvaksyy pilkun ja pisteen', () => {
    expect(parseFeeToCents('12')).toBe(1200);
    expect(parseFeeToCents('12,50')).toBe(1250);
    expect(parseFeeToCents('12.5')).toBe(1250);
    expect(parseFeeToCents('0')).toBe(0);
  });

  it('sietaa valilyontia ja euromerkkia', () => {
    expect(parseFeeToCents(' 25,00 \u20ac ')).toBe(2500);
  });

  it('hylkaa kelvottoman syotteen', () => {
    expect(parseFeeToCents('')).toBeNull();
    expect(parseFeeToCents('abc')).toBeNull();
    expect(parseFeeToCents('-5')).toBeNull();
    expect(parseFeeToCents('12,345')).toBeNull();
    expect(parseFeeToCents('999999999')).toBeNull();
  });
});

describe('centsToInput', () => {
  it('palauttaa summan lomakemuodossa', () => {
    expect(centsToInput(1250)).toBe('12,50');
    expect(centsToInput(0)).toBe('0,00');
  });
});
