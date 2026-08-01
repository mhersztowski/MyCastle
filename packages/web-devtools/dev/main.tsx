/**
 * Playground pakietu — narzędzia uruchomione bez aplikacji hosta.
 *
 * Pozwala oglądać i klikać edytor diagramów bez logowania i bez edytora
 * markdown, więc problemy z układem czy renderem widać od razu i w izolacji.
 * Uruchomienie: `pnpm --filter @mhersztowski/web-devtools run dev:playground`.
 */
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DiagramEditor, SequenceEditor, PacketEditor, KanbanEditor, GanttEditor, TimelineEditor,
  mermaidFormat, mergeLayout, starterDiagram, DIAGRAM_STARTERS,
  type DiagramDocument,
} from '../src/diagrams';
import '@xyflow/react/dist/style.css';

const SAMPLES: Record<string, string> = {
  'architektura C4 (kontekst)': `C4Context
    title Kontekst systemu bankowosci internetowej
    Enterprise_Boundary(b0, "Bank") {
        Person(klientA, "Klient banku", "Posiada konto osobiste")
        Person_Ext(klientB, "Klient zewnetrzny", "Korzysta przez partnera")
        System(bankowosc, "Bankowosc internetowa", "Pozwala obsluzyc konto")
        SystemDb(rdzen, "System centralny", "Przechowuje dane kont")
        SystemQueue(kolejka, "Szyna zdarzen", "Rozsyla powiadomienia")
    }
    System_Ext(poczta, "System pocztowy", "Wysyla powiadomienia e-mail")
    Rel(klientA, bankowosc, "Uzywa", "HTTPS")
    Rel(klientB, bankowosc, "Uzywa przez API")
    Rel(bankowosc, rdzen, "Czyta i zapisuje", "JDBC")
    BiRel(bankowosc, kolejka, "Wymienia zdarzenia", "AMQP")
    Rel_Back(poczta, klientA, "Wysyla listy do")
`,
  'os wydarzen (timeline)': `timeline
    title Dzieje sieci spolecznosciowych
    section Poczatki
        2002 : LinkedIn
        2004 : Facebook : Google
    section Rozkwit
        2005 : YouTube
        2006 : Twitter
        2007 : Tumblr
    section Era mobilna
        2010 : Instagram : Pinterest
        2011 : Snapchat
        2016 : TikTok
`,
  'harmonogram (gantt)': `gantt
    title Wdrozenie systemu
    dateFormat YYYY-MM-DD
    axisFormat %d.%m
    excludes weekends
    section Analiza
        Zebranie wymagan :done, a1, 2024-01-08, 5d
        Projekt techniczny :done, a2, after a1, 4d
        Akceptacja klienta :crit, a3, after a2, 2d
    section Wykonanie
        Backend :active, b1, after a3, 12d
        Frontend :active, b2, after a3, 15d
        Integracja :b3, after b1 b2, 5d
    section Wdrozenie
        Testy odbiorcze :c1, after b3, 4d
        Szkolenia :c2, after b3, until c3
        Start produkcyjny :milestone, c3, 2024-03-01, 0d
`,
  'tablica kanban': `kanban
  Todo
    [Napisac dokumentacje]
    docs[Wpis na blogu o nowym diagramie]
  id6[W trakcie]
    id7[Renderer dzialajacy we wszystkich przypadkach]@{ assigned: 'knsv', priority: 'High' }
  id9[Gotowe do wdrozenia]
    id8[Projekt gramatyki]@{ assigned: 'knsv' }
  id10[Gotowe do testow]
    id4[Testy parsera]@{ ticket: MC-2038, assigned: 'K.Sveidqvist', priority: 'High' }
    id66[ostatnia pozycja]@{ priority: 'Very Low', assigned: 'knsv' }
  id11[Zrobione]
    id5[definicja getData]
    id2[Tytul dluzszy niz 100 znakow przy duplikowaniu diagramu]@{ ticket: MC-2036, priority: 'Very High' }
  id12[Nie do odtworzenia]
    id13[Migotanie w Firefoksie]
`,
  'mapa bitow (TCP)': `packet-beta
title TCP Packet
0-15: "Source Port"
16-31: "Destination Port"
32-63: "Sequence Number"
64-95: "Acknowledgment Number"
96-99: "Data Offset"
100-105: "Reserved"
106: "URG"
107: "ACK"
108: "PSH"
109: "RST"
110: "SYN"
111: "FIN"
112-127: "Window"
128-143: "Checksum"
144-159: "Urgent Pointer"
`,
  'ER: komentarze i klucze zlozone': `erDiagram
  %% = RELACJE Z ETYKIETAMI ===
  DEVICE ||--o{ MEASUREMENT : wysyla
  DEVICE }o--|| LOCATION : "znajduje sie w"
  LOCATION |o--o{ LOCATION : zawiera
  DEVICE ||--|| CONFIG : ma
  DEVICE ||--o{ ALARM_LOG : generuje

  DEVICE {
    int id PK "autoincrement"
    string mac UK "adres MAC, unikalny"
    string name
    string firmware_version
    datetime registered_at
    bool active
  }
  MEASUREMENT {
    int id PK
    int device_id PK, FK "klucz zlozony z FK"
    float npk_n "azot mg/kg"
    float ph
    timestamp created_at
  }
  LOCATION {
    int id PK
    string name UK
    float lat
    int parent_id FK "hierarchia lokalizacji"
  }
  ALARM_LOG
  CONFIG {
    int id PK
    string topics "lista subskrypcji"
    json payload_schema "schemat walidacji"
  }
`,
  'diagram ER': `erDiagram
    KLIENT ||--o{ ZAMOWIENIE : sklada
    ZAMOWIENIE ||--|{ POZYCJA : zawiera
    PRODUKT ||--o{ POZYCJA : dotyczy
    KLIENT }|..|{ ADRES : uzywa
    MAGAZYN }o--o{ PRODUKT : przechowuje
    PRODUKT |o--o| PROMOCJA : ma

    KLIENT {
        string numer PK
        string nazwa
        string email UK "unikalny"
        string nip
    }
    ZAMOWIENIE {
        int nr PK
        string klientNumer FK
        date data
        float suma
    }
    POZYCJA {
        int id PK
        int zamowienieNr FK
        string produktId FK
        int ilosc
    }
    PRODUKT {
        string id PK
        string nazwa
        float cena
    }
    ADRES {
        int id PK
        string ulica
        string miasto
    }
    MAGAZYN {
        string kod PK
        string lokalizacja
    }
    PROMOCJA {
        int id PK
        float rabat
    }
`,
  'sekwencja: cykl zycia i zagniezdzenia': `sequenceDiagram
    autonumber 10 10

    actor Op as Operator
    participant IDE as Edytor graficzny
    participant VM as Lua VM

    link IDE: Repozytorium @ https://github.com/mhersztowski/MyCastle
    links VM: {"Lua": "https://www.lua.org"}

    Op ->> IDE : edytuj skrypt
    IDE ->> VM : reload request

    create participant S2 as Nowy lua_State
    VM ->> S2 : lua_newstate()
    VM ->> S2 : load(bajtkod)
    S2 -->> VM : init() OK

    create participant S1 as Stary lua_State
    VM ->> S1 : przekaz tabele persist
    S1 -->> VM : persist zrzucony
    destroy S1
    VM -x S1 : lua_close()

    VM -->> IDE : hot-reload OK
    IDE -->> Op : zielony status

    par watchdog
        loop co 1s
            VM ->> S2 : lua_sethook check
            alt limit instrukcji przekroczony
                VM ->> S2 : przerwij blad
                break skrypt ubity
                    VM -->> IDE : raport crash
                end
            else OK
                S2 -->> VM : tyka
            end
        end
    and heartbeat
        loop co 5s
            VM -) IDE : status RAM/CPU
        end
    end

    create actor Tmp as Task tymczasowy
    VM ->> Tmp : spawn
    Tmp -->> VM : wynik
    destroy Tmp
    Tmp -->> VM : koniec zadania

    Note over Op,VM : Pelny cykl hot-reload z rollbackiem
`,
  'sekwencja: wszystkie bloki': `sequenceDiagram
    participant N as ESP32
    participant B as Broker
    participant S as Serwer

    Note right of N : Deep sleep, wakeup co 15 min
    Note left of S : Coolify, homelab Proxmox
    Note over B : Mosquitto 2.x
    Note over N,S : Caly tor danych pomiarowych

    loop co 60 sekund
        N ->> N : odczyt czujnika
        N ->> B : PUBLISH ndk/pomiar
    end

    alt QoS 1 i ACK
        B -->> N : PUBACK
    else timeout
        N ->> N : zapisz do bufora flash
    else blad protokolu
        N ->> N : reconnect
    end

    opt bateria ponizej 20%
        N ->> B : PUBLISH status/lowbat
    end

    par zapis do bazy
        B ->> S : forward pomiar
        S ->> S : INSERT InfluxDB
    and powiadomienie
        B ->> S : forward alarm
        S ->> S : sprawdz progi
    and log
        B ->> B : zapis do logu
    end

    critical polaczenie z baza
        S ->> S : otworz transakcje
    option deadlock
        S ->> S : retry
    option brak miejsca
        S ->> S : alert administratora
    end

    break gdy walidacja schematu padnie
        S -->> B : odrzuc wiadomosc
    end

    rect rgb(255, 240, 220)
        Note over N,B : Sciezka awaryjna
        N ->> B : PUBLISH z bufora
        B -->> N : PUBACK
    end

    N --> B : ...15 minut pozniej...
`,
  'diagram sekwencji': `sequenceDiagram
    autonumber
    actor K as Klient
    participant A as API
    participant D as Baza

    K->>+A: POST /zamowienie
    A->>+D: zapisz
    D-->>-A: id = 42
    A-->>-K: 201 Created

    loop Co 30 s
        K->>A: GET /status/42
        alt Gotowe
            A-->>K: status: wysłane
        else W toku
            A-->>K: status: pakowanie
        end
    end

    Note over K,A: Klient odpytuje aż do skutku

    par Powiadomienia
        A->>K: e-mail
    and
        A-)K: push
    end

    opt Anulowanie
        K->>A: DELETE /zamowienie/42
    end
`,
  'diagram klas (UML)': `classDiagram
    class Zwierze {
        <<abstract>>
        +String imie
        -int wiek
        +opis()* String
        +policz()$ int
    }
    class Pies {
        +szczekaj() void
    }
    class Kot {
        +miaucz() void
    }
    class Lot {
        <<interface>>
        +lec()
    }

    Zwierze <|-- Pies
    Zwierze <|-- Kot
    Lot <|.. Pies

    class Zamowienie {
        +Date data
        +suma() float
    }
    class Pozycja {
        +int ilosc
    }
    Zamowienie "1" --> "0..*" Pozycja : zawiera
    Dom *-- Pokoj
    Zespol o-- Osoba
    Klient ..> Faktura : tworzy
`,
  // Przegląd składni diagramu stanów: zagnieżdżenie dwupoziomowe, pseudostany,
  // regiony współbieżne i stylowanie.
  'przegląd stanów (zagnieżdżenia, fork, regiony)': `stateDiagram-v2
    [*] --> Boot

    %% === Stan złożony (composite) z zagnieżdżeniem 2 poziomy =
    state Connecting {
        direction LR
        [*] --> Wifi
        state Wifi {
            [*] --> Scan
            Scan --> Join : SSID znaleziony
            Join --> [*] : DHCP OK
        }
        Wifi --> Mqtt : sieć gotowa
        Mqtt --> [*] : CONNACK
    }

    Boot --> Connecting

    %% = Choice - rozgałęzienie warunkowe ===
    state check_bat <<choice>>
    Connecting --> check_bat
    check_bat --> Running : bateria >= 20%
    check_bat --> LowPower : bateria < 20%

    %% === Fork / Join - równoległe rozwidlenie =
    state fork_state <<fork>>
    state join_state <<join>>

    Running --> fork_state
    fork_state --> ReadSensors
    fork_state --> ListenRadio
    ReadSensors --> join_state
    ListenRadio --> join_state
    join_state --> Publish

    %% = Concurrency - regiony współbieżne wewnątrz stanu =
    state Diagnostics {
        [*] --> WatchdogFeed
        WatchdogFeed --> WatchdogFeed : co 1s
        --
        [*] --> LedBlink
        LedBlink --> LedOff
        LedOff --> LedBlink
        --
        [*] --> LogFlush
        LogFlush --> LogFlush : co 10s
    }

    Publish --> Diagnostics
    Diagnostics --> [*]
    LowPower --> [*]

    %% = Stylowanie: classDef + przypisanie ===
    classDef error fill:#f96,stroke:#900,stroke-width:2px,color:#fff
    classDef ok fill:#9f9,stroke:#090
    class LowPower error
    class Running ok

    %% Styl inline przez ::: przy przejściu definicji
    OtaUpdate:::error
    Running --> OtaUpdate : nowy firmware
    OtaUpdate --> Boot : reboot
`,
  // Przegląd całej składni — służy do oglądania, czy kształty i zakończenia
  // linii zgadzają się z tym, co rysuje sam Mermaid.
  'przegląd składni (kształty i połączenia)': `flowchart TB
    %% ===== KSZTAŁTY WĘZŁÓW =====
    A[Prostokąt]
    B(Zaokrąglony)
    C([Stadion])
    D[[Podprogram]]
    E[(Baza danych)]
    F((Okrąg))
    G>Chorągiewka]
    H{Romb}
    I{{Sześciokąt}}
    J[/Równoległobok/]
    K[\\Równoległobok alt\\]
    L[/Trapez\\]
    M[\\Trapez alt/]
    N(((Podwójny okrąg)))

    %% ===== RODZAJE POŁĄCZEŃ =====
    A --> B
    B --- C
    C -.-> D
    D ==> E
    E --o F
    F --x G
    G --Etykieta--> H
    H -->|Etykieta inaczej| I
    I -. kropki z tekstem .-> J
    J --grube z tekstem--> K
    K ~~~ L
    L ----> M
    M -...-> N
    N <--> A2[Dwukierunkowa]
    A2 o--o A3[Kółka]
    A3 x--x A4[Krzyżyki]

    %% ===== ŁAŃCUCHY I WIELOKROTNE =====
    Q1[Start] --> Q2[Krok] --> Q3[Koniec]
    R1 & R2 --> R3 & R4
`,
  'automat ESP32 (stany złożone)': `stateDiagram-v2
    [*] --> Boot

    Boot --> Config : brak konfiguracji
    Boot --> Connecting : konfiguracja OK

    Config --> Connecting : zapisano ustawienia

    state Connecting {
        [*] --> WifiConnect
        WifiConnect --> MqttConnect : WiFi OK
        MqttConnect --> [*] : MQTT OK
        WifiConnect --> WifiConnect : retry (max 5)
    }

    Connecting --> Running : połączono
    Connecting --> Error : timeout

    state Running {
        [*] --> Idle
        Idle --> Measuring : timer 60s
        Measuring --> Publishing : dane gotowe
        Publishing --> Idle : ACK
        Publishing --> Buffering : brak sieci
        Buffering --> Idle : zapisano do flash
    }

    Running --> DeepSleep : bateria < 20%
    DeepSleep --> Boot : wakeup

    Error --> Boot : watchdog reset

    note right of DeepSleep
        ESP32 deep sleep,
        wakeup co 15 min
    end note`,
  'flowchart z podgrafem': `flowchart TD
    A[Start] --> B{Decyzja}
    B -->|tak| C([Gotowe])
    B -.->|nie| D[(Zapis)]
    subgraph g [Obróbka]
      D --> E[Krok 1]
      E --> F[Krok 2]
    end
    F --> C`,
  'poziomy, długie opisy': `stateDiagram-v2
  direction LR
  state "Oczekiwanie na zdarzenie" as Idle
  state "Pomiar czujników" as Measuring
  state "Głęboki sen" as Sleep
  [*] --> Idle
  Idle --> Measuring: timer 60s
  Measuring --> Publishing: dane gotowe
  Publishing --> Idle: ACK otrzymany
  Publishing --> Publishing: retry (max 3)
  Idle --> Sleep: bateria < 20%
  Sleep --> [*]: wyłączenie
    %% Komentarz - start/koniec, przejścia, etykiety, self-transition
    note right of Publishing
        Publikacja MQTT
        QoS 1, retained
    end note
    note left of Sleep : ESP32 deep sleep`,
  'wszystkie kształty': `flowchart TD
  A[Prostokąt] --> B(Zaokrąglony)
  B --> C([Stadion / pill])
  C -.-> D
  D -.-> E[(Baza danych)]
  E ==> F((Okrąg))
  F ==> G>Chorągiewka]
  G -->|Etykieta| H{Romb / decyzja}
  H -->|Etykieta inaczej| I{{Sześciokąt}}
  I -.->|kropki z tekstem| J[/Równoległobok/]
  J ==>|grube z tekstem| K[\\Równoległobok odwrotny\\]
  K --> L[/Trapez\\]
  L --> M[\\Trapez odwrotny/]
  M --> N[[Podprogram]]`,
  'wiele połączeń (&)': `flowchart TD
  R1[Ra] & R2[Rb] --> R3[Rc] & R4[Rd]`,
  'pusty (wybór rodzaju)': '',
  'prosty automat': `stateDiagram-v2
    [*] --> Idle
    Idle --> Praca: start
    Praca --> Idle: stop
    Praca --> [*]`,
};

