#!/usr/bin/env bash
# Purpose: Fix the extension.ts imports and wire up modular pipeline
# Run from repo root

set -euo pipefail
EXT_FILE="src/extension/extension.ts"
BACKUP="$EXT_FILE.surgical.$(date +%s)"

if [[ ! -f "$EXT_FILE" ]]; then
  echo "❌ Cannot find $EXT_FILE - check your paths!"
  exit 1
fi

echo "🛡  Backing up $EXT_FILE to $BACKUP"
cp "$EXT_FILE" "$BACKUP"

echo "🔧  Adding IntentPipeline import at top of file"
sed -i '1i import { IntentPipeline } from '"'"'./src/pipeline/intentPipeline'"'"';\n' "$EXT_FILE"

echo "🔗  Replacing UniversalIntentPipeline instantiation"
sed -i 's/pipeline = new UniversalIntentPipeline();/pipeline = new IntentPipeline();/g' "$EXT_FILE"

echo "🗑️  Commenting out the massive embedded UniversalIntentPipeline class"
sed -i '/^class UniversalIntentPipeline {/,/^}$/s/^/\/\/ /' "$EXT_FILE"

echo "✅  Extension.ts wired for modular pipeline!"
