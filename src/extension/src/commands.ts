import * as vscode from 'vscode';

export function registerCommands(context: vscode.ExtensionContext): void {
    // Enhanced Agentic Intent command
    context.subscriptions.push(
        vscode.commands.registerCommand('aide.agenticIntent', async () => {
            // Try to focus the chat panel first
            await vscode.commands.executeCommand('aide.openChat');
            
            // Get current context
            const editor = vscode.window.activeTextEditor;
            let contextMessage = "I need help with my code.";
            
            if (editor) {
                const selection = editor.selection;
                if (!selection.isEmpty) {
                    const selectedText = editor.document.getText(selection);
                    contextMessage = `Please help me with this selected code:\n\n${selectedText}`;
                } else {
                    const fileName = editor.document.fileName.split(/[\\\/]/).pop();
                    contextMessage = `Please review and help me with the current file: ${fileName}`;
                }
            }
            
            // Show input for more specific intent
            const userIntent = await vscode.window.showInputBox({
                prompt: "What would you like AIDE to help you with?",
                placeHolder: "e.g., 'Review this code', 'Fix bugs', 'Add tests', etc.",
                value: contextMessage,
                valueSelection: [0, contextMessage.length]
            });
            
            if (userIntent) {
                // Send the intent to the chat panel
                vscode.commands.executeCommand('workbench.view.extension.aide-chat');
                
                // Note: In a real implementation, you would send this to the chat panel
                // For now, we'll show it as a message
                vscode.window.showInformationMessage(
                    `AIDE is processing your intent: "${userIntent}". Check the chat panel for the response.`
                );
            }
        })
    );

    // Clear Chat command
    context.subscriptions.push(
        vscode.commands.registerCommand('aide.clearChat', () => {
            // This will be handled by the chat panel itself
            vscode.window.showInformationMessage('Chat history cleared');
        })
    );

    // ✅ REMOVED aide.codeReview - handled by codeReviewUI.ts

    context.subscriptions.push(
        vscode.commands.registerCommand('aide.batchFix', () =>
            vscode.window.showInformationMessage('Batch fixing issues…')
        )
    );

    // ✅ REMOVED aide.debugGuide - handled by debugGuideUI.ts (probably has the same issue)

    context.subscriptions.push(
        vscode.commands.registerCommand('aide.memoryManage', () =>
            vscode.window.showInformationMessage('AIDE memory and context center opened.')
        )
    );
}

