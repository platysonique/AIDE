import * as vscode from 'vscode';

export class AIDEChatPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = 'aide.chatView';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'sendMessage':
                        this._handleChatMessage(message.text);
                        return;
                    case 'clearChat':
                        this._clearChat();
                        return;
                    case 'startSpeech':
                        this._startSpeechInput();
                        return;
                    case 'uploadDocument':
                        this._uploadDocument();
                        return;
                    case 'executeAction':
                        this._executeAction(message.action);
                        return;
                }
            },
            undefined,
        );
    }

    private async _handleChatMessage(message: string) {
        if (!this._view) {
            return;
        }

        // Show user message in chat
        this._view.webview.postMessage({
            command: 'addMessage',
            sender: 'user',
            text: message
        });

        // Show loading indicator
        this._view.webview.postMessage({
            command: 'setLoading',
            loading: true
        });

        try {
            // Send to backend for agentic processing
            const response = await fetch('http://127.0.0.1:8000/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: message,
                    context: await this._getWorkspaceContext()
                })
            });

            const data = await response.json();
            
            // Show AI response
            this._view.webview.postMessage({
                command: 'addMessage',
                sender: 'aide',
                text: data.response || 'I apologize, but I encountered an error processing your request.',
                actions: data.actions || []
            });

        } catch (error) {
            console.error('Error sending message to backend:', error);
            this._view.webview.postMessage({
                command: 'addMessage',
                sender: 'aide',
                text: 'Sorry, I am unable to connect to the AIDE backend. Please ensure the backend is running.'
            });
        } finally {
            // Hide loading indicator
            this._view.webview.postMessage({
                command: 'setLoading',
                loading: false
            });
        }
    }

    private async _startSpeechInput() {
        try {
            // Call the existing speech UI command
            await vscode.commands.executeCommand('aide.speechUI');
            
            // Show feedback in chat
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'addMessage',
                    sender: 'aide',
                    text: '🎤 Speech input activated. Speak your request and I\'ll process it when you\'re done.'
                });
            }
        } catch (error) {
            console.error('Error starting speech input:', error);
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'addMessage',
                    sender: 'aide',
                    text: 'Sorry, there was an error activating speech input. Please ensure your microphone is available.'
                });
            }
        }
    }

    private async _uploadDocument() {
        try {
            // Use VSCode's file picker for document selection
            const uris = await vscode.window.showOpenDialog({
                filters: { 
                    'Documents': ['pdf', 'epub', 'txt', 'md', 'docx', 'doc'],
                    'Images': ['jpg', 'jpeg', 'png', 'gif', 'bmp'],
                    'All Files': ['*']
                },
                canSelectMany: true,
                openLabel: 'Select Documents to Ingest'
            });

            if (uris && uris.length > 0) {
                // Show processing message in chat
                if (this._view) {
                    this._view.webview.postMessage({
                        command: 'addMessage',
                        sender: 'aide',
                        text: `📚 Processing ${uris.length} document(s) for ingestion...`
                    });
                    
                    this._view.webview.postMessage({
                        command: 'setLoading',
                        loading: true
                    });
                }

                // Process each file
                for (const uri of uris) {
                    try {
                        // Send to backend for ingestion
                        const response = await fetch('http://127.0.0.1:8000/ingest', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                file_path: uri.fsPath,
                                file_name: uri.path.split('/').pop()
                            })
                        });

                        const result = await response.json();
                        
                        if (this._view) {
                            this._view.webview.postMessage({
                                command: 'addMessage',
                                sender: 'aide',
                                text: `✅ Successfully ingested: ${uri.path.split('/').pop()}`
                            });
                        }
                    } catch (fileError) {
                        console.error(`Error processing file ${uri.fsPath}:`, fileError);
                        if (this._view) {
                            this._view.webview.postMessage({
                                command: 'addMessage',
                                sender: 'aide',
                                text: `❌ Error processing: ${uri.path.split('/').pop()}`
                            });
                        }
                    }
                }

                if (this._view) {
                    this._view.webview.postMessage({
                        command: 'setLoading',
                        loading: false
                    });
                    
                    this._view.webview.postMessage({
                        command: 'addMessage',
                        sender: 'aide',
                        text: '🎉 Document ingestion complete! I can now answer questions about the content you\'ve uploaded.'
                    });
                }
            }
        } catch (error) {
            console.error('Error uploading document:', error);
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'setLoading',
                    loading: false
                });
                this._view.webview.postMessage({
                    command: 'addMessage',
                    sender: 'aide',
                    text: 'Sorry, there was an error uploading the document. Please try again.'
                });
            }
        }
    }

    private async _executeAction(action: any) {
        // Handle action buttons that appear with AI responses
        try {
            switch (action.type) {
                case 'code_review':
                    await vscode.commands.executeCommand('aide.codeReview');
                    break;
                case 'batch_fix':
                    await vscode.commands.executeCommand('aide.batchFix');
                    break;
                case 'debug_guide':
                    await vscode.commands.executeCommand('aide.debugGuide');
                    break;
                case 'open_file':
                    if (action.path) {
                        const uri = vscode.Uri.file(action.path);
                        await vscode.window.showTextDocument(uri);
                    }
                    break;
                default:
                    vscode.window.showInformationMessage(`Executing: ${action.label}`);
            }
        } catch (error) {
            console.error('Error executing action:', error);
            vscode.window.showErrorMessage(`Error executing action: ${action.label}`);
        }
    }

    private async _getWorkspaceContext() {
        const context: any = {};
        
        // Get current file context
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            context.currentFile = {
                filename: activeEditor.document.fileName,
                language: activeEditor.document.languageId,
                content: activeEditor.document.getText(),
                selection: activeEditor.selection.isEmpty ? null : activeEditor.document.getText(activeEditor.selection)
            };
        }

        // Get workspace info
        if (vscode.workspace.workspaceFolders) {
            context.workspace = {
                name: vscode.workspace.name,
                folders: vscode.workspace.workspaceFolders.map(folder => folder.uri.fsPath)
            };
        }

        return context;
    }

    private _clearChat() {
        if (this._view) {
            this._view.webview.postMessage({ command: 'clearMessages' });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AIDE Chat</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 10px;
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        
        #toolbar {
            display: flex;
            gap: 5px;
            margin-bottom: 10px;
            padding: 5px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .toolbar-button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            padding: 6px 10px;
            cursor: pointer;
            font-size: 0.85em;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .toolbar-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .toolbar-button.speech {
            background-color: var(--vscode-button-secondaryBackground);
        }
        
        .toolbar-button.upload {
            background-color: var(--vscode-inputValidation-infoBackground);
        }
        
        #chatContainer {
            flex: 1;
            overflow-y: auto;
            margin-bottom: 10px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 10px;
        }
        
        .message {
            margin-bottom: 10px;
            padding: 8px;
            border-radius: 6px;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        
        .message.user {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            margin-left: 20px;
        }
        
        .message.aide {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            margin-right: 20px;
        }
        
        .message .sender {
            font-weight: bold;
            margin-bottom: 4px;
            font-size: 0.9em;
            opacity: 0.8;
        }
        
        .actions {
            margin-top: 8px;
        }
        
        .action-button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 8px;
            margin: 2px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 0.8em;
        }
        
        .action-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        #inputContainer {
            display: flex;
            gap: 5px;
            align-items: flex-end;
        }
        
        #messageInput {
            flex: 1;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 8px;
            font-family: inherit;
            font-size: inherit;
            resize: none;
            min-height: 20px;
            max-height: 100px;
        }
        
        #sendButton, #clearButton {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            padding: 8px 12px;
            cursor: pointer;
            font-size: inherit;
        }
        
        #sendButton:hover, #clearButton:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        #sendButton:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .loading {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            text-align: center;
            padding: 10px;
        }
        
        .welcome {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            margin: 20px 0;
        }
        
        .feature-buttons {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin: 15px 0;
        }
        
        .feature-button {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border);
            border-radius: 6px;
            padding: 12px;
            cursor: pointer;
            text-align: center;
            font-size: 0.9em;
            transition: background-color 0.2s;
        }
        
        .feature-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .feature-button .icon {
            font-size: 1.2em;
            margin-bottom: 4px;
        }
    </style>
