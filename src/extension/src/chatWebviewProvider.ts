import * as vscode from 'vscode';

interface ParsedIntent {
    intent: string;
    scope: 'file' | 'workspace' | 'selection';
    auto_fix: boolean;
    tools_needed: string[];
    confidence: number;
    context_hints?: string[];
}

export class ChatWebviewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private chatHistory: Array<{message: string, type: 'user' | 'system' | 'error', timestamp: string}> = [];
    private pipeline: any; // Will receive the IntentPipeline

    constructor(private context: vscode.ExtensionContext, pipeline: any) {
        this.pipeline = pipeline; // ← Use the main pipeline instead of orchestrator
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
        
        try {
            // Use the main pipeline instead of orchestrator - THIS IS THE FIX!
            await this.pipeline.executeIntent(text, (message: string) => {
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

    public postMessage(message: string, type: 'system' | 'error' = 'system') {
        this.addChatMessage(message, type);
    }

    public async executeDirectIntent(text: string): Promise<void> {
        await this.handleUserMessage(text);
    }

    private getWebviewContent(): string {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AIDE Chat</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            margin: 0;
            padding: 10px;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .chat-container {
            flex: 1;
            overflow-y: auto;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 5px;
            margin-bottom: 10px;
            padding: 10px;
            background: var(--vscode-input-background);
        }
        
        .message {
            margin-bottom: 10px;
            padding: 8px;
            border-radius: 5px;
            word-wrap: break-word;
        }
        
        .message.user {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            margin-left: 20px;
        }
        
        .message.system {
            background: var(--vscode-textCodeBlock-background);
            border-left: 3px solid var(--vscode-textLink-foreground);
        }
        
        .message.error {
            background: var(--vscode-inputValidation-errorBackground);
            border-left: 3px solid var(--vscode-inputValidation-errorBorder);
        }
        
        .timestamp {
            font-size: 0.8em;
            opacity: 0.7;
            margin-bottom: 5px;
        }
        
        .input-container {
            display: flex;
            gap: 5px;
        }
        
        #messageInput {
            flex: 1;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            padding: 8px;
            font-family: inherit;
        }
        
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            padding: 8px 12px;
            cursor: pointer;
            font-family: inherit;
        }
        
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        .clear-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
    </style>
</head>
<body>
    <div class="chat-container" id="chatContainer">
        <!-- Messages will be populated here -->
    </div>
    
    <div class="input-container">
        <input type="text" id="messageInput" placeholder="Type your command here..." />
        <button onclick="sendMessage()">Send</button>
        <button class="clear-btn" onclick="clearChat()">Clear</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function sendMessage() {
            const input = document.getElementById('messageInput');
            const text = input.value.trim();
            if (text) {
                vscode.postMessage({
                    command: 'userMessage',
                    text: text
                });
                input.value = '';
            }
        }
        
        function clearChat() {
            vscode.postMessage({
                command: 'clearChat'
            });
        }
        
        document.getElementById('messageInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
        
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'appendMessage':
                    appendMessage(message.message, message.type, message.timestamp);
                    break;
                case 'refreshChat':
                    refreshChat(message.history);
                    break;
            }
        });
        
        function appendMessage(text, type, timestamp) {
            const container = document.getElementById('chatContainer');
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${type}\`;
            
            const timestampDiv = document.createElement('div');
            timestampDiv.className = 'timestamp';
            timestampDiv.textContent = timestamp;
            
            const textDiv = document.createElement('div');
            textDiv.textContent = text;
            
            messageDiv.appendChild(timestampDiv);
            messageDiv.appendChild(textDiv);
            container.appendChild(messageDiv);
            
            container.scrollTop = container.scrollHeight;
        }
        
        function refreshChat(history) {
            const container = document.getElementById('chatContainer');
            container.innerHTML = '';
            
            history.forEach(item => {
                appendMessage(item.message, item.type, item.timestamp);
            });
        }
    </script>
</body>
</html>
        `;
    }
}

