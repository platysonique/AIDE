import * as vscode from 'vscode';
import { Orchestrator } from './orchestrator';

interface ParsedIntent {
  intent: string;
  scope: 'file' | 'workspace' | 'selection';
  auto_fix: boolean;
  tools_needed: string[];
  confidence: number;
  context_hints?: string[];
}

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

export class ChatWebviewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private chatHistory: Array<{message: string, type: 'user' | 'system' | 'error', timestamp: string}> = [];
  private orchestrator: Orchestrator;

  constructor(private context: vscode.ExtensionContext) {
    this.orchestrator = new Orchestrator();
    this.addWelcomeMessage();
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ): void {
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

    // Refresh the chat history when view becomes visible
    this.refreshChat();
  }

  private addWelcomeMessage() {
    this.chatHistory.push({
      message: '🎯 AIDE Intent → Tool → Execution Pipeline Ready!\nType your command below to get started...',
      type: 'system',
      timestamp: new Date().toLocaleTimeString()
    });
  }

  private async handleUserMessage(text: string): Promise<void> {
    if (!this._view) return;

    // Add user message to history
    this.addChatMessage(`👤 ${text}`, 'user');

    // Build intent request
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
      // Show thinking message
      this.addChatMessage('🤔 Interpreting intent...', 'system');

      const response = await fetch('http://localhost:8000/api/v1/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const intent = await response.json() as ParsedIntent;

      this.addChatMessage(
        `🎯 Intent: ${intent.intent} | Confidence: ${(intent.confidence * 100).toFixed(0)}% | Tools: ${intent.tools_needed.join(', ')}`,
        'system'
      );

      // Execute via orchestrator with progress updates
      const normalizedIntent = {
      ...intent,
      context_hints: intent.context_hints || []
    };
    await this.orchestrator.executePlan(normalizedIntent, (message) => {
        this.addChatMessage(message, 'system');
      });

    } catch (error: any) {
      this.addChatMessage(`❌ Error: ${error.message || error}`, 'error');
    }
  }

  private addChatMessage(text: string, type: 'user' | 'system' | 'error') {
    const timestamp = new Date().toLocaleTimeString();
    this.chatHistory.push({
      message: text,
      type,
      timestamp
    });

    // Send message to webview if it's active
    if (this._view?.webview) {
      this._view.webview.postMessage({
        command: 'appendMessage',
        message: text,
        type,
        timestamp
      });
    }
  }

  public clearChat() {
    this.chatHistory = [];
    this.addWelcomeMessage();
    this.refreshChat();
  }

  private refreshChat() {
    if (!this._view) return;

    this._view.webview.postMessage({
      command: 'refreshChat',
      history: this.chatHistory
    });
  }

  // Public method to post messages from other parts of the extension
  public postMessage(message: string, type: 'system' | 'error' = 'system') {
    this.addChatMessage(message, type);
  }

  // Method to execute direct intent (for command palette)
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
          .user-message {
            color: var(--vscode-terminal-ansiBlue);
          }
          .system-message {
            color: var(--vscode-terminal-ansiGreen);
          }
          .error-message {
            color: var(--vscode-terminal-ansiRed);
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
                messageDiv.className = 'message ' + message.type + '-message';
                messageDiv.textContent = message.timestamp + ' - ' + message.message;
                chatContainer.appendChild(messageDiv);
                chatContainer.scrollTop = chatContainer.scrollHeight;
                break;
              case 'refreshChat':
                chatContainer.innerHTML = '';
                message.history.forEach(msg => {
                  const messageDiv = document.createElement('div');
                  messageDiv.className = 'message ' + msg.type + '-message';
                  messageDiv.textContent = msg.timestamp + ' - ' + msg.message;
                  chatContainer.appendChild(messageDiv);
                });
                chatContainer.scrollTop = chatContainer.scrollHeight;
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

