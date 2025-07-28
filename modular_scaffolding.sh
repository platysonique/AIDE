#!/usr/bin/env bash
# Purpose: Create modular folder layout and relocate existing files
# Run from repo root:  chmod +x modular_scaffolding.sh && ./modular_scaffolding.sh

set -euo pipefail
ROOT="$(pwd)"
EXT_SRC="$ROOT/src/extension/src"
BACKUP="$ROOT/.backup_$(date +%s)"
mkdir -p "$BACKUP"

echo "🔧  Backing up existing files to $BACKUP"
cp -r "$EXT_SRC" "$BACKUP/"

echo "📂  Creating new directory structure"
for d in pipeline ai search ui utils; do
  mkdir -p "$EXT_SRC/$d"
done

echo "🚚  Moving UI files"
mv "$EXT_SRC"/{chatPanel.ts,speechUI.ts,ingestUI.ts,codeReviewUI.ts,debugGuideUI.ts,memoryUI.ts,chatWebviewProvider.ts} "$EXT_SRC/ui/" 2>/dev/null || true

echo "🚚  Moving shared types"
mv "$EXT_SRC/types.ts" "$EXT_SRC/utils/" 2>/dev/null || true

echo "🗂  Relocating sidebar providers"
mv "$EXT_SRC"/{chatViewProvider.ts,toolsViewProvider.ts,toolsWebviewProvider.ts} "$EXT_SRC/ui/" 2>/dev/null || true

echo "📄  Creating starter module stubs"
cat > "$EXT_SRC/pipeline/intelligenceEngine.ts" <<'EOF'
export class IntelligenceEngine {
  async handleQuery(_text: string) {
    // TODO: real reasoning & search integration
    return { intent: 'unknown', tools_needed: [], confidence: 0.0 };
  }
}
EOF

cat > "$EXT_SRC/pipeline/intentPipeline.ts" <<'EOF'
import { IntelligenceEngine } from './intelligenceEngine';
export class IntentPipeline {
  private engine = new IntelligenceEngine();
  async executeIntent(text: string, logger: (m:string)=>void) {
    logger(`🤖 Pipeline received: ${text}`);
    const parsed = await this.engine.handleQuery(text);
    logger(`🎯 Parsed intent: ${JSON.stringify(parsed)}`);
    // Execution delegated in script 3
  }
}
EOF

echo "✅  Scaffolding complete"
