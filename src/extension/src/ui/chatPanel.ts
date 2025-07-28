import * as vscode from 'vscode';

export function initChatPanel(context: vscode.ExtensionContext) {
  // Your existing chatPanel initialization code
  console.log('🎯 AIDE Chat Panel initializing...');
}

// Data contracts matching your backend
interface DiagnosticDump {
  message: string;
  severity: number;
  range_start: number;
  range_end: number;
}

interface IntentRequest {
  user_text: string;
  diagnostics: DiagnosticDump[];
  selection: string;
  fileName: string;
}

interface ParsedIntent {
  intent: string;
  scope: 'file' | 'workspace' | 'selection';
  auto_fix: boolean;
  tools_needed: string[];
  confidence: number;
  context_hints: string[];
}

// Tool discovery and execution engine
class Orchestrator {
  private chatPanel: vscode.WebviewPanel | undefined;

  constructor(chatPanel?: vscode.WebviewPanel) {
    this.chatPanel = chatPanel;
  }

  async discoverTools(toolsNeeded: string[]): Promise<Array<{id: string, type: string, description: string}>> {
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
          // Unknown tool - will fallback to AgentFactory
          break;
      }
    }
    return catalog;
  }

  async executePlan(task: ParsedIntent, callback?: (message: string) => void): Promise<number> {
    this.logToChat(`🎯 Executing: ${task.intent} (confidence: ${(task.confidence * 100).toFixed(0)}%)`);
    if (callback) callback(`🎯 Executing: ${task.intent} (confidence: ${(task.confidence * 100).toFixed(0)}%)`);

    const tools = await this.discoverTools(task.tools_needed);

    if (tools.length > 0) {
      this.logToChat(`🔧 Found ${tools.length} tools: ${tools.map(t => t.description).join(', ')}`);
      if (callback) callback(`🔧 Found ${tools.length} tools: ${tools.map(t => t.description).join(', ')}`);

      for (const tool of tools) {
        try {
          await vscode.commands.executeCommand(tool.id);
          this.logToChat(`✅ Executed: ${tool.description}`);
          if (callback) callback(`✅ Executed: ${tool.description}`);
        } catch (error) {
          this.logToChat(`❌ Failed: ${tool.description} - ${error}`);
          if (callback) callback(`❌ Failed: ${tool.description} - ${error}`);
        }
      }

      // Auto-fix if requested
      if (task.auto_fix) {
        try {
          await vscode.commands.executeCommand('editor.action.fixAll');
          this.logToChat(`🛠️ Applied auto-fixes`);
          if (callback) callback(`🛠️ Applied auto-fixes`);
        } catch (error) {
          this.logToChat(`⚠️ Auto-fix unavailable: ${error}`);
          if (callback) callback(`⚠️ Auto-fix unavailable: ${error}`);
        }
      }
    } else {
      // Fallback to AgentFactory (for Sprint 4)
      this.logToChat(`🤖 No native tools found, would create custom agent...`);
      if (callback) callback(`🤖 No native tools found, would create custom agent...`);
      // TODO: Implement AgentFactory fallback
    }

    return tools.length;
  }

  private logToChat(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    if (this.chatPanel?.webview) {
      this.chatPanel.webview.postMessage({
        command: 'append',
        text: `${timestamp} - ${message}`
      });
    }
    console.log(`[AIDE Orchestrator] ${message}`);
  }
}

// Main chat panel management
let chatPanel: vscode.WebviewPanel | undefined;
let orchestrator: Orchestrator | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('🚀 AIDE Intent → Tool → Execution pipeline activating...');

  context.subscriptions.push(
    vscode.commands.registerCommand('aide.openChat', () => {
      vscode.commands.executeCommand('workbench.view.extension.aideChatContainer');
    })
  );
}

export function deactivate() {
  console.log('🔴 AIDE extension deactivated');
}

