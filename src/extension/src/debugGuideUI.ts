import * as vscode from 'vscode';
import fetch from 'node-fetch';

interface DebugResponse {
  status: string;
  errors?: Array<{
    location: string;
    type: string;
    details: string;
    severity?: 'high' | 'medium' | 'low';
  }>;
  next_steps?: string[];
  suggestions?: string[];
  message?: string;
}

export function initDebugGuideUI(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('aide.debugGuide', async () => {
      const logs = await vscode.window.showInputBox({
        prompt: 'Paste error output/logs here for analysis',
        placeHolder: 'Copy and paste your error messages, stack traces, or log output...',
        ignoreFocusOut: true
      });

      if (!logs?.trim()) {
        vscode.window.showWarningMessage('No logs provided for analysis');
        return;
      }

      try {
        vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: "🐛 AIDE Debug Analysis",
          cancellable: false
        }, async (progress) => {
          progress.report({ increment: 0, message: "Analyzing errors..." });

          const response = await fetch('http://127.0.0.1:8000/debug-guide', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ logs })
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          progress.report({ increment: 70, message: "Processing analysis..." });

          const data = await response.json() as DebugResponse;

          progress.report({ increment: 100, message: "Analysis complete!" });

          // ✅ FIXED: Added null check before iterating
          if (data.errors && data.errors.length > 0) {
            vscode.window.showInformationMessage(
              `🔍 Found ${data.errors.length} error(s) to analyze`,
              'Show Errors'
            ).then(async (selection) => {
              if (selection === 'Show Errors') {
                for (const err of data.errors!) { // Now TypeScript knows it's not undefined
                  const severity = err.severity || 'medium';
                  const icon = severity === 'high' ? '🚨' : severity === 'medium' ? '⚠️' : 'ℹ️';
                  
                  vscode.window.showErrorMessage(
                    `${icon} [${err.location}] ${err.type}: ${err.details}`
                  );
                }
              }
            });
          }

          if (data.next_steps && data.next_steps.length > 0) {
            const step = await vscode.window.showQuickPick(data.next_steps, {
              placeHolder: 'What would you like to do next?',
              ignoreFocusOut: true
            });

            if (step) {
              vscode.window.showInformationMessage(`🎯 Next step: ${step}`);
            }
          }

          if (data.suggestions && data.suggestions.length > 0) {
            const suggestion = await vscode.window.showQuickPick(data.suggestions, {
              placeHolder: 'Select a suggestion to learn more',
              ignoreFocusOut: true
            });

            if (suggestion) {
              vscode.window.showInformationMessage(`💡 Suggestion: ${suggestion}`);
            }
          }
        });
      } catch (error: any) {
        vscode.window.showErrorMessage(`Debug analysis failed: ${error.message}`);
        console.error('Debug guide error:', error);
      }
    })
  );
}

