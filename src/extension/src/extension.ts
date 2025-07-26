import * as vscode from 'vscode';
import { launchBackend } from './backendManager';
import { registerCommands } from './commands';
import { initSpeechUI } from './speechUI';
import { initIngestUI } from './ingestUI';
import { initCodeReviewUI } from './codeReviewUI';
import { initDebugGuideUI } from './debugGuideUI';
import { initMemoryUI } from './memoryUI';
import { initChatPanel } from './chatPanel';

// Intent → Tool → Execution Pipeline Classes

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

// Webview Provider for Chat Panel
class ChatWebviewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private messages: string[] = [];

  constructor(private context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = this.getWebviewContent();

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'userMessage':
          await this.handleUserMessage(message.text);
          break;
        case 'clearChat':
          this.clearChat();
          break;
      }
    });

    // Initial welcome message
    this.addMessage('🎯 AIDE Intent → Tool → Execution Pipeline Ready!');
    this.addMessage('💬 Type your command below to get started.');
  }

  private async handleUserMessage(text: string): Promise<void> {
    if (!this._view) return;

    this.addMessage(`👤 ${text}`);
    this.addMessage('🤔 Interpreting intent...');

    // Build context payload
    const activeEditor = vscode.window.activeTextEditor;
    const diagnostics = activeEditor 
      ? vscode.languages.getDiagnostics(activeEditor.document.uri).map(diag => ({
          message: diag.message,
          severity: diag.severity,
          range_start: diag.range.start.character,
          range_end: diag.range.end.character
        }))
      : [];

    const payload: IntentRequest = {
      user_text: text,
      diagnostics,
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

      const intent: ParsedIntent = await response.json();
      
      this.addMessage(
        `🎯 Intent: ${intent.intent} | Confidence: ${(intent.confidence * 100).toFixed(0)}% | Tools: ${intent.tools_needed.join(', ')}`
      );

      // Execute the plan
      await this.executePlan(intent);

    } catch (error: any) {
      this.addMessage(`❌ Error: ${error.message}`);
      vscode.window.showErrorMessage(`Intent execution failed: ${error.message}`);
    }
  }

  private async executePlan(intent: ParsedIntent): Promise<void> {
    const commands = await vscode.commands.getCommands(true);
    let executed = 0;

    this.addMessage('🔧 Discovering VS Code commands...');

    // Tool discovery and execution
    for (const tool of intent.tools_needed) {
      switch (tool) {
        case 'formatter':
          if (commands.includes('editor.action.formatDocument')) {
            await vscode.commands.executeCommand('editor.action.formatDocument');
            this.addMessage('✅ Executed: Format Document');
            executed++;
          } else if (commands.includes('prettier.forceFormatDocument')) {
            await vscode.commands.executeCommand('prettier.forceFormatDocument');
            this.addMessage('✅ Executed: Prettier Format');
            executed++;
          }
          break;
        
        case 'linter':
        case 'auto_fix':
          if (commands.includes('editor.action.fixAll')) {
            await vscode.commands.executeCommand('editor.action.fixAll');
            this.addMessage('✅ Executed: Fix All Issues');
            executed++;
          }
          break;
          
        case 'indent_checker':
          if (commands.includes('editor.action.indentLines')) {
            await vscode.commands.executeCommand('editor.action.indentLines');
            this.addMessage('✅ Executed: Fix Indentation');
            executed++;
          }
          break;

        case 'style_guide':
          if (commands.includes('eslint.executeAutofix')) {
            await vscode.commands.executeCommand('eslint.executeAutofix');
            this.addMessage('✅ Executed: ESLint Auto-fix');
            executed++;
          }
          break;

        case 'test_runner':
          if (commands.includes('test-explorer.run-all')) {
            await vscode.commands.executeCommand('test-explorer.run-all');
            this.addMessage('✅ Executed: Run All Tests');
            executed++;
          } else if (commands.includes('npm.runTest')) {
            await vscode.commands.executeCommand('npm.runTest');
            this.addMessage('✅ Executed: NPM Test');
            executed++;
          }
          break;

        case 'search':
          if (commands.includes('workbench.action.findInFiles')) {
            await vscode.commands.executeCommand('workbench.action.findInFiles');
            this.addMessage('✅ Executed: Open Search in Files');
            executed++;
          }
          break;

        case 'refactor_tools':
          if (commands.includes('editor.action.refactor')) {
            await vscode.commands.executeCommand('editor.action.refactor');
            this.addMessage('✅ Executed: Show Refactor Options');
            executed++;
          }
          break;

        case 'documentation':
        case 'chat':
          // Route back to AIDE's existing functionality
          this.addMessage('💬 Routing to AIDE chat system...');
          if (commands.includes('aide.agenticIntent')) {
            await vscode.commands.executeCommand('aide.agenticIntent');
            executed++;
          }
          break;

        default:
          this.addMessage(`⚠️ Unknown tool: ${tool} - would create custom agent`);
          break;
      }
    }

    // Auto-fix if requested
    if (intent.auto_fix && executed > 0) {
      try {
        await vscode.commands.executeCommand('editor.action.fixAll');
        this.addMessage('🛠️ Applied auto-fixes');
      } catch (error) {
        this.addMessage(`⚠️ Auto-fix unavailable: ${error}`);
      }
    }

    if (executed > 0) {
      this.addMessage(`🎉 Executed ${executed} tools successfully!`);
    } else {
      this.addMessage(`⚠️ No matching VS Code tools found for: ${intent.tools_needed.join(', ')}`);
    }
  }

  private addMessage(text: string): void {
    const timestamp = new Date().toLocaleTimeString();
    const message = `${timestamp} - ${text}`;
    this.messages.push(message);
    
    if (this._view) {
      this._view.webview.postMessage({
        command: 'appendMessage',
        message: message
      });
    }
  }

  private clearChat(): void {
    this.messages = [];
    if (this._view) {
      this._view.webview.postMessage({
        command: 'clearChat'
      });
    }
    this.addMessage('🎯 AIDE Chat Ready!');
  }

  public async executeDirectIntent(text: string): Promise<void> {
    await this.handleUserMessage(text);
  }

  private getWebviewContent(): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AIDE Chat</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            margin: 0;
            padding: 10px;
            height: 100vh;
            display: flex;
            flex-direction: column;
          }
          #chatContainer {
            flex: 1;
            overflow-y: auto;
            border: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-panel-background);
            padding: 10px;
            margin-bottom: 10px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            line-height: 1.4;
            white-space: pre-wrap;
          }
          #inputContainer {
            display: flex;
            gap: 5px;
          }
          #messageInput {
            flex: 1;
            padding: 6px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 2px;
            font-size: 12px;
          }
          #sendButton, #clearButton {
            padding: 6px 12px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-size: 12px;
          }
          #sendButton:hover, #clearButton:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          .message {
            margin-bottom: 4px;
            word-wrap: break-word;
          }
        </style>
      </head>
      <body>
        <div id="chatContainer"></div>
        <div id="inputContainer">
          <input type="text" id="messageInput" placeholder="Ask AIDE to help with your code..." />
          <button id="sendButton">Send</button>
          <button id="clearButton">Clear</button>
        </div>

        <script>
          const vscode = acquireVsCodeApi();
          const chatContainer = document.getElementById('chatContainer');
          const messageInput = document.getElementById('messageInput');
          const sendButton = document.getElementById('sendButton');
          const clearButton = document.getElementById('clearButton');

          function sendMessage() {
            const text = messageInput.value.trim();
            if (text) {
              vscode.postMessage({ command: 'userMessage', text });
              messageInput.value = '';
            }
          }

          function clearChat() {
            vscode.postMessage({ command: 'clearChat' });
          }

          messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              sendMessage();
            }
          });

          sendButton.addEventListener('click', sendMessage);
          clearButton.addEventListener('click', clearChat);

          // Handle messages from extension
          window.addEventListener('message', (event) => {
            const message = event.data;
            switch (message.command) {
              case 'appendMessage':
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message';
                messageDiv.textContent = message.message;
                chatContainer.appendChild(messageDiv);
                chatContainer.scrollTop = chatContainer.scrollHeight;
                break;
              case 'clearChat':
                chatContainer.innerHTML = '';
                break;
            }
          });

          // Focus input on load
          messageInput.focus();
        </script>
      </body>
      </html>
    `;
  }
}

// Tools Status Provider
class ToolsWebviewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private tools: Array<{name: string, status: string, available: boolean}> = [];

  constructor(private context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = this.getWebviewContent();

    // Auto-refresh tools on load
    this.refreshTools();
  }

  public async refreshTools(): Promise<void> {
    const commands = await vscode.commands.getCommands(true);
    this.tools = [];

    // Check available formatting tools
    this.tools.push({
      name: 'Format Document',
      status: commands.includes('editor.action.formatDocument') ? 'Available' : 'Missing',
      available: commands.includes('editor.action.formatDocument')
    });

    this.tools.push({
      name: 'Fix All Issues',
      status: commands.includes('editor.action.fixAll') ? 'Available' : 'Missing',
      available: commands.includes('editor.action.fixAll')
    });

    this.tools.push({
      name: 'ESLint Auto-fix',
      status: commands.includes('eslint.executeAutofix') ? 'Available' : 'Missing',
      available: commands.includes('eslint.executeAutofix')
    });

    this.tools.push({
      name: 'Run Tests',
      status: commands.includes('test-explorer.run-all') ? 'Available' : 'Missing',
      available: commands.includes('test-explorer.run-all')
    });

    this.tools.push({
      name: 'Search Files',
      status: commands.includes('workbench.action.findInFiles') ? 'Available' : 'Missing',
      available: commands.includes('workbench.action.findInFiles')
    });

    // Check backend connectivity
    try {
      const response = await fetch('http://localhost:8000/health');
      this.tools.push({
        name: 'AIDE Backend',
        status: response.ok ? 'Online' : 'Issues',
        available: response.ok
      });
    } catch {
      this.tools.push({
        name: 'AIDE Backend',
        status: 'Offline',
        available: false
      });
    }

    this.updateWebview();
  }

  private updateWebview(): void {
    if (this._view) {
      this._view.webview.postMessage({
        command: 'updateTools',
        tools: this.tools
      });
    }
  }

  private getWebviewContent(): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AIDE Tools</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            margin: 0;
            padding: 10px;
          }
          .tool-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px;
            margin: 4px 0;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 3px;
            background-color: var(--vscode-panel-background);
          }
          .tool-name {
            font-weight: 500;
            flex: 1;
          }
          .tool-status {
            font-size: 11px;
            padding: 2px 6px;
            border-radius: 2px;
          }
          .available {
            background-color: var(--vscode-charts-green);
            color: var(--vscode-editor-background);
          }
          .missing {
            background-color: var(--vscode-charts-red);
            color: var(--vscode-editor-background);
          }
          #refreshButton {
            width: 100%;
            padding: 8px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            margin-bottom: 10px;
          }
          #refreshButton:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
        </style>
      </head>
      <body>
        <button id="refreshButton">🔄 Refresh Tools</button>
        <div id="toolsList"></div>

        <script>
          const vscode = acquireVsCodeApi();
          const toolsList = document.getElementById('toolsList');
          const refreshButton = document.getElementById('refreshButton');

          refreshButton.addEventListener('click', () => {
            vscode.postMessage({ command: 'refreshTools' });
          });

          function updateToolsList(tools) {
            toolsList.innerHTML = '';
            tools.forEach(tool => {
              const item = document.createElement('div');
              item.className = 'tool-item';
              
              const name = document.createElement('div');
              name.className = 'tool-name';
              name.textContent = tool.name;
              
              const status = document.createElement('div');
              status.className = \`tool-status \${tool.available ? 'available' : 'missing'}\`;
              status.textContent = tool.status;
              
              item.appendChild(name);
              item.appendChild(status);
              toolsList.appendChild(item);
            });
          }

          // Handle messages from extension
          window.addEventListener('message', (event) => {
            const message = event.data;
            if (message.command === 'updateTools') {
              updateToolsList(message.tools);
            }
          });
        </script>
      </body>
      </html>
    `;
  }
}

