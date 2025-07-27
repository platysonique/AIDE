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

// Complete Intent Pipeline Implementation
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
    context_hints?: string[]; // Made optional as suggested
}

class IntentPipeline {
    private async callBackend(payload: IntentRequest): Promise<ParsedIntent> {
        try {
            const response = await fetch('http://localhost:8000/api/v1/intent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                throw new Error(`Backend error: ${response.status} ${response.statusText}`);
            }

            // 🎯 HERE'S THE FIX - Type assertion moved to the JSON parsing line
            const result = await response.json() as ParsedIntent;
            // Validate the response structure
            if (!result.intent || !Array.isArray(result.tools_needed)) {
                throw new Error('Invalid response from backend');
            }

            return result; // No need for type assertion here anymore
        } catch (error: any) {
            // Fallback response if backend is down
            return {
                intent: 'general_help',
                scope: 'file',
                auto_fix: false,
                tools_needed: ['formatter'],
                confidence: 0.5,
                context_hints: ['backend_offline']
            };
        }
    }

    private async discoverAndExecuteTools(toolsNeeded: string[]): Promise<number> {
        const commands = await vscode.commands.getCommands(true);
        let executed = 0;

        for (const tool of toolsNeeded) {
            try {
                switch (tool) {
                    // 🎯 CONVERSATIONAL INTENTS - NEW!
                    case 'general_help':
                    case 'chat':
                    case 'help_system':
                    case 'documentation':
                        const responses = [
                            "Hey there! I'm doing fantastic, thanks for asking! 🤖 Ready to help you automate some VS Code magic. Try: 'format my code', 'fix my errors', or 'run tests'!",
                            "All systems operational! 🚀 How can I help you with your code today?",
                            "Doing great! 💪 What would you like me to automate in VS Code?",
                            "I'm excellent, boss! 🔥 Ready to turn your natural language into code automation. What can I do for you?"
                        ];
                        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
                        vscode.window.showInformationMessage(randomResponse);
                        executed++;
                        break;

                    // 🔧 CODE AUTOMATION INTENTS - ENHANCED!
                    case 'formatter':
                        if (commands.includes('editor.action.formatDocument')) {
                            await vscode.commands.executeCommand('editor.action.formatDocument');
                            vscode.window.showInformationMessage('🎯 Code formatted successfully!');
                            executed++;
                        } else if (commands.includes('prettier.forceFormatDocument')) {
                            await vscode.commands.executeCommand('prettier.forceFormatDocument');
                            vscode.window.showInformationMessage('🎯 Prettier formatting applied!');
                            executed++;
                        } else {
                            vscode.window.showWarningMessage('⚠️ No formatters found. Install Prettier or enable built-in formatter.');
                        }
                        break;

                    case 'linter':
                    case 'auto_fix':
                        if (commands.includes('editor.action.fixAll')) {
                            await vscode.commands.executeCommand('editor.action.fixAll');
                            vscode.window.showInformationMessage('🔧 Auto-fixes applied!');
                            executed++;
                        } else if (commands.includes('eslint.executeAutofix')) {
                            await vscode.commands.executeCommand('eslint.executeAutofix');
                            vscode.window.showInformationMessage('🔧 ESLint fixes applied!');
                            executed++;
                        } else {
                            vscode.window.showWarningMessage('⚠️ No linters found. Install ESLint or enable built-in linting.');
                        }
                        break;

                    case 'indent_checker':
                        if (commands.includes('editor.action.indentLines')) {
                            await vscode.commands.executeCommand('editor.action.indentLines');
                            vscode.window.showInformationMessage('📏 Indentation fixed!');
                            executed++;
                        } else if (commands.includes('editor.action.reindentlines')) {
                            await vscode.commands.executeCommand('editor.action.reindentlines');
                            vscode.window.showInformationMessage('📏 Re-indentation complete!');
                            executed++;
                        }
                        break;

                    case 'style_guide':
                        if (commands.includes('eslint.executeAutofix')) {
                            await vscode.commands.executeCommand('eslint.executeAutofix');
                            vscode.window.showInformationMessage('✨ Style guide fixes applied!');
                            executed++;
                        } else if (commands.includes('editor.action.formatDocument')) {
                            await vscode.commands.executeCommand('editor.action.formatDocument');
                            vscode.window.showInformationMessage('✨ Basic style formatting applied!');
                            executed++;
                        }
                        break;

                    case 'test_runner':
                        if (commands.includes('test-explorer.run-all')) {
                            await vscode.commands.executeCommand('test-explorer.run-all');
                            vscode.window.showInformationMessage('🧪 Running all tests via Test Explorer!');
                            executed++;
                        } else if (commands.includes('npm.runTest')) {
                            await vscode.commands.executeCommand('npm.runTest');
                            vscode.window.showInformationMessage('🧪 Running npm tests!');
                            executed++;
                        } else if (commands.includes('workbench.action.tasks.runTask')) {
                            // Try to run a generic test task
                            await vscode.commands.executeCommand('workbench.action.tasks.runTask');
                            vscode.window.showInformationMessage('🧪 Test task selector opened!');
                            executed++;
                        } else {
                            vscode.window.showWarningMessage('⚠️ No test runners found. Configure Jest, Mocha, or npm test scripts.');
                        }
                        break;

                    case 'search':
                        if (commands.includes('workbench.action.findInFiles')) {
                            await vscode.commands.executeCommand('workbench.action.findInFiles');
                            vscode.window.showInformationMessage('🔍 Search panel opened!');
                            executed++;
                        } else if (commands.includes('workbench.action.quickOpen')) {
                            await vscode.commands.executeCommand('workbench.action.quickOpen');
                            vscode.window.showInformationMessage('🔍 Quick Open activated!');
                            executed++;
                        }
                        break;

                    case 'refactor_tools':
                        if (commands.includes('editor.action.refactor')) {
                            await vscode.commands.executeCommand('editor.action.refactor');
                            vscode.window.showInformationMessage('🔄 Refactoring menu opened!');
                            executed++;
                        } else if (commands.includes('editor.action.quickFix')) {
                            await vscode.commands.executeCommand('editor.action.quickFix');
                            vscode.window.showInformationMessage('🔄 Quick fixes available!');
                            executed++;
                        }
                        break;

                    case 'diagnostics':
                        if (commands.includes('editor.action.marker.nextInFiles')) {
                            await vscode.commands.executeCommand('editor.action.marker.nextInFiles');
                            vscode.window.showInformationMessage('🔍 Navigating to next diagnostic!');
                            executed++;
                        } else if (commands.includes('workbench.actions.view.problems')) {
                            await vscode.commands.executeCommand('workbench.actions.view.problems');
                            vscode.window.showInformationMessage('🔍 Problems panel opened!');
                            executed++;
                        }
                        break;

                    default:
                        // Handle unknown tools gracefully
                        console.log(`Unknown tool requested: ${tool}`);
                        vscode.window.showInformationMessage(`🤔 I don't know how to handle "${tool}" yet, but I'm learning!`);
                        break;
                }
            } catch (error) {
                console.error(`Failed to execute tool ${tool}:`, error);
                vscode.window.showErrorMessage(`❌ Failed to execute ${tool}: ${error}`);
                // Continue with other tools even if one fails
            }
        }

        return executed;
    }

