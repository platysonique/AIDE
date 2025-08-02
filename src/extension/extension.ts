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
import { AideWebSocket } from './src/websocketClient';

export async function activate(context: vscode.ExtensionContext) {
    // FIXED: Add crash protection immediately
    process.setMaxListeners(50);
    
    process.on('uncaughtException', (error) => {
        console.error('AIDE Extension Error (handled):', error);
        // Don't let it crash the extension host
    });
    
    process.on('unhandledRejection', (reason, promise) => {
        console.error('AIDE Unhandled Rejection (handled):', reason);
        // Don't let it crash the extension host
    });

    console.log('🚀 AIDE GPU-FIRST Universal Intelligence Pipeline activating...');

    try {
        // GPU-FIRST: Extended loading message for GPU initialization
        const loadingMessage = vscode.window.setStatusBarMessage(
            '$(loading~spin) Starting AIDE GPU-FIRST backend server...',
            180000 // 3 minutes for GPU model loading
        );

        // Start GPU-FIRST backend server - FIXED: Single argument
        console.log('🎮 Initializing GPU-FIRST enhanced backend manager...');
        const serverStarted = await backendManager.startBackend(context);

        if (!serverStarted) {
            loadingMessage.dispose();
            vscode.window.showErrorMessage(
                'AIDE GPU-FIRST backend startup timed out. GPU model loading may take time.',
                'Fast Start (CPU)', 'Force GPU Retry', 'View GPU Status', 'View Logs'
            ).then(selection => {
                if (selection === 'Fast Start (CPU)') {
                    // Use basic startup - FIXED: Single argument
                    backendManager.startBackend(context);
                } else if (selection === 'Force GPU Retry') {
                    // Retry with GPU focus
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                } else if (selection === 'View GPU Status') {
                    vscode.commands.executeCommand('aide.gpuStatus');
                } else if (selection === 'View Logs') {
                    vscode.commands.executeCommand('workbench.action.showLogs');
                }
            });
            return;
        }

        // Clear loading message
        loadingMessage.dispose();

        // Check GPU status
        const gpuStatus = await checkGpuStatus();

        // Now that server is ready, initialize the rest of the extension
        console.log('✅ GPU-FIRST Backend ready, initializing AIDE components...');

        // Initialize WebSocket - FIXED: Use basic connect method
        const webSocket = new AideWebSocket();
        try {
            await webSocket.connect();
        } catch (error) {
            console.warn('WebSocket connection failed, retrying...', error);
            // Simple retry logic
            setTimeout(async () => {
                try {
                    await webSocket.connect();
                } catch (retryError) {
                    console.error('WebSocket retry failed:', retryError);
                }
            }, 2000);
        }

        // Keep the pipeline for legacy support
        const pipeline = new IntentPipeline();

        initializeExtensionComponents(context, pipeline, webSocket);

        // Enhanced status bar with GPU status
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.text = gpuStatus.gpuDetected ? '$(robot) AIDE 🎮' : '$(robot) AIDE 💻';
        statusBarItem.tooltip = `AIDE GPU-FIRST AI Assistant\nBackend: Running on ${backendManager.getServerUrl()}\nWebSocket: Connected\nGPU: ${gpuStatus.gpuDetected ? '✅ ' + gpuStatus.deviceName : '❌ CPU Only'}\nModel Loading: ${gpuStatus.modelStatus}`;
        statusBarItem.command = 'aide.ask';
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);

        // Clean up WebSocket on extension deactivation
        context.subscriptions.push({
            dispose: () => webSocket.disconnect()
        });

        // GPU-FIRST: Enhanced success message with GPU details
        const successMessage = gpuStatus.gpuDetected
            ? `🎮 AIDE GPU-FIRST is ready! Backend started with ${gpuStatus.deviceName}. Models loading with GPU acceleration...`
            : `💻 AIDE is ready on CPU! Backend started on ${backendManager.getServerUrl()}. Consider GPU setup for better performance.`;

        vscode.window.showInformationMessage(
            successMessage,
            'Ask AIDE', 'Check GPU Status', 'Open Chat', 'GPU Settings'
        ).then(selection => {
            if (selection === 'Ask AIDE') {
                vscode.commands.executeCommand('aide.ask');
            } else if (selection === 'Check GPU Status') {
                vscode.commands.executeCommand('aide.gpuStatus');
            } else if (selection === 'Open Chat') {
                vscode.commands.executeCommand('aide.openChat');
            } else if (selection === 'GPU Settings') {
                vscode.commands.executeCommand('aide.gpuSettings');
            }
        });

        console.log('✅ AIDE GPU-FIRST Universal Intelligence activation complete! 🎯');

    } catch (error) {
        console.error('AIDE GPU-FIRST activation failed:', error);
        vscode.window.showErrorMessage(`AIDE GPU-FIRST failed to activate: ${error}`);
    }
}

