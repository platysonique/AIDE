import * as vscode from 'vscode';
import { backendManager } from './src/backendManager';
import { IntentPipeline } from './src/pipeline/intentPipeline';
import { initSpeechUI } from './src/ui/speechUI';
import { initIngestUI } from './src/ui/ingestUI';
import { initCodeReviewUI } from './src/ui/codeReviewUI';
import { initDebugGuideUI } from './src/ui/debugGuideUI';
import { initMemoryUI } from './src/ui/memoryUI';
import { initChatPanel } from './src/ui/chatPanel';
import { ChatWebviewProvider } from './src/ui/chatWebviewProvider';
import { ToolsWebviewProvider } from './src/ui/toolsWebviewProvider';

// NEW: Import WebSocket client
import { AideWebSocket } from './src/websocketClient';

export async function activate(context: vscode.ExtensionContext) {
    console.log('🚀 AIDE Universal Intelligence Pipeline activating...');

    try {
        // Show initial loading message
        const loadingMessage = vscode.window.setStatusBarMessage('$(loading~spin) Starting AIDE backend server...', 30000);

        // Start backend server first and wait for it to be ready
        console.log('🔧 Initializing enhanced backend manager...');
        const serverStarted = await backendManager.startBackend(context);

        if (!serverStarted) {
            loadingMessage.dispose();
            vscode.window.showErrorMessage(
                'AIDE backend failed to start. Extension will have limited functionality.',
                'Retry', 'View Logs', 'Continue Anyway'
            ).then(selection => {
                if (selection === 'Retry') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                } else if (selection === 'View Logs') {
                    vscode.commands.executeCommand('workbench.action.showLogs');
                } else if (selection === 'Continue Anyway') {
                    initializeExtensionComponents(context, null, null);
                }
            });
            return;
        }

        // Clear loading message
        loadingMessage.dispose();

        // Now that server is ready, initialize the rest of the extension
        console.log('✅ Backend ready, initializing AIDE components...');

        // NEW: Initialize WebSocket instead of just Intent Pipeline
        const webSocket = new AideWebSocket();
        webSocket.connect(); // Connects to ws://127.0.0.1:8000/ws

        // Keep the pipeline for legacy support (if needed)
        const pipeline = new IntentPipeline();
        
        initializeExtensionComponents(context, pipeline, webSocket);

        // Enhanced status bar with server status
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.text = '$(robot) AIDE ✅';
        statusBarItem.tooltip = `AIDE Universal AI Assistant - Backend Running on ${backendManager.getServerUrl()}\nWebSocket: Connected`;
        statusBarItem.command = 'aide.ask'; // Changed to use new WebSocket command
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);

        // Clean up WebSocket on extension deactivation
        context.subscriptions.push({
            dispose: () => webSocket.disconnect()
        });

        // Success message with server details
        vscode.window.showInformationMessage(
            `🎉 AIDE is fully loaded and ready! Backend auto-started on ${backendManager.getServerUrl()}`,
            'Ask AIDE', 'Open Chat', 'View Tools', 'Status'
        ).then(selection => {
            if (selection === 'Ask AIDE') {
                vscode.commands.executeCommand('aide.ask');
            } else if (selection === 'Open Chat') {
                vscode.commands.executeCommand('aide.openChat');
            } else if (selection === 'View Tools') {
                vscode.commands.executeCommand('aide.invokeTool');
            } else if (selection === 'Status') {
                vscode.window.showInformationMessage(
                    `AIDE Status:\n` +
                    `Backend: ${backendManager.isServerReady() ? '✅ Running' : '❌ Not Ready'}\n` +
                    `Server: ${backendManager.getServerUrl()}\n` +
                    `WebSocket: ✅ Connected\n` +
                    `Dynamic Tools: ✅ Active`
                );
            }
        });

        console.log('✅ AIDE Universal Intelligence activation complete! 🎯');

    } catch (error) {
        console.error('AIDE activation failed:', error);
        vscode.window.showErrorMessage(`AIDE failed to activate: ${error}`);
    }
}