</head>
<body>
    <div id="toolbar">
        <button class="toolbar-button speech" onclick="startSpeech()">
            🎤 Speech
        </button>
        <button class="toolbar-button upload" onclick="uploadDocument()">
            📚 Upload Docs
        </button>
        <button class="toolbar-button" onclick="clearChat()">
            🗑️ Clear
        </button>
    </div>
    
    <div id="chatContainer">
        <div class="welcome">
            <h3>🚀 AIDE Agentic Chat</h3>
            <p>Your intelligent coding assistant with speech and document capabilities!</p>
            
            <div class="feature-buttons">
                <div class="feature-button" onclick="startSpeech()">
                    <div class="icon">🎤</div>
                    <div>Voice Input</div>
                </div>
                <div class="feature-button" onclick="uploadDocument()">
                    <div class="icon">📚</div>
                    <div>Ingest Books</div>
                </div>
            </div>
            
            <p><em>Try asking:</em></p>
            <ul style="text-align: left; max-width: 300px; margin: 0 auto;">
                <li>"Review the current file"</li>
                <li>"Fix bugs in this project"</li>
                <li>"Explain this function"</li>
                <li>"Add error handling"</li>
                <li>"Generate unit tests"</li>
                <li>"What did I upload earlier?"</li>
            </ul>
        </div>
    </div>
    
    <div id="inputContainer">
        <textarea id="messageInput" placeholder="Type your message here..." rows="2"></textarea>
        <button id="sendButton">Send</button>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        const chatContainer = document.getElementById('chatContainer');
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        
        let isLoading = false;
        
        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'addMessage':
                    addMessage(message.sender, message.text, message.actions || []);
                    break;
                case 'setLoading':
                    setLoading(message.loading);
                    break;
                case 'clearMessages':
                    clearMessages();
                    break;
            }
        });
        
        function addMessage(sender, text, actions = []) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + sender;
            
            const senderDiv = document.createElement('div');
            senderDiv.className = 'sender';
            senderDiv.textContent = sender === 'user' ? 'You' : 'AIDE';
            
            const textDiv = document.createElement('div');
            textDiv.textContent = text;
            
            messageDiv.appendChild(senderDiv);
            messageDiv.appendChild(textDiv);
            
            // Add action buttons if provided
            if (actions.length > 0) {
                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'actions';
                
                actions.forEach(action => {
                    const button = document.createElement('button');
                    button.className = 'action-button';
                    button.textContent = action.label;
                    button.onclick = () => executeAction(action);
                    actionsDiv.appendChild(button);
                });
                
                messageDiv.appendChild(actionsDiv);
            }
            
            chatContainer.appendChild(messageDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
        
        function setLoading(loading) {
            isLoading = loading;
            sendButton.disabled = loading;
            
            if (loading) {
                const loadingDiv = document.createElement('div');
                loadingDiv.className = 'loading';
                loadingDiv.id = 'loadingIndicator';
                loadingDiv.textContent = 'AIDE is thinking...';
                chatContainer.appendChild(loadingDiv);
            } else {
                const loadingIndicator = document.getElementById('loadingIndicator');
                if (loadingIndicator) {
                    loadingIndicator.remove();
                }
            }
            
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
        
        function clearMessages() {
            chatContainer.innerHTML = '<div class="welcome"><h3>🚀 AIDE Agentic Chat</h3><p>Chat cleared! Ready for new conversations.</p></div>';
            messageInput.value = '';
        }
        
        function startSpeech() {
            vscode.postMessage({
                command: 'startSpeech'
            });
        }
        
        function uploadDocument() {
            vscode.postMessage({
                command: 'uploadDocument'
            });
        }
        
        function clearChat() {
            vscode.postMessage({
                command: 'clearChat'
            });
        }
        
        function executeAction(action) {
            vscode.postMessage({
                command: 'executeAction',
                action: action
            });
        }
        
        function sendMessage() {
            const message = messageInput.value.trim();
            if (message && !isLoading) {
                vscode.postMessage({
                    command: 'sendMessage',
                    text: message
                });
                messageInput.value = '';
                messageInput.focus();
            }
        }
        
        // Event listeners
        sendButton.addEventListener('click', sendMessage);
        
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        // Auto-resize textarea
        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 100) + 'px';
        });
        
        // Focus input on load
        messageInput.focus();
    </script>
</body>
</html>`;
    }
}

export function initChatPanel(context: vscode.ExtensionContext): void {
    const provider = new AIDEChatPanel(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(AIDEChatPanel.viewType, provider)
    );
}
