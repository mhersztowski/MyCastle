#!/bin/bash
set -e
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  echo "Creating venv..."
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
fi

if [ -f .env.client-desktop ]; then
  set -a
  source .env.client-desktop
  set +a
fi

exec .venv/bin/python -m apps.client_desktop "$@"
