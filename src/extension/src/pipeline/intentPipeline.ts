import { ToolExecutor } from './toolExecutor';
import { IntelligenceEngine, ParsedIntent } from './intelligenceEngine';

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
