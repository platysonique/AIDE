import * as vscode from 'vscode';

interface ParsedIntent {
  intent: string;
  scope: 'file' | 'workspace' | 'selection';
  auto_fix: boolean;
  tools_needed: string[];
  confidence: number;
  context_hints?: string[];
}

// API response interfaces
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

export class ChatWebviewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private chatHistory: Array<{message: string, type: 'user' | 'system' | 'error', timestamp: string}> = [];
  private pipeline: any;
  
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
      this._view?.show?.(true); // Ensure view is visible
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
    // Only add welcome message if chat history is empty
    if (this.chatHistory.length === 0) {
      this.chatHistory.push({
        message: '🎯 AIDE LLM-First Conversation Ready! Your Intel Arc A770 + 94GB RAM is ready to crush AI inference. Load a model and let\'s code!',
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
      this.addChatMessage(`🤔 Analyzing with AI model...`, 'system');
      
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
