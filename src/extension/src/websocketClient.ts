// File: src/extension/src/websocketClient.ts - VSCODIUM 403 FIX VERSION
import * as vscode from 'vscode';

export class AideWebSocket {
    private ws?: any;
    private registry: any[] = [];
    private reconnectInterval?: NodeJS.Timeout;
    private maxReconnectAttempts = 10;
    private reconnectAttempts = 0;
    private reconnectDelay = 5000;
    private maxReconnectDelay = 30000;
    private isManuallyDisconnected = false;
    private connectionUrl = 'ws://127.0.0.1:8000/ws';

    connect(url = 'ws://127.0.0.1:8000/ws') {
        this.connectionUrl = url;
        this.isManuallyDisconnected = false;
        
        try {
            const WebSocket = require('ws');
            
            // 🚨 THE KEY 403 FIX - VSCodium-specific headers 🚨
            this.ws = new WebSocket(url, {
                headers: {
                    'Origin': 'vscode-webview',
                    'User-Agent': 'VSCodium-AIDE-Extension/1.6.0',
                    'Sec-WebSocket-Version': '13',
                    'Sec-WebSocket-Key': Buffer.from('VSCodium-AIDE-' + Date.now()).toString('base64'),
                    'Upgrade': 'websocket',
                    'Connection': 'Upgrade',
                    'Access-Control-Request-Headers': '*',
                    'Access-Control-Request-Method': 'GET'
                },
                rejectUnauthorized: false // For development
            });
            
            this.ws.on('open', () => {
                console.log('🔌 AIDE WebSocket connected to VSCodium');
                vscode.window.showInformationMessage('🔌 AIDE WebSocket connected successfully!');
                
                // Reset reconnect state on successful connection
                this.reconnectAttempts = 0;
                this.reconnectDelay = 5000;
                
                if (this.reconnectInterval) {
                    clearInterval(this.reconnectInterval);
                    this.reconnectInterval = undefined;
                }
            });

            this.ws.on('message', (data: Buffer) => {
                try {
                    const msg = JSON.parse(data.toString());
                    this.handleMessage(msg);
                } catch (e) {
                    console.error('Failed to parse WebSocket message:', e);
                }
            });

            this.ws.on('close', (code: number, reason: string) => {
                console.log(`🔌 AIDE WebSocket disconnected: ${code} - ${reason}`);
                
                if (!this.isManuallyDisconnected) {
                    if (code === 1006) {
                        console.log('🔌 Connection closed abnormally - likely 403/network issue');
                        vscode.window.showWarningMessage(
                            '🔌 WebSocket connection lost (403/network). Retrying with different approach...'
                        );
                    }
                    this.attemptReconnect();
                }
            });

            this.ws.on('error', (error: any) => {
                console.error('🔌 AIDE WebSocket error:', error);
                
                if (error.message && error.message.includes('403')) {
                    vscode.window.showErrorMessage(
                        '🚫 WebSocket 403 Forbidden - Backend CORS issue detected',
                        'Check Backend', 'Restart Backend', 'Try Different Port'
                    ).then(selection => {
                        if (selection === 'Check Backend') {
                            this.checkBackendStatus();
                        } else if (selection === 'Restart Backend') {
                            vscode.commands.executeCommand('aide.restartBackend');
                        } else if (selection === 'Try Different Port') {
                            this.connect('ws://127.0.0.1:8001/ws');
                        }
                    });
                } else {
                    vscode.window.showErrorMessage(`WebSocket error: ${error.message || 'Unknown error'}`);
                }
            });

        } catch (error) {
            console.error('Failed to connect WebSocket:', error);
            vscode.window.showErrorMessage(`Failed to create WebSocket: ${error}`);
            if (!this.isManuallyDisconnected) {
                this.attemptReconnect();
            }
        }
    }

    private attemptReconnect() {
        // Don't reconnect if we're at max attempts
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('🔌 Max reconnect attempts reached, stopping automatic reconnection');
            vscode.window.showErrorMessage(
                `🔌 AIDE WebSocket failed to reconnect after ${this.maxReconnectAttempts} attempts. Backend may be down.`,
                'Retry Now', 'Check Backend', 'Stop Trying'
            ).then(selection => {
                if (selection === 'Retry Now') {
                    this.resetAndReconnect();
                } else if (selection === 'Check Backend') {
                    this.checkBackendStatus();
                } else if (selection === 'Stop Trying') {
                    this.stopReconnecting();
                }
            });
            return;
        }

