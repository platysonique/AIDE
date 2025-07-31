import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';

// FIXED: Added proper health response interface
interface HealthResponse {
    status: string;
    message?: string;
    uptime_seconds?: number;
    server_version?: string;
    system_metrics?: {
        cpu_percent?: number;
        memory_percent?: number;
        memory_available_gb?: number;
    };
}

export class EnhancedBackendManager {
    private backendProcess: ChildProcess | null = null;
    private serverReady = false;
    private readonly serverHost = '127.0.0.1';
    private serverPort = 8000;
    private healthCheckInterval?: NodeJS.Timeout;
    private readonly MAX_RESTART_ATTEMPTS = 3;
    private restartAttempts = 0;
    private lastRestartTime = 0;
    // Request queuing for high performance
    private requestQueue: Array<{
        request: () => Promise<any>;
        resolve: (value: any) => void;
        reject: (error: any) => void;
    }> = [];
    private isProcessingQueue = false;

    async startBackend(context: vscode.ExtensionContext): Promise<boolean> {
        try {
            console.log('🚀 Starting AIDE backend with enhanced auto-recovery...');
            
            // Check if server is already running
            if (await this.isServerHealthy()) {
                console.log('🟢 AIDE backend server already running');
                this.serverReady = true;
                return true;
            }

            // Find available port
            this.serverPort = await this.findAvailablePort();
            // Find pixi command
            const pixiCommand = await this.findPixiCommand();
            // Find project root
            const workspaceRoot = this.findProjectRoot();
            if (!workspaceRoot) {
                throw new Error('Could not find AIDE project root with pixi.toml');
            }

            console.log(`🎯 Starting server on ${this.serverHost}:${this.serverPort}`);
            
            // FIXED: Start server with proper Python path and module loading
            this.backendProcess = spawn(pixiCommand, [
                'run',
                'python',
                '-m', 'src.backend.api'  // Use module syntax instead of file path
            ], {
                cwd: workspaceRoot,
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: false,
                shell: true,
                env: {
                    ...process.env,
                    AIDE_PORT: this.serverPort.toString(),
                    AIDE_HOST: this.serverHost,
                    PYTHONPATH: path.join(workspaceRoot, 'src')  // FIXED: Add proper Python path
                }
            });

            // Enhanced output monitoring
            this.setupProcessMonitoring();

            // FIXED: Wait for server with longer timeout (45 seconds instead of 30)
            const serverStarted = await this.waitForServerReady(120000);

            if (serverStarted) {
                this.startEnhancedHealthMonitoring(context);
                context.subscriptions.push({
                    dispose: () => this.cleanup()
                });
                console.log('✅ AIDE backend started with full monitoring suite');
                return true;
            } else {
                throw new Error('Server failed to start within timeout period');
            }

        } catch (error) {
            console.error('❌ Enhanced backend startup failed:', error);
            await this.handleServerFailure(context);
            return false;
        }
    }

    private async findPixiCommand(): Promise<string> {
        const possibleCommands = process.platform === 'win32'
            ? ['pixi.exe', 'pixi']
            : ['pixi'];

        for (const cmd of possibleCommands) {
            try {
                // Try to run pixi --version to test if it exists
                const testProcess = spawn(cmd, ['--version'], { stdio: 'ignore' });
                const success = await new Promise<boolean>((resolve) => {
                    testProcess.on('close', (code) => resolve(code === 0));
                    testProcess.on('error', () => resolve(false));
                    setTimeout(() => resolve(false), 3000); // 3s timeout
                });

                if (success) {
                    console.log(`✅ Found pixi command: ${cmd}`);
                    return cmd;
                }
            } catch (error) {
                continue;
            }
        }

        // Fallback: try common installation paths
        const commonPaths = process.platform === 'win32'
            ? ['C:\\Users\\%USERNAME%\\.pixi\\bin\\pixi.exe', '%USERPROFILE%\\.pixi\\bin\\pixi.exe']
            : ['/usr/local/bin/pixi', `${process.env.HOME}/.pixi/bin/pixi`];

        for (const fullPath of commonPaths) {
            const expandedPath = fullPath.replace(/%([^%]+)%/g, (_, key) => process.env[key] || '');
            if (fs.existsSync(expandedPath)) {
                console.log(`✅ Found pixi at: ${expandedPath}`);
                return expandedPath;
            }
        }

        throw new Error('Pixi command not found. Please ensure pixi is installed and in PATH.');
    }

