# Media

Odtwarzacz podkastów: wyszukiwanie w katalogach, lista odtwarzanych i notatki
przypięte do miejsca w nagraniu.

Aplikacja składa się z dwóch części, tak jak Monaco i CAD w tym monorepo:

- **`app/media-backend`** (port 1996) — cienka warstwa na `@mhersztowski/core-backend`.
  `MediaHttpServer` rozszerza `HttpUploadServer` o trasy podkastowe; upload,
  serwowanie plików i statyczny frontend są już w klasie bazowej.
- **`app/media-web`** (port 1997) — React 18 + MUI 6 + Vite 6, te same wersje
  co w `mycastle-web`. Build ląduje w `app/media-backend/public/`, skąd backend
  serwuje go jako stronę.

## Uruchomienie

    pnpm dev:media          # backend i frontend naraz
    pnpm build:media        # produkcyjnie — frontend trafia do public/ backendu

Porty są w `app/media-backend/.env`; `vite.config.ts` czyta ten sam plik, więc
zmiana portu jest w jednym miejscu.

## Katalogi podkastów

Wyszukiwanie pyta dwa katalogi równolegle:

| Katalog | Klucze | Uwagi |
|---|---|---|
| **iTunes Search** | nie wymaga | działa od pierwszego uruchomienia |
| **Podcast Index** | `PODCASTINDEX_KEY` + `PODCASTINDEX_SECRET` | wyniki spoza ekosystemu Apple, pełniejsze opisy |

Awaria jednego katalogu nie przerywa wyszukiwania — front pokazuje, który
zawiódł, zamiast udawać, że wyników nie ma. Klucze bierze się na
<https://api.podcastindex.org/signup>; sekret nigdy nie opuszcza backendu,
bo podpisem jest SHA-1 ze sklejenia klucza, sekretu i czasu uniksowego.

Katalog mówi tylko, że podkast istnieje. Odcinki i adresy plików dźwiękowych
biorą się **zawsze z kanału RSS** — dzięki temu obie drogi wyszukiwania kończą
się tak samo.

## Dlaczego wszystko idzie przez backend

1. Sekret Podcast Index nie może trafić do przeglądarki.
2. Kanały RSS nie mają nagłówków CORS — przeglądarka ich nie pobierze.
3. Pliki odcinków bywają serwowane po HTTP, czego strona po HTTPS nie odtworzy;
   `/api/media` przekazuje je dalej, wraz z nagłówkiem `Range`, bez którego
   przewijanie suwakiem pobierałoby plik od początku.
4. Notatki mają przeżyć przeglądarkę i profil.

Adresy podawane przez przeglądarkę przechodzą przez `isSafeHttpUrl()` — bez
tego serwer byłby narzędziem do odpytywania sieci wewnętrznej z jej wnętrza.

## Dane

Dwa pliki JSON w katalogu danych, nie baza:

- `queue.json` — lista odtwarzanych wraz z zapamiętanym miejscem w każdym odcinku,
- `notes.json` — notatki.

Zapis idzie przez plik tymczasowy i `rename`, więc przerwanie procesu zostawia
poprzednią wersję, a nie plik ucięty w połowie. Uszkodzony plik jest odkładany
obok zamiast nadpisany — notatki to jedyna rzecz w tej aplikacji, której nie da
się odtworzyć z sieci.

## Notatki przypięte do czasu

Czas notatki zamraża się w chwili, gdy zaczynasz pisać, a nie gdy naciskasz
„dodaj" — między usłyszeniem czegoś ciekawego a dopisaniem zdania mija
kilkanaście sekund, przez które nagranie leci dalej. Zapisana notatka staje się
zakładką: kliknięcie przewija nagranie do tamtego miejsca.
