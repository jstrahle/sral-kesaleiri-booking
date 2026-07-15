import { describe, expect, it } from 'vitest';
import { checkOrigin, hostOf } from './origin-guard.ts';

describe('hostOf', () => {
  it('poimii isantanimen eri muodoista', () => {
    expect(hostOf('https://hallinta.example.fi')).toBe('hallinta.example.fi');
    expect(hostOf('https://hallinta.example.fi/login')).toBe('hallinta.example.fi');
    expect(hostOf('hallinta.example.fi')).toBe('hallinta.example.fi');
    expect(hostOf('https://hallinta.example.fi/')).toBe('hallinta.example.fi');
  });

  it('palauttaa null tyhjasta ja null-sanasta', () => {
    expect(hostOf(undefined)).toBeNull();
    expect(hostOf('')).toBeNull();
    expect(hostOf('null')).toBeNull();
  });
});

describe('checkOrigin', () => {
  const host = 'hallinta.example.fi';
  const ref = 'https://hallinta.example.fi/login';

  it('paastaa GET-pyynnot aina lapi', () => {
    expect(checkOrigin('GET', undefined, undefined, host, host)).toBe('allow');
  });

  it('hyvaksyy tasmaavan originin', () => {
    expect(checkOrigin('POST', 'https://hallinta.example.fi', undefined, host, host)).toBe('allow');
  });

  it('sietaa ADMIN_DOMAINin joka sisaltaa protokollan tai kauttaviivan', () => {
    expect(checkOrigin('POST', 'https://hallinta.example.fi', undefined, host, 'https://hallinta.example.fi/')).toBe('allow');
  });

  it('toimii vaikka ADMIN_DOMAIN puuttuisi (kaytetaan Host-otsaketta)', () => {
    expect(checkOrigin('POST', 'https://hallinta.example.fi', undefined, host, undefined)).toBe('allow');
  });

  it('putoaa Refereriin kun Origin on null (Firefox tiukalla politiikalla)', () => {
    expect(checkOrigin('POST', 'null', ref, host, host)).toBe('allow');
  });

  it('putoaa Refereriin kun Origin puuttuu kokonaan', () => {
    expect(checkOrigin('POST', undefined, ref, host, host)).toBe('allow');
  });

  it('hylkaa vieraan originin', () => {
    expect(checkOrigin('POST', 'https://paha.example.com', undefined, host, host)).toBe('mismatch');
  });

  it('hylkaa kun seka Origin etta Referer puuttuvat', () => {
    expect(checkOrigin('POST', 'null', undefined, host, host)).toBe('no_origin');
    expect(checkOrigin('POST', undefined, undefined, host, host)).toBe('no_origin');
  });

  it('hylkaa vieraalta sivustolta tulevan Refererin kun Origin on null', () => {
    expect(checkOrigin('POST', 'null', 'https://paha.example.com/x', host, host)).toBe('mismatch');
  });
});
