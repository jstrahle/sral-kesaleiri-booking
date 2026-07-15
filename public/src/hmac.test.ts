import { describe, expect, it } from 'vitest';
import { sign, verify } from './hmac.ts';

const SECRET = 'testisalaisuus';
const NOW = 1_752_500_000_000;
const TS = String(Math.floor(NOW / 1000));
const BODY = '{"events":[]}';

describe('synkronoinnin allekirjoitus', () => {
  it('hyvaksyy oikein allekirjoitetun pyynnon', () => {
    expect(verify(SECRET, TS, sign(SECRET, TS, BODY), BODY, NOW)).toBe('ok');
  });

  it('hylkaa vaaralla salaisuudella allekirjoitetun', () => {
    expect(verify(SECRET, TS, sign('vaara', TS, BODY), BODY, NOW)).toBe('bad_signature');
  });

  it('hylkaa muutetun rungon', () => {
    const signature = sign(SECRET, TS, BODY);
    expect(verify(SECRET, TS, signature, '{"events":[{"hax":1}]}', NOW)).toBe('bad_signature');
  });

  it('hylkaa vanhentuneen aikaleiman (toistohyokkays)', () => {
    const signature = sign(SECRET, TS, BODY);
    expect(verify(SECRET, TS, signature, BODY, NOW + 10 * 60 * 1000)).toBe('expired');
  });

  it('hylkaa puuttuvat otsakkeet', () => {
    expect(verify(SECRET, undefined, undefined, BODY, NOW)).toBe('malformed');
  });
});
