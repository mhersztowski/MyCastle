# 0010. C4 Model jako standard dokumentacji architektonicznej

Data: 2026-03-05
Status: Accepted

## Kontekst

Projekt rośnie (6 pakietów, 5 aplikacji, 2 platformy). Brak dokumentacji architektonicznej utrudnia onboarding, komunikację decyzji projektowych i rozumienie zależności między komponentami. Potrzebujemy standardu który:
1. Opisuje system na różnych poziomach szczegółowości
2. Jest łatwy do utrzymania (blisko kodu)
3. Renderuje się bez specjalnych narzędzi

## Rozważane opcje

- **C4 Model + Mermaid + ADR** — C4 jako framework opisu, Mermaid dla diagramów w Markdown, MADR dla decyzji
- **UML** — klasyczny standard, ale verbose, wymaga specjalnych narzędzi, ciężki do utrzymania
- **Arc42** — pełny framework dokumentacji, bardzo rozbudowany, overkill dla single-team projektu
- **Informal README docs** — brak struktury, trudne do nawigacji przy wzroście projektu

## Decyzja

Wybrana opcja: **C4 Model + Mermaid + ADR (MADR)**, ponieważ:

- **C4 Model** — 4 poziomy (Context, Containers, Components, Code) pokrywają potrzeby różnych odbiorców
- **Mermaid** — diagramy jako kod w `.md` plikach, renderowanie w GitHub/GitLab/VS Code bez instalacji
- **MADR** (Markdown Architectural Decision Records) — minimalistyczny format ADR, plain text, git-friendly
- **draw.io XML** — dla bardziej złożonych diagramów wizualnych (C4 overview), edytowalny i versionowany

## Lokalizacja dokumentacji
```
docs/architecture/
├── README.md              # Nawigacja i przegląd
├── adr/                   # Architecture Decision Records
└── diagrams/              # Mermaid diagrams (C4 L1-L3, flows)
└── drawio/                # draw.io XML files
```

## Konsekwencje

### Pozytywne
- Diagramy Mermaid renderują się natywnie w GitHub PR reviews
- ADR jako git history — widać kiedy i dlaczego podjęto decyzje
- C4 L1/L2 wystarczają dla większości dyskusji o architekturze
- draw.io pliki edytowalne bez specjalnej licencji

### Negatywne / kompromisy
- Diagramy Mermaid wymagają ręcznej aktualizacji przy zmianach architektury
- Brak automatycznego generowania diagramów z kodu (todo: przyszłość z structurizr)
- MADR format wymaga dyscypliny — łatwo zapomnieć o dodaniu ADR przy nowej decyzji
