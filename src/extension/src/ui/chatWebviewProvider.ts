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
    private pipeline: any;
    
    // ADVANCED DEDUPLICATION SYSTEM - Prevents triple responses
    private processingMessage = false;
    private messageQueue: string[] = [];
    private lastProcessedMessage = '';
    private lastProcessedTime = 0;
    private messageTracker = new Set<string>();

    constructor(private context: vscode.ExtensionContext, pipeline: any) {
        this.pipeline = pipeline;
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
                    await this.handleUserMessageWithAdvancedDeduplication(message.text);
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
            message: '🎯 AIDE Intent → Tool → Execution Pipeline Ready! Real speech enabled, regex patterns fixed, auto-start backend active!',
            type: 'system',
            timestamp: new Date().toLocaleTimeString()
        });
    }

    // FIXED: Advanced message deduplication system
    private async handleUserMessageWithAdvancedDeduplication(text: string): Promise<void> {
        if (!this._view) return;
        
        const now = Date.now();
        const messageHash = `${text}_${Math.floor(now / 1000)}`; // Hash with second precision
        
        // Prevent duplicate processing within 3 seconds
        if (this.processingMessage) {
            console.log('⚠️ Message already being processed, ignoring duplicate');
            return;
        }
        
        // Check for exact duplicate message within 3 seconds
        if (text === this.lastProcessedMessage && now - this.lastProcessedTime < 3000) {
            console.log('⚠️ Duplicate message detected within 3 seconds, ignoring');
            return;
        }
        
        // Check message tracker for recent duplicates
        if (this.messageTracker.has(messageHash)) {
            console.log('⚠️ Message hash already processed, ignoring');
            return;
        }
        
        // Update tracking
        this.lastProcessedMessage = text;
        this.lastProcessedTime = now;
        this.messageTracker.add(messageHash);
        
        // Clean old message hashes (older than 10 seconds)
        setTimeout(() => {
            this.messageTracker.delete(messageHash);
        }, 10000);
        
        // Add to queue and process
        this.messageQueue.push(text);
        await this.processMessageQueue();
    }

    private async processMessageQueue(): Promise<void> {
        if (this.processingMessage || this.messageQueue.length === 0) {
            return;
        }

        this.processingMessage = true;
        
        try {
            const text = this.messageQueue.shift()!;
            console.log(`🤖 Processing message: "${text}"`);
            
            // Add user message to history
            this.addChatMessage(`👤 ${text}`, 'user');
            this.addChatMessage(`🤔 Analyzing your request...`, 'system');

            if (!this.pipeline) {
                this.addChatMessage(`❌ Pipeline not available. Please restart AIDE.`, 'error');
                return;
            }

            // Track response messages to prevent duplicates within this execution
            const responseTracker = new Set<string>();
            let responseCount = 0;

            // Use the modular pipeline with enhanced callback deduplication
            await this.pipeline.executeIntent(text, (message: string) => {
                // Create message signature for deduplication
                const messageSignature = message.replace(/[🎯✅💬🤖🔧📚🎨⚡\d]/g, '').trim();
                
                // Skip empty or very short messages
                if (messageSignature.length < 3) {
                    return;
                }
                
                // Prevent duplicate responses within this execution
                if (!responseTracker.has(messageSignature) && !this.isDuplicateMessage(message)) {
                    responseTracker.add(messageSignature);
                    responseCount++;
                    
                    // Limit responses to prevent spam (max 5 per execution)
                    if (responseCount <= 5) {
                        this.addChatMessage(message, 'system');
                    } else {
                        console.log(`⚠️ Response limit reached, skipping: "${message.substring(0, 50)}..."`);
                    }
                }
            });

        } catch (error: any) {
            console.error('Chat message processing error:', error);
            this.addChatMessage(`❌ Error: ${error.message || error}`, 'error');
        } finally {
            this.processingMessage = false;
            
            // Process next message in queue if any (with delay to prevent overwhelm)
            if (this.messageQueue.length > 0) {
                setTimeout(() => this.processMessageQueue(), 500);
            }
        }
    }

    private isDuplicateMessage(message: string): boolean {
        // Check if this exact message was added in the last 5 seconds
        const now = new Date().getTime();
        const recentMessages = this.chatHistory.filter(entry => {
            const entryTime = new Date(entry.timestamp).getTime();
            return now - entryTime < 5000; // 5 second window
        });
        
        // Compare cleaned message content (removing emojis and timestamps)
        const cleanMessage = message.replace(/[🎯✅💬🤖🔧📚🎨⚡\d]/g, '').trim();
        
        return recentMessages.some(entry => {
            const cleanEntry = entry.message.replace(/[🎯✅💬🤖🔧📚🎨⚡\d]/g, '').trim();
            return cleanEntry === cleanMessage;
        });
    }

    private addChatMessage(text: string, type: 'user' | 'system' | 'error') {
        const timestamp = new Date().toLocaleTimeString();
        
        // Additional duplicate check with enhanced logic
        if (this.isDuplicateMessage(text)) {
            console.log(`⚠️ Skipping duplicate message: "${text.substring(0, 50)}..."`);
            return;
        }
        
        this.chatHistory.push({
            message: text,
            type,
            timestamp
        });

        // Limit chat history to prevent memory issues
        if (this.chatHistory.length > 100) {
            this.chatHistory = this.chatHistory.slice(-80); // Keep last 80 messages
        }

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
        this.messageQueue = [];
        this.processingMessage = false;
        this.lastProcessedMessage = '';
        this.lastProcessedTime = 0;
        this.messageTracker.clear();
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
        await this.handleUserMessageWithAdvancedDeduplication(text);
    }

    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AIDE Chat</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            margin: 0;
            padding: 10px;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .status-indicator {
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
            padding: 4px 8px;
            background-color: var(--vscode-badge-background);
            border-radius: 3px;
            text-align: center;
        }
        
        #chat-container {
            flex: 1;
            overflow-y: auto;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 10px;
            margin-bottom: 10px;
            background-color: var(--vscode-panel-background);
        }
        
        .message {
            margin-bottom: 10px;
            padding: 8px;
            border-radius: 4px;
            word-wrap: break-word;
            line-height: 1.4;
            animation: fadeIn 0.3s ease-in;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .user-message {
            background-color: var(--vscode-inputValidation-infoBorder);
            border-left: 4px solid var(--vscode-inputValidation-infoBackground);
        }
        
        .system-message {
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
        }
        
        .error-message {
            background-color: var(--vscode-inputValidation-errorBorder);
            border-left: 4px solid var(--vscode-inputValidation-errorBackground);
        }
        
        .timestamp {
            font-size: 0.8em;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
        }
        
        #input-container {
            display: flex;
            gap: 8px;
        }
        
        #message-input {
            flex: 1;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 8px;
            font-family: var(--vscode-font-family);
        }
        
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            padding: 8px 12px;
            cursor: pointer;
            font-family: var(--vscode-font-family);
            transition: background-color 0.2s;
        }
        
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .processing-indicator {
            color: var(--vscode-progressBar-background);
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="status-indicator">✅ Enhanced AIDE - Fixed Regex | Real Speech | Auto Backend | Advanced Deduplication Active</div>
    <div id="chat-container"></div>
    <div id="input-container">
        <input type="text" id="message-input" placeholder="Type your message to AIDE... (try 'how are you' - now works!)" />
        <button id="send-button">Send</button>
        <button id="clear-button">Clear</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const chatContainer = document.getElementById('chat-container');
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('send-button');
        const clearButton = document.getElementById('clear-button');

        let isProcessing = false;
        let lastSentMessage = '';
        let lastSentTime = 0;
        const sentMessageTracker = new Set();

        function sendMessage() {
            const message = messageInput.value.trim();
            const now = Date.now();
            const messageHash = message + '_' + Math.floor(now / 1000);
            
            // Advanced client-side deduplication
            if (message && !isProcessing && 
                !(message === lastSentMessage && now - lastSentTime < 3000) &&
                !sentMessageTracker.has(messageHash)) {
                
                isProcessing = true;
                sendButton.disabled = true;
                sendButton.textContent = 'Processing...';
                
                lastSentMessage = message;
                lastSentTime = now;
                sentMessageTracker.add(messageHash);
                
                // Clean old message hashes
                setTimeout(() => sentMessageTracker.delete(messageHash), 10000);
                
                vscode.postMessage({
                    command: 'userMessage',
                    text: message
                });
                
                messageInput.value = '';
                
                // Re-enable after delay
                setTimeout(() => {
                    isProcessing = false;
                    sendButton.disabled = false;
                    sendButton.textContent = 'Send';
                }, 2000);
            }
        }

        function clearChat() {
            sentMessageTracker.clear();
            vscode.postMessage({
                command: 'clearChat'
            });
        }

        function appendMessage(message, type, timestamp) {
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${type}-message\`;
            
            const timestampDiv = document.createElement('div');
            timestampDiv.className = 'timestamp';
            timestampDiv.textContent = timestamp;
            
            const contentDiv = document.createElement('div');
            contentDiv.innerHTML = message.replace(/\\n/g, '<br>');
            
            messageDiv.appendChild(timestampDiv);
            messageDiv.appendChild(contentDiv);
            chatContainer.appendChild(messageDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        function refreshChat(history) {
            chatContainer.innerHTML = '';
            history.forEach(entry => {
                appendMessage(entry.message, entry.type, entry.timestamp);
            });
        }

        // Event listeners
        sendButton.addEventListener('click', sendMessage);
        clearButton.addEventListener('click', clearChat);
        
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !isProcessing) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Handle messages from extension
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
        
        // Focus input on load
        messageInput.focus();
    </script>
</body>
</html>`;
    }
}
