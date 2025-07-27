import * as vscode from 'vscode';
import { launchBackend } from './backendManager';
import { registerCommands } from './commands';
import { initSpeechUI } from './speechUI';
import { initIngestUI } from './ingestUI';
import { initCodeReviewUI } from './codeReviewUI';
import { initDebugGuideUI } from './debugGuideUI';
import { initMemoryUI } from './memoryUI';
import { initChatPanel } from './chatPanel';

// **Import your existing sidebar providers**
import { ChatViewProvider } from './chatViewProvider';
import { ToolsViewProvider } from './toolsViewProvider';

export function activate(context: vscode.ExtensionContext) {
  console.log('🚀 AIDE extension is now active!');

  // 1) Launch your Python backend
  launchBackend(context);

  // 2) Register all your pre-existing commands
  registerCommands(context);

  // 3) Initialize all your other UI modules
  initSpeechUI(context);
  initIngestUI(context);
  initCodeReviewUI(context);
  initDebugGuideUI(context);
  initMemoryUI(context);

  // 4) Legacy chat panel (webview) for backward compatibility
  initChatPanel(context);

  // 5) Sidebar Tree Views: Chat & Intent Pipeline
  const chatProvider  = new ChatViewProvider(context);
  const toolsProvider = new ToolsViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('aide.chatView',   chatProvider),
    vscode.window.registerTreeDataProvider('aide.intentView', toolsProvider)
  );

  // 6) “Open Chat” command shows your sidebar
  context.subscriptions.push(
    vscode.commands.registerCommand('aide.openChat', () =>
      vscode.commands.executeCommand('workbench.view.extension.aideChatContainer')
    )
  );

  // 7) Status bar icon
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text    = '$(robot) AIDE';
  statusBarItem.tooltip = 'AIDE Chat & Intent Pipeline';
  statusBarItem.command = 'aide.openChat';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // 8) Welcome message
  vscode.window
    .showInformationMessage(
      '🎯 AIDE is ready! Use the sidebar chat or run "AIDE: Agentic Intent" to get started.',
      'Open Chat',
      'Agentic Intent'
    )
    .then(selection => {
      if (selection === 'Open Chat') {
        vscode.commands.executeCommand('aide.openChat');
      } else if (selection === 'Agentic Intent') {
        vscode.commands.executeCommand('aide.agenticIntent');
      }
    });
}

export function deactivate() {
  console.log('🔴 AIDE extension deactivated');
}