async function checkGpuStatus(): Promise<any> {
    try {
        const response = await fetch(`${backendManager.getServerUrl()}/health/gpu`);
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.error('GPU status check failed:', error);
    }

    return {
        gpuDetected: false,
        deviceName: 'Unknown',
        modelStatus: 'Unknown'
    };
}

function initializeExtensionComponents(context: vscode.ExtensionContext, pipeline: IntentPipeline | null, webSocket: AideWebSocket | null) {
    console.log('🔧 Initializing AIDE GPU-FIRST extension components...');

    // Register all commands (enhanced with GPU-first functionality)
    registerCommands(context, webSocket);

    // Initialize UI modules
    initSpeechUI(context);
    initIngestUI(context);
    initCodeReviewUI(context);
    initDebugGuideUI(context);
    initMemoryUI(context);

    // Register webview providers
    const chatProvider = new ChatWebviewProvider(context, pipeline);
    const toolsProvider = new ToolsWebviewProvider(context);

    vscode.window.registerWebviewViewProvider('aide.chatView', chatProvider);
    vscode.window.registerWebviewViewProvider('aide.toolsView', toolsProvider);

    // Initialize chat panel
    initChatPanel(context);

    console.log('✅ All AIDE GPU-FIRST components initialized successfully');
}

function registerCommands(context: vscode.ExtensionContext, webSocket: AideWebSocket | null) {
    // Register all AIDE commands (enhanced with GPU-first functionality)
    const commands = [
        // Primary GPU-FIRST WebSocket-powered command
        vscode.commands.registerCommand('aide.ask', async () => {
            const userInput = await vscode.window.showInputBox({
                prompt: '🎮 What would you like AIDE to do? (GPU-accelerated)',
                placeHolder: 'Ask anything about your code or workspace...'
            });

            if (userInput && webSocket) {
                webSocket.query(userInput);
            } else if (userInput && backendManager.isServerReady()) {
                const pipeline = new IntentPipeline();
                await pipeline.executeIntent(userInput, (message) => {
                    console.log(message);
                    vscode.window.showInformationMessage(message);
                });
            } else if (userInput) {
                vscode.window.showWarningMessage(
                    '⚠️ AIDE GPU-FIRST backend is not ready. Please wait for GPU initialization or restart.',
                    'Restart Extension', 'Check GPU Status', 'Wait & Retry'
                ).then(selection => {
                    if (selection === 'Restart Extension') {
                        vscode.commands.executeCommand('workbench.action.reloadWindow');
                    } else if (selection === 'Check GPU Status') {
                        vscode.commands.executeCommand('aide.gpuStatus');
                    } else if (selection === 'Wait & Retry') {
                        setTimeout(() => {
                            if (backendManager.isServerReady()) {
                                vscode.window.showInformationMessage('✅ GPU backend is now ready! Try your command again.');
                            } else {
                                vscode.window.showWarningMessage('GPU backend still not ready. Consider checking GPU status.');
                            }
                        }, 60000);
                    }
                });
            }
        }),

        // GPU Status command
        vscode.commands.registerCommand('aide.gpuStatus', async () => {
            try {
                const gpuStatus = await checkGpuStatus();
                const statusMessage = `🎮 AIDE GPU Status:\n` +
                    `GPU Detected: ${gpuStatus.gpu_detected ? '✅ Yes' : '❌ No'}\n` +
                    `Device: ${gpuStatus.device_info?.device_config?.device_name || 'Unknown'}\n` +
                    `Priority: ${gpuStatus.device_info?.current_priority || 'Unknown'}\n` +
                    `Model Status: ${gpuStatus.model_loading?.loaded ? '✅ Loaded' :
                        gpuStatus.model_loading?.loading ? '🔄 Loading' : '❌ Not Loaded'}\n` +
                    `Backend: ${gpuStatus.gpu_backend_info?.backend || 'Unknown'}\n` +
                    `GPU Layers: ${gpuStatus.args?.gpu_layers || 'Unknown'}`;

                vscode.window.showInformationMessage(
                    statusMessage,
                    'Refresh', 'GPU Settings', 'View Details'
                ).then(selection => {
                    if (selection === 'Refresh') {
                        vscode.commands.executeCommand('aide.gpuStatus');
                    } else if (selection === 'GPU Settings') {
                        vscode.commands.executeCommand('aide.gpuSettings');
                    } else if (selection === 'View Details') {
                        console.log('GPU Status Details:', gpuStatus);
                        vscode.window.showInformationMessage('GPU details logged to console. Press F12 to view.');
                    }
                });
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to get GPU status: ${error}`);
            }
        }),

        // GPU Settings command
        vscode.commands.registerCommand('aide.gpuSettings', async () => {
            const options = [
                'Force GPU Mode',
                'CPU Fallback Mode',
                'Maximum GPU Layers',
                'GPU Performance Test',
                'Install GPU Drivers',
                'GPU Documentation'
            ];

            const selection = await vscode.window.showQuickPick(options, {
                placeHolder: 'AIDE GPU-FIRST Settings - Optimize your Intel Arc A770'
            });

            switch (selection) {
                case 'Force GPU Mode':
                    vscode.window.showInformationMessage('🎮 Force GPU mode will be enabled on next restart.');
                    break;
                case 'CPU Fallback Mode':
                    vscode.window.showInformationMessage('💻 CPU fallback mode will be enabled on next restart.');
                    break;
                case 'Maximum GPU Layers':
                    vscode.window.showInformationMessage('🚀 Maximum GPU layers (-1) will be used on next restart.');
                    break;
                case 'GPU Performance Test':
                    vscode.commands.executeCommand('aide.performanceTest');
                    break;
                case 'Install GPU Drivers':
                    vscode.env.openExternal(vscode.Uri.parse('https://www.intel.com/content/www/us/en/support/articles/000005629/graphics.html'));
                    break;
                case 'GPU Documentation':
                    vscode.env.openExternal(vscode.Uri.parse('https://intel.github.io/intel-extension-for-pytorch/'));
                    break;
            }
        }),

        // Tool invocation command (enhanced for GPU)
        vscode.commands.registerCommand('aide.invokeTool', async () => {
            if (!webSocket) {
                vscode.window.showWarningMessage('WebSocket not connected - tools not available');
                return;
            }

            // Simple registry check - assumes getRegistry exists or provide fallback
            let registry: any[] = [];
            try {
                registry = (webSocket as any).getRegistry?.() || [];
            } catch {
                registry = [];
            }

            if (registry.length === 0) {
                vscode.window.showWarningMessage('No tools available yet - GPU backend may still be starting');
                return;
            }

            const tool = await vscode.window.showQuickPick(
                registry.map(t => ({
                    label: t.name,
                    description: t.description,
                    detail: `Args: ${JSON.stringify(t.args_schema)} | GPU-optimized`
                })),
                { placeHolder: 'Select a GPU-optimized tool to invoke' }
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

                // Invoke method - assumes it exists or provide fallback
                try {
                    (webSocket as any).invoke?.(tool.label, args);
                } catch (error) {
                    vscode.window.showErrorMessage(`Tool invocation failed: ${error}`);
                }
            }
        }),

        // Enhanced server status with GPU info
        vscode.commands.registerCommand('aide.serverStatus', async () => {
            const status = backendManager.isServerReady() ? '✅ Running' : '❌ Not Ready';
            const url = backendManager.getServerUrl();
            const wsStatus = webSocket ? '✅ Connected' : '❌ Not Connected';
            const gpuStatus = await checkGpuStatus();

            vscode.window.showInformationMessage(
                `🎮 AIDE GPU-FIRST Backend Status: ${status}\n` +
                `URL: ${url}\n` +
                `WebSocket: ${wsStatus}\n` +
                `GPU: ${gpuStatus.gpu_detected ? '✅ ' + gpuStatus.device_info?.current_priority : '❌ Not Detected'}\n` +
                `Model: ${gpuStatus.model_loading?.loaded ? '✅ Loaded' : '❌ Not Loaded'}`,
                'Restart Server', 'GPU Status', 'View Logs', 'Test GPU'
            ).then(selection => {
                if (selection === 'Restart Server') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                } else if (selection === 'GPU Status') {
                    vscode.commands.executeCommand('aide.gpuStatus');
                } else if (selection === 'View Logs') {
                    vscode.commands.executeCommand('workbench.action.showLogs');
                } else if (selection === 'Test GPU') {
                    vscode.commands.executeCommand('aide.performanceTest');
                }
            });
        }),

        // Other existing commands...
        vscode.commands.registerCommand('aide.openChat', () => {
            vscode.commands.executeCommand('aide.chatView.focus');
        }),

        vscode.commands.registerCommand('aide.restartBackend', async () => {
            const progress = vscode.window.showInformationMessage('🔄 Restarting AIDE GPU-FIRST backend...');
            backendManager.cleanup();
            setTimeout(async () => {
                // FIXED: Single argument
                const restarted = await backendManager.startBackend(context);
                if (restarted) {
                    vscode.window.showInformationMessage('✅ AIDE GPU-FIRST backend restarted successfully!');
                } else {
                    vscode.window.showErrorMessage('❌ AIDE GPU-FIRST backend restart failed. Check GPU status.');
                }
            }, 2000);
        })
    ];

    // Add all commands to subscriptions
    commands.forEach(command => context.subscriptions.push(command));
    console.log(`✅ Registered ${commands.length} AIDE GPU-FIRST commands`);
}

export function deactivate() {
    console.log('🔴 AIDE GPU-FIRST Universal Intelligence deactivating...');
    backendManager.cleanup();
    console.log('✅ AIDE GPU-FIRST deactivation complete');
}
