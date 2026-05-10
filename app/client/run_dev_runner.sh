#!/bin/bash
set -e
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  echo "Creating venv..."
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
fi

if [ -f .env.dev-runner ]; then
  set -a
  source .env.dev-runner
  set +a
fi

exec .venv/bin/python apps/dev_runner.py "$@"
