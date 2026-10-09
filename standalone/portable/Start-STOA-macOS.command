#!/bin/zsh
cd "$(dirname "$0")" || exit 1

if ! command -v python3 >/dev/null 2>&1; then
  echo "STOA requires Python 3 to start its local web server."
  read -r "?Press Return to close..."
  exit 1
fi

exec python3 serve_stoa.py
