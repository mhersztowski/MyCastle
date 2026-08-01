/**
 * embedCheck.ts — czy dany adres pozwala pokazać się w ramce.
 *
 * Edytor markdown wkłada adresy do `<iframe>`. Serwisy, które tego zabraniają
 * (`X-Frame-Options`, CSP `frame-ancestors`), wyświetlają wtedy systemową stronę
 * błędu przeglądarki — z JavaScriptu nie da się jej ani odczytać, ani podmienić.
 * Nagłówki widać dopiero z serwera, stąd ten moduł.
 *
 * Endpoint pobiera dowolny adres podany przez użytkownika, więc jest klasycznym
 * celem SSRF: bez zabezpieczeń pozwalałby czytać usługi w sieci wewnętrznej
 * („http://localhost:1894/api/...", metadane chmury pod 169.254.169.254).
 * Dlatego adresy prywatne i pętla zwrotna są odrzucane przed połączeniem.
 */

export interface EmbedCheckResponse {
  embeddable: boolean;
  /** Co zablokowało osadzanie (nagłówek z wartością) — do pokazania w edytorze. */
  reason?: string;
  /** `<title>` strony, jeśli udało się odczytać. */
  title?: string;
  status?: number;
}

/** Hosty, których nigdy nie odpytujemy — pętla zwrotna i sieci prywatne. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '::1' || host === '0.0.0.0') return true;
  // IPv4 literal → sprawdzamy zakresy prywatne i link-local (metadane chmur).
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;            // link-local + metadane
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT
  }
  // IPv6 unique-local / link-local.
  if (/^f[cd][0-9a-f]{2}:/i.test(host) || /^fe80:/i.test(host)) return true;
  return false;
}

export type UrlCheck =
  | { ok: true; url: URL }
  | { ok: false; error: string };

/** Waliduje adres: tylko http(s) i tylko adresy publiczne. */
export function validateEmbedUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: 'Niepoprawny adres URL.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Obsługiwane są tylko adresy http(s).' };
  }
  if (isPrivateHost(url.hostname)) {
    return { ok: false, error: 'Adresy lokalne i prywatne nie są sprawdzane.' };
  }
  return { ok: true, url };
}

/** Wyciąga `<title>` z początku dokumentu (pełnego HTML-a nie parsujemy). */
export function extractTitle(html: string): string | undefined {
  const m = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(html);
  if (!m) return undefined;
  const text = m[1].replace(/\s+/g, ' ').trim();
  return text || undefined;
}

/**
 * Czy nagłówki pozwalają na osadzenie.
 *
 * Lustro `framingAllowed` z frontendu — świadomie powielone, bo backend nie
 * importuje kodu aplikacji webowej, a reguła jest krótka i stabilna.
 */
export function framingVerdict(headers: Record<string, string | undefined>): { embeddable: boolean; reason?: string } {
  const xfo = headers['x-frame-options']?.trim().toUpperCase();
  if (xfo === 'DENY' || xfo === 'SAMEORIGIN') {
    return { embeddable: false, reason: `X-Frame-Options: ${xfo}` };
  }
  const csp = headers['content-security-policy'];
  if (csp) {
    const directive = csp.split(';').map((d) => d.trim())
      .find((d) => d.toLowerCase().startsWith('frame-ancestors'));
    if (directive) {
      const value = directive.slice('frame-ancestors'.length).trim().toLowerCase();
      if (value === "'none'" || value === "'self'") {
        return { embeddable: false, reason: `CSP frame-ancestors ${value}` };
      }
    }
  }
  return { embeddable: true };
}

/**
 * Pobiera nagłówki (i tytuł) adresu.
 *
 * Używamy GET zamiast HEAD, bo część serwerów odpowiada na HEAD inaczej albo
 * wcale; czytamy tylko początek treści, tyle ile trzeba na `<title>`.
 */
export async function checkEmbeddable(rawUrl: string, timeoutMs = 6000): Promise<EmbedCheckResponse & { error?: string }> {
  const check = validateEmbedUrl(rawUrl);
  if (!check.ok) return { embeddable: false, error: check.error };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(check.url.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'MyCastle-EmbedCheck/1.0' },
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

    const verdict = framingVerdict(headers);
    let title: string | undefined;
    if ((headers['content-type'] ?? '').includes('text/html')) {
      const html = (await res.text()).slice(0, 20_000);
      title = extractTitle(html);
    }
    return { ...verdict, title, status: res.status };
  } catch (e) {
    // Nieosiągalny adres nie znaczy „nie da się osadzić" — ramka może zadziałać
    // z przeglądarki użytkownika (VPN, sesja, geolokalizacja).
    return { embeddable: true, error: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}
