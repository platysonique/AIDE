# File: src/extension/src/ui/chatWebviewProvider_ENHANCED.ts

import * as vscode from 'vscode';

interface ParsedIntent {
    intent: string;
    scope: 'file' | 'workspace' | 'selection';
    auto_fix: boolean;
    tools_needed: string[];
    confidence: number;
    context_hints?: string[];
}

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

interface ChatResponse {
    response: string;
    model_used?: string;
    actions?: any[];
    tools_invoked?: string[];
    detected_intents?: string[];
    conversation_type?: string;
    fallback_reason?: string;
}

interface SpeechResult {
    success: boolean;
    text?: string;
    error?: string;
}

export class ChatWebviewProviderEnhanced implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private chatHistory: Array<{message: string, type: 'user' | 'system' | 'error', timestamp: string}> = [];
    private pipeline: any;
    
    // ENHANCED: Speech functionality state
    private isRecording = false;
    private mediaRecorder?: MediaRecorder;
    private audioChunks: Blob[] = [];
    private speechSupported = false;
    
    // ADVANCED DEDUPLICATION SYSTEM
    private processingMessage = false;
    private messageQueue: string[] = [];
    private lastProcessedMessage = '';
    private lastProcessedTime = 0;
    private messageTracker = new Set();
    
    // Model management state
    private availableModels: string[] = [];
    private currentModel: string | null = null;

    constructor(private context: vscode.ExtensionContext, pipeline: any) {
        this.pipeline = pipeline;
        this.loadChatHistory();
        this.addWelcomeMessage();
        this.loadAvailableModels();
        this.checkSpeechSupport();
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
                // ENHANCED: Speech commands
                case 'startSpeechRecording':
                    await this.startSpeechRecording();
                    break;
                case 'stopSpeechRecording':
                    await this.stopSpeechRecording();
                    break;
                case 'playTTS':
                    await this.playTextToSpeech(message.text);
                    break;
            }
        });

        this.refreshChat();
    }

    // ENHANCED: Speech support detection
    private async checkSpeechSupport() {
        try {
            const response = await fetch('http://127.0.0.1:8000/speech/capabilities');
            if (response.ok) {
                const data = await response.json();
                this.speechSupported = data.speech_to_text || data.text_to_speech;
                
                if (this._view?.webview) {
                    this._view.webview.postMessage({
                        command: 'speechSupport',
                        supported: this.speechSupported,
                        capabilities: data
                    });
                }
            }
        } catch (error) {
            console.error('Speech support check failed:', error);
            this.speechSupported = false;
        }
    }

    // ENHANCED: Start speech recording
    private async startSpeechRecording() {
        if (!this.speechSupported || this.isRecording) {
            return;
        }

        try {
            // Get user media
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];
            this.isRecording = true;

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                await this.processSpeechInput(audioBlob);
                
                // Stop all tracks to release microphone
                stream.getTracks().forEach(track => track.stop());
            };

            this.mediaRecorder.start();
            
            // Update UI
            if (this._view?.webview) {
                this._view.webview.postMessage({
                    command: 'recordingStarted'
                });
            }
            
            this.addChatMessage('🎤 Recording started... Click stop when done.', 'system');

        } catch (error) {
            console.error('Speech recording failed:', error);
            this.addChatMessage('❌ Speech recording failed. Please check microphone permissions.', 'error');
        }
    }

    // ENHANCED: Stop speech recording
    private async stopSpeechRecording() {
        if (!this.isRecording || !this.mediaRecorder) {
            return;
        }

        this.mediaRecorder.stop();
        this.isRecording = false;

        // Update UI
        if (this._view?.webview) {
            this._view.webview.postMessage({
                command: 'recordingStopped'
            });
        }

        this.addChatMessage('🎤 Recording stopped, processing speech...', 'system');
    }

    // ENHANCED: Process speech input
    private async processSpeechInput(audioBlob: Blob) {
        try {
            // Convert blob to base64
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64Audio = (reader.result as string).split(',')[1];
                
                try {
                    const response = await fetch('http://127.0.0.1:8000/speech/stt/base64', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({
                            audio_base64: base64Audio,
                            format: 'wav'
                        })
                    });

                    const result: SpeechResult = await response.json();
                    
                    if (result.success && result.text) {
                        this.addChatMessage(`🎙️ You said: "${result.text}"`, 'system');
                        
                        // Process the recognized text as a regular message
                        await this.handleUserMessageWithAdvancedDeduplication(result.text);
                    } else {
                        this.addChatMessage(`❌ Speech recognition failed: ${result.error || 'Unknown error'}`, 'error');
                    }
                } catch (error) {
                    this.addChatMessage(`❌ Speech processing error: ${error}`, 'error');
                }
            };
            
            reader.readAsDataURL(audioBlob);
            
        } catch (error) {
            console.error('Speech processing failed:', error);
            this.addChatMessage(`❌ Speech processing failed: ${error}`, 'error');
        }
    }

    // ENHANCED: Text-to-speech
    private async playTextToSpeech(text: string) {
        if (!this.speechSupported) {
            this.addChatMessage('❌ Text-to-speech not supported', 'error');
            return;
        }

        try {
            this.addChatMessage('🔊 Playing text-to-speech...', 'system');
            
            const response = await fetch('http://127.0.0.1:8000/speech/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    text: text,
                    return_audio: 'true'
                })
            });

            const result = await response.json();
            
            if (result.success && result.audio_base64) {
                // Play audio in webview
                if (this._view?.webview) {
                    this._view.webview.postMessage({
                        command: 'playAudio',
                        audioBase64: result.audio_base64
                    });
                }
                
                this.addChatMessage('✅ Text-to-speech completed', 'system');
            } else {
                this.addChatMessage(`❌ TTS failed: ${result.error || 'Unknown error'}`, 'error');
            }
            
        } catch (error) {
            console.error('TTS failed:', error);
            this.addChatMessage(`❌ TTS error: ${error}`, 'error');
        }
    }

    // EXISTING METHODS (enhanced versions)
    private async loadAvailableModels() {
        try {
            const response = await fetch('http://127.0.0.1:8000/models');
            if (response.ok) {
                const data = await response.json() as ModelListResponse;
                this.availableModels = data.models || [];
                this.currentModel = data.current || null;
                
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

    private async switchModel(modelName: string) {
        try {
            this.addChatMessage(`🔄 Switching to model: ${modelName}...`, 'system');
            
            const response = await fetch('http://127.0.0.1:8000/models/use', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: modelName })
            });

            const result = await response.json() as ModelSwitchResponse;
            
            if (result.status === 'success') {
                this.currentModel = modelName;
                this.addChatMessage(`✅ Successfully switched to ${modelName}!`, 'system');
                
                if (this._view?.webview) {
                    this._view.webview.postMessage({
                        command: 'modelSwitched',
                        model: modelName
                    });
                }
            } else {
                this.addChatMessage(`❌ Failed to switch model: ${result.error || 'Unknown error'}`, 'error');
            }
        } catch (error) {
            this.addChatMessage(`❌ Model switch error: ${error}`, 'error');
        }
    }

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

                const result = await response.json() as IngestResponse;
                
                if (result.status === 'success') {
                    this.addChatMessage(`✅ Document ingested successfully!`, 'system');
                } else {
                    this.addChatMessage(`❌ Ingestion failed: ${result.message || 'Unknown error'}`, 'error');
                }
            } catch (error) {
                this.addChatMessage(`❌ Ingestion error: ${error}`, 'error');
            }
        }
    }

    private loadChatHistory() {
        const savedHistory = this.context.workspaceState.get<Array<{message: string, type: 'user' | 'system' | 'error', timestamp: string}>>('chatHistory', []);
        this.chatHistory = savedHistory;
    }

    private saveChatHistory() {
        this.context.workspaceState.update('chatHistory', this.chatHistory);
    }

    private addWelcomeMessage() {
        if (this.chatHistory.length === 0) {
            this.chatHistory.push({
                message: '🎯 AIDE Enhanced Chat Ready! Features: Voice input 🎤, Text-to-speech 🔊, Model switching 🤖, Document ingestion 📄',
                type: 'system',
                timestamp: new Date().toLocaleTimeString()
            });
        }
    }

    private async handleUserMessageWithAdvancedDeduplication(text: string): Promise<void> {
        if (!this._view) return;

        const now = Date.now();
        const messageHash = `${text}_${Math.floor(now / 1000)}`;

        if (this.processingMessage) {
            console.log('⚠️ Message already being processed, ignoring duplicate');
            return;
        }

        if (text === this.lastProcessedMessage && now - this.lastProcessedTime < 3000) {
            console.log('⚠️ Duplicate message detected within 3 seconds, ignoring');
            return;
        }

        if (this.messageTracker.has(messageHash)) {
            console.log('⚠️ Message hash already processed, ignoring');
            return;
        }

        this.lastProcessedMessage = text;
        this.lastProcessedTime = now;
        this.messageTracker.add(messageHash);

        setTimeout(() => {
            this.messageTracker.delete(messageHash);
        }, 10000);

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

            this.addChatMessage(`👤 ${text}`, 'user');
            this.addChatMessage(`🤔 Processing with enhanced backend...`, 'system');

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
                    
                    this.addChatMessage(result.response, 'system');
                    
                    if (result.model_used) {
                        this.addChatMessage(`🤖 Powered by: ${result.model_used}`, 'system');
                    }
                    
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
            }

        } catch (error: any) {
            console.error('Chat message processing error:', error);
            this.addChatMessage(`❌ Error: ${error.message || error}`, 'error');
        } finally {
            this.processingMessage = false;
            if (this.messageQueue.length > 0) {
                setTimeout(() => this.processMessageQueue(), 500);
            }
        }
    }

    private addChatMessage(text: string, type: 'user' | 'system' | 'error') {
        const timestamp = new Date().toLocaleTimeString();

        this.chatHistory.push({
            message: text,
            type,
            timestamp
        });

        if (this.chatHistory.length > 100) {
            this.chatHistory = this.chatHistory.slice(-80);
        }

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
    <title>AIDE Enhanced Chat</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            margin: 0;
            padding: 0;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .chat-header {
            padding: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-sideBar-background);
        }

        .header-title {
            font-weight: bold;
            margin-bottom: 8px;
        }

        .controls {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .control-group {
            display: flex;
            gap: 4px;
            align-items: center;
        }

        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }

        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        button:disabled {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            cursor: not-allowed;
        }

        /* ENHANCED: Speech button styles */
        .speech-button {
            background-color: var(--vscode-inputValidation-infoBackground);
            position: relative;
        }

        .speech-button.recording {
            background-color: var(--vscode-inputValidation-errorBackground);
            animation: pulse 1s infinite;
        }

        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.7; }
            100% { opacity: 1; }
        }

        .tts-button {
            background-color: var(--vscode-inputValidation-warningBackground);
        }

        select {
            background-color: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            padding: 2px 4px;
            border-radius: 2px;
            font-size: 12px;
        }

        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 10px;
        }

        .message {
            margin-bottom: 10px;
            padding: 8px;
            border-radius: 4px;
        }

        .message.user {
            background-color: var(--vscode-textCodeBlock-background);
            border-left: 3px solid var(--vscode-textLink-foreground);
        }

        .message.system {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-left: 3px solid var(--vscode-charts-green);
        }

        .message.error {
            background-color: var(--vscode-inputValidation-errorBackground);
            border-left: 3px solid var(--vscode-inputValidation-errorBorder);
        }

        .message-content {
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        .message-timestamp {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }

        .input-container {
            padding: 10px;
            border-top: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-sideBar-background);
        }

        .input-row {
            display: flex;
            gap: 8px;
            align-items: center;
        }

        #messageInput {
            flex: 1;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 8px;
            border-radius: 4px;
            font-size: 14px;
            resize: vertical;
            min-height: 20px;
        }

        #messageInput:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        .send-button {
            background-color: var(--vscode-button-background);
            padding: 8px 12px;
        }

        /* Hidden audio element for TTS playback */
        #audioPlayer {
            display: none;
        }
    </style>
