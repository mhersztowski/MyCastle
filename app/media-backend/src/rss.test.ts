/**
 * Testy odczytu kanału RSS.
 *
 * Kanał jest jedynym miejscem, z którego bierzemy adres pliku dźwiękowego,
 * więc sprawdzamy przede wszystkim to, co się dzieje, gdy kanał odbiega od
 * wzorca: CDATA w tytule, brak `enclosure`, czas trwania w trzech formatach.
 */

import { describe, it, expect } from 'vitest';
import { parseFeed, parseDuration } from './rss';

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Radio Nauka</title>
    <itunes:author>Redakcja</itunes:author>
    <description>O nauce <![CDATA[<b>przystępnie</b>]]></description>
    <itunes:image href="https://example.org/okladka.jpg"/>
    <item>
      <title><![CDATA[Odcinek 1: Grawitacja]]></title>
      <guid isPermaLink="false">ep-001</guid>
      <pubDate>Mon, 03 Mar 2025 08:00:00 +0000</pubDate>
      <itunes:duration>01:02:03</itunes:duration>
      <description>Pierwszy odcinek</description>
      <enclosure url="https://example.org/ep1.mp3" length="123" type="audio/mpeg"/>
    </item>
    <item>
      <title>Zapowied&#378; sezonu</title>
      <pubDate>Tue, 04 Mar 2025 08:00:00 +0000</pubDate>
      <itunes:duration>90</itunes:duration>
      <enclosure url='https://example.org/ep2.mp3' type='audio/mpeg'/>
    </item>
    <item>
      <title>Wpis bez pliku</title>
      <guid>ep-003</guid>
    </item>
  </channel>
</rss>`;

describe('parseDuration', () => {
  it('przyjmuje same sekundy', () => {
    expect(parseDuration('90')).toBe(90);
  });

  it('przyjmuje MM:SS', () => {
    expect(parseDuration('12:30')).toBe(12 * 60 + 30);
  });

  it('przyjmuje HH:MM:SS', () => {
    expect(parseDuration('01:02:03')).toBe(3723);
  });

  it('nieczytelną wartość zwraca jako zero, a nie NaN', () => {
    // NaN w czasie trwania rozlewa się na cały pasek postępu w odtwarzaczu.
    expect(parseDuration('nie wiadomo')).toBe(0);
    expect(parseDuration('')).toBe(0);
  });
});

describe('parseFeed', () => {
  const feed = parseFeed(FEED);

  it('czyta opis kanału sprzed pierwszego odcinka', () => {
    // Bez tego tytuł podkastu zostałby nadpisany tytułem pierwszego odcinka.
    expect(feed.title).toBe('Radio Nauka');
    expect(feed.author).toBe('Redakcja');
    expect(feed.image).toBe('https://example.org/okladka.jpg');
  });

  it('zdejmuje CDATA z tytułu odcinka', () => {
    expect(feed.episodes[0].title).toBe('Odcinek 1: Grawitacja');
  });

  it('rozwija encje liczbowe', () => {
    expect(feed.episodes[1].title).toBe('Zapowiedź sezonu');
  });

  it('czyta adres pliku niezależnie od rodzaju cudzysłowu', () => {
    expect(feed.episodes[0].mediaUrl).toBe('https://example.org/ep1.mp3');
    expect(feed.episodes[1].mediaUrl).toBe('https://example.org/ep2.mp3');
  });

  it('pomija wpisy bez pliku dźwiękowego', () => {
    // Kanały mieszają zapowiedzi i wpisy tekstowe między odcinki; odtwarzacz
    // nie ma z nimi co zrobić, a na liście wyglądałyby jak zepsute pozycje.
    expect(feed.episodes).toHaveLength(2);
    expect(feed.episodes.map((e) => e.title)).not.toContain('Wpis bez pliku');
  });

  it('bierze guid jako identyfikator, a przy jego braku adres pliku', () => {
    expect(feed.episodes[0].id).toBe('ep-001');
    expect(feed.episodes[1].id).toBe('https://example.org/ep2.mp3');
  });

  it('przelicza czas trwania na sekundy', () => {
    expect(feed.episodes[0].durationSec).toBe(3723);
    expect(feed.episodes[1].durationSec).toBe(90);
  });

  it('pusty kanał daje pustą listę, a nie wyjątek', () => {
    expect(parseFeed('<rss><channel></channel></rss>').episodes).toEqual([]);
  });
});
