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
                    initializeExtensionComponents(context, null);
                }
            });
            return;
        }
        
        // Clear loading message
        loadingMessage.dispose();
        
        // Now that server is ready, initialize the rest of the extension
        console.log('✅ Backend ready, initializing AIDE components...');
        
        // Initialize the modular pipeline
        const pipeline = new IntentPipeline();
        
        initializeExtensionComponents(context, pipeline);
        
        // Enhanced status bar with server status
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.text = '$(robot) AIDE ✅';
        statusBarItem.tooltip = `AIDE Universal AI Assistant - Backend Running on ${backendManager.getServerUrl()}`;
        statusBarItem.command = 'aide.intentExecute';
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);
        
        // Success message with server details
        vscode.window.showInformationMessage(
            `🎉 AIDE is fully loaded and ready! Backend auto-started on ${backendManager.getServerUrl()}`,
            'Open Chat', 'Try Command', 'View Status'
        ).then(selection => {
            if (selection === 'Open Chat') {
                vscode.commands.executeCommand('aide.openChat');
            } else if (selection === 'Try Command') {
                vscode.commands.executeCommand('aide.intentExecute');
            } else if (selection === 'View Status') {
                vscode.window.showInformationMessage(
                    `AIDE Status:\n` +
                    `Backend: ${backendManager.isServerReady() ? '✅ Running' : '❌ Not Ready'}\n` +
                    `Server: ${backendManager.getServerUrl()}\n` +
                    `Modular Pipeline: ✅ Active`
                );
            }
        });
        
        console.log('✅ AIDE Universal Intelligence activation complete! 🎯');
        
    } catch (error) {
        console.error('AIDE activation failed:', error);
        vscode.window.showErrorMessage(`AIDE failed to activate: ${error}`);
    }
}

function initializeExtensionComponents(context: vscode.ExtensionContext, pipeline: IntentPipeline | null) {
    console.log('🔧 Initializing AIDE extension components...');
    
    // Register all commands
    registerCommands(context);
    
    // Initialize UI modules
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

function registerCommands(context: vscode.ExtensionContext) {
    // Register all AIDE commands
    const commands = [
        vscode.commands.registerCommand('aide.intentExecute', async () => {
            const userInput = await vscode.window.showInputBox({
                prompt: '🤖 What would you like AIDE to do?',
                placeHolder: 'Type your command or question here...'
            });
            
            if (userInput) {
                if (backendManager.isServerReady()) {
                    // Execute through pipeline if backend is ready
                    const pipeline = new IntentPipeline();
                    await pipeline.executeIntent(userInput, (message) => {
                        console.log(message);
                        vscode.window.showInformationMessage(message);
                    });
                } else {
                    // Fallback handling
                    vscode.window.showWarningMessage(
                        '⚠️ AIDE backend is not ready. Please wait for the server to start or restart the extension.',
                        'Restart Extension'
                    ).then(selection => {
                        if (selection === 'Restart Extension') {
                            vscode.commands.executeCommand('workbench.action.reloadWindow');
                        }
                    });
                }
            }
        }),

        vscode.commands.registerCommand('aide.openChat', () => {
            vscode.commands.executeCommand('aide.chatView.focus');
        }),

        vscode.commands.registerCommand('aide.serverStatus', () => {
            const status = backendManager.isServerReady() ? '✅ Running' : '❌ Not Ready';
            const url = backendManager.getServerUrl();
            
            vscode.window.showInformationMessage(
                `AIDE Backend Status: ${status}\nURL: ${url}`,
                'Restart Server', 'View Logs'
            ).then(selection => {
                if (selection === 'Restart Server') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                } else if (selection === 'View Logs') {
                    vscode.commands.executeCommand('workbench.action.showLogs');
                }
            });
        }),

        // FIXED: Pass context directly instead of trying to get extensionContext property
        vscode.commands.registerCommand('aide.restartBackend', async () => {
            vscode.window.showInformationMessage('🔄 Restarting AIDE backend...');
            backendManager.cleanup();
            
            // Wait a moment then restart - FIXED: Use context parameter directly
            setTimeout(async () => {
                await backendManager.startBackend(context); // Use context parameter directly
                vscode.window.showInformationMessage('✅ AIDE backend restarted successfully!');
            }, 2000);
        }),

        vscode.commands.registerCommand('aide.manageTools', async () => {
            const options = [
                'View Available Tools',
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
                    vscode.commands.executeCommand('aide.toolsView.focus');
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
    console.log(`✅ Registered ${commands.length} AIDE commands`);
}

export function deactivate() {
    console.log('🔴 AIDE Universal Intelligence deactivating...');
    backendManager.cleanup();
    console.log('✅ AIDE deactivation complete');
}
