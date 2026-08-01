/**
 * Testy sprawdzania, czy adres da się osadzić w ramce.
 *
 * Najważniejsza część to odrzucanie adresów prywatnych: endpoint pobiera URL
 * podany przez użytkownika, więc bez tego byłby wygodnym narzędziem do
 * skanowania sieci wewnętrznej serwera (SSRF).
 */
import { describe, it, expect } from 'vitest';
import { isPrivateHost, validateEmbedUrl, framingVerdict, extractTitle } from './embedCheck';

describe('isPrivateHost', () => {
  it('pętla zwrotna i nazwy lokalne', () => {
    for (const h of ['localhost', 'LOCALHOST', 'foo.localhost', 'nas.local', '127.0.0.1', '127.1.2.3', '::1', '0.0.0.0']) {
      expect(isPrivateHost(h), h).toBe(true);
    }
  });

  it('sieci prywatne RFC1918, CGNAT i link-local (metadane chmur)', () => {
    for (const h of ['10.0.0.1', '172.16.5.4', '172.31.255.255', '192.168.1.1', '100.64.0.1', '169.254.169.254']) {
      expect(isPrivateHost(h), h).toBe(true);
    }
  });

  it('adresy publiczne przechodzą', () => {
    for (const h of ['claude.ai', 'example.com', '8.8.8.8', '172.32.0.1', '192.169.0.1']) {
      expect(isPrivateHost(h), h).toBe(false);
    }
  });

  it('IPv6 unique-local i link-local', () => {
    expect(isPrivateHost('[fd00::1]')).toBe(true);
    expect(isPrivateHost('fe80::1')).toBe(true);
    expect(isPrivateHost('[2001:4860:4860::8888]')).toBe(false);
  });
});

describe('validateEmbedUrl', () => {
  it('przepuszcza publiczne http(s)', () => {
    const r = validateEmbedUrl('https://claude.ai/share/abc');
    expect(r.ok).toBe(true);
  });

  it('odrzuca inne schematy — file: czytałby dysk serwera', () => {
    expect(validateEmbedUrl('file:///etc/passwd')).toEqual({ ok: false, error: expect.stringContaining('http') });
    expect(validateEmbedUrl('ftp://example.com').ok).toBe(false);
  });

  it('odrzuca adresy lokalne i prywatne', () => {
    expect(validateEmbedUrl('http://localhost:1894/api/users').ok).toBe(false);
    expect(validateEmbedUrl('http://169.254.169.254/latest/meta-data/').ok).toBe(false);
  });

  it('odrzuca śmieci zamiast adresu', () => {
    expect(validateEmbedUrl('nie-adres').ok).toBe(false);
  });
});

describe('framingVerdict', () => {
  it('X-Frame-Options DENY / SAMEORIGIN blokuje i podaje powód', () => {
    expect(framingVerdict({ 'x-frame-options': 'DENY' }))
      .toEqual({ embeddable: false, reason: 'X-Frame-Options: DENY' });
    expect(framingVerdict({ 'x-frame-options': 'sameorigin' }).embeddable).toBe(false);
  });

  it('CSP frame-ancestors none / self blokuje', () => {
    expect(framingVerdict({ 'content-security-policy': "frame-ancestors 'none'" }).embeddable).toBe(false);
    expect(framingVerdict({ 'content-security-policy': "default-src *; frame-ancestors 'self'" }).embeddable).toBe(false);
  });

  it('brak nagłówków albo CSP bez frame-ancestors = zgoda', () => {
    expect(framingVerdict({})).toEqual({ embeddable: true });
    expect(framingVerdict({ 'content-security-policy': "default-src 'self'" }).embeddable).toBe(true);
  });

  it('lista konkretnych adresów w frame-ancestors nie przesądza — niech spróbuje ramka', () => {
    expect(framingVerdict({ 'content-security-policy': 'frame-ancestors https://mycastle.hersztowski.org' }).embeddable)
      .toBe(true);
  });
});

describe('extractTitle', () => {
  it('wyciąga tytuł i skleja białe znaki', () => {
    expect(extractTitle('<html><head><title>\n  Rozmowa —\n  Claude\n</title>')).toBe('Rozmowa — Claude');
  });

  it('radzi sobie z atrybutami i brakiem tytułu', () => {
    expect(extractTitle('<title lang="pl">Strona</title>')).toBe('Strona');
    expect(extractTitle('<html><body>bez tytułu</body>')).toBeUndefined();
    expect(extractTitle('<title>   </title>')).toBeUndefined();
  });
});
