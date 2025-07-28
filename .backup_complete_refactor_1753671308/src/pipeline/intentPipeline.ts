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
