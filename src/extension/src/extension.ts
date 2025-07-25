import * as vscode from 'vscode';
import { launchBackend } from './backendManager';
import { registerCommands } from './commands';
import { initSpeechUI } from './speechUI';
import { initIngestUI } from './ingestUI';
import { initCodeReviewUI } from './codeReviewUI';
import { initDebugGuideUI } from './debugGuideUI';
import { initMemoryUI } from './memoryUI';

export function activate(context: vscode.ExtensionContext) {
  launchBackend(context);
  registerCommands(context);
  initSpeechUI(context);
  initIngestUI(context);
  initCodeReviewUI(context);
  initDebugGuideUI(context);
  initMemoryUI(context);
}

export function deactivate() {}
