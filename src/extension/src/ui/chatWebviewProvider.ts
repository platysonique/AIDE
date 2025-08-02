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

interface SpeechCapabilities {
  speech_to_text: boolean;
  text_to_speech: boolean;
}

interface TTSResult {
  success: boolean;
  audio_base64?: string;
  error?: string;
}

export class ChatWebviewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private chatHistory: Array<{message: string, type: 'user' | 'system' | 'error', timestamp: string}> = [];
  private pipeline: any;
  
  // Speech functionality state
  private speechSupported = false;
  
  // Advanced deduplication system
  private processingMessage = false;
  private messageQueue: string[] = [];
  private lastProcessedMessage = '';
  private lastProcessedTime = 0;
  private messageTracker = new Set<string>();
  
  // Model management state
  private availableModels: string[] = [];
  private currentModel: string | null = null;
  private refreshing = false;

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

    webviewView.webview.onDidReceiveMessage(async (message: any) => {
      try {
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
          case 'startSpeechRecording':
            await this.startSpeechRecording();
            break;
          case 'stopSpeechRecording':
            await this.stopSpeechRecording();
            break;
          case 'playTTS':
            await this.playTextToSpeech(message.text);
            break;
          case 'processSpeech':
            await this.processSpeechInput(message.audioBase64);
            break;
        }
      } catch (error) {
        console.error('Error handling webview message:', error);
        this.addChatMessage(`❌ Error: ${error}`, 'error');
      }
    });

    this.refreshChat();
  }

  // Speech support detection
  private async checkSpeechSupport() {
    try {
      const response = await fetch('http://127.0.0.1:8000/speech/capabilities');
      if (response.ok) {
        const data = await response.json() as SpeechCapabilities;
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

  // Start speech recording - delegated to webview
  private async startSpeechRecording() {
    if (!this.speechSupported) {
      this.addChatMessage('❌ Speech recognition not supported by backend', 'error');
      return;
    }

    this.addChatMessage('🎤 Speech recording will start in webview...', 'system');
    
    if (this._view?.webview) {
      this._view.webview.postMessage({
        command: 'startRecording'
      });
    }
  }

  // Stop speech recording - delegated to webview
  private async stopSpeechRecording() {
    if (this._view?.webview) {
      this._view.webview.postMessage({
        command: 'stopRecording'
      });
    }
  }

  // Process speech input from webview
  private async processSpeechInput(audioBase64: string) {
    try {
      this.addChatMessage('🎤 Processing speech...', 'system');
      
      const response = await fetch('http://127.0.0.1:8000/speech/stt/base64', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          audio_base64: audioBase64,
          format: 'wav'
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const result = await response.json() as SpeechResult;
      
      if (result.success && result.text) {
        this.addChatMessage(`🎙️ You said: "${result.text}"`, 'system');
        await this.handleUserMessageWithAdvancedDeduplication(result.text);
      } else {
        this.addChatMessage(`❌ Speech recognition failed: ${result.error || 'Unknown error'}`, 'error');
      }
      
    } catch (error) {
      console.error('Speech processing failed:', error);
      this.addChatMessage(`❌ Speech processing failed: ${error}`, 'error');
    }
  }

  // Text-to-speech
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

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const result = await response.json() as TTSResult;
      
      if (result.success && result.audio_base64) {
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

  // Enhanced model loading with debouncing
  private async loadAvailableModels() {
    if (this.refreshing) {
      console.log('🔄 Already refreshing models, skipping duplicate request');
      return;
    }
    
    this.refreshing = true;
    try {
      console.log('🔄 Loading available models from backend...');
      const response = await fetch('http://127.0.0.1:8000/models');
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const data = await response.json() as ModelListResponse;
      this.availableModels = data.models || [];
      this.currentModel = data.current || null;
      
      // Update UI with model list
      this._view?.show?.(true);
      this._view?.webview.postMessage({
        command: 'updateModels',
        models: this.availableModels,
        current: this.currentModel
      });

      console.log(`🤖 Loaded ${this.availableModels.length} models, current: ${this.currentModel}`);
      
      if (this.availableModels.length === 0) {
        this.addChatMessage('⚠️ No models found. Make sure your backend has models configured.', 'error');
      }
      
    } catch (error) {
      console.error('Failed to load models:', error);
      this.addChatMessage(`⚠️ Could not load available models: ${error}`, 'error');
      this.addChatMessage('💡 Tip: Check if your backend is running on port 8000', 'system');
    } finally {
      this.refreshing = false;
    }
  }

  // Improved model switching with better error handling
  private async switchModel(modelName: string) {
    if (!modelName) {
      this.addChatMessage('❌ No model selected', 'error');
      return;
    }
    
    try {
      this.addChatMessage(`🔄 Switching to model: ${modelName}...`, 'system');
      
      const response = await fetch('http://127.0.0.1:8000/models/use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const result = await response.json() as ModelSwitchResponse;
      
      if (result.status === 'success') {
        this.currentModel = modelName;
        this.addChatMessage(`✅ Successfully switched to ${modelName}! Your Arc A770 beast is now running this model.`, 'system');
        
        // Update UI
        this._view?.webview.postMessage({
          command: 'modelSwitched',
          model: modelName
        });
        
      } else {
        throw new Error(result.error || result.message || 'Unknown error');
      }
      
    } catch (error) {
      console.error('Model switch error:', error);
      this.addChatMessage(`❌ Model switch failed: ${error}`, 'error');
    }
  }

  // Enhanced document ingestion
  private async ingestDocument() {
    const options: vscode.OpenDialogOptions = {
      canSelectMany: false,
      openLabel: 'Ingest Document',
      filters: {
        'Text files': ['txt', 'md', 'py', 'js', 'ts', 'json', 'yaml', 'yml', 'csv'],
        'Documents': ['pdf', 'docx', 'doc'],
        'All files': ['*']
      }
    };

    const fileUri = await vscode.window.showOpenDialog(options);
    if (!fileUri || !fileUri[0]) {
      return;
    }

    const filePath = fileUri[0].fsPath;
    const fileName = fileUri[0].fsPath.split('/').pop() || 'unknown';
    
    try {
      this.addChatMessage(`📄 Ingesting document: ${fileName}...`, 'system');
      
      const response = await fetch('http://127.0.0.1:8000/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: filePath,
          file_name: fileName
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json() as IngestResponse;
      
      if (result.status === 'success') {
        this.addChatMessage(`✅ Document "${fileName}" ingested successfully!`, 'system');
        this.addChatMessage(`💡 You can now ask questions about this document.`, 'system');
      } else {
        throw new Error(result.message || 'Unknown ingestion error');
      }
      
    } catch (error) {
      console.error('Ingestion error:', error);
      this.addChatMessage(`❌ Ingestion failed: ${error}`, 'error');
    }
  }

  // Load chat history from workspace state
  private loadChatHistory() {
    const savedHistory = this.context.workspaceState.get<Array<{message: string, type: 'user' | 'system' | 'error', timestamp: string}>>('chatHistory', []);
    this.chatHistory = savedHistory;
  }

  // Save chat history to workspace state
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

  // Advanced message deduplication system
  private async handleUserMessageWithAdvancedDeduplication(text: string): Promise<void> {
    if (!this._view) return;
    
    const now = Date.now();
    const messageHash = `${text}_${Math.floor(now / 1000)}`;
    
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

  // Enhanced message processing with better error recovery
  private async processMessageQueue(): Promise<void> {
    if (this.processingMessage || this.messageQueue.length === 0) {
      return;
    }

    this.processingMessage = true;
    let text: string | undefined;
    
    try {
      text = this.messageQueue.shift()!;
      console.log(`🤖 Processing message: "${text}"`);
      
      // Add user message to history
      this.addChatMessage(`👤 ${text}`, 'user');
      this.addChatMessage(`🤔 Processing with enhanced backend...`, 'system');
      
      // Get current context
      const currentFile = vscode.window.activeTextEditor?.document;
      const selection = vscode.window.activeTextEditor?.selection;
      
      const requestBody = {
        message: text,
        context: {
          currentFile: currentFile ? {
            filename: currentFile.fileName,
            language: currentFile.languageId,
            selection: selection && !selection.isEmpty ? 
              currentFile.getText(selection) : null
          } : null,
          workspace: {
            name: vscode.workspace.name || 'No workspace',
            rootPath: vscode.workspace.rootPath
          }
        }
      };
      
      const response = await fetch('http://127.0.0.1:8000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backend API returned ${response.status}: ${errorText}`);
      }

      const result = await response.json() as ChatResponse;
      
      // Display AI response
      this.addChatMessage(result.response, 'system');
      
      // Show additional info if available
      if (result.model_used) {
        this.addChatMessage(`🤖 Powered by: ${result.model_used}`, 'system');
      }
      
      if (result.conversation_type === 'regex_fallback' && result.fallback_reason) {
        this.addChatMessage(`⚠️ Note: Using fallback mode - ${result.fallback_reason}`, 'system');
      }
      
      if (result.tools_invoked && result.tools_invoked.length > 0) {
        this.addChatMessage(`🔧 Tools used: ${result.tools_invoked.join(', ')}`, 'system');
      }
      
    } catch (apiError) {
      console.error('Backend API error:', apiError);
      this.addChatMessage(`❌ AI Backend Error: ${apiError}`, 'error');
      this.addChatMessage('💭 Tip: Make sure your Python backend is running on port 8000', 'system');
      
    } finally {
      this.processingMessage = false;
      
      // Process next message in queue with delay
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
        <title>AIDE Enhanced Chat</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 10px;
          }
          
          .chat-header {
            text-align: center;
            margin-bottom: 10px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
          }
          
          .chat-container {
            max-height: 400px;
            overflow-y: auto;
            border: 1px solid var(--vscode-widget-border);
            padding: 10px;
            margin-bottom: 10px;
            border-radius: 5px;
            background-color: var(--vscode-input-background);
          }
          
          .message {
            margin-bottom: 8px;
            line-height: 1.4;
          }
          
          .message.user {
            color: var(--vscode-terminal-ansiGreen);
          }
          
          .message.system {
            color: var(--vscode-foreground);
          }
          
          .message.error {
            color: var(--vscode-errorForeground);
          }
          
          .timestamp {
            font-size: 0.8em;
            opacity: 0.7;
            margin-right: 8px;
          }
          
          .controls {
            display: flex;
            gap: 5px;
            margin-bottom: 10px;
            flex-wrap: wrap;
            align-items: center;
          }
          
          .model-select {
            flex: 1;
            min-width: 120px;
            padding: 6px;
            border: 1px solid var(--vscode-widget-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-foreground);
            border-radius: 3px;
          }
          
          .btn {
            padding: 6px 12px;
            border: 1px solid var(--vscode-button-border);
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            white-space: nowrap;
          }
          
          .btn:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          
          .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
          
          .speech-controls {
            display: flex;
            gap: 5px;
            margin-bottom: 10px;
          }
          
          .input-area {
            display: flex;
            gap: 5px;
          }
          
          .user-input {
            flex: 1;
            padding: 8px;
            border: 1px solid var(--vscode-widget-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-foreground);
            border-radius: 3px;
          }
          
          .send-btn {
            padding: 8px 16px;
            border: 1px solid var(--vscode-button-border);
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-radius: 3px;
            cursor: pointer;
          }
          
          .send-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          
          .recording {
            background-color: var(--vscode-errorBackground) !important;
            color: var(--vscode-errorForeground) !important;
          }
        </style>
      </head>
      <body>
        <div class="chat-header">🎯 AIDE Enhanced Chat</div>
        
        <div class="chat-container" id="chatContainer">
          <div id="chatHistory"></div>
        </div>
        
        <div class="controls">
          <select id="modelSelect" class="model-select">
            <option value="">Loading models...</option>
          </select>
          <button onclick="refreshModels()" class="btn">🔄 Refresh</button>
        </div>
        
        <div class="speech-controls">
          <button id="speechBtn" onclick="toggleSpeech()" class="btn" disabled>🎤 Speech</button>
          <button onclick="ingestDocument()" class="btn">📄 Ingest</button>
          <button onclick="clearChat()" class="btn">🗑️ Clear</button>
        </div>
        
        <div class="input-area">
          <input type="text" id="userInput" class="user-input" placeholder="Type your message..." />
          <button onclick="sendMessage()" class="send-btn">Send</button>
        </div>

        <script>
          const vscode = acquireVsCodeApi();
          let isRecording = false;
          let mediaRecorder = null;
          let audioChunks = [];
          let speechSupported = false;
          
          function refreshModels() {
            console.log('🔄 Refresh models clicked');
            vscode.postMessage({ command: 'refreshModels' });
          }
          
          function clearChat() {
            vscode.postMessage({ command: 'clearChat' });
          }
          
          function ingestDocument() {
            vscode.postMessage({ command: 'ingestDocument' });
          }
          
          function sendMessage() {
            const input = document.getElementById('userInput');
            if (input.value.trim()) {
              vscode.postMessage({ command: 'userMessage', text: input.value });
              input.value = '';
            }
          }
          
          function switchModel() {
            const select = document.getElementById('modelSelect');
            if (select.value) {
              vscode.postMessage({ command: 'switchModel', model: select.value });
            }
          }
          
          async function toggleSpeech() {
            if (!speechSupported) {
              console.log('Speech not supported');
              return;
            }
            
            if (!isRecording) {
              await startRecording();
            } else {
              await stopRecording();
            }
          }
          
          async function startRecording() {
            try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              mediaRecorder = new MediaRecorder(stream);
              audioChunks = [];
              isRecording = true;
              
              const speechBtn = document.getElementById('speechBtn');
              speechBtn.textContent = '🛑 Stop';
              speechBtn.classList.add('recording');
              
              mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                  audioChunks.push(event.data);
                }
              };
              
              mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                await processSpeechInput(audioBlob);
                stream.getTracks().forEach(track => track.stop());
              };
              
              mediaRecorder.start();
              
            } catch (error) {
              console.error('Failed to start recording:', error);
            }
          }
          
          async function stopRecording() {
            if (mediaRecorder && isRecording) {
              mediaRecorder.stop();
              isRecording = false;
              
              const speechBtn = document.getElementById('speechBtn');
              speechBtn.textContent = '🎤 Speech';
              speechBtn.classList.remove('recording');
            }
          }
          
          async function processSpeechInput(audioBlob) {
            try {
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64Audio = reader.result.split(',')[1];
                vscode.postMessage({ 
                  command: 'processSpeech', 
                  audioBase64: base64Audio 
                });
              };
              reader.readAsDataURL(audioBlob);
            } catch (error) {
              console.error('Failed to process speech:', error);
            }
          }
          
          function playAudio(audioBase64) {
            try {
              const audio = new Audio('data:audio/wav;base64,' + audioBase64);
              audio.play();
            } catch (error) {
              console.error('Failed to play audio:', error);
            }
          }
          
          // Handle Enter key in input
          document.getElementById('userInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
              sendMessage();
            }
          });
          
          // Handle messages from extension
          window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
              case 'updateModels':
                updateModelDropdown(message.models, message.current);
                break;
              case 'appendMessage':
                appendChatMessage(message.message, message.type, message.timestamp);
                break;
              case 'refreshChat':
                refreshChatHistory(message.history);
                break;
              case 'modelSwitched':
                updateCurrentModel(message.model);
                break;
              case 'speechSupport':
                speechSupported = message.supported;
                document.getElementById('speechBtn').disabled = !speechSupported;
                break;
              case 'playAudio':
                playAudio(message.audioBase64);
                break;
              case 'startRecording':
                startRecording();
                break;
              case 'stopRecording':
                stopRecording();
                break;
            }
          });
          
          function updateModelDropdown(models, current) {
            const select = document.getElementById('modelSelect');
            select.innerHTML = '';
            
            if (models.length === 0) {
              select.innerHTML = '<option value="">No models available</option>';
            } else {
              models.forEach(model => {
                const option = document.createElement('option');
                option.value = model;
                option.textContent = model;
                if (model === current) {
                  option.selected = true;
                }
                select.appendChild(option);
              });
            }
            
            select.onchange = switchModel;
          }
          
          function appendChatMessage(message, type, timestamp) {
            const chatHistory = document.getElementById('chatHistory');
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${type}\`;
            messageDiv.innerHTML = \`
              <span class="timestamp">\${timestamp}</span>
              <span class="content">\${message}</span>
            \`;
            chatHistory.appendChild(messageDiv);
            chatHistory.scrollTop = chatHistory.scrollHeight;
          }
          
          function refreshChatHistory(history) {
            const chatHistory = document.getElementById('chatHistory');
            chatHistory.innerHTML = '';
            history.forEach(entry => {
              appendChatMessage(entry.message, entry.type, entry.timestamp);
            });
          }
          
          function updateCurrentModel(model) {
            const select = document.getElementById('modelSelect');
            select.value = model;
          }
        </script>
      </body>
      </html>
    `;
  }
}
