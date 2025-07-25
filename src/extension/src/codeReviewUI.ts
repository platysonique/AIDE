import * as vscode from 'vscode';
import fetch from 'node-fetch';

export function initCodeReviewUI(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('aide.codeReview', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const code = editor.document.getText();
      const filename = editor.document.fileName.split('/').pop() || 'current_file';
      const response = await fetch('http://127.0.0.1:8000/review-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: [{ filename, content: code }] })
      });
      const data = await response.json();
      if (data.results) {
        for (const issue of data.results) {
          vscode.window.showInformationMessage(
            `[${issue.file}:${issue.line}] ${issue.issue} ${issue.suggestion}`
          );
        }
      }
    })
  );
}
