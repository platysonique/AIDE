import * as vscode from 'vscode';

export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('aide.agenticIntent', () =>
      vscode.window.showInformationMessage('AIDE is proactively analyzing your intent.')
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aide.codeReview', () =>
      vscode.window.showInformationMessage('Code review in progress…')
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aide.batchFix', () =>
      vscode.window.showInformationMessage('Batch fixing issues…')
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aide.debugGuide', () =>
      vscode.window.showInformationMessage('Starting conversational debug guide.')
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aide.memoryManage', () =>
      vscode.window.showInformationMessage('AIDE memory and context center opened.')
    )
  );
}
