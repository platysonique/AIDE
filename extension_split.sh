#!/usr/bin/env bash
# Purpose: Extract and re-home the old Orchestrator as ToolExecutor,
# create proper pipeline glue, and patch imports.
# Run after scripts 1 & 2

set -euo pipefail
EXT_SRC="src/extension/src"
PIPELINE_DIR="$EXT_SRC/pipeline"
BACKUP_DIR=".backup_split_$(date +%s)"
mkdir -p "$BACKUP_DIR"

echo "🛡  Backing up orchestrator & related files"
cp "$EXT_SRC/orchestrator.ts" "$BACKUP_DIR/orchestrator.ts"

echo "🚚  Moving orchestrator → pipeline/toolExecutor.ts"
mv "$EXT_SRC/orchestrator.ts" "$PIPELINE_DIR/toolExecutor.ts"

echo "🔀  Renaming exported class to ToolExecutor"
sed -i 's/export class Orchestrator/export class ToolExecutor/' "$PIPELINE_DIR/toolExecutor.ts"

echo "📝 Creating/overwriting stub IntentPipeline to call ToolExecutor"
cat > "$PIPELINE_DIR/intentPipeline.ts" <<'EOF'
import { ToolExecutor } from './toolExecutor';
import { IntelligenceEngine } from './intelligenceEngine';

export class IntentPipeline {
  private engine = new IntelligenceEngine();
  private executor = new ToolExecutor();

  async executeIntent(text: string, logger: (m:string)=>void) {
    logger(`🤖 Pipeline received: ${text}`);
    const parsed = await this.engine.handleQuery(text);
    await this.executor.executePlan(parsed, logger);
  }
}
EOF

echo "🔧  Patching imports across codebase"
# For every TS file, replace old import path & class reference
find "$EXT_SRC" -type f -name "*.ts" ! -path "*/pipeline/*" \
  -exec sed -i "s#'./orchestrator'#'./pipeline/toolExecutor'#g" {} +

# Replace constructor calls
find "$EXT_SRC" -type f -name "*.ts" ! -path "*/pipeline/*" \
  -exec sed -i 's/new Orchestrator(/new ToolExecutor(/g' {} + || true

echo "✨  Extension split completed. Compile with:  cd src/extension && npm run bundle"
