#!/bin/sh
cd "$(dirname "$0")"
python3 -c "import anthropic" 2>/dev/null || python3 -m pip install --quiet anthropic || true
python3 app.py "$@"
