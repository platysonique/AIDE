import * as vscode from 'vscode';
import fetch from 'node-fetch';

interface CodeReviewResponse {
  status: string;
  results?: Array<{
    file: string;
    line: number;
    issue: string;
    suggestion: string;
    severity?: 'error' | 'warning' | 'info';
  }>;
  message?: string;
}

export function initCodeReviewUI(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('aide.codeReview', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
      }

      const code = editor.document.getText();
      const filename = editor.document.fileName.split('/').pop() || 'current_file';

      try {
        vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: "🔍 AIDE Code Review",
          cancellable: false
        }, async (progress) => {
          progress.report({ increment: 0, message: "Analyzing code..." });

          const response = await fetch('http://127.0.0.1:8000/review-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: [{ filename, content: code }] })
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          progress.report({ increment: 80, message: "Processing results..." });

          const data = await response.json() as CodeReviewResponse;

          progress.report({ increment: 100, message: "Complete!" });

          if (data.results && data.results.length > 0) {
            vscode.window.showInformationMessage(
              `🎉 Code review complete! Found ${data.results.length} suggestion(s)`,
              'Show Details'
            ).then(selection => {
              if (selection === 'Show Details') {
                for (const issue of data.results!) {
                  const severity = issue.severity || 'info';
                  const icon = severity === 'error' ? '❌' : severity === 'warning' ? '⚠️' : 'ℹ️';
                  
                  vscode.window.showInformationMessage(
                    `${icon} [${issue.file}:${issue.line}] ${issue.issue}\n💡 ${issue.suggestion}`
                  );
                }
              }
            });
          } else {
            vscode.window.showInformationMessage('✅ Code review complete! No issues found.');
          }
        });
      } catch (error: any) {
        vscode.window.showErrorMessage(`Code review failed: ${error.message}`);
        console.error('Code review error:', error);
      }
    })
  );
}

