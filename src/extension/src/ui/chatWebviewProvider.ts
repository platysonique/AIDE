import * as vscode from 'vscode';

interface ParsedIntent {
    intent: string;
    scope: 'file' | 'workspace' | 'selection';
    auto_fix: boolean;
    tools_needed: string[];
    confidence: number;
    context_hints?: string[];
}

// NEW: Add interface definitions for API responses
interface ModelListResponse {
    models: string[];
    current: string | null;
    total_available?: number;
}

interface ModelSwitchResponse {
    status: string;
    active?: string;
    message?: string;
    error?: string;
}

interface IngestResponse {
    status: string;
    message: string;
}

// NEW: Chat response interface
interface ChatResponse {
    response: string;
    model_used?: string;
    actions?: any[];
    tools_invoked?: string[];
    detected_intents?: string[];
    conversation_type?: string;
    fallback_reason?: string;
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
    private messageTracker = new Set();
    
    // NEW: Model management state
    private availableModels: string[] = [];
    private currentModel: string | null = null;

    constructor(private context: vscode.ExtensionContext, pipeline: any) {
        this.pipeline = pipeline;
        this.loadChatHistory(); // Load persisted chat history
        this.addWelcomeMessage();
        this.loadAvailableModels(); // Load model list on startup
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
                case 'switchModel':
                    await this.switchModel(message.model);
                    break;
                case 'refreshModels':
                    await this.loadAvailableModels();
                    break;
                case 'ingestDocument':
                    await this.ingestDocument();
                    break;
            }
        });

        this.refreshChat();
    }

    // FIXED: Load available models from backend with proper typing
    private async loadAvailableModels() {
        try {
            const response = await fetch('http://127.0.0.1:8000/models');
            if (response.ok) {
                const data = await response.json() as ModelListResponse; // ← TYPE ASSERTION ADDED
                this.availableModels = data.models || [];
                this.currentModel = data.current || null;
                
                // Update UI with model list
                if (this._view?.webview) {
                    this._view.webview.postMessage({
                        command: 'updateModels',
                        models: this.availableModels,
                        current: this.currentModel
                    });
                }
                
                console.log(`🤖 Loaded ${this.availableModels.length} models, current: ${this.currentModel}`);
            }
        } catch (error) {
            console.error('Failed to load models:', error);
            this.addChatMessage('⚠️ Could not load available models. Backend may not be running.', 'error');
        }
    }

    // FIXED: Switch to a different model with proper typing
    private async switchModel(modelName: string) {
        try {
            this.addChatMessage(`🔄 Switching to model: ${modelName}...`, 'system');
            
            const response = await fetch('http://127.0.0.1:8000/models/use', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: modelName })
            });

            const result = await response.json() as ModelSwitchResponse; // ← TYPE ASSERTION ADDED
            
            if (result.status === 'success') {
                this.currentModel = modelName;
                this.addChatMessage(`✅ Successfully switched to ${modelName}! Your beast hardware is now running this model.`, 'system');
                
                // Update UI
                if (this._view?.webview) {
                    this._view.webview.postMessage({
                        command: 'modelSwitched',
                        model: modelName
                    });
                }
            } else {
                this.addChatMessage(`❌ Failed to switch model: ${result.error || 'Unknown error'}`, 'error'); // ← SAFE ACCESS
            }
        } catch (error) {
            this.addChatMessage(`❌ Model switch error: ${error}`, 'error');
        }
    }

    // FIXED: Document ingestion with proper typing
    private async ingestDocument() {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: 'Ingest Document',
            filters: {
                'Text files': ['txt', 'md', 'py', 'js', 'ts', 'json', 'yaml', 'yml'],
                'All files': ['*']
            }
        };

        const fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri && fileUri[0]) {
            try {
                this.addChatMessage(`📄 Ingesting document: ${fileUri[0].fsPath}...`, 'system');
                
                const response = await fetch('http://127.0.0.1:8000/ingest', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        file_path: fileUri[0].fsPath,
                        file_name: fileUri[0].fsPath.split('/').pop()
                    })
                });

                const result = await response.json() as IngestResponse; // ← TYPE ASSERTION ADDED
                
                if (result.status === 'success') {
                    this.addChatMessage(`✅ Document ingested successfully!`, 'system');
                } else {
                    this.addChatMessage(`❌ Ingestion failed: ${result.message || 'Unknown error'}`, 'error'); // ← SAFE ACCESS
                }
            } catch (error) {
                this.addChatMessage(`❌ Ingestion error: ${error}`, 'error');
            }
        }
    }

    // NEW: Load chat history from workspace state
    private loadChatHistory() {
        const savedHistory = this.context.workspaceState.get<Array<{message: string, type: 'user' | 'system' | 'error', timestamp: string}>>('chatHistory', []);
        this.chatHistory = savedHistory;
    }

    // NEW: Save chat history to workspace state
    private saveChatHistory() {
        this.context.workspaceState.update('chatHistory', this.chatHistory);
    }

    private addWelcomeMessage() {
        // Only add welcome message if chat history is empty
        if (this.chatHistory.length === 0) {
            this.chatHistory.push({
                message: '🎯 AIDE LLM-First Conversation Ready! Your Intel Arc A770 + 94GB RAM is ready to crush AI inference. Load a model and let\'s code!',
                type: 'system',
                timestamp: new Date().toLocaleTimeString()
            });
        }
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

    // 🚀 THE BREAKTHROUGH: Direct Backend API Integration
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
            this.addChatMessage(`🤔 Analyzing with AI model...`, 'system');

            // 🔥 BYPASS PIPELINE - Call backend API directly!
            try {
                const response = await fetch('http://127.0.0.1:8000/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: text,
                        context: {
                            currentFile: vscode.window.activeTextEditor?.document ? {
                                filename: vscode.window.activeTextEditor.document.fileName,
                                language: vscode.window.activeTextEditor.document.languageId,
                                selection: vscode.window.activeTextEditor.selection ? 
                                    vscode.window.activeTextEditor.document.getText(vscode.window.activeTextEditor.selection) : null
                            } : null,
                            workspace: {
                                name: vscode.workspace.name || 'No workspace',
                                rootPath: vscode.workspace.rootPath
                            }
                        }
                    })
                });

                if (response.ok) {
                    const result = await response.json() as ChatResponse;
                    
                    // Display AI response
                    this.addChatMessage(result.response, 'system');
                    
                    // Show model used if available
                    if (result.model_used) {
                        this.addChatMessage(`🤖 Powered by: ${result.model_used}`, 'system');
                    }
                    
                    // Show conversation type for debugging
                    if (result.conversation_type) {
                        console.log(`💡 Conversation type: ${result.conversation_type}`);
                        if (result.conversation_type === 'regex_fallback' && result.fallback_reason) {
                            this.addChatMessage(`⚠️ Note: Using fallback mode - ${result.fallback_reason}`, 'system');
                        }
                    }
                    
                    // Show tools invoked if any
                    if (result.tools_invoked && result.tools_invoked.length > 0) {
                        this.addChatMessage(`🔧 Tools used: ${result.tools_invoked.join(', ')}`, 'system');
                    }
                    
                } else {
                    throw new Error(`Backend API returned ${response.status}: ${response.statusText}`);
                }
                
            } catch (apiError) {
                console.error('Backend API error:', apiError);
                this.addChatMessage(`❌ AI Backend Error: ${apiError}`, 'error');
                this.addChatMessage('💭 Tip: Make sure your Python backend is running on port 8000', 'system');
                
                // Optional: Fallback to pipeline only if backend is completely unavailable
                if (this.pipeline) {
                    this.addChatMessage('🔄 Attempting fallback to local pipeline...', 'system');
                    try {
                        const responseTracker = new Set();
                        let responseCount = 0;

                        await this.pipeline.executeIntent(text, (message: string) => {
                            const messageSignature = message.replace(/[🎯✅💬🤖🔧📚🎨⚡\d]/g, '').trim();
                            if (messageSignature.length >= 3 && !responseTracker.has(messageSignature) && !this.isDuplicateMessage(message)) {
                                responseTracker.add(messageSignature);
                                responseCount++;
                                if (responseCount <= 3) {
                                    this.addChatMessage(message, 'system');
                                }
                            }
                        });
                    } catch (pipelineError) {
                        this.addChatMessage(`❌ Pipeline fallback also failed: ${pipelineError}`, 'error');
                    }
                }
            }

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

        // Save to workspace state for persistence
        this.saveChatHistory();

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
        
        // Clear from workspace state
        this.context.workspaceState.update('chatHistory', []);
        
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
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>AIDE Chat</title>
                <style>
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        margin: 0;
                        padding: 0;
                        background-color: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                        height: 100vh;
                        display: flex;
                        flex-direction: column;
                    }
                    
                    .header {
                        background-color: var(--vscode-panel-background);
                        border-bottom: 1px solid var(--vscode-panel-border);
                        padding: 12px;
                        flex-shrink: 0;
                    }
                    
                    .header h3 {
                        margin: 0;
                        font-size: 14px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    
                    .model-controls {
                        margin-top: 8px;
                        display: flex;
                        gap: 8px;
                        align-items: center;
                        flex-wrap: wrap;
                    }
                    
                    .model-select {
                        background-color: var(--vscode-dropdown-background);
                        border: 1px solid var(--vscode-dropdown-border);
                        color: var(--vscode-dropdown-foreground);
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 12px;
                        min-width: 120px;
                    }
                    
                    .btn {
                        background-color: var(--vscode-button-background);
                        border: none;
                        color: var(--vscode-button-foreground);
                        padding: 4px 12px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 12px;
                        display: flex;
                        align-items: center;
                        gap: 4px;
                    }
                    
                    .btn:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                    
                    .btn-secondary {
                        background-color: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                    }
                    
                    .btn-secondary:hover {
                        background-color: var(--vscode-button-secondaryHoverBackground);
                    }
                    
                    .chat-container {
                        flex: 1;
                        overflow-y: auto;
                        padding: 12px;
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                    }
                    
                    .message {
                        max-width: 100%;
                        word-wrap: break-word;
                        padding: 8px 12px;
                        border-radius: 8px;
                        line-height: 1.4;
                        font-size: 13px;
                    }
                    
                    .message.user {
                        background-color: var(--vscode-inputValidation-infoBorder);
                        color: var(--vscode-inputValidation-infoForeground);
                        margin-left: 20%;
                    }
                    
                    .message.system {
                        background-color: var(--vscode-textBlockQuote-background);
                        border-left: 3px solid var(--vscode-textBlockQuote-border);
                    }
                    
                    .message.error {
                        background-color: var(--vscode-inputValidation-errorBackground);
                        color: var(--vscode-inputValidation-errorForeground);
                        border-left: 3px solid var(--vscode-inputValidation-errorBorder);
                    }
                    
                    .timestamp {
                        font-size: 10px;
                        opacity: 0.7;
                        margin-top: 4px;
                    }
                    
                    .input-section {
                        flex-shrink: 0;
                        background-color: var(--vscode-panel-background);
                        border-top: 1px solid var(--vscode-panel-border);
                        padding: 12px;
                    }
                    
                    .input-container {
                        display: flex;
                        gap: 8px;
                        align-items: flex-end;
                    }
                    
                    .input-field {
                        flex: 1;
                        background-color: var(--vscode-input-background);
                        border: 1px solid var(--vscode-input-border);
                        color: var(--vscode-input-foreground);
                        padding: 8px 12px;
                        border-radius: 4px;
                        font-size: 13px;
                        resize: vertical;
                        min-height: 20px;
                        max-height: 100px;
                        font-family: inherit;
                    }
                    
                    .input-field:focus {
                        outline: none;
                        border-color: var(--vscode-focusBorder);
                    }
                    
                    .current-model {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                        font-weight: normal;
                    }
                    
                    .status-indicator {
                        display: inline-block;
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                        margin-right: 6px;
                    }
                    
                    .status-ready { background-color: #4CAF50; }
                    .status-loading { background-color: #FF9800; }
                    .status-error { background-color: #F44336; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h3>
                        <span class="status-indicator status-ready"></span>
                        AIDE LLM-First Chat
                        <span class="current-model" id="currentModelDisplay">Loading models...</span>
                    </h3>
                    <div class="model-controls">
                        <select class="model-select" id="modelSelect">
                            <option value="">Loading models...</option>
                        </select>
                        <button class="btn btn-secondary" onclick="refreshModels()">🔄 Refresh</button>
                        <button class="btn btn-secondary" onclick="ingestDocument()">📄 Ingest</button>
                        <button class="btn btn-secondary" onclick="clearChat()">🗑️ Clear</button>
                    </div>
                </div>
                
                <div class="chat-container" id="chatContainer">
                    <!-- Chat messages will be inserted here -->
                </div>
                
                <div class="input-section">
                    <div class="input-container">
                        <textarea 
                            class="input-field" 
                            id="messageInput" 
                            placeholder="Ask AIDE anything... (Shift+Enter for new line)"
                            rows="1"
                        ></textarea>
                        <button class="btn" onclick="sendMessage()">Send</button>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    let chatHistory = [];
                    let availableModels = [];
                    let currentModel = null;

                    // Handle messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'appendMessage':
                                appendMessage(message.message, message.type, message.timestamp);
                                break;
                            case 'refreshChat':
                                chatHistory = message.history || [];
                                refreshChatDisplay();
                                break;
                            case 'updateModels':
                                updateModelList(message.models, message.current);
                                break;
                            case 'modelSwitched':
                                currentModel = message.model;
                                updateCurrentModelDisplay();
                                break;
                        }
                    });

                    function updateModelList(models, current) {
                        availableModels = models || [];
                        currentModel = current;
                        
                        const select = document.getElementById('modelSelect');
                        select.innerHTML = '';
                        
                        if (availableModels.length === 0) {
                            select.innerHTML = '<option value="">No models found</option>';
                        } else {
                            availableModels.forEach(model => {
                                const option = document.createElement('option');
                                option.value = model;
                                option.textContent = model;
                                option.selected = model === currentModel;
                                select.appendChild(option);
                            });
                        }
                        
                        updateCurrentModelDisplay();
                        
                        // Add change event listener
                        select.onchange = function() {
                            if (this.value && this.value !== currentModel) {
                                vscode.postMessage({
                                    command: 'switchModel',
                                    model: this.value
                                });
                            }
                        };
                    }

                    function updateCurrentModelDisplay() {
                        const display = document.getElementById('currentModelDisplay');
                        if (currentModel) {
                            display.textContent = \`Model: \${currentModel}\`;
                            display.style.color = 'var(--vscode-charts-green)';
                        } else {
                            display.textContent = 'No model loaded';
                            display.style.color = 'var(--vscode-charts-orange)';
                        }
                    }

                    function refreshModels() {
                        vscode.postMessage({ command: 'refreshModels' });
                    }

                    function ingestDocument() {
                        vscode.postMessage({ command: 'ingestDocument' });
                    }

                    function sendMessage() {
                        const input = document.getElementById('messageInput');
                        const message = input.value.trim();
                        if (message) {
                            vscode.postMessage({
                                command: 'userMessage',
                                text: message
                            });
                            input.value = '';
                            input.style.height = 'auto';
                        }
                    }

                    function clearChat() {
                        vscode.postMessage({ command: 'clearChat' });
                    }

                    function appendMessage(text, type, timestamp) {
                        chatHistory.push({ message: text, type, timestamp });
                        addMessageToDOM(text, type, timestamp);
                        scrollToBottom();
                    }

                    function addMessageToDOM(text, type, timestamp) {
                        const container = document.getElementById('chatContainer');
                        const messageDiv = document.createElement('div');
                        messageDiv.className = \`message \${type}\`;
                        
                        const messageText = document.createElement('div');
                        messageText.textContent = text;
                        
                        const timestampDiv = document.createElement('div');
                        timestampDiv.className = 'timestamp';
                        timestampDiv.textContent = timestamp;
                        
                        messageDiv.appendChild(messageText);
                        messageDiv.appendChild(timestampDiv);
                        container.appendChild(messageDiv);
                    }

                    function refreshChatDisplay() {
                        const container = document.getElementById('chatContainer');
                        container.innerHTML = '';
                        chatHistory.forEach(msg => {
                            addMessageToDOM(msg.message, msg.type, msg.timestamp);
                        });
                        scrollToBottom();
                    }

                    function scrollToBottom() {
                        const container = document.getElementById('chatContainer');
                        container.scrollTop = container.scrollHeight;
                    }

                    // Handle Enter key
                    document.getElementById('messageInput').addEventListener('keydown', function(e) {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                        }
                    });

                    // Auto-resize textarea
                    document.getElementById('messageInput').addEventListener('input', function() {
                        this.style.height = 'auto';
                        this.style.height = this.scrollHeight + 'px';
                    });
                </script>
            </body>
            </html>
        `;
    }
}
