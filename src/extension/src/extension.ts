import * as vscode from 'vscode';
import { launchBackend } from './backendManager';
import { registerCommands } from './commands';
import { initSpeechUI } from './speechUI';
import { initIngestUI } from './ingestUI';
import { initCodeReviewUI } from './codeReviewUI';
import { initDebugGuideUI } from './debugGuideUI';
import { initMemoryUI } from './memoryUI';
import { initChatPanel } from './chatPanel';

// Working tree data provider class
class WorkingTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private items: vscode.TreeItem[] = [];

  constructor(initialItems: string[] = []) {
    this.items = initialItems.map(item => 
      new vscode.TreeItem(item, vscode.TreeItemCollapsibleState.None)
    );
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
    if (element) {
      return Promise.resolve([]);
    }
    return Promise.resolve(this.items);
  }

  addItem(text: string): void {
    this.items.push(new vscode.TreeItem(text, vscode.TreeItemCollapsibleState.None));
    this.refresh();
  }

  clear(): void {
    this.items = [];
    this.refresh();
  }

  setItems(items: string[]): void {
    this.items = items.map(item => 
      new vscode.TreeItem(item, vscode.TreeItemCollapsibleState.None)
    );
    this.refresh();
  }
}

// Intent orchestrator class
class IntentOrchestrator {
  constructor(private chatProvider: WorkingTreeProvider) {}

