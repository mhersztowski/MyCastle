/**
 * Host podglądowy klasy `Aura` — używany, gdy skrypt akcji uruchamiasz z
 * edytora (Ctrl+Enter), a nie z rozmowy.
 *
 * Nie ma tu mikrofonu, syntezatora mowy ani historii czatu, więc zamiast
 * udawać rozmowę, kierujemy wypowiedzi do panelu wyników i mówimy wprost, że
 * to podgląd. Skrypt wykonuje się do końca (`ask`/`listen` zwracają pusty
 * tekst), więc autor widzi kolejność kroków i błędy składni bez odpalania Aury.
 */

import type { AuraHost } from '../../../../../packages/core/browser/aura/aura';

/** Minimalny fragment `display` z runtime'u skryptów, którego tu potrzebujemy. */
export interface AuraPreviewDisplay {
  text(value: string): void;
}

export interface AuraPreviewLog {
  info(message: string): void;
  warn(message: string): void;
}

export function createAuraPreviewHost(display: AuraPreviewDisplay, log: AuraPreviewLog): AuraHost {
  let lastUtterance = '';
  const notSupported = (what: string): void =>
    log.warn(`Aura: „${what}" działa dopiero w rozmowie — w podglądzie zwracam pustą wartość.`);

  return {
    appendAssistant: (text) => display.text(`Aura: ${text}`),
    appendUser: (text) => display.text(`Ty: ${text}`),
    speak: async () => { /* podgląd nie mówi na głos */ },
    capture: async () => { notSupported('nasłuchiwanie'); return ''; },
    setThinking: () => {},
    showComponent: (config) => display.text(`[komponent] ${JSON.stringify(config)}`),
    runAction: async (id) => { log.info(`Aura: wywołanie akcji „${id}" (pomijane w podglądzie).`); },
    askAi: async () => { notSupported('agent AI'); return ''; },
    readVfsFile: async (path) => { notSupported(`odczyt pliku ${path}`); return ''; },
    queryVfsJson: async () => { notSupported('odczyt JSON z VFS'); return null; },
    getLastUtterance: () => lastUtterance,
    setLastUtterance: (text) => { lastUtterance = text; },
    getSerperKey: () => '',
    debug: (message) => log.info(`Aura: ${message}`),
  };
}
