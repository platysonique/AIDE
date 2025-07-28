#!/usr/bin/env bash
set -euo pipefail

EXTENSION_FILE="extension.ts"
BACKUP="$EXTENSION_FILE.import_fix.$(date +%s)"

echo "🔧 Fixing import paths in extension.ts"
cp "$EXTENSION_FILE" "$BACKUP"

sed -i "s|from './src/speechUI'|from './src/ui/speechUI'|g" "$EXTENSION_FILE"
sed -i "s|from './src/ingestUI'|from './src/ui/ingestUI'|g" "$EXTENSION_FILE"
sed -i "s|from './src/codeReviewUI'|from './src/ui/codeReviewUI'|g" "$EXTENSION_FILE"
sed -i "s|from './src/debugGuideUI'|from './src/ui/debugGuideUI'|g" "$EXTENSION_FILE"
sed -i "s|from './src/memoryUI'|from './src/ui/memoryUI'|g" "$EXTENSION_FILE"
sed -i "s|from './src/chatPanel'|from './src/ui/chatPanel'|g" "$EXTENSION_FILE"
sed -i "s|from './src/chatWebviewProvider'|from './src/ui/chatWebviewProvider'|g" "$EXTENSION_FILE"
sed -i "s|from './src/toolsWebviewProvider'|from './src/ui/toolsWebviewProvider'|g" "$EXTENSION_FILE"
sed -i 's/UniversalIntentPipeline/IntentPipeline/g' "$EXTENSION_FILE"

echo "✅ Import paths fixed!"
echo "🛡  Backup at: $BACKUP"
