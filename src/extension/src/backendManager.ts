import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';

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
    private requestQueue: Array<{
        request: () => Promise<any>;
        resolve: (value: any) => void;
        reject: (error: any) => void;
    }> = [];
    private isProcessingQueue = false;
    private healthCheckCache = { lastCheck: 0, lastResult: false };
    private readonly healthCheckCacheTimeout = 2000; // 2s

    /**
     * Start the AIDE backend.
     * FIXED: Now uses module invocation instead of direct file execution.
     */
    async startBackend(context: vscode.ExtensionContext): Promise<boolean> {
        try {
            console.log('🚀 Starting AIDE backend with OPTIMIZED enhanced auto-recovery...');

            if (await this.isServerHealthyOptimized()) {
                console.log('🟢 AIDE backend server already running');
                this.serverReady = true;
                return true;
            }

            this.serverPort = await this.findAvailablePort();
            const pixiCommand = await this.findPixiCommandOptimized();
            const workspaceRoot = this.findProjectRoot();

            if (!workspaceRoot) {
                throw new Error('Could not find project root (pixi.toml missing)');
            }

            console.log(`🎯 Starting server on ${this.serverHost}:${this.serverPort}`);

            this.backendProcess = spawn(
                pixiCommand,
                [
                    'run',
                    'python',
                    '-m',                           // 🔥 THE FIX: Use module invocation
                    'src.backend.main',             // 🔥 THE FIX: Module path instead of file path
                    '--gpu-first'
                ],
                {
                    cwd: workspaceRoot,
                    stdio: ['ignore', 'pipe', 'pipe'],
                    shell: true,
                    env: {
                        ...process.env,
                        AIDE_PORT: this.serverPort.toString(),
                        AIDE_HOST: this.serverHost,
                        PYTHONPATH: path.join(workspaceRoot, 'src')
                    }
                }
            );

            this.setupOptimizedProcessMonitoring();

            const serverStarted = await this.waitForServerReadyOptimized(300_000);
            if (serverStarted) {
                this.startOptimizedHealthMonitoring(context);
                context.subscriptions.push({ dispose: () => this.cleanup() });
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

    /**
     * Fast-start variant, no model preload flag.
     */
    async startBackendFast(context: vscode.ExtensionContext): Promise<boolean> {
        // Simply delegates to startBackend (main.py is responsible for --no-model-preload if needed)
        return this.startBackend(context);
    }

    private async findPixiCommandOptimized(): Promise<string> {
        const candidates = process.platform === 'win32' ? ['pixi.exe', 'pixi'] : ['pixi'];

        for (const cmd of candidates) {
            try {
                const test = spawn(cmd, ['--version']);
                const ok = await new Promise<boolean>(resolve => {
                    test.on('close', code => resolve(code === 0));
                    test.on('error', () => resolve(false));
                    setTimeout(() => resolve(false), 5000);
                });
                if (ok) {
                    console.log(`✅ Found pixi command: ${cmd}`);
                    return cmd;
                }
            } catch {}
        }

        const fallbacks = process.platform === 'win32'
            ? ['%USERPROFILE%\\.pixi\\bin\\pixi.exe']
            : ['/usr/local/bin/pixi', `${process.env.HOME}/.pixi/bin/pixi`];

        for (let p of fallbacks) {
            p = p.replace(/%([^%]+)%/g, (_, k) => process.env[k] || '');
            if (fs.existsSync(p)) {
                console.log(`✅ Found pixi at: ${p}`);
                return p;
            }
        }

        throw new Error('Pixi command not found. Please install pixi and ensure it is in PATH.');
    }

    private async findAvailablePort(start: number = 8000): Promise<number> {
        for (let port = start; port < start + 100; port++) {
            const avail = await new Promise<boolean>(res => {
                const srv = net.createServer();
                srv.listen(port, () => srv.close(() => res(true)));
                srv.on('error', () => res(false));
            });
            if (avail) {
                console.log(`🔌 Using port ${port} for AIDE backend`);
                return port;
            }
        }
        throw new Error('No available ports in range 8000-8099');
    }

    private findProjectRoot(): string | null {
        let dir = __dirname;
        for (let i = 0; i < 5; i++) {
            if (fs.existsSync(path.join(dir, 'pixi.toml'))) {
                console.log(`📁 Found project root: ${dir}`);
                return dir;
            }
            dir = path.dirname(dir);
        }

        const wf = vscode.workspace.workspaceFolders;
        if (wf) {
            for (const f of wf) {
                if (fs.existsSync(path.join(f.uri.fsPath, 'pixi.toml'))) {
                    console.log(`📁 Found project root in workspace: ${f.uri.fsPath}`);
                    return f.uri.fsPath;
                }
            }
        }
        return null;
    }

    private setupOptimizedProcessMonitoring(): void {
        if (!this.backendProcess) return;

        this.backendProcess.stdout?.on('data', data => {
            const s = data.toString();
            console.log(`[AIDE Backend] ${s}`);
            if (
                s.includes('Uvicorn running on') ||
                s.includes('Application startup complete') ||
                s.includes('Server started') ||
                s.includes('AIDE Backend starting') ||
                s.includes('✅ AIDE backend started')
            ) {
                this.serverReady = true;
                console.log('✅ AIDE backend server is ready!');
            }
        });

        this.backendProcess.stderr?.on('data', data => {
            const s = data.toString();
            console.error(`[AIDE Backend Error] ${s}`);
            if (
                s.includes('ModuleNotFoundError') ||
                s.includes('ImportError') ||
                s.includes('FATAL')
            ) {
                this.serverReady = false;
            }
        });

        this.backendProcess.on('error', err => {
            console.error('❌ AIDE backend process error:', err);
            this.serverReady = false;
        });

        this.backendProcess.on('exit', (code, sig) => {
            console.log(`🔴 AIDE backend exited: code=${code}, signal=${sig}`);
            this.serverReady = false;
            this.backendProcess = null;
        });
    }

    private async waitForServerReadyOptimized(timeout: number): Promise<boolean> {
        const start = Date.now();
        let interval = 100;
        let last = 0;

        while (Date.now() - start < timeout) {
            const now = Date.now();
            if (now - start > 10000) interval = 1000;
            else if (now - start > 5000) interval = 500;

            if (now - last >= interval) {
                if (this.serverReady && await this.isServerHealthyOptimized()) {
                    console.log(`✅ Server ready in ${now - start}ms (OPTIMIZED)`);
                    return true;
                }
                last = now;
            }
            await new Promise(r => setTimeout(r, 50));
        }

        console.log(`❌ Server startup timeout after ${timeout}ms (OPTIMIZED)`);
        return false;
    }

    private async isServerHealthyOptimized(): Promise<boolean> {
        const now = Date.now();
        if (now - this.healthCheckCache.lastCheck < this.healthCheckCacheTimeout) {
            return this.healthCheckCache.lastResult;
        }

        try {
            const res = await fetch(`http://${this.serverHost}:${this.serverPort}/health`, {
                signal: AbortSignal.timeout(5000)
            });
            if (res.ok) {
                const h = await res.json() as HealthResponse;
                const ok = h.status === 'ok';
                this.healthCheckCache = { lastCheck: now, lastResult: ok };
                return ok;
            }
        } catch {
            try {
                const r2 = await fetch(`http://${this.serverHost}:${this.serverPort}/health`, {
                    signal: AbortSignal.timeout(2000)
                });
                if (r2.ok) {
                    const h2 = await r2.json() as HealthResponse;
                    const ok2 = h2.status === 'ok';
                    this.healthCheckCache = { lastCheck: now, lastResult: ok2 };
                    return ok2;
                }
            } catch {}
        }

        this.healthCheckCache = { lastCheck: now, lastResult: false };
        return false;
    }

    private startOptimizedHealthMonitoring(context: vscode.ExtensionContext): void {
        let interval = 5000;
        let failures = 0;

        this.healthCheckInterval = setInterval(async () => {
            const healthy = await this.isServerHealthyOptimized();
            if (!healthy && this.serverReady) {
                failures++;
                console.log(`⚠️ Health check failed (${failures} consecutive)`);
                if (failures >= 2) {
                    this.serverReady = false;
                    if (!this.backendProcess || this.backendProcess.killed) {
                        console.log('🔄 Attempting restart...');
                        await this.handleServerFailure(context);
                    }
                }
                interval = Math.max(2000, interval - 1000);
            } else if (healthy) {
                failures = 0;
                interval = Math.min(15000, interval + 1000);
            }

            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = setInterval(() => {}, interval);
            }
        }, interval);
    }

    private async handleServerFailure(context: vscode.ExtensionContext): Promise<void> {
        const now = Date.now();
        if (now - this.lastRestartTime > 5 * 60e3) this.restartAttempts = 0;

        if (this.restartAttempts < this.MAX_RESTART_ATTEMPTS) {
            this.restartAttempts++;
            this.lastRestartTime = now;
            console.log(`🔄 Restart attempt ${this.restartAttempts}/${this.MAX_RESTART_ATTEMPTS}`);
            const ok = await this.attemptServerRestart(context);
            if (ok) this.restartAttempts = 0;
        } else {
            console.log('❌ Max restart attempts reached. Entering degraded mode.');
            this.enterDegradedMode();
        }
    }

    private async attemptServerRestart(context: vscode.ExtensionContext): Promise<boolean> {
        console.log('🔄 Attempting OPTIMIZED restart...');
        this.cleanup();
        await new Promise(r => setTimeout(r, 1000));

        for (let i = 1; i <= 3; i++) {
            console.log(`🚀 Restart attempt ${i}/3`);
            try {
                const ok = await this.startBackend(context);
                if (ok) {
                    vscode.window.showInformationMessage('✅ AIDE backend restarted');
                    return true;
                }
            } catch {
                await new Promise(r => setTimeout(r, i * 1000));
            }
        }

        vscode.window.showErrorMessage('❌ Automatic restart failed', 'Reload Extension').then(sel => {
            if (sel === 'Reload Extension') vscode.commands.executeCommand('workbench.action.reloadWindow');
        });
        return false;
    }

    private enterDegradedMode(): void {
        this.serverReady = false;
        vscode.window.showWarningMessage(
            '⚠️ AIDE backend unavailable—running offline with limited functionality.',
            'Manual Start', 'Reload Extension'
        ).then(sel => {
            if (sel === 'Manual Start') {
                vscode.window.showInformationMessage(
                    'Manual start:\n1. pixi run python -m src.backend.main\n2. Reload extension'
                );
            } else if (sel === 'Reload Extension') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });
    }

    async makeRequest<T>(fn: () => Promise<T>): Promise<T> {
        if (!this.isServerReady()) throw new Error('Server not ready');
        return new Promise((res, rej) => {
            this.requestQueue.push({ request: fn, resolve: res, reject: rej });
            this.processQueueOptimized();
        });
    }

    private async processQueueOptimized(): Promise<void> {
        if (this.isProcessingQueue || !this.requestQueue.length) return;
        this.isProcessingQueue = true;

        while (this.requestQueue.length) {
            const { request, resolve, reject } = this.requestQueue.shift()!;
            try {
                const out = await request();
                resolve(out);
            } catch (e) {
                reject(e);
            }
            await new Promise(r => setTimeout(r, 5));
        }

        this.isProcessingQueue = false;
    }

    isServerReady(): boolean {
        return this.serverReady;
    }

    getServerUrl(): string {
        return `http://${this.serverHost}:${this.serverPort}`;
    }

    cleanup(): void {
        console.log('🧹 Cleaning up AIDE backend...');

        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = undefined;
        }

        if (this.backendProcess && !this.backendProcess.killed) {
            console.log('🔴 Terminating backend process...');
            if (process.platform !== 'win32' && this.backendProcess.pid) {
                try { process.kill(-this.backendProcess.pid, 'SIGTERM'); }
                catch { this.backendProcess.kill('SIGTERM'); }
            } else {
                this.backendProcess.kill('SIGTERM');
            }

            setTimeout(() => {
                if (this.backendProcess && !this.backendProcess.killed) {
                    console.log('💀 Force killing backend process');
                    this.backendProcess.kill('SIGKILL');
                }
            }, 5000);
        }

        this.serverReady = false;
        this.backendProcess = null;
        this.requestQueue = [];
        this.isProcessingQueue = false;
        this.healthCheckCache = { lastCheck: 0, lastResult: false };
    }
}

export const backendManager = new EnhancedBackendManager();
