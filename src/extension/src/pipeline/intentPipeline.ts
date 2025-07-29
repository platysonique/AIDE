import { ToolExecutor } from './toolExecutor';
import { IntelligenceEngine, ParsedIntent } from './intelligenceEngine';

export class IntentPipeline {
    private engine = new IntelligenceEngine();
    private executor = new ToolExecutor();

    async executeIntent(text: string, logger?: (m: string) => void): Promise<void> {
        const log = logger || ((msg: string) => console.log(msg));
        
        log(`🤖 Pipeline received: ${text}`);
        
        try {
            // Get AI reasoning from intelligence engine with FIXED regex patterns
            const parsed = await this.engine.handleQuery(text);
            log(`🎯 Intent: ${parsed.intent} | Type: ${this.getIntentCategory(parsed.intent)} | Confidence: ${Math.round(parsed.confidence * 100)}%`);
            
            // Add contextual response based on intent type
            this.addContextualResponse(parsed, log);
            
            // Execute using tool executor
            await this.executor.executePlan(parsed, log);
            
            // Only add this footer for non-conversational intents
            if (parsed.response_type !== 'conversation') {
                log(`💡 Want me to explain anything else, show examples, or dive deeper into this topic?`);
            }
            
        } catch (error) {
            console.error('Pipeline execution error:', error);
            log(`❌ Pipeline error: ${error}`);
        }
    }

    private getIntentCategory(intent: string): string {
        if (intent.includes('code') || intent.includes('format') || intent.includes('fix')) return 'code';
        if (intent.includes('file') || intent.includes('create') || intent.includes('open')) return 'file';
        if (intent.includes('explain') || intent.includes('help') || intent.includes('show')) return 'learning';
        if (intent.includes('generate') || intent.includes('create') || intent.includes('write')) return 'creative';
        if (intent.includes('search') || intent.includes('find') || intent.includes('time')) return 'research';
        if (intent.includes('setup') || intent.includes('config')) return 'config';
        return 'chat';
    }

    private addContextualResponse(parsed: ParsedIntent, logger: (msg: string) => void): void {
        // Add contextual information based on the classified intent
        switch (parsed.response_type) {
            case 'conversation':
                // For general conversation, provide a friendly response
                if (parsed.intent === 'general_conversation') {
                    logger(`💬 I understand you want to have a conversation. I'm here to help! What specifically would you like to know or do?`);
                }
                break;
                
            case 'explanation':
                // For learning requests, show what we're analyzing
                if (parsed.confidence > 0.8) {
                    logger(`📚 High confidence explanation request detected. Let me provide detailed information.`);
                } else {
                    logger(`📚 I'll do my best to explain this. If you need clarification, just ask!`);
                }
                break;
                
            case 'action':
                // For code/file actions, show what tools will be used
                if (parsed.tools_needed.length > 0) {
                    logger(`🔧 Preparing to use: ${parsed.tools_needed.join(', ')}`);
                }
                break;
                
            case 'creation':
                // For creative tasks, show what we're creating
                logger(`🎨 Creative task detected. I'll help you create ${parsed.intent.replace('_', ' ')}.`);
                break;
        }
    }

    // Public method for direct access to intelligence engine
    async classifyIntent(text: string): Promise<ParsedIntent> {
        return await this.engine.handleQuery(text);
    }

    // Public method for direct tool execution
    async executeTools(parsed: ParsedIntent, logger?: (m: string) => void): Promise<void> {
        await this.executor.executePlan(parsed, logger || ((msg: string) => console.log(msg)));
    }

    // Health check method
    isReady(): boolean {
        return true; // Pipeline is always ready since it's local processing
    }

    // Get pipeline stats
    getStats(): { engine: string, executor: string } {
        return {
            engine: 'IntelligenceEngine v2.0 - Fixed Regex Patterns',
            executor: 'ToolExecutor v2.0 - Smart Extension Discovery'
        };
    }
}

export { ParsedIntent };
