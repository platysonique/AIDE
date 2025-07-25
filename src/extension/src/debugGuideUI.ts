import * as vscode from 'vscode';
import fetch from 'node-fetch';

export function initDebugGuideUI(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('aide.debugGuide', async () => {
      const logs = await vscode.window.showInputBox({
        prompt: 'Paste error output/logs here for analysis'
      });
      if (!logs) return;
      const response = await fetch('http://127.0.0.1:8000/debug-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs })
      });
      const data = await response.json();
      if (data.errors?.length) {
        for (const err of data.errors) {
          vscode.window.showErrorMessage(
            `[${err.location}] ${err.type}: ${err.details}`
          );
        }
      }
      if (data.next_steps?.length) {
        const step = await vscode.window.showQuickPick(data.next_steps, {
          placeHolder: 'What would you like to do next?'
        });
        if (step) {
          // Optionally: handle conversational next step with another backend call
        }
      }
    })
  );
}
