#!/usr/bin/env bash
# Concatenates backend/src/*.gs (in name order) into backend/Code.gs, the single file Andrew pastes into Apps Script.
set -euo pipefail
cd "$(dirname "$0")"
{ for f in src/*.gs; do cat "$f"; printf '\n\n'; done; } > Code.gs
node -e "new Function(require('fs').readFileSync('Code.gs','utf8'))" && echo "Code.gs built: $(wc -c < Code.gs) bytes, syntax OK"