    async executeIntent(userText: string): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;
        // Build payload for your working backend
        const payload: IntentRequest = {
            user_text: userText,
            diagnostics: activeEditor
                ? vscode.languages.getDiagnostics(activeEditor.document.uri).map(diag => ({
                    message: diag.message,
                    severity: diag.severity,
                    range_start: diag.range.start.character,
                    range_end: diag.range.end.character
                }))
                : [],
            selection: activeEditor ? activeEditor.document.getText(activeEditor.selection) : '',
            fileName: activeEditor ? activeEditor.document.fileName : ''
        };

        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "🎯 AIDE Intent Pipeline",
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ increment: 20, message: "Interpreting intent..." });
                // Call your enhanced intent interpreter
                const intent = await this.callBackend(payload);

                progress.report({
                    increment: 40,
                    message: `Intent: ${intent.intent} (${Math.round(intent.confidence * 100)}% confidence)`
                });

                progress.report({ increment: 60, message: "Executing tools..." });
                // Execute discovered tools
                const executedCount = await this.discoverAndExecuteTools(intent.tools_needed);

                // Auto-fix if requested
                if (intent.auto_fix && executedCount > 0) {
                    try {
                        await vscode.commands.executeCommand('editor.action.fixAll');
                        progress.report({ increment: 90, message: "Applied auto-fixes..." });
                    } catch (error) {
                        console.log('Auto-fix failed:', error);
                    }
                }

                progress.report({ increment: 100, message: `Completed! Executed ${executedCount} tools.` });

                // Show success message
                const message = executedCount > 0
                    ? `🎉 AIDE executed ${executedCount} tools for "${intent.intent}" with ${Math.round(intent.confidence * 100)}% confidence!`
                    : `🤖 AIDE analyzed "${intent.intent}" but no matching tools were found. Confidence: ${Math.round(intent.confidence * 100)}%`;

                vscode.window.showInformationMessage(message, 'Run Another').then(selection => {
                    if (selection === 'Run Another') {
                        vscode.commands.executeCommand('aide.intentExecute');
                    }
                });

            } catch (error: any) {
                progress.report({ increment: 100, message: "Failed" });
                vscode.window.showErrorMessage(`❌ Intent pipeline failed: ${error.message}`);
                console.error('Intent pipeline error:', error);
            }
        });
    }
}

