import * as cp    from 'child_process';
import * as path  from 'path';
import * as vscode from 'vscode';

let backendProcess: cp.ChildProcess | null = null;

export function launchBackend(context: vscode.ExtensionContext): void {
  if (backendProcess) {
    return;
  }

  const extensionRoot = context.extensionPath;
  const backendPath   = path.join(extensionRoot, '../backend/api.py');
  const bashCommand = `pixi run python "${backendPath}"`;

  try {
    backendProcess = cp.spawn(
      'bash',
      ['-lc', bashCommand],
      { detached: true, stdio: 'ignore' }
    );
    backendProcess.unref();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`AIDE backend failed to start: ${message}`);
  }
}
