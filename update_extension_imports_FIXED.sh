#!/usr/bin/env bash
# Purpose: Slim extension.ts to orchestrator role & wire new pipeline
# FIXED VERSION - corrected path to extension.ts
# Run after script 1

set -euo pipefail
EXT_FILE="src/extension/extension.ts"  # CORRECTED PATH
BACKUP="$EXT_FILE.bak.$(date +%s)"

# Check if the file exists first
if [ ! -f "$EXT_FILE" ]; then
    echo "❌ Error: Cannot find $EXT_FILE"
    echo "📍 Current directory: $(pwd)"
    echo "📂 Looking for these files:"
    find . -name "extension.ts" -type f 2>/dev/null || echo "   No extension.ts files found"
    exit 1
fi

cp "$EXT_FILE" "$BACKUP"
echo "🛡  Backup stored at $BACKUP"

# Inject IntentPipeline import at the top
sed -i "1s;^;import { IntentPipeline } from './src/pipeline/intentPipeline';\n;" "$EXT_FILE"

# Look for existing ChatViewProvider instantiation and modify it
if grep -q "new ChatViewProvider" "$EXT_FILE"; then
    # Add pipeline instantiation before ChatViewProvider
    sed -i "s/const chatProvider = new ChatViewProvider(/const pipeline = new IntentPipeline();\nconst chatProvider = new ChatViewProvider(/" "$EXT_FILE"
    
    # Update ChatViewProvider constructor call to include pipeline
    sed -i "s/new ChatViewProvider(context)/new ChatViewProvider(context, pipeline)/" "$EXT_FILE"
    
    echo "🔗  extension.ts rewired for modular pipeline"
else
    echo "⚠️  Warning: ChatViewProvider instantiation not found in expected format"
    echo "    You may need to manually wire the IntentPipeline"
fi

echo "✅  Extension import fixes complete"