function initializeExtensionComponents(context: vscode.ExtensionContext, pipeline: IntentPipeline | null, webSocket: AideWebSocket | null) {
    console.log('🔧 Initializing AIDE extension components...');

    // Register all commands (enhanced with WebSocket)
    registerCommands(context, webSocket);

    // Initialize UI modules (keeping your existing structure)
    initSpeechUI(context);
    initIngestUI(context);
    initCodeReviewUI(context);
    initDebugGuideUI(context);
    initMemoryUI(context);

    // Register webview providers with pipeline (if available)
    const chatProvider = new ChatWebviewProvider(context, pipeline);
    const toolsProvider = new ToolsWebviewProvider(context);

    vscode.window.registerWebviewViewProvider('aide.chatView', chatProvider);
    vscode.window.registerWebviewViewProvider('aide.toolsView', toolsProvider);

    // Initialize chat panel
    initChatPanel(context);

    console.log('✅ All AIDE components initialized successfully');
}

function registerCommands(context: vscode.ExtensionContext, webSocket: AideWebSocket | null) {
    // Register all AIDE commands (enhanced with WebSocket functionality)
    const commands = [
        // NEW: Primary WebSocket-powered command
        vscode.commands.registerCommand('aide.ask', async () => {
            const userInput = await vscode.window.showInputBox({
                prompt: '🤖 What would you like AIDE to do?',
                placeHolder: 'Ask anything about your code or workspace...'
            });

            if (userInput && webSocket) {
                webSocket.query(userInput); // Send via WebSocket
            } else if (userInput && backendManager.isServerReady()) {
                // Fallback to legacy pipeline if WebSocket not available
                const pipeline = new IntentPipeline();
                await pipeline.executeIntent(userInput, (message) => {
                    console.log(message);
                    vscode.window.showInformationMessage(message);
                });
            } else if (userInput) {
                vscode.window.showWarningMessage(
                    '⚠️ AIDE backend is not ready. Please wait for the server to start or restart the extension.',
                    'Restart Extension'
                ).then(selection => {
                    if (selection === 'Restart Extension') {
                        vscode.commands.executeCommand('workbench.action.reloadWindow');
                    }
                });
            }
        }),

        // NEW: Tool invocation command
        vscode.commands.registerCommand('aide.invokeTool', async () => {
            if (!webSocket) {
                vscode.window.showWarningMessage('WebSocket not connected - tools not available');
                return;
            }

            const registry = webSocket.getRegistry();
            if (registry.length === 0) {
                vscode.window.showWarningMessage('No tools available yet - backend may still be starting');
                return;
            }

            const tool = await vscode.window.showQuickPick(
                registry.map(t => ({ 
                    label: t.name, 
                    description: t.description,
                    detail: `Args: ${JSON.stringify(t.args_schema)}`
                })),
                { placeHolder: 'Select a tool to invoke' }
            );

            if (tool) {
                const argsInput = await vscode.window.showInputBox({
                    prompt: `Arguments for ${tool.label} (JSON format)`,
                    placeHolder: '{"arg1": "value1", "arg2": "value2"} or leave empty'
                });

                let args = {};
                if (argsInput && argsInput.trim()) {
                    try {
                        args = JSON.parse(argsInput);
                    } catch (e) {
                        vscode.window.showErrorMessage('Invalid JSON format for arguments');
                        return;
                    }
                }

                webSocket.invoke(tool.label, args);
            }
        }),

        // NEW: Demo command to propose a new tool
        vscode.commands.registerCommand('aide.proposeTimeTool', () => {
            if (!webSocket) {
                vscode.window.showWarningMessage('WebSocket not connected');
                return;
            }

            const code = [
                'from . import tool',
                'import datetime',
                '',
                '@tool("get_current_time", "Get the current time in multiple formats", {})',
                'def get_current_time():',
                '    """Get current time in multiple formats"""',
                '    now = datetime.datetime.now()',
                '    return {',
                '        "utc": datetime.datetime.utcnow().isoformat() + "Z",',
                '        "local": now.isoformat(),',
                '        "formatted": now.strftime("%Y-%m-%d %H:%M:%S"),',
                '        "unix": int(now.timestamp())',
                '    }'
            ].join('\n');

            webSocket.propose("get_current_time", code);
        }),

        // LEGACY: Keep existing commands for compatibility
        vscode.commands.registerCommand('aide.intentExecute', async () => {
            // Redirect to new ask command
            vscode.commands.executeCommand('aide.ask');
        }),

        vscode.commands.registerCommand('aide.openChat', () => {
            vscode.commands.executeCommand('aide.chatView.focus');
        }),

        vscode.commands.registerCommand('aide.serverStatus', () => {
            const status = backendManager.isServerReady() ? '✅ Running' : '❌ Not Ready';
            const url = backendManager.getServerUrl();
            const wsStatus = webSocket ? '✅ Connected' : '❌ Not Connected';
            
            vscode.window.showInformationMessage(
                `AIDE Backend Status: ${status}\nURL: ${url}\nWebSocket: ${wsStatus}`,
                'Restart Server', 'View Logs'
            ).then(selection => {
                if (selection === 'Restart Server') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                } else if (selection === 'View Logs') {
                    vscode.commands.executeCommand('workbench.action.showLogs');
                }
            });
        }),

        vscode.commands.registerCommand('aide.restartBackend', async () => {
            vscode.window.showInformationMessage('🔄 Restarting AIDE backend...');
            backendManager.cleanup();
            // Wait a moment then restart
            setTimeout(async () => {
                await backendManager.startBackend(context);
                vscode.window.showInformationMessage('✅ AIDE backend restarted successfully!');
            }, 2000);
        }),

        vscode.commands.registerCommand('aide.manageTools', async () => {
            const options = [
                'View Available Tools',
                'Invoke Tool',
                'Propose Time Tool (Demo)',
                'Hide Extension Tools',
                'Show Hidden Tools',
                'Reset Tool Preferences',
                'Extension Marketplace'
            ];

            const selection = await vscode.window.showQuickPick(options, {
                placeHolder: 'AIDE Tool Management - Control your development toolkit'
            });

            switch (selection) {
                case 'View Available Tools':
                    if (webSocket && webSocket.getRegistry().length > 0) {
                        const tools = webSocket.getRegistry().map(t => `• ${t.name}: ${t.description}`).join('\n');
                        vscode.window.showInformationMessage(`Available Tools:\n${tools}`);
                    } else {
                        vscode.commands.executeCommand('aide.toolsView.focus');
                    }
                    break;
                case 'Invoke Tool':
                    vscode.commands.executeCommand('aide.invokeTool');
                    break;
                case 'Propose Time Tool (Demo)':
                    vscode.commands.executeCommand('aide.proposeTimeTool');
                    break;
                case 'Hide Extension Tools':
                    vscode.window.showInformationMessage('🛠️ Tool hiding interface coming soon!');
                    break;
                case 'Show Hidden Tools':
                    vscode.window.showInformationMessage('👁️ Show hidden tools interface coming soon!');
                    break;
                case 'Reset Tool Preferences':
                    vscode.window.showInformationMessage('🔄 Tool preferences reset!');
                    break;
                case 'Extension Marketplace':
                    vscode.commands.executeCommand('workbench.extensions.action.showExtensionsInstaller');
                    break;
            }
        })
    ];

    // Add all commands to subscriptions
    commands.forEach(command => context.subscriptions.push(command));
    console.log(`✅ Registered ${commands.length} AIDE commands (WebSocket enhanced)`);
}

export function deactivate() {
    console.log('🔴 AIDE Universal Intelligence deactivating...');
    backendManager.cleanup();
    console.log('✅ AIDE deactivation complete');
}
