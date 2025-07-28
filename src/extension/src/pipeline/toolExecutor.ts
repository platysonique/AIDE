import * as vscode from 'vscode';

interface ParsedIntent {
    intent: string;
    scope: 'file' | 'workspace' | 'selection';
    auto_fix: boolean;
    tools_needed: string[];
    confidence: number;
    context_hints: string[];
}

export class ToolExecutor {
    async executePlan(task: ParsedIntent, logger: (message: string) => void): Promise<void> {
        logger(`🎯 Executing: ${task.intent} (confidence: ${(task.confidence * 100).toFixed(0)}%)`);

        const tools = await this.discoverTools(task.tools_needed);

        if (tools.length > 0) {
            logger(`🔧 Found ${tools.length} tools: ${tools.map(t => t.description).join(', ')}`);

            for (const tool of tools) {
                try {
                    await vscode.commands.executeCommand(tool.id);
                    logger(`✅ Executed: ${tool.description}`);
                } catch (error) {
                    logger(`❌ Failed: ${tool.description} - ${error}`);
                }
            }

            // Auto-fix if requested
            if (task.auto_fix) {
                try {
                    await vscode.commands.executeCommand('editor.action.fixAll');
                    logger(`🛠️ Applied auto-fixes`);
                } catch (error) {
                    logger(`⚠️ Auto-fix unavailable: ${error}`);
                }
            }

        } else {
            logger(`🤖 No native tools found for: ${task.tools_needed.join(', ')}`);
            // TODO: Fallback to AgentFactory (Sprint 4)
        }
    }

    private async discoverTools(toolsNeeded: string[]): Promise<Array<{id: string, type: string, description: string}>> {
        const cmds = await vscode.commands.getCommands(true);
        const catalog: Array<{id: string, type: string, description: string}> = [];

        for (const need of toolsNeeded) {
            switch (need) {
                case 'formatter':
                    if (cmds.includes('editor.action.formatDocument')) {
                        catalog.push({ 
                            id: 'editor.action.formatDocument', 
                            type: 'cmd',
                            description: 'Format entire document'
                        });
                    }
                    break;

                case 'indent_checker':
                    if (cmds.includes('editor.action.indentLines')) {
                        catalog.push({ 
                            id: 'editor.action.indentLines', 
                            type: 'cmd',
                            description: 'Fix indentation'
                        });
                    }
                    break;

                case 'style_guide':
                    if (cmds.includes('eslint.executeAutofix')) {
                        catalog.push({ 
                            id: 'eslint.executeAutofix', 
                            type: 'cmd',
                            description: 'Apply ESLint style fixes'
                        });
                    }
                    break;

                case 'linter':
                    if (cmds.includes('eslint.executeAutofix')) {
                        catalog.push({ 
                            id: 'eslint.executeAutofix', 
                            type: 'cmd',
                            description: 'ESLint auto-fix'
                        });
                    }
                    break;

                case 'auto_fix':
                    if (cmds.includes('editor.action.fixAll')) {
                        catalog.push({ 
                            id: 'editor.action.fixAll', 
                            type: 'cmd',
                            description: 'Apply all available fixes'
                        });
                    }
                    break;

                case 'test_runner':
                    if (cmds.includes('test-explorer.run-all')) {
                        catalog.push({ 
                            id: 'test-explorer.run-all', 
                            type: 'cmd',
                            description: 'Run all tests'
                        });
                    }
                    break;

                default:
                    // Unknown tool - will need AgentFactory
                    break;
            }
        }

        return catalog;
    }
}