    private async findAvailablePort(startPort: number = 8000): Promise<number> {
        for (let port = startPort; port < startPort + 100; port++) {
            const available = await new Promise<boolean>((resolve) => {
                const server = net.createServer();
                server.listen(port, () => {
                    server.close(() => resolve(true));
                });
                server.on('error', () => resolve(false));
            });

            if (available) {
                console.log(`🔌 Using port ${port} for AIDE backend`);
                return port;
            }
        }

        throw new Error('No available ports found in range 8000-8099');
    }

    private findProjectRoot(): string | null {
        // Start from extension directory and work up
        let currentDir = __dirname;
        
        // Go up from src/extension/src to project root
        for (let i = 0; i < 5; i++) {
            const pixiTomlPath = path.join(currentDir, 'pixi.toml');
            if (fs.existsSync(pixiTomlPath)) {
                console.log(`📁 Found project root: ${currentDir}`);
                return currentDir;
            }
            currentDir = path.dirname(currentDir);
        }

        // Also check workspace folders
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
            for (const folder of workspaceFolders) {
                const pixiTomlPath = path.join(folder.uri.fsPath, 'pixi.toml');
                if (fs.existsSync(pixiTomlPath)) {
                    console.log(`📁 Found project root in workspace: ${folder.uri.fsPath}`);
                    return folder.uri.fsPath;
                }
            }
        }
        return null;
    }

    private setupProcessMonitoring(): void {
        if (!this.backendProcess) return;

        this.backendProcess.stdout?.on('data', (data) => {
            const output = data.toString();
            console.log(`[AIDE Backend] ${output}`);
            
            // Multiple startup indicators
            if (output.includes('Uvicorn running on') ||
                output.includes('Application startup complete') ||
                output.includes('Server started on') ||
                output.includes('Listening on')) {
                this.serverReady = true;
                console.log('✅ AIDE backend server is ready!');
            }
        });

        this.backendProcess.stderr?.on('data', (data) => {
            const error = data.toString();
            console.error(`[AIDE Backend Error] ${error}`);
            
            // Check for critical errors that require restart
            if (error.includes('Address already in use') ||
                error.includes('Permission denied') ||
                error.includes('ModuleNotFoundError') ||
                error.includes('ImportError')) {
                console.log('🚨 Critical error detected - server needs restart');
                this.serverReady = false;
            }
        });

        this.backendProcess.on('error', (error) => {
            console.error('❌ AIDE backend process error:', error);
            this.serverReady = false;
        });

        this.backendProcess.on('exit', (code, signal) => {
            console.log(`🔴 AIDE backend exited: code=${code}, signal=${signal}`);
            this.serverReady = false;
            this.backendProcess = null;
        });
    }

    private async waitForServerReady(timeout: number): Promise<boolean> {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            if (this.serverReady && await this.isServerHealthy()) {
                return true;
            }
            // Wait 500ms before checking again
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        return false;
    }

    private async isServerHealthy(): Promise<boolean> {
        try {
            const response = await fetch(`http://${this.serverHost}:${this.serverPort}/health`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(10000) // 2 second timeout
            });

            if (response.ok) {
                // FIXED: Proper type assertion instead of annotation
                const health = await response.json() as HealthResponse;
                return health.status === 'ok';
            }
        } catch (error) {
            // Server not responding
        }
        
        return false;
    }

    private startEnhancedHealthMonitoring(context: vscode.ExtensionContext): void {
        this.healthCheckInterval = setInterval(async () => {
            const healthy = await this.isServerHealthy();
            
            if (!healthy && this.serverReady) {
                console.log('⚠️ AIDE backend health check failed');
                this.serverReady = false;
                
                // Attempt restart if process died
                if (!this.backendProcess || this.backendProcess.killed) {
                    console.log('🔄 Attempting to restart AIDE backend...');
                    await this.handleServerFailure(context);
                }
            }
        }, 10000); // Check every 10 seconds
    }

    private async handleServerFailure(context: vscode.ExtensionContext): Promise<void> {
        const now = Date.now();
        
        // Reset attempt counter if it's been more than 5 minutes since last restart
        if (now - this.lastRestartTime > 5 * 60 * 1000) {
            this.restartAttempts = 0;
        }

        if (this.restartAttempts < this.MAX_RESTART_ATTEMPTS) {
            this.restartAttempts++;
            this.lastRestartTime = now;
            console.log(`🔄 Server failure detected. Restart attempt ${this.restartAttempts}/${this.MAX_RESTART_ATTEMPTS}`);
            
            const success = await this.attemptServerRestart(context);
            if (success) {
                this.restartAttempts = 0; // Reset on successful restart
            }
        } else {
            // Max attempts reached - go into degraded mode
            console.log('❌ Max restart attempts reached. Entering degraded mode.');
            this.enterDegradedMode();
        }
    }

    private async attemptServerRestart(context: vscode.ExtensionContext): Promise<boolean> {
        console.log('🔄 AIDE server died - attempting automatic restart...');
        
        // Clean up dead process
        this.cleanup();
        
        // Wait a moment before restart
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Try restart up to 3 times
        for (let attempt = 1; attempt <= 3; attempt++) {
            console.log(`🚀 Restart attempt ${attempt}/3...`);
            try {
                const success = await this.startBackend(context);
                if (success) {
                    vscode.window.showInformationMessage(
                        '✅ AIDE backend automatically restarted successfully!',
                        'Continue Working'
                    );
                    return true;
                }
            } catch (error) {
                console.error(`❌ Restart attempt ${attempt} failed:`, error);
            }
            
            // Wait before next attempt with exponential backoff
            await new Promise(resolve => setTimeout(resolve, attempt * 3000));
        }
        
        // All restart attempts failed
        vscode.window.showErrorMessage(
            '❌ AIDE backend failed to restart automatically. Manual intervention required.',
            'Restart Extension', 'View Logs'
        ).then(selection => {
            if (selection === 'Restart Extension') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });
        
        return false;
    }

    private enterDegradedMode(): void {
        this.serverReady = false;
        vscode.window.showWarningMessage(
            '⚠️ AIDE backend is unavailable. Extension will run in offline mode with limited functionality.',
            'Try Manual Start', 'Reload Extension'
        ).then(selection => {
            if (selection === 'Try Manual Start') {
                vscode.window.showInformationMessage(
                    'Manual Start Instructions:\n1. Open terminal\n2. Run: pixi run python src/backend/api.py\n3. Then reload the extension'
                );
            } else if (selection === 'Reload Extension') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });
    }

    // High-performance request handling
    async makeRequest<T>(requestFn: () => Promise<T>): Promise<T> {
        if (!this.isServerReady()) {
            throw new Error('AIDE backend server is not ready');
        }

        return new Promise<T>((resolve, reject) => {
            this.requestQueue.push({
                request: requestFn,
                resolve,
                reject
            });
            this.processQueue();
        });
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessingQueue || this.requestQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;
        
        while (this.requestQueue.length > 0) {
            const { request, resolve, reject } = this.requestQueue.shift()!;
            try {
                const result = await request();
                resolve(result);
            } catch (error) {
                reject(error);
            }
            
            // Small delay to prevent overwhelming the server
            await new Promise(r => setTimeout(r, 10));
        }
        
        this.isProcessingQueue = false;
    }

    isServerReady(): boolean {
        return this.serverReady;
    }

    getServerUrl(): string {
        return `http://${this.serverHost}:${this.serverPort}`;
    }

    // Enhanced cleanup with process tree termination
    cleanup(): void {
        console.log('🧹 Enhanced cleanup of AIDE backend...');
        
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = undefined;
        }

        if (this.backendProcess && !this.backendProcess.killed) {
            console.log('🔴 Terminating AIDE backend process tree...');
            
            // Try to kill entire process tree on Unix systems
            if (process.platform !== 'win32' && this.backendProcess.pid) {
                try {
                    process.kill(-this.backendProcess.pid, 'SIGTERM');
                } catch (error) {
                    console.log('Process group kill failed, trying individual kill');
                }
            }
            
            this.backendProcess.kill('SIGTERM');
            
            // Force kill with longer timeout
            setTimeout(() => {
                if (this.backendProcess && !this.backendProcess.killed) {
                    console.log('💀 Force killing AIDE backend process...');
                    this.backendProcess.kill('SIGKILL');
                }
            }, 8000); // 8 second timeout
        }

        this.serverReady = false;
        this.backendProcess = null;
        this.requestQueue = [];
        this.isProcessingQueue = false;
    }
}

// Export enhanced singleton
export const backendManager = new EnhancedBackendManager();
