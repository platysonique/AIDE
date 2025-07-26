import * as vscode from 'vscode';
import { launchBackend } from './backendManager';
import { registerCommands } from './commands';
import { initSpeechUI } from './speechUI';
import { initIngestUI } from './ingestUI';
import { initCodeReviewUI } from './codeReviewUI';
import { initDebugGuideUI } from './debugGuideUI';
import { initMemoryUI } from './memoryUI';
import { initChatPanel } from './chatPanel';
import { ChatWebviewProvider } from './chatWebviewProvider';
import { ToolsWebviewProvider } from './toolsWebviewProvider';

// Global providers
let chatProvider: ChatWebviewProvider;
let toolsProvider: ToolsWebviewProvider;

export function activate(context: vscode.ExtensionContext) {
  console.log('🚀 AIDE Intent → Tool → Execution pipeline activating...');

  // Launch backend server
  launchBackend(context);

  // Register all existing commands (preserve your functionality)
  registerCommands(context);

  // Initialize all existing UI components (preserve your functionality)
  initSpeechUI(context);
  initIngestUI(context);
  initCodeReviewUI(context);
  initDebugGuideUI(context);
  initMemoryUI(context);

  // Initialize the original chat panel for backward compatibility
  initChatPanel(context);

  // Create webview providers for the Intent → Tool → Execution pipeline
  chatProvider = new ChatWebviewProvider(context);
  toolsProvider = new ToolsWebviewProvider(context);

  // Register webview providers (this is the KEY part!)
  vscode.window.registerWebviewViewProvider('aide.chatView', chatProvider);
  vscode.window.registerWebviewViewProvider('aide.intentView', toolsProvider);

  // Register Intent → Tool → Execution commands
  context.subscriptions.push(
    // Execute intent directly via input box
    vscode.commands.registerCommand('aide.executeIntent', async () => {
      const userInput = await vscode.window.showInputBox({
        prompt: 'What would you like AIDE to do?',
        placeHolder: 'e.g., format my code, fix errors, run tests...'
      });

      if (userInput) {
        await chatProvider.executeDirectIntent(userInput);
      }
    }),

    // Clear chat
    vscode.commands.registerCommand('aide.clearChat', () => {
      chatProvider.clearChat();
      vscode.window.showInformationMessage('🧹 AIDE chat history cleared!');
    }),

    // Refresh tools
    vscode.commands.registerCommand('aide.refreshTools', async () => {
      await toolsProvider.refreshTools();
      vscode.window.showInformationMessage('🔄 AIDE tools refreshed!');
    }),

    // Keep your existing open chat command working
    vscode.commands.registerCommand('aide.openChat', () => {
      vscode.commands.executeCommand('workbench.view.extension.aideChatContainer');
    })
  );

  // Status bar integration
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(robot) AIDE';
  statusBarItem.tooltip = 'AIDE Intent → Tool → Execution Pipeline';
  statusBarItem.command = 'aide.executeIntent'; 
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Auto-refresh tools on startup
  setTimeout(async () => {
    try {
      await toolsProvider.refreshTools();
    } catch (error) {
      console.log('Initial tool refresh failed:', error);
    }
  }, 2000);

  // Enhanced welcome message
  vscode.window
    .showInformationMessage(
      '🎯 AIDE Intent → Tool → Execution pipeline is ready! Click the robot icon to start.',
      'Try Intent Command',
      'Open Sidebar',
      'Refresh Tools'
    )
    .then(selection => {
      switch (selection) {
        case 'Try Intent Command':
          vscode.commands.executeCommand('aide.executeIntent');
          break;
        case 'Open Sidebar':
          vscode.commands.executeCommand('workbench.view.extension.aideChatContainer');
          break;
        case 'Refresh Tools':
          vscode.commands.executeCommand('aide.refreshTools');
          break;
      }
    });

  console.log('✅ AIDE activation complete! Intent → Tool → Execution pipeline online.');
}

export function deactivate() {
  console.log('🔴 AIDE extension deactivated - Intent → Tool → Execution pipeline offline');
}

