#!/bin/sh
# Claude Code hook entry point: sh tools/seo-agent/hooks/run.sh <pre_bash|post_write|on_stop>
# Picks python3 or python; exits 0 (no-op) when neither exists so hooks never break a session.
DIR="$(cd "$(dirname "$0")" && pwd)"
NAME="$1"
[ -z "$NAME" ] && exit 0
if command -v python3 >/dev/null 2>&1; then PY=python3
elif command -v python >/dev/null 2>&1; then PY=python
else exit 0
fi
exec "$PY" "$DIR/$NAME.py"
