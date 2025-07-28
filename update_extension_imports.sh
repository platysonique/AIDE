#!/usr/bin/env bash
# Purpose: Slim extension.ts to orchestrator role & wire new pipeline
# Run after script 1

set -euo pipefail
EXT_FILE="src/extension/src/extension.ts"
BACKUP="$EXT_FILE.bak.$(date +%s)"
cp "$EXT_FILE" "$BACKUP"
echo "🛡  Backup stored at $BACKUP"

# Inject IntentPipeline import
sed -i "1s;^;import { IntentPipeline } from './src/pipeline/intentPipeline';\n;" "$EXT_FILE"

# Instantiate the pipeline once and pass it to UI providers
sed -i "s/const chatProvider = new ChatViewProvider(/const pipeline = new IntentPipeline();\nconst chatProvider = new ChatViewProvider(/" "$EXT_FILE"
sed -i "s/new ChatViewProvider(context)/new ChatViewProvider(context, pipeline)/" "$EXT_FILE"

echo "🔗  extension.ts rewired for modular pipeline"
