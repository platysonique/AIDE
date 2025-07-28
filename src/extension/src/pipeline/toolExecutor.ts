import * as vscode from 'vscode';

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

interface ToolDescriptor {
  id: string;
  type: 'cmd' | 'agent' | 'api';
  description: string;
}

export class ToolExecutor {
  async executePlan(task: ParsedIntent, logger: (message: string) => void): Promise<void> {
    logger(`🎯 Executing: ${task.intent} (confidence: ${Math.round(task.confidence * 100)}%)`);

    const tools = await this.discoverTools(task.tools_needed);

    if (tools.length > 0) {
      logger(`🔧 Found ${tools.length} tools: ${tools.map(t => t.description).join(', ')}`);

      for (const tool of tools) {
        try {
          if (tool.type === 'cmd') {
            await vscode.commands.executeCommand(tool.id);
            logger(`✅ Executed: ${tool.description}`);
          } else if (tool.type === 'agent') {
            // Future: AI agent execution
            logger(`🤖 Agent tool: ${tool.description} (coming soon)`);
          }
        } catch (error) {
          logger(`❌ Failed: ${tool.description} - ${error}`);
        }
      }

      // Auto-fix if requested and confidence is high enough
      if (task.auto_fix && task.confidence > 0.7) {
        try {
          await vscode.commands.executeCommand('editor.action.fixAll');
          logger(`🛠️ Applied auto-fixes`);
        } catch (error) {
          logger(`⚠️ Auto-fix unavailable: ${error}`);
        }
      }

    } else {
      logger(`🤖 No native tools found for: ${task.tools_needed.join(', ')}`);
      
      // Enhanced fallback handling
      await this.handleFallbackExecution(task, logger);
    }
  }

  private async handleFallbackExecution(task: ParsedIntent, logger: (message: string) => void): Promise<void> {
    // Enhanced conversational and creative responses when no tools match
    switch (task.response_type) {
      case 'conversation':
        logger(`💬 I understand you want to ${task.intent}. I'm here to help! What specifically would you like to know or do?`);
        break;
      
      case 'explanation':
        logger(`📚 I'd love to explain ${task.intent} for you! Could you provide more context about what you'd like to understand?`);
        break;
      
      case 'creation':
        logger(`🎨 I can help create ${task.intent}! Let me know what specific content or structure you need.`);
        break;
      
      case 'action':
        logger(`⚡ I recognize you want to perform ${task.intent}, but I need the right tools available. Check if relevant extensions are installed.`);
        break;
    }
  }

  private async discoverTools(toolsNeeded: string[]): Promise<ToolDescriptor[]> {
    const cmds = await vscode.commands.getCommands(true);
    const catalog: ToolDescriptor[] = [];

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
          if (cmds.includes('prettier.forceFormatDocument')) {
            catalog.push({ 
              id: 'prettier.forceFormatDocument', 
              type: 'cmd',
              description: 'Prettier formatting'
            });
          }
          break;

        case 'linter':
        case 'auto_fix':
          if (cmds.includes('editor.action.fixAll')) {
            catalog.push({ 
              id: 'editor.action.fixAll', 
              type: 'cmd',
              description: 'Apply all available fixes'
            });
          }
          if (cmds.includes('eslint.executeAutofix')) {
            catalog.push({ 
              id: 'eslint.executeAutofix', 
              type: 'cmd',
              description: 'ESLint auto-fix'
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
          if (cmds.includes('npm.runTest')) {
            catalog.push({ 
              id: 'npm.runTest', 
              type: 'cmd',
              description: 'Run npm tests'
            });
          }
          break;

        case 'file_manager':
          if (cmds.includes('workbench.action.files.newFile')) {
            catalog.push({ 
              id: 'workbench.action.files.newFile', 
              type: 'cmd',
              description: 'Create new file'
            });
          }
          break;

        case 'workspace_navigator':
          if (cmds.includes('workbench.action.quickOpen')) {
            catalog.push({ 
              id: 'workbench.action.quickOpen', 
              type: 'cmd',
              description: 'Quick file open'
            });
          }
          break;

        // Future AI agent tools (ready for online search integration)
        case 'online_search':
        case 'web_scraper':
        case 'api_caller':
          catalog.push({ 
            id: `agent_${need}`, 
            type: 'agent',
            description: `AI agent for ${need.replace('_', ' ')}`
          });
          break;

        case 'chat_handler':
        case 'conversation_manager':
          catalog.push({ 
            id: `agent_${need}`, 
            type: 'agent',
            description: `Conversational AI for ${need.replace('_', ' ')}`
          });
          break;

        default:
          // Unknown tool - mark for future AI agent handling
          catalog.push({ 
            id: `agent_${need}`, 
            type: 'agent',
            description: `AI agent for ${need.replace('_', ' ')}`
          });
          break;
      }
    }

    return catalog;
  }
}
