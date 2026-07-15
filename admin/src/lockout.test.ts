import { describe, expect, it } from 'vitest';
import { isLocked, MAX_FAILED_LOGINS, shouldLock } from './lockout.ts';

describe('tilin lukitus', () => {
  it('tunnistaa voimassa olevan lukituksen', () => {
    const now = new Date('2026-07-14T12:00:00Z');
    expect(isLocked({ locked_until: new Date('2026-07-14T12:05:00Z') }, now)).toBe(true);
  });

  it('paastaa lapi kun lukitus on umpeutunut', () => {
    const now = new Date('2026-07-14T12:00:00Z');
    expect(isLocked({ locked_until: new Date('2026-07-14T11:59:00Z') }, now)).toBe(false);
    expect(isLocked({ locked_until: null }, now)).toBe(false);
  });

  it('lukitsee vasta viimeisella sallitulla yrityksella', () => {
    expect(shouldLock(MAX_FAILED_LOGINS - 2)).toBe(false);
    expect(shouldLock(MAX_FAILED_LOGINS - 1)).toBe(true);
  });
});