        if (!this.reconnectInterval) {
            this.reconnectInterval = setInterval(() => {
                this.reconnectAttempts++;
                
                // Exponential backoff with jitter
                const jitter = Math.random() * 1000;
                const delay = Math.min(this.reconnectDelay + jitter, this.maxReconnectDelay);
                
                console.log(`🔄 Attempting WebSocket reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
                
                // Show progress to user
                vscode.window.setStatusBarMessage(
                    `🔄 AIDE reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
                    delay
                );
                
                // Try to connect
                this.connect(this.connectionUrl);
                
                // Increase delay for next attempt (exponential backoff)
                this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
                
            }, this.reconnectDelay);
        }
    }

    private resetAndReconnect() {
        this.reconnectAttempts = 0;
        this.reconnectDelay = 5000;
        this.stopReconnecting();
        this.connect(this.connectionUrl);
    }

    private async checkBackendStatus() {
        try {
            const response = await fetch('http://127.0.0.1:8000/health');
            if (response.ok) {
                const data = await response.json() as { status: string; websocket_enabled?: boolean; [key: string]: any };
                
                let message = `✅ Backend is responding: ${data.status}`;
                if (data.websocket_enabled) {
                    message += `\n🔌 WebSocket: ${data.websocket_enabled ? 'Enabled' : 'Disabled'}`;
                }
                
                vscode.window.showInformationMessage(
                    message,
                    'Reconnect WebSocket', 'View Full Status'
                ).then(selection => {
                    if (selection === 'Reconnect WebSocket') {
                        this.resetAndReconnect();
                    } else if (selection === 'View Full Status') {
                        vscode.window.showInformationMessage(
                            `Full Status: ${JSON.stringify(data, null, 2)}`
                        );
                    }
                });
            } else {
                vscode.window.showWarningMessage(
                    `⚠️ Backend responded with status ${response.status}`,
                    'Restart Backend'
                ).then(selection => {
                    if (selection === 'Restart Backend') {
                        vscode.commands.executeCommand('aide.restartBackend');
                    }
                });
            }
        } catch (error) {
            vscode.window.showErrorMessage(
                `❌ Backend is not responding. Please check if the server is running on port 8000.`,
                'Restart Backend', 'Try Different Port'
            ).then(selection => {
                if (selection === 'Restart Backend') {
                    vscode.commands.executeCommand('aide.restartBackend');
                } else if (selection === 'Try Different Port') {
                    this.connect('ws://127.0.0.1:8001/ws');
                }
            });
        }
    }

    private stopReconnecting() {
        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = undefined;
        }
        this.isManuallyDisconnected = true;
    }

    private handleMessage(msg: any) {
        switch (msg.type) {
            case 'registry':
                this.registry = msg.tools;
                const toolNames = this.registry.map(t => t.name).join(', ');
                console.log(`🛠️ Tools available: ${toolNames}`);
                vscode.window.showInformationMessage(
                    `🛠️ ${this.registry.length} tools loaded: ${toolNames.substring(0, 100)}${toolNames.length > 100 ? '...' : ''}`
                );
                break;
                
            case 'response':
                if (msg.mode === 'chat') {
                    vscode.window.showInformationMessage(
                        `💬 AIDE: ${msg.data.response.substring(0, 100)}${msg.data.response.length > 100 ? '...' : ''}`
                    );
                } else if (msg.mode === 'tool') {
                    vscode.window.showInformationMessage(
                        `🛠️ AIDE: ${msg.data.response.substring(0, 100)}${msg.data.response.length > 100 ? '...' : ''}`
                    );
                }
                break;
                
            case 'tool_response':
                vscode.window.showInformationMessage(
                    `✅ Tool ${msg.tool} completed: ${JSON.stringify(msg.result).substring(0, 100)}...`
                );
                break;
                
            case 'error':
                vscode.window.showErrorMessage(`❌ AIDE Error: ${msg.message}`);
                break;
        }
    }

    query(message: string) {
        if (!this.isConnected()) {
            vscode.window.showWarningMessage(
                '🔌 WebSocket not connected. Attempting to reconnect...',
                'Reconnect Now'
            ).then(selection => {
                if (selection === 'Reconnect Now') {
                    this.resetAndReconnect();
                }
            });
            return;
        }

        const context = {
            workspace_folders: vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) || [],
            active_file: vscode.window.activeTextEditor?.document.uri.fsPath || null,
            selection: vscode.window.activeTextEditor?.selection,
            language: vscode.window.activeTextEditor?.document.languageId
        };

        this.send({
            type: 'query',
            message,
            context
        });
    }

    invoke(tool: string, args: any = {}) {
        if (!this.isConnected()) {
            vscode.window.showWarningMessage('🔌 WebSocket not connected');
            return;
        }
        this.send({ type: 'invoke', tool, args });
    }

    propose(name: string, code: string) {
        if (!this.isConnected()) {
            vscode.window.showWarningMessage('🔌 WebSocket not connected');
            return;
        }
        this.send({ type: 'propose_new_tool', name, code });
    }

    private send(data: any) {
        if (this.ws && this.ws.readyState === 1) { // 1 = OPEN state
            this.ws.send(JSON.stringify(data));
        } else {
            vscode.window.showWarningMessage('🔌 WebSocket not ready - check connection');
        }
    }

    private isConnected(): boolean {
        return this.ws && this.ws.readyState === 1;
    }

    getRegistry() {
        return this.registry;
    }

    disconnect() {
        this.isManuallyDisconnected = true;
        this.stopReconnecting();
        if (this.ws) {
            this.ws.close();
        }
    }

    // New method to manually trigger reconnection
    forceReconnect() {
        this.resetAndReconnect();
    }

    // Method to test connection without full reconnect
    async testConnection(): Promise<boolean> {
        try {
            const response = await fetch('http://127.0.0.1:8000/health');
            return response.ok;
        } catch {
            return false;
        }
    }
}