// Global pipeline instance
let pipeline: IntentPipeline;

export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 AIDE Intent → Tool → Execution pipeline activating...');
    
    try {
        // Launch backend server
        launchBackend(context);
        
        // Register all commands
        registerCommands(context);
        
        // Initialize all UI components
        initSpeechUI(context);
        initIngestUI(context);
        initCodeReviewUI(context);
        initDebugGuideUI(context);
        initMemoryUI(context);
        
        // Initialize the chat panel (sidebar view)
        initChatPanel(context);
        
        // Register command to open the chat panel
        const openChatDisposable = vscode.commands.registerCommand('aide.openChat', () =>
            vscode.commands.executeCommand('workbench.view.extension.aideChatContainer')
        );
        context.subscriptions.push(openChatDisposable);

        // Initialize intent pipeline
        pipeline = new IntentPipeline();

        // 🎯 WEBVIEW PROVIDER REGISTRATION - CRITICAL FOR CHAT PANEL:
        const chatProvider = new ChatWebviewProvider(context);
        const toolsProvider = new ToolsWebviewProvider(context);
        
        vscode.window.registerWebviewViewProvider('aide.chatView', chatProvider);
        vscode.window.registerWebviewViewProvider('aide.toolsView', toolsProvider);

        // Register all Intent Pipeline commands
        context.subscriptions.push(
            // Main intent pipeline command
            vscode.commands.registerCommand('aide.intentExecute', async () => {
                try {
                    const userInput = await vscode.window.showInputBox({
                        prompt: '🎯 What would you like AIDE to do?',
                        placeHolder: 'e.g., format my code, fix errors, run tests...',
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

            // Quick action commands
            vscode.commands.registerCommand('aide.formatCode', async () => {
                try {
                    await pipeline.executeIntent('format my code');
                } catch (error) {
                    console.error('Format code command failed:', error);
                }
            }),

            vscode.commands.registerCommand('aide.fixErrors', async () => {
                try {
                    await pipeline.executeIntent('fix my errors');
                } catch (error) {
                    console.error('Fix errors command failed:', error);
                }
            }),

            vscode.commands.registerCommand('aide.runTests', async () => {
                try {
                    await pipeline.executeIntent('run my tests');
                } catch (error) {
                    console.error('Run tests command failed:', error);
                }
            })
        );

        // Status bar with direct access
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.text = '$(robot) AIDE';
        statusBarItem.tooltip = 'Click to run Intent → Tool → Execution pipeline';
        statusBarItem.command = 'aide.intentExecute';
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);

        // Show welcome message on first activation
        vscode.window.showInformationMessage(
            'AIDE is ready! Use the chat panel in the sidebar or run "AIDE: Agentic Intent" to get started.',
            'Open Chat Panel',
            'Try Intent Pipeline',
            'Format Code',
            'Fix Errors'
        ).then(selection => {
            switch(selection) {
                case 'Open Chat Panel':
                    vscode.commands.executeCommand('aide.openChat');
                    break;
                case 'Try Intent Pipeline':
                    vscode.commands.executeCommand('aide.intentExecute');
                    break;
                case 'Format Code':
                    vscode.commands.executeCommand('aide.formatCode');
                    break;
                case 'Fix Errors':
                    vscode.commands.executeCommand('aide.fixErrors');
                    break;
            }
        });

        console.log('✅ AIDE activation complete! Intent → Tool → Execution pipeline online.');
        
    } catch (error) {
        console.error('AIDE activation failed:', error);
        vscode.window.showErrorMessage(`AIDE failed to activate: ${error}`);
    }
}

export function deactivate() {
    console.log('🔴 AIDE extension deactivated');
}

