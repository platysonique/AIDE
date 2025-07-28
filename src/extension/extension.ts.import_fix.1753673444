import { IntentPipeline } from './src/pipeline/intentPipeline';

import * as vscode from 'vscode';
import { launchBackend } from './src/backendManager';
import { registerCommands } from './src/commands';
import { initSpeechUI } from './src/speechUI';
import { initIngestUI } from './src/ingestUI';
import { initCodeReviewUI } from './src/codeReviewUI';
import { initDebugGuideUI } from './src/debugGuideUI';
import { initMemoryUI } from './src/memoryUI';
import { initChatPanel } from './src/chatPanel';
import { ChatWebviewProvider } from './src/chatWebviewProvider';
import { ToolsWebviewProvider } from './src/toolsWebviewProvider';
import * as fs from 'fs';
import * as path from 'path';

// Enhanced Universal Communication Interfaces
interface DiagnosticDump {
    message: string;
    severity: number;
    range_start: number;
    range_end: number;
}

interface WorkspaceContext {
    openFiles: string[];
    currentFile?: string;
    language?: string;
    projectType?: string;
    hasPackageJson: boolean;
    hasTsConfig: boolean;
    folderStructure: string[];
}

interface IntentRequest {
    user_text: string;
    diagnostics: DiagnosticDump[];
    selection: string;
    fileName: string;
    workspace_context: WorkspaceContext;
    conversation_history: string[];
    intent_type: 'code' | 'chat' | 'file' | 'learning' | 'creative' | 'research';
}

interface ParsedIntent {
    intent: string;
    scope: 'file' | 'workspace' | 'selection' | 'global';
    auto_fix: boolean;
    tools_needed: string[];
    confidence: number;
    context_hints?: string[];
    response_type: 'action' | 'explanation' | 'creation' | 'conversation';
    requires_context: boolean;
}


// Global enhanced pipeline instance
let pipeline: UniversalIntentPipeline;

export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 AIDE Universal Intelligence Pipeline activating...');
    
    try {
        launchBackend(context);
        registerCommands(context);
        
        // Initialize ALL UI components
        initSpeechUI(context);
        initIngestUI(context);
        initCodeReviewUI(context);
        initDebugGuideUI(context);
        initMemoryUI(context);
        
        // Initialize enhanced pipeline FIRST
        const pipeline = new IntentPipeline();

        // Register webview providers with enhanced pipeline
        const chatProvider = new ChatWebviewProvider(context, pipeline);
        const toolsProvider = new ToolsWebviewProvider(context);
        
        vscode.window.registerWebviewViewProvider('aide.chatView', chatProvider);
        vscode.window.registerWebviewViewProvider('aide.toolsView', toolsProvider);
        
        // Initialize chat panel after providers
        initChatPanel(context);
        
        // Enhanced command registration
        const openChatDisposable = vscode.commands.registerCommand('aide.openChat', () =>
            vscode.commands.executeCommand('workbench.view.extension.aideChatContainer')
        );
        context.subscriptions.push(openChatDisposable);

        // Add speech and ingest buttons to command palette and status bar
        const speechCommand = vscode.commands.registerCommand('aide.speechInput', () => {
            vscode.window.showInformationMessage('🎤 Speech input activated! (Feature coming soon)');
        });
        
        const ingestCommand = vscode.commands.registerCommand('aide.bookIngest', () => {
            vscode.window.showInformationMessage('📚 Book ingest activated! (Feature coming soon)');
        });
        
        context.subscriptions.push(speechCommand, ingestCommand);

        context.subscriptions.push(
            vscode.commands.registerCommand('aide.intentExecute', async () => {
                try {
                    const userInput = await vscode.window.showInputBox({
                        prompt: '🎯 What would you like AIDE to do? (I can code, explain, create, chat, or research!)',
                        placeHolder: 'e.g., "format my code", "explain this function", "create a README", "how are you?"',
                        ignoreFocusOut: true
                    });

                    if (userInput?.trim()) {
                        await pipeline.executeIntent(userInput.trim());
                    }
                } catch (error) {
                    console.error('Intent execute command failed:', error);
                    vscode.window.showErrorMessage(`Failed to execute intent: ${error}`);
                }
            }),

            // Enhanced quick commands
            vscode.commands.registerCommand('aide.formatCode', async () => {
                try {
                    await pipeline.executeIntent('format and clean up my code with best practices');
                } catch (error) {
                    console.error('Format code command failed:', error);
                }
            }),

            vscode.commands.registerCommand('aide.fixErrors', async () => {
                try {
                    await pipeline.executeIntent('analyze and fix all the errors and issues in my code');
                } catch (error) {
                    console.error('Fix errors command failed:', error);
                }
            }),

            vscode.commands.registerCommand('aide.runTests', async () => {
                try {
                    await pipeline.executeIntent('run all tests and show me the results');
                } catch (error) {
                    console.error('Run tests command failed:', error);
                }
            }),

            // New enhanced commands
            vscode.commands.registerCommand('aide.explainCode', async () => {
                try {
                    await pipeline.executeIntent('explain the current code and what it does');
                } catch (error) {
                    console.error('Explain code command failed:', error);
                }
            }),

            vscode.commands.registerCommand('aide.generateDocs', async () => {
                try {
                    await pipeline.executeIntent('create documentation for this project');
                } catch (error) {
                    console.error('Generate docs command failed:', error);
                }
            })
        );

        // Enhanced status bar with more options
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.text = '$(robot) AIDE';
        statusBarItem.tooltip = 'AIDE Universal AI Assistant - Click for quick access!';
        statusBarItem.command = 'aide.intentExecute';
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);

        // Enhanced welcome message
        vscode.window.showInformationMessage(
            'AIDE Universal Intelligence is ready! 🚀 I can code, explain, create, chat, research, and much more!',
            'Open Chat',
            'Try Smart Intent',
            'Format Code',
            'Explain Code',
            'Generate Docs'
        ).then(selection => {
            switch(selection) {
                case 'Open Chat':
                    vscode.commands.executeCommand('aide.openChat');
                    break;
                case 'Try Smart Intent':
                    vscode.commands.executeCommand('aide.intentExecute');
                    break;
                case 'Format Code':
                    vscode.commands.executeCommand('aide.formatCode');
                    break;
                case 'Explain Code':
                    vscode.commands.executeCommand('aide.explainCode');
                    break;
                case 'Generate Docs':
                    vscode.commands.executeCommand('aide.generateDocs');
                    break;
            }
        });

        console.log('✅ AIDE Universal Intelligence activation complete! Ready for any task! 🎯');
        
    } catch (error) {
        console.error('AIDE activation failed:', error);
        vscode.window.showErrorMessage(`AIDE failed to activate: ${error}`);
    }
}

export function deactivate() {
    console.log('🔴 AIDE Universal Intelligence deactivated');
}