</head>
<body>
    <div class="chat-header">
        <div class="header-title">🎯 AIDE Enhanced Chat</div>
        <div class="controls">
            <div class="control-group">
                <select id="modelSelect">
                    <option value="">Loading models...</option>
                </select>
                <button onclick="refreshModels()">🔄</button>
            </div>
            <div class="control-group">
                <!-- ENHANCED: Speech controls -->
                <button id="speechButton" class="speech-button" onclick="toggleSpeechRecording()" disabled>
                    🎤 Speech
                </button>
                <button class="tts-button" onclick="playLastMessage()">
                    🔊 TTS
                </button>
                <button onclick="ingestDocument()">📄 Ingest</button>
                <button onclick="clearChat()">🗑️ Clear</button>
            </div>
        </div>
    </div>

    <div class="chat-container" id="chatContainer">
        <!-- Messages will be inserted here -->
    </div>

    <div class="input-container">
        <div class="input-row">
            <textarea id="messageInput" placeholder="Type your message or use speech input..." rows="1"></textarea>
            <button class="send-button" onclick="sendMessage()">Send</button>
        </div>
    </div>

    <!-- Hidden audio player for TTS -->
    <audio id="audioPlayer" controls></audio>

    <script>
        const vscode = acquireVsCodeApi();
        let isRecording = false;
        let speechSupported = false;
        let lastAIMessage = '';

        // ENHANCED: Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'appendMessage':
                    appendMessage(message.message, message.type, message.timestamp);
                    if (message.type === 'system' && !message.message.includes('🎤') && !message.message.includes('🔊')) {
                        lastAIMessage = message.message;
                    }
                    break;
                case 'refreshChat':
                    refreshChat(message.history);
                    break;
                case 'updateModels':
                    updateModelSelect(message.models, message.current);
                    break;
                case 'speechSupport':
                    speechSupported = message.supported;
                    updateSpeechButton();
                    break;
                case 'recordingStarted':
                    isRecording = true;
                    updateSpeechButton();
                    break;
                case 'recordingStopped':
                    isRecording = false;
                    updateSpeechButton();
                    break;
                case 'playAudio':
                    playAudioFromBase64(message.audioBase64);
                    break;
            }
        });

        // ENHANCED: Speech recording toggle
        function toggleSpeechRecording() {
            if (!speechSupported) {
                alert('Speech recognition not supported');
                return;
            }

            if (isRecording) {
                vscode.postMessage({
                    command: 'stopSpeechRecording'
                });
            } else {
                vscode.postMessage({
                    command: 'startSpeechRecording'
                });
            }
        }

        // ENHANCED: Update speech button state
        function updateSpeechButton() {
            const button = document.getElementById('speechButton');
            if (!speechSupported) {
                button.disabled = true;
                button.textContent = '🎤 N/A';
                button.title = 'Speech not supported';
            } else if (isRecording) {
                button.disabled = false;
                button.textContent = '⏹️ Stop';
                button.classList.add('recording');
                button.title = 'Click to stop recording';
            } else {
                button.disabled = false;
                button.textContent = '🎤 Speech';
                button.classList.remove('recording');
                button.title = 'Click to start voice input';
            }
        }

        // ENHANCED: Play TTS for last AI message
        function playLastMessage() {
            if (!lastAIMessage) {
                alert('No message to play');
                return;
            }

            // Clean up message for TTS (remove emojis and formatting)
            const cleanText = lastAIMessage.replace(/[🎯✅💬🤖🔧📚🎨⚡🎙️🔊]/g, '').trim();
            
            vscode.postMessage({
                command: 'playTTS',
                text: cleanText
            });
        }

        // ENHANCED: Play audio from base64
        function playAudioFromBase64(audioBase64) {
            const audioPlayer = document.getElementById('audioPlayer');
            audioPlayer.src = 'data:audio/wav;base64,' + audioBase64;
            audioPlayer.play().catch(error => {
                console.error('Audio playback failed:', error);
            });
        }

        // Existing functions (enhanced)
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
            vscode.postMessage({
                command: 'clearChat'
            });
        }

        function refreshModels() {
            vscode.postMessage({
                command: 'refreshModels'
            });
        }

        function ingestDocument() {
            vscode.postMessage({
                command: 'ingestDocument'
            });
        }

        function updateModelSelect(models, current) {
            const select = document.getElementById('modelSelect');
            select.innerHTML = '';
            
            if (models.length === 0) {
                select.innerHTML = '<option value="">No models available</option>';
                return;
            }

            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model;
                option.textContent = model;
                if (model === current) {
                    option.selected = true;
                }
                select.appendChild(option);
            });

            select.onchange = function() {
                if (this.value) {
                    vscode.postMessage({
                        command: 'switchModel',
                        model: this.value
                    });
                }
            };
        }

        function appendMessage(content, type, timestamp) {
            const container = document.getElementById('chatContainer');
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${type}\`;
            
            messageDiv.innerHTML = \`
                <div class="message-content">\${content}</div>
                <div class="message-timestamp">\${timestamp}</div>
            \`;
            
            container.appendChild(messageDiv);
            container.scrollTop = container.scrollHeight;
        }

        function refreshChat(history) {
            const container = document.getElementById('chatContainer');
            container.innerHTML = '';
            
            history.forEach(msg => {
                appendMessage(msg.message, msg.type, msg.timestamp);
            });
        }

        // Enhanced input handling
        document.getElementById('messageInput').addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Auto-resize textarea
        document.getElementById('messageInput').addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });

        // Initialize
        updateSpeechButton();
    </script>
</body>
</html>
        `;
    }
}