// Global providers
let chatProvider: ChatWebviewProvider;
let toolsProvider: ToolsWebviewProvider;

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

  // Create webview providers for the new Intent → Tool → Execution pipeline
  chatProvider = new ChatWebviewProvider(context);
  toolsProvider = new ToolsWebviewProvider(context);

  // Register webview providers (NOT tree data providers!)
  vscode.window.registerWebviewViewProvider('aide.chatView', chatProvider);
  vscode.window.registerWebviewViewProvider('aide.intentView', toolsProvider);

  // Register Intent → Tool → Execution commands
  context.subscriptions.push(
    // Execute intent directly via input box
    vscode.commands.registerCommand('aide.executeIntent', async () => {
      const userInput = await vscode.window.showInputBox({
        prompt: 'What would you like AIDE to do?',
        placeHolder: 'e.g., format my code, fix errors, run tests...'
      });

      if (userInput) {
        await chatProvider.executeDirectIntent(userInput);
      }
    }),

    // Clear chat
    vscode.commands.registerCommand('aide.clearChat', () => {
      chatProvider.clearChat();
      vscode.window.showInformationMessage('🧹 AIDE chat history cleared!');
    }),

    // Refresh tools
    vscode.commands.registerCommand('aide.refreshTools', async () => {
      await toolsProvider.refreshTools();
      vscode.window.showInformationMessage('🔄 AIDE tools refreshed!');
    }),

    // Keep your existing open chat command working
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

  // Auto-refresh tools on startup
  setTimeout(async () => {
    try {
      await toolsProvider.refreshTools();
    } catch (error) {
      console.log('Initial tool refresh failed:', error);
    }
  }, 2000);

  // Enhanced welcome message
  vscode.window
    .showInformationMessage(
      '🎯 AIDE Intent → Tool → Execution pipeline is ready! Click the robot icon to start.',
      'Try Intent Command',
      'Open Sidebar',
      'Refresh Tools'
    )
    .then(selection => {
      switch (selection) {
        case 'Try Intent Command':
          vscode.commands.executeCommand('aide.executeIntent');
          break;
        case 'Open Sidebar':
          vscode.commands.executeCommand('workbench.view.extension.aideChatContainer');
          break;
        case 'Refresh Tools':
          vscode.commands.executeCommand('aide.refreshTools');
          break;
      }
    });

  console.log('✅ AIDE activation complete! Intent → Tool → Execution pipeline online.');
}

export function deactivate() {
  console.log('🔴 AIDE extension deactivated - Intent → Tool → Execution pipeline offline');
}

