import * as vscode from 'vscode';
import { Orchestrator } from './orchestrator';

export class ChatViewProvider implements vscode.TreeDataProvider<ChatItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ChatItem | undefined | null | void> = new vscode.EventEmitter<ChatItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ChatItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private chatHistory: ChatItem[] = [];
    private chatPanel: vscode.WebviewPanel | undefined;
    private orchestrator: Orchestrator;

    constructor(private context: vscode.ExtensionContext) {
        this.orchestrator = new Orchestrator();
        this.addWelcomeMessage();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ChatItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ChatItem): Thenable<ChatItem[]> {
        if (!element) {
            return Promise.resolve(this.chatHistory);
        }
        return Promise.resolve([]);
    }

    private addWelcomeMessage() {
        this.chatHistory.push(new ChatItem(
            '🎯 AIDE Intent → Tool → Execution Ready!',
            'Click to open chat window',
            vscode.TreeItemCollapsibleState.None,
            'welcome'
        ));
        this.refresh();
    }

    openChatPanel() {
        if (this.chatPanel) {
            this.chatPanel.reveal();
            return;
        }

        this.chatPanel = vscode.window.createWebviewPanel(
            'aideChat',
            'AIDE Chat',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.chatPanel.webview.html = this.getWebviewContent();

        this.chatPanel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'userMessage':
                        await this.handleUserMessage(message.text);
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        this.chatPanel.onDidDispose(() => {
            this.chatPanel = undefined;
        }, null, this.context.subscriptions);
    }

    private async handleUserMessage(text: string) {
        if (!this.chatPanel) return;

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

        const payload = {
            user_text: text,
            diagnostics,
            selection: activeEditor ? activeEditor.document.getText(activeEditor.selection) : '',
            fileName: activeEditor ? activeEditor.document.fileName : ''
        };

        try {
            // Call your enhanced intent interpreter
            this.addChatMessage('🤔 Interpreting intent...', 'system');
            
            const response = await fetch('http://localhost:8000/api/v1/intent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const intent = await response.json();
            
            this.addChatMessage(
                `🎯 Intent: ${intent.intent} | Confidence: ${(intent.confidence * 100).toFixed(0)}% | Tools: ${intent.tools_needed.join(', ')}`, 
                'system'
            );

            // Execute via orchestrator
            await this.orchestrator.executePlan(intent, (message) => {
                this.addChatMessage(message, 'system');
            });

        } catch (error) {
            this.addChatMessage(`❌ Error: ${error}`, 'error');
        }
    }

    private addChatMessage(text: string, type: 'user' | 'system' | 'error') {
        const timestamp = new Date().toLocaleTimeString();
        const message = `${timestamp} - ${text}`;
        
        this.chatHistory.push(new ChatItem(
            message,
            type,
            vscode.TreeItemCollapsibleState.None,
            type
        ));
        
        this.refresh();

        // Also send to webview if open
        if (this.chatPanel?.webview) {
            this.chatPanel.webview.postMessage({
                command: 'append',
                text: message
            });
        }
    }

    clearChat() {
        this.chatHistory = [];
        this.addWelcomeMessage();
        
        if (this.chatPanel?.webview) {
            this.chatPanel.webview.postMessage({
                command: 'clear'
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
                <title>AIDE Chat</title>
                <style>
                    body {
                        font-family: 'Segoe UI', sans-serif;
                        margin: 0;
                        padding: 20px;
                        background-color: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                        height: 100vh;
                        display: flex;
                        flex-direction: column;
                    }
                    #chat {
                        flex: 1;
                        overflow-y: auto;
                        border: 1px solid var(--vscode-panel-border);
                        padding: 15px;
                        margin-bottom: 15px;
                        border-radius: 5px;
                        background-color: var(--vscode-panel-background);
                        font-family: 'Consolas', monospace;
                        font-size: 14px;
                        line-height: 1.5;
                        white-space: pre-wrap;
                    }
                    #inputContainer {
                        display: flex;
                        gap: 10px;
                    }
                    #input {
                        flex: 1;
                        padding: 10px;
                        border: 1px solid var(--vscode-input-border);
                        background-color: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border-radius: 3px;
                        font-size: 14px;
                    }
                    #sendBtn {
                        padding: 10px 20px;
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        border-radius: 3px;
                        cursor: pointer;
                    }
                    #sendBtn:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                </style>
            </head>
            <body>
                <div id="chat">🎯 AIDE Intent → Tool → Execution Pipeline Ready!\nType your command below...</div>
                <div id="inputContainer">
                    <input type="text" id="input" placeholder="Ask AIDE to help with your code..." />
                    <button id="sendBtn">Send</button>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    const chatDiv = document.getElementById('chat');
                    const input = document.getElementById('input');
                    const sendBtn = document.getElementById('sendBtn');

                    function sendMessage() {
                        const text = input.value.trim();
                        if (text) {
                            vscode.postMessage({ command: 'userMessage', text });
                            input.value = '';
                        }
                    }

                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') sendMessage();
                    });

                    sendBtn.addEventListener('click', sendMessage);

                    window.addEventListener('message', (event) => {
                        const message = event.data;
                        if (message.command === 'append') {
                            chatDiv.textContent += '\\n' + message.text;
                            chatDiv.scrollTop = chatDiv.scrollHeight;
                        } else if (message.command === 'clear') {
                            chatDiv.textContent = '🎯 AIDE Ready! Type your command...';
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }
}

class ChatItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly tooltip: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string
    ) {
        super(label, collapsibleState);
        this.tooltip = tooltip;
        this.contextValue = contextValue;
    }
}

