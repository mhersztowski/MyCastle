#!/usr/bin/env bash
# install-tools.sh — Instalacja narzędzi do pracy z dokumentacją architektoniczną
#
# Co instaluje:
#   - adr-tools (brew)    — zarządzanie ADR z linii komend
#   - log4brains (pnpm)   — web viewer dla ADR
#   - rozszerzenia VS Code — Mermaid preview, Draw.io, Markdown
#
# Mermaid renderuje się natywnie w VS Code i GitHub — mmdc/Chromium NIE jest potrzebny.
# Draw.io otwiera się przez rozszerzenie VS Code — AppImage NIE jest potrzebny.
#
# Użycie:
#   chmod +x install-tools.sh && ./install-tools.sh

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR]${NC}  $*" >&2; exit 1; }
skip()    { echo -e "${YELLOW}[SKIP]${NC} $*"; }

# PNPM_HOME potrzebny w nieinteraktywnym shellu (nie ładuje ~/.bashrc)
export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
export PATH="$PNPM_HOME:$PATH"

command -v node &>/dev/null || error "Node.js nie jest zainstalowany"
command -v pnpm &>/dev/null || error "pnpm nie jest zainstalowany"
command -v brew &>/dev/null || error "Homebrew (linuxbrew) nie jest zainstalowany"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

info "Node.js: $(node --version) | pnpm: $(pnpm --version) | brew: $(brew --version | head -1)"
echo ""

# ─── 1. adr-tools ─────────────────────────────────────────────────────────────
info "=== 1. adr-tools ==="
if command -v adr &>/dev/null; then
  skip "adr-tools już zainstalowany"
else
  brew install adr-tools
  success "adr-tools zainstalowany"
fi

# Plik .adr-dir wskazuje gdzie są ADR (wymagany przez adr-tools)
if [ ! -f "$PROJECT_ROOT/.adr-dir" ]; then
  echo "docs/architecture/adr" > "$PROJECT_ROOT/.adr-dir"
  success ".adr-dir → docs/architecture/adr"
else
  skip ".adr-dir już istnieje"
fi

# ─── 2. log4brains ────────────────────────────────────────────────────────────
echo ""
info "=== 2. log4brains (web viewer ADR) ==="
if command -v log4brains &>/dev/null; then
  skip "log4brains już zainstalowany"
else
  pnpm add -g log4brains
  success "log4brains zainstalowany"
fi

# Konfiguracja log4brains
if [ ! -f "$PROJECT_ROOT/.log4brains.yml" ]; then
  cat > "$PROJECT_ROOT/.log4brains.yml" << 'YAML'
project:
  name: MyCastle
  slug: mycastle

repositories:
  - path: .
    name: MyCastle Monorepo
    adrFolder: docs/architecture/adr
YAML
  success ".log4brains.yml utworzony"
else
  skip ".log4brains.yml już istnieje"
fi

# ─── 3. Rozszerzenia VS Code ──────────────────────────────────────────────────
echo ""
info "=== 3. Rozszerzenia VS Code ==="
command -v code &>/dev/null || { warn "'code' nie znaleziony w PATH — pomiń VS Code"; }

if command -v code &>/dev/null; then
  install_ext() {
    local ext="$1" name="$2"
    if code --list-extensions 2>/dev/null | grep -qi "^${ext}$"; then
      skip "$name"
    else
      code --install-extension "$ext" --force &>/dev/null && success "$name" \
        || warn "$name — błąd (sprawdź ręcznie: code --install-extension $ext)"
    fi
  }

  install_ext "bierner.markdown-mermaid"            "Mermaid in Markdown Preview  ← renderuje diagramy w .md"
  install_ext "hediet.vscode-drawio"                "Draw.io Integration          ← otwiera .drawio w VS Code"
  install_ext "yzhang.markdown-all-in-one"          "Markdown All in One          ← TOC, shortcuts, preview"
  install_ext "DavidAnson.vscode-markdownlint"      "markdownlint                 ← linting Markdown"
  install_ext "shd101wyy.markdown-preview-enhanced" "Markdown Preview Enhanced    ← zaawansowany preview"
fi

# ─── Podsumowanie ─────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Gotowe!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo ""
echo "  Zainstalowane:"
command -v adr        &>/dev/null && echo -e "  ${GREEN}✓${NC} adr-tools    — brew"
command -v log4brains &>/dev/null && echo -e "  ${GREEN}✓${NC} log4brains   — pnpm global"
command -v code       &>/dev/null && echo -e "  ${GREEN}✓${NC} VS Code extensions (Mermaid, Draw.io, Markdown)"
echo ""
echo "  Szybki start:"
echo ""
echo "  # Wyświetl ADR w przeglądarce:"
echo "    cd $PROJECT_ROOT && log4brains preview"
echo ""
echo "  # Dodaj nowy ADR:"
echo "    cd $PROJECT_ROOT && adr new 'Tytuł decyzji'"
echo ""
echo "  # Otwórz dokumentację w VS Code:"
echo "    code $SCRIPT_DIR/README.md"
echo "    code $SCRIPT_DIR/drawio/system-overview.drawio"
echo ""
echo "  # Mermaid renderuje się natywnie — otwórz dowolny .md i naciśnij Ctrl+Shift+V"
echo ""
warn "Uruchom 'source ~/.bashrc' w nowym terminalu (PNPM_HOME w PATH)."
