import { describe, it, expect } from 'vitest';
import { czytajSrodowisko, domyslnyGlos, scalGlosZeSrodowiskiem } from './srodowisko';

describe('czytajSrodowisko', () => {
  it('bez zmiennych nie wymyśla wartości', () => {
    const s = czytajSrodowisko({});
    expect(s.kluczModelu).toBe('');
    expect(s.kluczElevenLabs).toBe('');
    expect(s.dostawca).toBeUndefined();
  });

  it('czyta klucz Anthropic', () => {
    expect(czytajSrodowisko({ ANTHROPIC_API_KEY: 'sk-ant-x' }).kluczModelu).toBe('sk-ant-x');
  });

  it('klucz Anthropic wybiera dostawcę, gdy nikt nie wskazał innego', () => {
    // Sam klucz jest deklaracją zamiaru — nikt nie wpisuje go „na wszelki wypadek".
    expect(czytajSrodowisko({ ANTHROPIC_API_KEY: 'sk-ant-x' }).dostawca).toBe('anthropic');
  });

  it('klucz OpenAI wybiera OpenAI', () => {
    expect(czytajSrodowisko({ OPENAI_API_KEY: 'sk-x' }).dostawca).toBe('openai');
  });

  it('jawny wybór dostawcy wygrywa z wnioskowaniem z klucza', () => {
    const s = czytajSrodowisko({ ANTHROPIC_API_KEY: 'sk-ant-x', KASIA_DOSTAWCA: 'ollama' });
    expect(s.dostawca).toBe('ollama');
  });

  it('odrzuca nieznanego dostawcę zamiast przekazać go dalej', () => {
    expect(czytajSrodowisko({ KASIA_DOSTAWCA: 'skynet' }).dostawca).toBeUndefined();
  });

  it('czyta nazwę modelu i interwał inicjatywy', () => {
    const s = czytajSrodowisko({ KASIA_MODEL: 'claude-opus-5', KASIA_INICJATYWA_MIN: '15' });
    expect(s.model).toBe('claude-opus-5');
    expect(s.inicjatywaCoMin).toBe(15);
  });

  it('zero minut wyłącza inicjatywę i nie jest mylone z brakiem wpisu', () => {
    expect(czytajSrodowisko({ KASIA_INICJATYWA_MIN: '0' }).inicjatywaCoMin).toBe(0);
    expect(czytajSrodowisko({}).inicjatywaCoMin).toBeUndefined();
  });

  it('pomija wartości niebędące liczbą, zamiast robić z nich NaN', () => {
    expect(czytajSrodowisko({ KASIA_INICJATYWA_MIN: 'często' }).inicjatywaCoMin).toBeUndefined();
  });

  it('puste zmienne traktuje jak brak — tak wygląda odkomentowany, niewypełniony .env', () => {
    const s = czytajSrodowisko({ ANTHROPIC_API_KEY: '', ELEVENLABS_API_KEY: '   ' });
    expect(s.kluczModelu).toBe('');
    expect(s.kluczElevenLabs).toBe('');
    expect(s.dostawca).toBeUndefined();
  });
});

describe('domyslnyGlos', () => {
  it('bez klucza ElevenLabs zostaje przy przeglądarce', () => {
    const g = domyslnyGlos({ kluczElevenLabs: '' });
    expect(g.tts.provider).toBe('browser');
    expect(g.stt.provider).toBe('browser');
  });

  it('klucz ElevenLabs czyni go domyślnym dla mowy i rozpoznawania', () => {
    const g = domyslnyGlos({ kluczElevenLabs: 'el-x' });
    expect(g.tts.provider).toBe('elevenlabs');
    expect(g.stt.provider).toBe('elevenlabs');
    expect(g.tts.elevenlabs.apiKey).toBe('el-x');
    expect(g.stt.elevenlabs.apiKey).toBe('el-x');
  });

  it('zachowuje pozostałe ustawienia domyślne — klucz nie zmienia głosu ani języka', () => {
    const g = domyslnyGlos({ kluczElevenLabs: 'el-x' });
    expect(g.tts.elevenlabs.voiceId).toBeTruthy();
    expect(g.stt.browser.lang).toBeTruthy();
  });
});

describe('scalGlosZeSrodowiskiem', () => {
  it('bez zapisanej konfiguracji zwraca domyślną ze środowiska', () => {
    const g = scalGlosZeSrodowiskiem(undefined, { kluczElevenLabs: 'el-x' });
    expect(g.tts.provider).toBe('elevenlabs');
  });

  it('zapisany wybór dostawcy wygrywa ze środowiskiem', () => {
    // Panel jest nadrzędny: ktoś, kto przełączył na przeglądarkę, chciał tego.
    const zapisana = { ...domyslnyGlos({ kluczElevenLabs: '' }) };
    const g = scalGlosZeSrodowiskiem(zapisana, { kluczElevenLabs: 'el-x' });
    expect(g.tts.provider).toBe('browser');
  });

  it('klucz ze środowiska wypełnia puste miejsce w zapisanej konfiguracji', () => {
    /*
     * To sedno: klucze trzymamy w env, a ustawienia w panelu. Bez tego zapis
     * czegokolwiek w panelu „zamrażałby" pusty klucz i zmiana w .env
     * przestawałaby działać.
     */
    const zapisana = domyslnyGlos({ kluczElevenLabs: '' });
    zapisana.tts.provider = 'elevenlabs';
    const g = scalGlosZeSrodowiskiem(zapisana, { kluczElevenLabs: 'el-nowy' });
    expect(g.tts.elevenlabs.apiKey).toBe('el-nowy');
  });

  it('klucz wpisany w panelu nie jest nadpisywany przez środowisko', () => {
    const zapisana = domyslnyGlos({ kluczElevenLabs: '' });
    zapisana.tts.elevenlabs.apiKey = 'wpisany-recznie';
    const g = scalGlosZeSrodowiskiem(zapisana, { kluczElevenLabs: 'z-env' });
    expect(g.tts.elevenlabs.apiKey).toBe('wpisany-recznie');
  });

  it('scala także klucz rozpoznawania mowy', () => {
    const zapisana = domyslnyGlos({ kluczElevenLabs: '' });
    const g = scalGlosZeSrodowiskiem(zapisana, { kluczElevenLabs: 'el-x' });
    expect(g.stt.elevenlabs.apiKey).toBe('el-x');
  });

  it('uszkodzona zapisana konfiguracja nie wywraca odczytu', () => {
    const g = scalGlosZeSrodowiskiem({ tts: null } as unknown, { kluczElevenLabs: 'el-x' });
    expect(g.tts.provider).toBeTruthy();
  });
});
