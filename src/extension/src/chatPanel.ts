import * as vscode from 'vscode';

// Data contracts matching your backend
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

// Tool discovery and execution engine
class Orchestrator {
    private chatPanel: vscode.WebviewPanel | undefined;

    constructor(chatPanel?: vscode.WebviewPanel) {
        this.chatPanel = chatPanel;
    }

    async discoverTools(toolsNeeded: string[]): Promise<Array<{id: string, type: string, description: string}>> {
        const cmds = await vscode.commands.getCommands(true);
        const catalog: Array<{id: string, type: string, description: string}> = [];

        for (const need of toolsNeeded) {
            switch (need) {
                case 'formatter':
                    if (cmds.includes('editor.action.formatDocument')) {
                        catalog.push({ 
                            id: 'editor.action.formatDocument', 
                            type: 'cmd',
                            description: 'Format entire document'
                        });
                    }
                    break;

                case 'indent_checker':
                    if (cmds.includes('editor.action.indentLines')) {
                        catalog.push({ 
                            id: 'editor.action.indentLines', 
                            type: 'cmd',
                            description: 'Fix indentation'
                        });
                    }
                    break;

                case 'style_guide':
                    if (cmds.includes('eslint.executeAutofix')) {
                        catalog.push({ 
                            id: 'eslint.executeAutofix', 
                            type: 'cmd',
                            description: 'Apply ESLint style fixes'
                        });
                    }
                    break;

                case 'linter':
                    if (cmds.includes('eslint.executeAutofix')) {
                        catalog.push({ 
                            id: 'eslint.executeAutofix', 
                            type: 'cmd',
                            description: 'ESLint auto-fix'
                        });
                    }
                    break;

                case 'auto_fix':
                    if (cmds.includes('editor.action.fixAll')) {
                        catalog.push({ 
                            id: 'editor.action.fixAll', 
                            type: 'cmd',
                            description: 'Apply all available fixes'
                        });
                    }
                    break;

                case 'test_runner':
                    if (cmds.includes('test-explorer.run-all')) {
                        catalog.push({ 
                            id: 'test-explorer.run-all', 
                            type: 'cmd',
                            description: 'Run all tests'
                        });
                    }
                    break;

                default:
                    // Unknown tool - will fallback to AgentFactory
                    break;
            }
        }

        return catalog;
    }

    async executePlan(task: ParsedIntent): Promise<void> {
        this.logToChat(`🎯 Executing: ${task.intent} (confidence: ${(task.confidence * 100).toFixed(0)}%)`);

        const tools = await this.discoverTools(task.tools_needed);

        if (tools.length > 0) {
            this.logToChat(`🔧 Found ${tools.length} tools: ${tools.map(t => t.description).join(', ')}`);

            for (const tool of tools) {
                try {
                    await vscode.commands.executeCommand(tool.id);
                    this.logToChat(`✅ Executed: ${tool.description}`);
                } catch (error) {
                    this.logToChat(`❌ Failed: ${tool.description} - ${error}`);
                }
            }

            // Auto-fix if requested
            if (task.auto_fix) {
                try {
                    await vscode.commands.executeCommand('editor.action.fixAll');
                    this.logToChat(`🛠️ Applied auto-fixes`);
                } catch (error) {
                    this.logToChat(`⚠️ Auto-fix unavailable: ${error}`);
                }
            }

        } else {
            // Fallback to AgentFactory (for Sprint 4)
            this.logToChat(`🤖 No native tools found, would create custom agent...`);
            // TODO: Implement AgentFactory fallback
        }
    }

    private logToChat(message: string): void {
        const timestamp = new Date().toLocaleTimeString();
        if (this.chatPanel?.webview) {
            this.chatPanel.webview.postMessage({
                command: 'append',
                text: `${timestamp} - ${message}`
            });
        }
        console.log(`[AIDE Orchestrator] ${message}`);
    }
}

// Main chat panel management
let chatPanel: vscode.WebviewPanel | undefined;
let orchestrator: Orchestrator | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 AIDE Intent → Tool → Execution pipeline activating...');

    context.subscriptions.push(
        vscode.commands.registerCommand('aide.openChat', () => {
            if (chatPanel) {
                chatPanel.reveal();
            } else {
                createChatPanel(context);
            }
        })
    );
}

function createChatPanel(context: vscode.ExtensionContext) {
    chatPanel = vscode.window.createWebviewPanel(
        'aideChat',
        'AIDE - Intent Driven Assistant',
        vscode.ViewColumn.One,
        { 
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    orchestrator = new Orchestrator(chatPanel);
    chatPanel.webview.html = getWebviewContent();

    chatPanel.webview.onDidReceiveMessage(
        async message => {
            if (message.command === 'userMessage') {
                await handleUserMessage(message.text);
            }
        },
        undefined,
        context.subscriptions
    );

    chatPanel.onDidDispose(() => {
        chatPanel = undefined;
        orchestrator = undefined;
    }, null, context.subscriptions);
}

async function handleUserMessage(text: string): Promise<void> {
    if (!chatPanel || !orchestrator) return;

    // Display user message
    chatPanel.webview.postMessage({
        command: 'append',
        text: `👤 ${text}`
    });

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
        // Call your working intent interpreter
        chatPanel.webview.postMessage({
            command: 'append',
            text: '🤔 Interpreting intent...'
        });

        const response = await fetch('http://localhost:8000/api/v1/intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const intent: ParsedIntent = await response.json();

        // Execute the plan using your discovered tools
        await orchestrator.executePlan(intent);

    } catch (error) {
        chatPanel.webview.postMessage({
            command: 'append',
            text: `💥 Error: ${error}`
        });
    }
}

function getWebviewContent(): string {
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
            </style>
        </head>
        <body>
            <div id="chat"></div>
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
                        chatDiv.textContent += message.text + '\\n';
                        chatDiv.scrollTop = chatDiv.scrollHeight;
                    }
                });
            </script>
        </body>
        </html>
    `;
}

export function deactivate() {
    if (chatPanel) {
        chatPanel.dispose();
    }
}

