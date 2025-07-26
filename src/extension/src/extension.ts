import * as vscode from 'vscode';
import { launchBackend } from './backendManager';
import { registerCommands } from './commands';
import { initUI } from './speechUI';
import { initIngestUI } from './ingestUI';
import { initCodeReviewUI } from './codeReviewUI';
import { initDebugGuideUI } from './debugGuideUI';
import { initMemoryUI } from './memoryUI';
import { initChatPanel } from './chatPanel';

export function activate(context: vscode.ExtensionContext) {
  console.log('AIDE extension is now active!');

  // Launch backend server
  launchBackend(context);

  // Register all commands
  registerCommands(context);

  // Initialize all UI components
  initSpeechUI(context);
  initIngestUI(context);
  initCodeReviewUI(context);
  initDebugGuideUI(context);
  initMemoryUI(context);

  // Initialize the chat panel (sidebar view)
  initChatPanel(context);

  // Register command to open the chat panel
  const openChatDisposable = vscode.commands.registerCommand('aide.openChat', () =>
    vscode.commands.executeCommand('workbench.view.extension.aideChatContainer')
  );
  context.subscriptions.push(openChatDisposable);

  // Show welcome message on first activation
  vscode.window
    .showInformationMessage(
      'AIDE is ready! Use the chat panel in the sidebar or run "AIDE: Agentic Intent" to get started.',
      'Open Chat Panel'
    )
    .then(selection => {
      if (selection === 'Open Chat Panel') {
        vscode.commands.executeCommand('aide.openChat');
      }
    });
}

export function deactivate() {
  console.log('AIDE extension is now deactivated');
}

