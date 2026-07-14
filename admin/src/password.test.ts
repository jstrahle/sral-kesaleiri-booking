import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.ts';

describe('salasanan tiiviste', () => {
  it('hyvaksyy oikean ja hylkaa vaaran salasanan', async () => {
    const hash = await hashPassword('oikea-salasana-123');
    expect(await verifyPassword('oikea-salasana-123', hash)).toBe(true);
    expect(await verifyPassword('vaara-salasana', hash)).toBe(false);
  }, 20_000);

  it('tuottaa eri tiivisteen samalle salasanalle (suola)', async () => {
    const a = await hashPassword('sama');
    const b = await hashPassword('sama');
    expect(a).not.toBe(b);
  }, 20_000);
});
