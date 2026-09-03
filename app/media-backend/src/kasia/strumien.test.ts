import { describe, it, expect } from 'vitest';
import { ParserSse, deltyAnthropic, deltyOpenAi, tnijNaZdania } from './strumien';

describe('ParserSse', () => {
  it('składa zdarzenie z jednej porcji', () => {
    const p = new ParserSse();
    expect(p.dodaj('data: {"a":1}\n\n')).toEqual(['{"a":1}']);
  });

  it('czeka na dokończenie zdarzenia rozciętego między porcjami', () => {
    // Sieć tnie strumień w dowolnym miejscu — także w środku liczby.
    const p = new ParserSse();
    expect(p.dodaj('data: {"a":')).toEqual([]);
    expect(p.dodaj('123}\n\n')).toEqual(['{"a":123}']);
  });

  it('zwraca kilka zdarzeń z jednej porcji', () => {
    const p = new ParserSse();
    expect(p.dodaj('data: {"a":1}\n\ndata: {"b":2}\n\n')).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('pomija linie zdarzeń i komentarze — interesuje nas tylko `data:`', () => {
    const p = new ParserSse();
    const wynik = p.dodaj('event: message_start\ndata: {"x":1}\n\n: ping\n\n');
    expect(wynik).toEqual(['{"x":1}']);
  });

  it('rozpoznaje koniec strumienia OpenAI', () => {
    const p = new ParserSse();
    expect(p.dodaj('data: [DONE]\n\n')).toEqual(['[DONE]']);
  });

  it('radzi sobie z zakończeniami CRLF', () => {
    const p = new ParserSse();
    expect(p.dodaj('data: {"a":1}\r\n\r\n')).toEqual(['{"a":1}']);
  });
});

describe('deltyAnthropic', () => {
  it('wyciąga fragment tekstu', () => {
    const w = deltyAnthropic('{"type":"content_block_delta","delta":{"type":"text_delta","text":"Cześć"}}');
    expect(w).toEqual({ tekst: 'Cześć' });
  });

  it('rozpoznaje początek wywołania narzędzia', () => {
    const w = deltyAnthropic(
      '{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"t1","name":"zapisz_wage"}}',
    );
    expect(w.narzedzieStart).toEqual({ indeks: 1, id: 't1', nazwa: 'zapisz_wage' });
  });

  it('zbiera fragmenty parametrów narzędzia', () => {
    const w = deltyAnthropic(
      '{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"kg\\":"}}',
    );
    expect(w.narzedzieParametry).toEqual({ indeks: 1, fragment: '{"kg":' });
  });

  it('rozpoznaje koniec odpowiedzi', () => {
    expect(deltyAnthropic('{"type":"message_stop"}').koniec).toBe(true);
  });

  it('ignoruje zdarzenia, których nie potrzebujemy', () => {
    expect(deltyAnthropic('{"type":"ping"}')).toEqual({});
  });

  it('uszkodzony JSON nie wywraca parsowania', () => {
    expect(deltyAnthropic('{niepoprawny')).toEqual({});
  });
});

describe('deltyOpenAi', () => {
  it('wyciąga fragment tekstu', () => {
    expect(deltyOpenAi('{"choices":[{"delta":{"content":"Cześć"}}]}')).toEqual({ tekst: 'Cześć' });
  });

  it('rozpoznaje początek wywołania narzędzia', () => {
    const w = deltyOpenAi(
      '{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"zapisz_wage","arguments":""}}]}}]}',
    );
    expect(w.narzedzieStart).toEqual({ indeks: 0, id: 'c1', nazwa: 'zapisz_wage' });
  });

  it('zbiera fragmenty parametrów — przychodzą po kawałku', () => {
    const w = deltyOpenAi(
      '{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"kg\\":84}"}}]}}]}',
    );
    expect(w.narzedzieParametry).toEqual({ indeks: 0, fragment: '{"kg":84}' });
  });

  it('rozpoznaje koniec', () => {
    expect(deltyOpenAi('[DONE]').koniec).toBe(true);
  });

  it('uszkodzony JSON nie wywraca parsowania', () => {
    expect(deltyOpenAi('{niepoprawny')).toEqual({});
  });
});

describe('tnijNaZdania', () => {
  it('oddaje zdanie, gdy padnie kropka', () => {
    expect(tnijNaZdania('Dzień dobry. Masz dziś', false))
      .toEqual({ zdania: ['Dzień dobry.'], reszta: ' Masz dziś' });
  });

  it('tnie też na wykrzykniku, pytajniku i nowej linii', () => {
    // „Trzecie" nie ma jeszcze terminatora, więc zostaje w reszcie —
    // strumień może je dopiero rozwijać.
    const w = tnijNaZdania('Uwaga! Co teraz?\nTrzecie', false);
    expect(w.zdania).toEqual(['Uwaga!', 'Co teraz?']);
    expect(w.reszta).toBe('Trzecie');
  });

  it('bez znaku końca nic nie oddaje — zdanie może się jeszcze rozwinąć', () => {
    expect(tnijNaZdania('Masz dziś trzy', false)).toEqual({ zdania: [], reszta: 'Masz dziś trzy' });
  });

  it('przy końcu strumienia oddaje resztę, choćby bez kropki', () => {
    expect(tnijNaZdania('Masz dziś trzy', true)).toEqual({ zdania: ['Masz dziś trzy'], reszta: '' });
  });

  it('nie oddaje samych białych znaków', () => {
    expect(tnijNaZdania('   \n  ', true).zdania).toEqual([]);
  });

  /*
   * Skróty i liczby dziesiętne to najczęstszy powód, dla którego naiwne cięcie
   * po kropce rozsypuje wypowiedź na kawałki bez sensu — a syntezator czyta je
   * z fałszywą intonacją i pauzami w środku zdania.
   */
  it('nie tnie po kropce w liczbie dziesiętnej', () => {
    expect(tnijNaZdania('Ważysz 84.2 kilograma dzisiaj', false).zdania).toEqual([]);
  });

  it('nie tnie po skrócie w rodzaju „godz."', () => {
    expect(tnijNaZdania('Spotkanie o godz. 18 dzisiaj', false).zdania).toEqual([]);
  });

  it('tnie po kropce kończącej zdanie mimo skrótu wcześniej', () => {
    const w = tnijNaZdania('Spotkanie o godz. 18 jest dzisiaj. Potem', false);
    expect(w.zdania).toEqual(['Spotkanie o godz. 18 jest dzisiaj.']);
  });
});
