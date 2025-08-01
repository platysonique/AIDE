import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';

// OPTIMIZED: Enhanced health response interface
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
    startup_optimized?: boolean;
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
    
    // OPTIMIZED: Enhanced request queuing for high performance
    private requestQueue: Array<{
        request: () => Promise<any>;
        resolve: (value: any) => void;
        reject: (error: any) => void;
    }> = [];
    private isProcessingQueue = false;
    
    // OPTIMIZED: Connection pooling for health checks
    private healthCheckCache: { lastCheck: number; lastResult: boolean } = { lastCheck: 0, lastResult: false };
    private readonly healthCheckCacheTimeout = 2000; // Cache health results for 2s
    
    async startBackend(context: vscode.ExtensionContext): Promise<boolean> {
        try {
            console.log('🚀 Starting AIDE backend with OPTIMIZED enhanced auto-recovery...');
            
            // OPTIMIZED: Fast health check with cache
            if (await this.isServerHealthyOptimized()) {
                console.log('🟢 AIDE backend server already running');
                this.serverReady = true;
                return true;
            }

            // Find available port
            this.serverPort = await this.findAvailablePort();
            // Find pixi command with optimized timeout
            const pixiCommand = await this.findPixiCommandOptimized();
            // Find project root
            const workspaceRoot = this.findProjectRoot();
            if (!workspaceRoot) {
                throw new Error('Could not find AIDE project root with pixi.toml');
            }

            console.log(`🎯 Starting server on ${this.serverHost}:${this.serverPort}`);
            
            // OPTIMIZED: Start server with proper Python path and module loading
            this.backendProcess = spawn(pixiCommand, [
                'run',
                'python',
                '-m', 'src.backend.api' // Use module syntax instead of file path
            ], {
                cwd: workspaceRoot,
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: false,
                shell: true,
                env: {
                    ...process.env,
                    AIDE_PORT: this.serverPort.toString(),
                    AIDE_HOST: this.serverHost,
                    PYTHONPATH: path.join(workspaceRoot, 'src')
                }
            });

            // OPTIMIZED: Enhanced output monitoring with more patterns
            this.setupOptimizedProcessMonitoring();

            // OPTIMIZED: Progressive timeout strategy (60s instead of 120s)
            const serverStarted = await this.waitForServerReadyOptimized(60000);

            if (serverStarted) {
                this.startOptimizedHealthMonitoring(context);
                context.subscriptions.push({
                    dispose: () => this.cleanup()
                });
                console.log('✅ AIDE backend started with OPTIMIZED monitoring suite');
                return true;
            } else {
                throw new Error('Server failed to start within OPTIMIZED timeout period');
            }

        } catch (error) {
            console.error('❌ OPTIMIZED backend startup failed:', error);
            await this.handleServerFailure(context);
            return false;
        }
    }

    // OPTIMIZED: Faster pixi command detection
    private async findPixiCommandOptimized(): Promise<string> {
        const possibleCommands = process.platform === 'win32'
            ? ['pixi.exe', 'pixi']
            : ['pixi'];

        for (const cmd of possibleCommands) {
            try {
                // OPTIMIZED: Increased timeout to 5s for slower systems
                const testProcess = spawn(cmd, ['--version'], { stdio: 'ignore' });
                const success = await new Promise<boolean>((resolve) => {
                    testProcess.on('close', (code) => resolve(code === 0));
                    testProcess.on('error', () => resolve(false));
                    setTimeout(() => resolve(false), 5000); // OPTIMIZED: 5s timeout
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

    // OPTIMIZED: Enhanced process monitoring with more startup patterns
    private setupOptimizedProcessMonitoring(): void {
        if (!this.backendProcess) return;

        this.backendProcess.stdout?.on('data', (data) => {
            const output = data.toString();
            console.log(`[AIDE Backend] ${output}`);
            
            // OPTIMIZED: More comprehensive startup indicators
            if (output.includes('Uvicorn running on') ||
                output.includes('Application startup complete') ||
                output.includes('Server started on') ||
                output.includes('Listening on') ||
                output.includes('AIDE Backend starting') ||
                output.includes('✅ AIDE backend started') ||
                output.includes('WebSocket enabled') ||
                output.includes('OPTIMIZED startup')) {
                this.serverReady = true;
                console.log('✅ AIDE backend server is ready! (OPTIMIZED detection)');
            }
        });

        this.backendProcess.stderr?.on('data', (data) => {
            const error = data.toString();
            console.error(`[AIDE Backend Error] ${error}`);
            
            // OPTIMIZED: Better error categorization
            if (error.includes('Address already in use') ||
                error.includes('Permission denied') ||
                error.includes('ModuleNotFoundError') ||
                error.includes('ImportError') ||
                error.includes('CRITICAL') ||
                error.includes('FATAL')) {
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

    // OPTIMIZED: Progressive timeout strategy with faster initial checks
    private async waitForServerReadyOptimized(timeout: number): Promise<boolean> {
        const startTime = Date.now();
        let checkInterval = 100; // Start with very fast checks (100ms)
        let lastCheck = 0;
        
        while (Date.now() - startTime < timeout) {
            const now = Date.now();
            
            // Progressive backoff: start fast, then slow down
            if (now - startTime > 10000) { // After 10s, slow down to 1s intervals
                checkInterval = 1000;
            } else if (now - startTime > 5000) { // After 5s, moderate intervals
                checkInterval = 500;
            }
            
            if (now - lastCheck >= checkInterval) {
                if (this.serverReady && await this.isServerHealthyOptimized()) {
                    console.log(`✅ Server ready in ${now - startTime}ms (OPTIMIZED)`);
                    return true;
                }
                lastCheck = now;
            }
            
            // Short sleep to prevent busy waiting
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        console.log(`❌ Server startup timeout after ${timeout}ms (OPTIMIZED)`);
        return false;
    }

    // OPTIMIZED: Faster health checks with caching and retries
    private async isServerHealthyOptimized(): Promise<boolean> {
        const now = Date.now();
        
        // Use cached result if recent
        if (now - this.healthCheckCache.lastCheck < this.healthCheckCacheTimeout) {
            return this.healthCheckCache.lastResult;
        }
        
        try {
            // OPTIMIZED: Reduced timeout to 5s with retries instead of single 10s
            const response = await fetch(`http://${this.serverHost}:${this.serverPort}/health`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(5000) // OPTIMIZED: 5s timeout
            });

            if (response.ok) {
                const health = await response.json() as HealthResponse;
                const isHealthy = health.status === 'ok';
                
                // Cache the result
                this.healthCheckCache = {
                    lastCheck: now,
                    lastResult: isHealthy
                };
                
                return isHealthy;
            }
        } catch (error) {
            // OPTIMIZED: Retry once on failure with shorter timeout
            try {
                const retryResponse = await fetch(`http://${this.serverHost}:${this.serverPort}/health`, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                    signal: AbortSignal.timeout(2000) // Quick retry
                });
                
                if (retryResponse.ok) {
                    const health = await retryResponse.json() as HealthResponse;
                    const isHealthy = health.status === 'ok';
                    
                    this.healthCheckCache = {
                        lastCheck: now,
                        lastResult: isHealthy
                    };
                    
                    return isHealthy;
                }
            } catch (retryError) {
                // Both attempts failed
            }
        }
        
        // Cache negative result
        this.healthCheckCache = {
            lastCheck: now,
            lastResult: false
        };
        
        return false;
    }

    // OPTIMIZED: Smarter health monitoring with adaptive intervals
    private startOptimizedHealthMonitoring(context: vscode.ExtensionContext): void {
        let healthCheckInterval = 5000; // Start with 5s intervals
        let consecutiveFailures = 0;
        
        this.healthCheckInterval = setInterval(async () => {
            const healthy = await this.isServerHealthyOptimized();
            
            if (!healthy && this.serverReady) {
                consecutiveFailures++;
                console.log(`⚠️ AIDE backend health check failed (${consecutiveFailures} consecutive failures)`);
                
                // Only consider it failed after 2 consecutive failures
                if (consecutiveFailures >= 2) {
                    this.serverReady = false;
                    
                    // Attempt restart if process died
                    if (!this.backendProcess || this.backendProcess.killed) {
                        console.log('🔄 Attempting to restart AIDE backend...');
                        await this.handleServerFailure(context);
                    }
                }
                
                // Increase check frequency when unhealthy
                healthCheckInterval = Math.max(2000, healthCheckInterval - 1000);
            } else if (healthy) {
                consecutiveFailures = 0;
                // Decrease check frequency when healthy (up to 15s max)
                healthCheckInterval = Math.min(15000, healthCheckInterval + 1000);
            }
            
            // Update interval dynamically
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = setInterval(arguments.callee as any, healthCheckInterval);
            }
            
        }, healthCheckInterval);
    }

    // Keep existing methods but with OPTIMIZED error handling
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
        console.log('🔄 AIDE server died - attempting OPTIMIZED automatic restart...');
        
        // Clean up dead process
        this.cleanup();
        
        // OPTIMIZED: Shorter wait before restart
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Try restart up to 3 times with OPTIMIZED backoff
        for (let attempt = 1; attempt <= 3; attempt++) {
            console.log(`🚀 OPTIMIZED restart attempt ${attempt}/3...`);
            try {
                const success = await this.startBackend(context);
                if (success) {
                    vscode.window.showInformationMessage(
                        '✅ AIDE backend automatically restarted successfully! (OPTIMIZED)',
                        'Continue Working'
                    );
                    return true;
                }
            } catch (error) {
                console.error(`❌ OPTIMIZED restart attempt ${attempt} failed:`, error);
            }
            
            // OPTIMIZED: Shorter wait before next attempt
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
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

    // OPTIMIZED: High-performance request handling with better error categorization
    async makeRequest<T>(requestFn: () => Promise<T>): Promise<T> {
        if (!this.isServerReady()) {
            throw new Error('AIDE backend server is not ready (OPTIMIZED check)');
        }

        return new Promise((resolve, reject) => {
            this.requestQueue.push({
                request: requestFn,
                resolve,
                reject
            });
            this.processQueueOptimized();
        });
    }

    // OPTIMIZED: Faster queue processing
    private async processQueueOptimized(): Promise<void> {
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
            
            // OPTIMIZED: Minimal delay to prevent overwhelming the server
            await new Promise(r => setTimeout(r, 5)); // Reduced from 10ms to 5ms
        }
        
        this.isProcessingQueue = false;
    }

    isServerReady(): boolean {
        return this.serverReady;
    }

    getServerUrl(): string {
        return `http://${this.serverHost}:${this.serverPort}`;
    }

    // OPTIMIZED: Enhanced cleanup with faster process termination
    cleanup(): void {
        console.log('🧹 OPTIMIZED enhanced cleanup of AIDE backend...');
        
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = undefined;
        }

        if (this.backendProcess && !this.backendProcess.killed) {
            console.log('🔴 Terminating AIDE backend process tree... (OPTIMIZED)');
            
            // Try to kill entire process tree on Unix systems
            if (process.platform !== 'win32' && this.backendProcess.pid) {
                try {
                    process.kill(-this.backendProcess.pid, 'SIGTERM');
                } catch (error) {
                    console.log('Process group kill failed, trying individual kill');
                }
            }
            
            this.backendProcess.kill('SIGTERM');
            
            // OPTIMIZED: Reduced force kill timeout from 8s to 5s
            setTimeout(() => {
                if (this.backendProcess && !this.backendProcess.killed) {
                    console.log('💀 Force killing AIDE backend process... (OPTIMIZED)');
                    this.backendProcess.kill('SIGKILL');
                }
            }, 5000); // OPTIMIZED: 5 second timeout instead of 8
        }

        this.serverReady = false;
        this.backendProcess = null;
        this.requestQueue = [];
        this.isProcessingQueue = false;
        
        // OPTIMIZED: Clear health check cache
        this.healthCheckCache = { lastCheck: 0, lastResult: false };
    }
}

// Export OPTIMIZED singleton
export const backendManager = new EnhancedBackendManager();
