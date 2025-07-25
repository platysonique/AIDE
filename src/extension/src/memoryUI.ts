import * as vscode from 'vscode';
import fetch from 'node-fetch';

export function initMemoryUI(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('aide.memoryManage', async () => {
      const recall = await fetch('http://127.0.0.1:8000/memory/recall');
      const memData = await recall.json();
      if (memData.memory?.length) {
        const items = memData.memory.map((m: any, idx: number) => `${idx+1}. ${m}`);
        vscode.window.showInformationMessage("AIDE project memory:\n" + items.join('\n'));
      } else {
        vscode.window.showInformationMessage("No entries in AIDE project memory.");
      }
      if (memData.privacy_prompts && Object.keys(memData.privacy_prompts).length) {
        for (const k of Object.keys(memData.privacy_prompts)) {
          const confirm = await vscode.window.showQuickPick(['Yes','No'], {
            placeHolder: `Save sensitive data "${k}" to project memory?`
          });
          await fetch('http://127.0.0.1:8000/memory/privacy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entry: k, confirm: confirm === 'Yes' })
          });
        }
      }
    })
  );
}
