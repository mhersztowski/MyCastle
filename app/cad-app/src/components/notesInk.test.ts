import { describe, it, expect } from 'vitest';
import { isLightColor, defaultInkFor, needsInkSwitch } from './notesInk';

describe('isLightColor', () => {
  it('rozpoznaje jasne i ciemne tła', () => {
    expect(isLightColor('#ffffff')).toBe(true);
    expect(isLightColor('#fef3c7')).toBe(true);   // „Paper"
    expect(isLightColor('#000000')).toBe(false);
    expect(isLightColor('#1a1a1a')).toBe(false);
  });

  it('waży składowe jasnością, nie średnią', () => {
    // Czysty niebieski i czysta zieleń mają tę samą średnią, a różnią się
    // jasnością o rząd wielkości — na niebieskim biały pisak jest czytelny,
    // na zielonym już nie.
    expect(isLightColor('#0000ff')).toBe(false);
    expect(isLightColor('#00ff00')).toBe(true);
  });

  it('wartość nie będąca kolorem uchodzi za ciemną', () => {
    // `transparent` i zapisy skrócone trafiają tu z ustawień użytkownika;
    // domysł „ciemne" daje biały pisak, czyli widoczny na domyślnym tle.
    expect(isLightColor('transparent')).toBe(false);
    expect(isLightColor('#fff')).toBe(false);
  });
});

describe('defaultInkFor', () => {
  it('na jasnym tle pisak jest czarny', () => {
    expect(defaultInkFor('#ffffff')).toBe('#000000');
    expect(defaultInkFor('#fef3c7')).toBe('#000000');
  });

  it('na ciemnym tle pisak jest biały', () => {
    expect(defaultInkFor('#000000')).toBe('#ffffff');
    expect(defaultInkFor('#1a1a1a')).toBe('#ffffff');
  });
});

describe('needsInkSwitch', () => {
  it('pisak niewidoczny na nowym tle wymaga zmiany', () => {
    expect(needsInkSwitch('#ffffff', '#ffffff')).toBe(true);   // biały na białym
    expect(needsInkSwitch('#1a1a1a', '#000000')).toBe(true);   // czarny na czarnym
  });

  it('czytelny pisak zostaje nietknięty', () => {
    expect(needsInkSwitch('#ffffff', '#000000')).toBe(false);
    expect(needsInkSwitch('#ef4444', '#ffffff')).toBe(false);  // czerwony na białym
  });

  it('przezroczystego pisaka nie ruszamy', () => {
    // „Brak obrysu" to wybór użytkownika, a nie kolor, który mógłby zniknąć
    // na tle. Podmiana zamieniłaby ustawienie w coś, czego nie prosił.
    expect(needsInkSwitch('transparent', '#000000')).toBe(false);
    expect(needsInkSwitch('transparent', '#ffffff')).toBe(false);
  });
});
