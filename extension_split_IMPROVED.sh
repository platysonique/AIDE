#!/usr/bin/env bash
# Purpose: Extract and re-home the old Orchestrator as ToolExecutor,
# create proper pipeline glue, and patch imports.
# IMPROVED VERSION with better error handling and path fixes
# Run after scripts 1 & 2

set -euo pipefail
EXT_SRC="src/extension/src"
PIPELINE_DIR="$EXT_SRC/pipeline"
BACKUP_DIR=".backup_split_$(date +%s)"
mkdir -p "$BACKUP_DIR"

echo "🛡  Backing up orchestrator & related files"
if [ -f "$EXT_SRC/orchestrator.ts" ]; then
    cp "$EXT_SRC/orchestrator.ts" "$BACKUP_DIR/orchestrator.ts"
    echo "✅  Orchestrator backed up successfully"
else
    echo "⚠️  Warning: orchestrator.ts not found at $EXT_SRC/orchestrator.ts"
    find . -name "orchestrator.ts" -type f 2>/dev/null || echo "   No orchestrator.ts files found anywhere"
fi

echo "🚚  Moving orchestrator → pipeline/toolExecutor.ts"
if [ -f "$EXT_SRC/orchestrator.ts" ]; then
    mv "$EXT_SRC/orchestrator.ts" "$PIPELINE_DIR/toolExecutor.ts"
    echo "✅  File moved successfully"
else
    echo "❌  Cannot move orchestrator.ts - file not found"
    exit 1
fi

echo "🔀  Renaming exported class to ToolExecutor"
sed -i 's/export class Orchestrator/export class ToolExecutor/g' "$PIPELINE_DIR/toolExecutor.ts"

# Also update any internal references within the file
sed -i 's/class Orchestrator/class ToolExecutor/g' "$PIPELINE_DIR/toolExecutor.ts"

echo "📝 Creating/overwriting IntentPipeline to call ToolExecutor"
cat > "$PIPELINE_DIR/intentPipeline.ts" <<'EOF'
import { ToolExecutor } from './toolExecutor';
import { IntelligenceEngine } from './intelligenceEngine';

export class IntentPipeline {
  private engine = new IntelligenceEngine();
  private executor = new ToolExecutor();

  async executeIntent(text: string, logger: (m: string) => void) {
    logger(`🤖 Pipeline received: ${text}`);
    
    try {
      const parsed = await this.engine.handleQuery(text);
      logger(`🎯 Parsed intent: ${JSON.stringify(parsed)}`);
      
      // Pass the parsed intent to the tool executor
      await this.executor.executePlan(parsed, logger);
    } catch (error) {
      logger(`❌ Pipeline error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
EOF

echo "🔧  Patching imports across codebase"
# Find all TypeScript files and update imports
find "$EXT_SRC" -type f -name "*.ts" ! -path "*/pipeline/*" -print0 | while IFS= read -r -d '' file; do
    if [ -f "$file" ]; then
        # Update import paths
        sed -i "s#'./orchestrator'#'./pipeline/toolExecutor'#g" "$file" 2>/dev/null || true
        sed -i "s#\"./orchestrator\"#\"./pipeline/toolExecutor\"#g" "$file" 2>/dev/null || true
        
        # Update class references
        sed -i 's/new Orchestrator(/new ToolExecutor(/g' "$file" 2>/dev/null || true
        sed -i 's/: Orchestrator/: ToolExecutor/g' "$file" 2>/dev/null || true
        
        echo "   ✅ Updated: $file"
    fi
done

# Also check the main extension.ts file
EXT_MAIN="src/extension/extension.ts"
if [ -f "$EXT_MAIN" ]; then
    sed -i "s#'./orchestrator'#'./src/pipeline/toolExecutor'#g" "$EXT_MAIN" 2>/dev/null || true
    sed -i "s#\"./orchestrator\"#\"./src/pipeline/toolExecutor\"#g" "$EXT_MAIN" 2>/dev/null || true
    sed -i 's/new Orchestrator(/new ToolExecutor(/g' "$EXT_MAIN" 2>/dev/null || true
    echo "   ✅ Updated main extension.ts"
fi

echo "🎨  Creating enhanced IntelligenceEngine stub"
cat > "$PIPELINE_DIR/intelligenceEngine.ts" <<'EOF'
export interface ParsedIntent {
  intent: string;
  confidence: number;
  tools_needed: string[];
  context?: any;
  parameters?: Record<string, any>;
}

export class IntelligenceEngine {
  async handleQuery(text: string): Promise<ParsedIntent> {
    // TODO: Implement real AI reasoning and online search integration
    // This is a stub that returns a basic parsed intent
    
    // Simple intent classification (to be replaced with real AI)
    const lowerText = text.toLowerCase();
    let intent = 'unknown';
    let tools_needed: string[] = [];
    
    if (lowerText.includes('format') || lowerText.includes('beautify')) {
      intent = 'format_code';
      tools_needed = ['format'];
    } else if (lowerText.includes('fix') || lowerText.includes('error')) {
      intent = 'fix_code';
      tools_needed = ['diagnostic', 'fix'];
    } else if (lowerText.includes('explain') || lowerText.includes('what does')) {
      intent = 'explain_code';
      tools_needed = ['analysis'];
    } else if (lowerText.includes('search') || lowerText.includes('find')) {
      intent = 'search';
      tools_needed = ['search'];
    } else {
      intent = 'chat';
      tools_needed = ['conversation'];
    }
    
    return {
      intent,
      confidence: 0.8, // Placeholder confidence
      tools_needed,
      context: { originalText: text },
      parameters: {}
    };
  }
}
EOF

echo "✨  Extension split completed successfully!"
echo ""
echo "📋  Next Steps:"
echo "   1. Run: cd src/extension && npm run bundle"
echo "   2. Test the extension in VS Code"
echo "   3. Implement real AI logic in intelligenceEngine.ts"
echo "   4. Add online search integration to IntelligenceEngine"
echo ""
echo "🎯  Files created/modified:"
echo "   • $PIPELINE_DIR/toolExecutor.ts (moved from orchestrator.ts)"
echo "   • $PIPELINE_DIR/intentPipeline.ts (new pipeline orchestrator)"
echo "   • $PIPELINE_DIR/intelligenceEngine.ts (enhanced AI stub)"
echo "   • Updated all import references across the codebase"