/** Render Mermaida — do porównania „jak widzi to biblioteka docelowa". */
function MermaidPane({ code }: { code: string }) {
  const host = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
        const { svg } = await mermaid.render(`m${Math.random().toString(36).slice(2)}`, code);
        if (!cancelled && host.current) host.current.innerHTML = svg;
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  if (error) return <pre style={{ margin: 0, padding: 8, fontSize: 11, color: '#b91c1c', whiteSpace: 'pre-wrap' }}>{error}</pre>;
  return <div ref={host} style={{ padding: 8, overflow: 'auto', height: '100%' }} />;
}

function App() {
  const [name, setName] = useState(Object.keys(SAMPLES)[0]);
  // Odtwarza warunek z bloku markdown: edytor montuje się w kontenerze o
  // zerowym rozmiarze („Code"), a dopiero potem staje się widoczny („Edit").
  const [ukryty, setUkryty] = useState(false);
  // Źródłem prawdy jest TEKST — tak samo jak w bloku markdown, gdzie model
  // wraca pętlą przez zserializowany kod. Bez tego playground nie odtwarzał
  // warunków, w których diagram skakał.
  const [code, setCode] = useState(SAMPLES[name]);
  const [doc, setDoc] = useState<DiagramDocument>(() => mermaidFormat.parse(SAMPLES[name]).document);
  const selfWritten = useRef<string | null>(null);
  const lastDoc = useRef<DiagramDocument | null>(doc);
  lastDoc.current = doc;

  useEffect(() => {
    if (code === selfWritten.current) return;
    const parsed = mermaidFormat.parse(code).document;
    setDoc(lastDoc.current ? mergeLayout(parsed, lastDoc.current) : parsed);
  }, [code]);

  const handleChange = (next: DiagramDocument) => {
    setDoc(next);
    const text = mermaidFormat.serialize(next);
    selfWritten.current = text;
    setCode(text);
  };

  const load = (key: string) => {
    setName(key);
    selfWritten.current = null;
    lastDoc.current = null;
    setCode(SAMPLES[key]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 8, padding: 8, borderBottom: '1px solid #e2e8f0', alignItems: 'center' }}>
        <strong style={{ fontSize: 13 }}>web-devtools / diagrams</strong>
        <select value={name} onChange={(e) => load(e.target.value)} style={{ fontSize: 13 }}>
          {Object.keys(SAMPLES).map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <button type="button" onClick={() => setUkryty((v) => !v)} style={{ marginLeft: 8, fontSize: 12 }}>
          {ukryty ? 'pokaż edytor' : 'ukryj edytor'}
        </button>
        <span style={{ fontSize: 12, color: '#64748b' }}>
          węzły: {doc.nodes.length} · krawędzie: {doc.edges.length} · grupy: {doc.groups.length}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div style={{ flex: 2, minWidth: 0, borderRight: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 11, padding: '2px 8px', background: '#f1f5f9' }}>edytor graficzny</div>
          <div style={{ height: 'calc(100% - 22px)' }}>
            {!code.trim() ? (
              <div style={{ padding: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {DIAGRAM_STARTERS.map((s2) => (
                  <button
                    key={s2.kind}
                    type="button"
                    onClick={() => setCode(mermaidFormat.serialize(starterDiagram(s2.kind)))}
                    style={{ textAlign: 'left', padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{s2.label}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{s2.description}</div>
                  </button>
                ))}
              </div>
            ) : ukryty ? (
              <div style={{ display: 'none' }}>
                <DiagramEditor document={doc} onChange={handleChange} height="100%" />
              </div>
            ) : doc.kind === 'timeline' ? (
              <TimelineEditor document={doc} onChange={handleChange} height="100%" />
            ) : doc.kind === 'gantt' ? (
              <GanttEditor document={doc} onChange={handleChange} height="100%" />
            ) : doc.kind === 'kanban' ? (
              <KanbanEditor document={doc} onChange={handleChange} height="100%" />
            ) : doc.kind === 'packet' ? (
              <PacketEditor document={doc} onChange={handleChange} height="100%" />
            ) : doc.kind === 'sequence' ? (
              <SequenceEditor document={doc} onChange={handleChange} height="100%" />
            ) : (
              <DiagramEditor document={doc} onChange={handleChange} height="100%" />
            )}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 11, padding: '2px 8px', background: '#f1f5f9' }}>render Mermaida (z naszego zapisu)</div>
          <div style={{ flex: 1, minHeight: 0 }}><MermaidPane code={code} /></div>
        </div>
        <pre style={{ width: 260, margin: 0, padding: 10, overflow: 'auto', fontSize: 11, background: '#f8fafc' }}>
          {code}
        </pre>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