  async executeIntent(userText: string): Promise<void> {
    const activeEditor = vscode.window.activeTextEditor;
    
    this.chatProvider.addItem(`👤 ${userText}`);
    this.chatProvider.addItem(`🤔 Interpreting intent...`);
    
    // Build intent request
    const payload = {
      user_text: userText,
      diagnostics: activeEditor 
        ? vscode.languages.getDiagnostics(activeEditor.document.uri).map(diag => ({
            message: diag.message,
            severity: diag.severity,
            range_start: diag.range.start.character,
            range_end: diag.range.end.character
          }))
        : [],
      selection: activeEditor ? activeEditor.document.getText(activeEditor.selection) : '',
      fileName: activeEditor ? activeEditor.document.fileName : ''
    };

    try {
      // Call your enhanced intent interpreter
      const response = await fetch('http://localhost:8000/api/v1/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const intent = await response.json();
      
      // Show intent result in chat
      this.chatProvider.addItem(
        `🎯 Intent: ${intent.intent} | Confidence: ${(intent.confidence * 100).toFixed(0)}% | Tools: ${intent.tools_needed.join(', ')}`
      );

      // Execute discovered tools
      const executedCount = await this.executePlan(intent);
      
      if (executedCount > 0) {
        this.chatProvider.addItem(`✅ Executed ${executedCount} tools successfully!`);
      } else {
        this.chatProvider.addItem(`⚠️ No matching VS Code tools found`);
      }

    } catch (error: any) {
      this.chatProvider.addItem(`❌ Error: ${error.message}`);
      vscode.window.showErrorMessage(`Intent execution failed: ${error.message}`);
    }
  }

  private async executePlan(intent: any): Promise<number> {
    const commands = await vscode.commands.getCommands(true);
    let executed = 0;

    this.chatProvider.addItem(`🔧 Discovering VS Code commands...`);

    // Simple tool mapping
    for (const tool of intent.tools_needed) {
      switch (tool) {
        case 'formatter':
          if (commands.includes('editor.action.formatDocument')) {
            await vscode.commands.executeCommand('editor.action.formatDocument');
            this.chatProvider.addItem(`✅ Executed: Format Document`);
            executed++;
          }
          break;
        
        case 'linter':
        case 'auto_fix':
          if (commands.includes('editor.action.fixAll')) {
            await vscode.commands.executeCommand('editor.action.fixAll');
            this.chatProvider.addItem(`✅ Executed: Fix All Issues`);
            executed++;
          }
          break;
          
        case 'indent_checker':
          if (commands.includes('editor.action.indentLines')) {
            await vscode.commands.executeCommand('editor.action.indentLines');
            this.chatProvider.addItem(`✅ Executed: Fix Indentation`);
            executed++;
          }
          break;

        case 'style_guide':
          if (commands.includes('eslint.executeAutofix')) {
            await vscode.commands.executeCommand('eslint.executeAutofix');
            this.chatProvider.addItem(`✅ Executed: ESLint Auto-fix`);
            executed++;
          }
          break;
      }
    }

    return executed;
  }
}

let orchestrator: IntentOrchestrator;
let chatTreeProvider: WorkingTreeProvider;
let intentTreeProvider: WorkingTreeProvider;

export function activate(context: vscode.ExtensionContext) {
  console.log('🚀 AIDE Intent → Tool → Execution pipeline activating...');

  // Launch backend server
  launchBackend(context);

  // Register all existing commands (preserve your functionality)
  registerCommands(context);

  // Initialize all existing UI components (preserve your functionality)
  initSpeechUI(context);
  initIngestUI(context);
  initCodeReviewUI(context);
  initDebugGuideUI(context);
  initMemoryUI(context);

  // Initialize the original chat panel for backward compatibility
  initChatPanel(context);

  // Create working tree providers for BOTH views
  chatTreeProvider = new WorkingTreeProvider([
    '🎯 AIDE Chat Ready!',
    '💬 Type your commands here...',
    '🤖 Intent → Tool → Execution Pipeline Online!'
  ]);

  intentTreeProvider = new WorkingTreeProvider([
    '🔧 Available Tools:',
    '📝 Format Document',
    '🛠️ Fix All Issues', 
    '🎯 ESLint Auto-fix',
    '📐 Fix Indentation'
  ]);

  // Initialize intent orchestrator
  orchestrator = new IntentOrchestrator(chatTreeProvider);

  // Register BOTH tree data providers
  vscode.window.registerTreeDataProvider('aide.chatView', chatTreeProvider);
  vscode.window.registerTreeDataProvider('aide.intentView', intentTreeProvider);

  // Register Intent → Tool → Execution commands
  context.subscriptions.push(
    // Execute intent directly
    vscode.commands.registerCommand('aide.executeIntent', async () => {
      const userInput = await vscode.window.showInputBox({
        prompt: 'What would you like AIDE to do?',
        placeHolder: 'e.g., format my code, fix errors, run tests...'
      });

      if (userInput) {
        await orchestrator.executeIntent(userInput);
      }
    }),

    // Clear chat/intent history
    vscode.commands.registerCommand('aide.clearChat', () => {
      chatTreeProvider.clear();
      chatTreeProvider.addItem('🎯 AIDE Chat Ready!');
      chatTreeProvider.addItem('💬 Chat history cleared');
      vscode.window.showInformationMessage('🧹 AIDE chat history cleared!');
    }),

    // Keep your existing command working
    vscode.commands.registerCommand('aide.openChat', () => {
      vscode.commands.executeCommand('workbench.view.extension.aideChatContainer');
    })
  );

  // Status bar integration
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(robot) AIDE';
  statusBarItem.tooltip = 'AIDE Intent → Tool → Execution Pipeline';
  statusBarItem.command = 'aide.executeIntent'; 
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Enhanced welcome message
  vscode.window
    .showInformationMessage(
      '🎯 AIDE Intent → Tool → Execution pipeline is ready! Click the robot in the Activity Bar to start.',
      'Try Intent Command',
      'Open Sidebar'
    )
    .then(selection => {
      switch (selection) {
        case 'Try Intent Command':
          vscode.commands.executeCommand('aide.executeIntent');
          break;
        case 'Open Sidebar':
          vscode.commands.executeCommand('workbench.view.extension.aideChatContainer');
          break;
      }
    });

  console.log('✅ AIDE activation complete! Intent → Tool → Execution pipeline online.');
}

export function deactivate() {
  console.log('🔴 AIDE extension deactivated');
}

