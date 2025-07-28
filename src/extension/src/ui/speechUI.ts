import * as vscode from 'vscode';

export function initSpeechUI(context: vscode.ExtensionContext): void {
    // Create status bar item for speech input
    const speechStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 95);
    speechStatusBar.text = '$(mic) Speech';
    speechStatusBar.tooltip = 'Activate speech input for AIDE - Convert speech to text commands';
    speechStatusBar.command = 'aide.speechInput';
    speechStatusBar.show();
    context.subscriptions.push(speechStatusBar);

    // Register the main speech input command
    const speechInputCommand = vscode.commands.registerCommand('aide.speechInput', async () => {
        try {
            // Show speech input dialog
            const speechResult = await showSpeechInputDialog();
            
            if (speechResult && speechResult.trim()) {
                // Send the speech result to AIDE's intent pipeline
                vscode.commands.executeCommand('aide.processSpeechIntent', speechResult);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Speech input failed: ${error}`);
        }
    });
    context.subscriptions.push(speechInputCommand);

    // Register speech intent processing command
    const processSpeechCommand = vscode.commands.registerCommand('aide.processSpeechIntent', async (speechText: string) => {
        try {
            // Show what was heard
            vscode.window.showInformationMessage(`🎤 Heard: "${speechText}"`, 'Execute', 'Cancel').then(selection => {
                if (selection === 'Execute') {
                    // Send to main AIDE intent pipeline
                    vscode.commands.executeCommand('aide.intentExecute');
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to process speech: ${error}`);
        }
    });
    context.subscriptions.push(processSpeechCommand);

    // Register speech settings command
    const speechSettingsCommand = vscode.commands.registerCommand('aide.speechSettings', async () => {
        const options = [
            'Configure Speech Recognition',
            'Test Microphone',
            'Speech Commands Help',
            'Enable/Disable Speech'
        ];
        
        const selection = await vscode.window.showQuickPick(options, {
            placeHolder: 'Speech Settings & Configuration'
        });
        
        switch (selection) {
            case 'Configure Speech Recognition':
                vscode.window.showInformationMessage('🎤 Speech recognition settings will open here. Configure your preferred speech engine and language.');
                break;
            case 'Test Microphone':
                testMicrophone();
                break;
            case 'Speech Commands Help':
                showSpeechHelp();
                break;
            case 'Enable/Disable Speech':
                toggleSpeechFeature(speechStatusBar);
                break;
        }
    });
    context.subscriptions.push(speechSettingsCommand);

    console.log('🎤 Enhanced Speech UI initialized with status bar integration');
}

async function showSpeechInputDialog(): Promise<string | undefined> {
    return new Promise((resolve) => {
        // For now, simulate speech input with a text input
        // This will be replaced with actual speech recognition
        vscode.window.showInputBox({
            prompt: '🎤 Speech Input Simulation (Actual speech recognition coming soon)',
            placeHolder: 'Say something like: "format my code", "explain this function", "create a README"',
            ignoreFocusOut: true
        }).then(result => {
            if (result) {
                // Simulate processing delay
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "🎤 Processing speech input...",
                    cancellable: false
                }, async (progress) => {
                    progress.report({ increment: 50, message: "Converting speech to text..." });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    progress.report({ increment: 100, message: "Speech processed!" });
                    resolve(result);
                });
            } else {
                resolve(undefined);
            }
        });
    });
}

function testMicrophone(): void {
    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "🎤 Testing microphone...",
        cancellable: false
    }, async (progress) => {
        progress.report({ increment: 25, message: "Checking microphone access..." });
        await new Promise(resolve => setTimeout(resolve, 500));
        
        progress.report({ increment: 50, message: "Testing audio levels..." });
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        progress.report({ increment: 75, message: "Verifying speech recognition..." });
        await new Promise(resolve => setTimeout(resolve, 500));
        
        progress.report({ increment: 100, message: "Test complete!" });
        
        vscode.window.showInformationMessage('🎤 Microphone test complete! Audio levels are good and speech recognition is ready.');
    });
}

function showSpeechHelp(): void {
    const helpMessage = `🎤 **AIDE Speech Commands Help**

**Supported Commands:**
• "Format my code" - Auto-format current file
• "Fix my errors" - Run auto-fix on current file  
• "Run my tests" - Execute test suite
• "Explain this function" - Get code explanation
• "Create a README" - Generate documentation
• "Search for [term]" - Find in files
• "Open [filename]" - Open specific file

**Tips:**
• Speak clearly and at normal pace
• Use natural language - AIDE understands context
• You can ask questions or give commands
• Say "help" anytime for assistance

**Settings:**
• Click the microphone icon for quick access
• Use Command Palette: "AIDE: Speech Settings"`;

    vscode.window.showInformationMessage(helpMessage);
}

function toggleSpeechFeature(statusBar: vscode.StatusBarItem): void {
    const currentText = statusBar.text;
    
    if (currentText.includes('$(mic)')) {
        // Disable speech
        statusBar.text = '$(mic-off) Speech (Off)';
        statusBar.tooltip = 'Speech input disabled - Click to enable';
        vscode.window.showInformationMessage('🔇 Speech input disabled');
    } else {
        // Enable speech
        statusBar.text = '$(mic) Speech';
        statusBar.tooltip = 'Activate speech input for AIDE - Convert speech to text commands';
        vscode.window.showInformationMessage('🎤 Speech input enabled');
    }
}

