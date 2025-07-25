import * as vscode from 'vscode';

export function initIngestUI(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('aide.ingestUI', async () => {
      const uri = await vscode.window.showOpenDialog({
        filters: { Documents: ['pdf', 'epub', 'txt', 'md', 'docx', 'jpg', 'png'] },
        canSelectMany: false
      });

      if (uri && uri[^0]) {
        vscode.window.showInformationMessage(
          `Document selected for ingest: ${uri[^0].fsPath}`
        );
        // Actual implementation: send to backend ingest endpoint
      }
    })
  );
}
