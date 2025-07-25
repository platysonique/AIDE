import * as vscode from 'vscode';

export function initSpeechUI(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('aide.speechUI', () => {
      vscode.window.showInformationMessage('Speech UI controls would open here.');
      // Actual implementation: trigger STT/TTS backend endpoints
    })
  );
}
