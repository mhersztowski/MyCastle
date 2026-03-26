#!/bin/bash
set -e
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  echo "Creating venv..."
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
fi

if [ -f .env.smart-display ]; then
  set -a
  source .env.smart-display
  set +a
fi

exec .venv/bin/python agent.py app:smart-display "$@"
