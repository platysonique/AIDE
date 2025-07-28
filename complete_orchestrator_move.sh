#!/usr/bin/env bash
# Purpose: Move orchestrator.ts to pipeline/toolExecutor.ts and update all imports
# Run after script 1

set -euo pipefail
SRC_DIR="src/extension/src"
PIPELINE_DIR="$SRC_DIR/pipeline"
ORCHESTRATOR_FILE="$SRC_DIR/orchestrator.ts"
TOOL_EXECUTOR_FILE="$PIPELINE_DIR/toolExecutor.ts"

if [[ ! -f "$ORCHESTRATOR_FILE" ]]; then
  echo "❌ Cannot find $ORCHESTRATOR_FILE - already moved or missing?"
  exit 1
fi

echo "🚚  Moving orchestrator.ts → pipeline/toolExecutor.ts"
mv "$ORCHESTRATOR_FILE" "$TOOL_EXECUTOR_FILE"

echo "🔄  Renaming Orchestrator class → ToolExecutor"
sed -i 's/export class Orchestrator/export class ToolExecutor/g' "$TOOL_EXECUTOR_FILE"

echo "📝  Updating intentPipeline.ts to use ToolExecutor"
cat > "$PIPELINE_DIR/intentPipeline.ts" <<'EOF'
import { ToolExecutor } from './toolExecutor';
import { IntelligenceEngine } from './intelligenceEngine';

interface ParsedIntent {
  intent: string;
  scope: 'file' | 'workspace' | 'selection' | 'global';
  auto_fix: boolean;
  tools_needed: string[];
  confidence: number;
  context_hints?: string[];
  response_type: 'action' | 'explanation' | 'creation' | 'conversation';
  requires_context: boolean;
}

export class IntentPipeline {
  private engine = new IntelligenceEngine();
  private executor = new ToolExecutor();

  async executeIntent(text: string, logger?: (m: string) => void): Promise<void> {
    const log = logger || ((msg: string) => console.log(msg));
    
    log(`🤖 Pipeline received: ${text}`);
    
    // Get AI reasoning from intelligence engine
    const parsed = await this.engine.handleQuery(text);
    log(`🎯 Intent: ${parsed.intent} (confidence: ${Math.round(parsed.confidence * 100)}%)`);
    
    // Execute using tool executor
    await this.executor.executePlan(parsed, log);
    
    log(`✅ Pipeline execution complete`);
  }
}

export { ParsedIntent };
EOF

echo "🔧  Updating all imports throughout codebase"
# Update imports in all TypeScript files
find "$SRC_DIR" -name "*.ts" -not -path "*/pipeline/*" \
  -exec sed -i "s|from './orchestrator'|from './pipeline/toolExecutor'|g" {} + || true

find "$SRC_DIR" -name "*.ts" -not -path "*/pipeline/*" \
  -exec sed -i "s|import.*orchestrator.*|import { ToolExecutor } from './pipeline/toolExecutor';|g" {} + || true

# Update class references
find "$SRC_DIR" -name "*.ts" -not -path "*/pipeline/*" \
  -exec sed -i 's/new Orchestrator(/new ToolExecutor(/g' {} + || true

find "$SRC_DIR" -name "*.ts" -not -path "*/pipeline/*" \
  -exec sed -i 's/: Orchestrator/: ToolExecutor/g' {} + || true

echo "✨  Orchestrator successfully transformed to ToolExecutor!"
