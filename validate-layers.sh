#!/bin/sh
# Roda o dependency-cruiser em cada serviço e pacote.
# Chamado pelo script "check:layers" do package.json raiz.
set -e

CRUISER="node_modules/.bin/depcruise"
CONFIG=".dependency-cruiser.mjs"
FAILED=0

check() {
  local target="$1"
  if [ -d "$target/src" ]; then
    echo "→ verificando $target"
    if ! $CRUISER --config "$CONFIG" "$target/src"; then
      FAILED=1
    fi
  fi
}

for dir in services/*/; do check "$dir"; done
for dir in packages/*/; do check "$dir"; done

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "❌ Violações de camada encontradas. Corrija os imports antes de continuar."
  exit 1
fi

echo ""
echo "✅ Nenhuma violação de camada encontrada."
