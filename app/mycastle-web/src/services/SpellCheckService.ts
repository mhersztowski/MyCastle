/**
 * SpellCheckService — frontend client for LanguageTool API.
 *
 * Mode of operation:
 *   1. If the backend exposes `/api/spellcheck`, talk to it (preferred —
 *      points at the self-hosted LanguageTool docker, gets LRU cache for
 *      repeated requests).
 *   2. Otherwise fall back to the public api.languagetool.org endpoint
 *      (free tier: 20 req/min, 20k chars/min — fine for hobby use).
 *
 * Why LanguageTool over Hunspell-in-WASM:
 *   - Polish dictionary is best-in-class (covers verb conjugations,
 *     case agreement, modern vocabulary).
 *   - Adds grammar checks on top of spelling (extra value).
 *   - The host browser doesn't need a polish system dictionary —
 *     everything is server-side, so it works the same in Chrome basic
 *     mode, Safari, mobile, etc.
 *   - Self-hosted means no privacy trade-off (Enhanced mode in Chrome
 *     sends your text to Google; LanguageTool docker stays local).
 */

export interface SpellMatch {
  /** Byte offset into the checked text where the issue starts. */
  offset: number;
  /** Number of bytes the issue spans. */
  length: number;
  /** Human-readable explanation (long form). */
  message: string;
  /** Short label, e.g. "Spelling mistake". */
  shortMessage?: string;
  /** Suggested replacements, ordered by confidence (best first). */
  replacements: string[];
  /** Issue category — 'TYPOS' / 'GRAMMAR' / 'STYLE' / 'PUNCTUATION' / ... */
  category: string;
  /** Internal rule id (useful for "ignore this rule" UX). */
  ruleId: string;
}

interface LanguageToolResponse {
  matches?: Array<{
    offset: number;
    length: number;
    message: string;
    shortMessage?: string;
    replacements: Array<{ value: string }>;
    rule: {
      id: string;
      category: { id: string; name: string };
    };
  }>;
}

/** Map ISO-639 codes the editor uses to LanguageTool's exact strings.
 *  Most are 1:1 but English variants need the regional suffix. */
function toLtLanguage(lang: string): string {
  // LanguageTool requires explicit variant for English.
  if (lang === 'en')    return 'en-US';
  if (lang === 'en-US') return 'en-US';
  if (lang === 'en-GB') return 'en-GB';
  // Catch-all: passes through anything else (pl, de, fr, es, …).
  return lang;
}

/** Pick the endpoint: try our backend first, fall back to the public API.
 *  We cache the URL across calls so the probe runs once per session. */
let endpointPromise: Promise<string> | null = null;
async function getEndpoint(): Promise<string> {
  if (endpointPromise) return endpointPromise;
  endpointPromise = (async () => {
    try {
      const probe = await fetch('/api/spellcheck/health', { method: 'GET' });
      if (probe.ok) return '/api/spellcheck';
    } catch { /* fall through */ }
    return 'https://api.languagetool.org/v2/check';
  })();
  return endpointPromise;
}

/** Check `text` for spelling/grammar issues. Returns an empty array on
 *  any network / server failure — the editor never blocks on this. */
export async function checkSpelling(text: string, language: string): Promise<SpellMatch[]> {
  if (!text.trim()) return [];
  if (text.length > 20000) {
    // Defensive: public LanguageTool caps at 20k chars per request, and
    // our backend cache key blows up on very long docs. Bail early so
    // the editor doesn't spam endpoints.
    return [];
  }
  const endpoint = await getEndpoint();
  const body = new URLSearchParams({
    text,
    language: toLtLanguage(language),
    // 'level: picky' adds style suggestions; we keep it on default so the
    // user isn't drowned in nitpicks. Can be added as an option later.
  });
  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!r.ok) return [];
    const json: LanguageToolResponse = await r.json();
    return (json.matches ?? []).map(m => ({
      offset: m.offset,
      length: m.length,
      message: m.message,
      shortMessage: m.shortMessage,
      replacements: m.replacements.map(rp => rp.value),
      category: m.rule.category.id,
      ruleId: m.rule.id,
    }));
  } catch {
    return [];
  }
}
