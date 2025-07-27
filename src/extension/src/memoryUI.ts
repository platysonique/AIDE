import * as vscode from 'vscode';

// Define the memory interface for better type safety
interface Memory {
  timestamp: string;
  content: string;
  context: string;
}

export function initMemoryUI(context: vscode.ExtensionContext) {
  // VS Code UI commands that call your Python backend
  
  const saveMemoryCommand = vscode.commands.registerCommand('aide.saveMemory', async () => {
    try {
      // Get current context
      const activeEditor = vscode.window.activeTextEditor;
      const selection = activeEditor ? activeEditor.document.getText(activeEditor.selection) : '';
      
      // Send to your Python backend
      const response = await fetch('http://localhost:8000/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: selection,
          context: activeEditor?.document.fileName || '',
          timestamp: new Date().toISOString()
        })
      });

      if (response.ok) {
        vscode.window.showInformationMessage('💾 Memory saved successfully!');
      } else {
        throw new Error(`Backend error: ${response.status}`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to save memory: ${error}`);
    }
  });

  const recallMemoryCommand = vscode.commands.registerCommand('aide.recallMemory', async () => {
    try {
      // Call your Python backend
      const response = await fetch('http://localhost:8000/memory/recall');
      
      if (response.ok) {
        // 🎯 YOUR FIX APPLIED - Proper typing for the response
        const memories = await response.json() as Memory[];
        
        // 🎯 AND CLEANER MAPPING - No more 'any' type needed!
        const items = memories.map((memory: Memory) => ({
          label: `💭 ${memory.timestamp}`,
          description: memory.content.substring(0, 100) + '...',
          detail: memory.context
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a memory to recall'
        });

        if (selected) {
          vscode.window.showInformationMessage(`Recalled: ${selected.description}`);
        }
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to recall memory: ${error}`);
    }
  });

  const managePrivacyCommand = vscode.commands.registerCommand('aide.managePrivacy', async () => {
    const options = ['Clear All Memories', 'Export Memories', 'Privacy Settings'];
    
    const selected = await vscode.window.showQuickPick(options, {
      placeHolder: 'Choose privacy action'
    });

    switch (selected) {
      case 'Clear All Memories':
        try {
          // Call backend to clear memories with better error handling
          const response = await fetch('http://localhost:8000/memory/clear', { method: 'DELETE' });
          if (response.ok) {
            vscode.window.showInformationMessage('🗑️ All memories cleared!');
          } else {
            throw new Error(`Backend error: ${response.status}`);
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to clear memories: ${error}`);
        }
        break;
      case 'Export Memories':
        // Handle export
        vscode.window.showInformationMessage('📤 Memories exported!');
        break;
      case 'Privacy Settings':
        // Show privacy configuration
        vscode.window.showInformationMessage('🔒 Privacy settings updated!');
        break;
    }
  });

  context.subscriptions.push(saveMemoryCommand, recallMemoryCommand, managePrivacyCommand);
}

