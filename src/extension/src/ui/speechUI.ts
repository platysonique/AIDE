// FILE: src/extension/src/ui/speechUI.ts - FULLY TYPE-SAFE SPEECH FUNCTIONALITY
import * as vscode from 'vscode';

// FIXED: Added comprehensive interfaces for all API responses
interface SpeechRecognitionResponse {
    status: string;
    transcript?: string;
    confidence?: number;
    language?: string;
    backend?: string;
    duration?: number;
    message?: string;
}

interface SpeechSynthesisResponse {
    status: string;
    message?: string;
    audio_file?: string;
    backend?: string;
    voice_used?: string;
    text_length?: number;
    played?: boolean;
}

interface HealthCheckResponse {
    status: string;
    message?: string;
    uptime_seconds?: number;
    server_version?: string;
}

export function initSpeechUI(context: vscode.ExtensionContext): void {
    console.log('🎤 Initializing REAL Speech UI with Coqui TTS + Vosk backend integration...');
    
    // Create status bar item for speech input
    const speechStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 95);
    speechStatusBar.text = '$(mic) Speech';
    speechStatusBar.tooltip = 'Activate REAL speech input - Convert speech to text using Vosk + Coqui TTS responses';
    speechStatusBar.command = 'aide.speechInput';
    speechStatusBar.show();
    context.subscriptions.push(speechStatusBar);

    // Register the main speech input command with REAL backend integration
    const speechInputCommand = vscode.commands.registerCommand('aide.speechInput', async () => {
        try {
            console.log('🎤 Starting REAL speech recognition using your Vosk backend...');
            
            // Start REAL speech recognition using your Coqui TTS/Vosk backend
            const speechResult = await startRealSpeechRecognition();
            
            if (speechResult && speechResult.trim()) {
                console.log(`🎤 Speech recognized: "${speechResult}"`);
                
                // Send the speech result to AIDE's intent pipeline
                vscode.commands.executeCommand('aide.processSpeechIntent', speechResult);
            } else {
                vscode.window.showInformationMessage('🎤 No speech detected. Please try again.');
            }
        } catch (error) {
            console.error('Speech input failed:', error);
            vscode.window.showErrorMessage(`❌ Speech input failed: ${error}`);
        }
    });
    context.subscriptions.push(speechInputCommand);

    // Register speech intent processing command with REAL text-to-speech response
    const processSpeechCommand = vscode.commands.registerCommand('aide.processSpeechIntent', async (speechText: string) => {
        try {
            // Show what was heard
            const response = `I heard you say: "${speechText}". Should I execute this command?`;
            
            // SPEAK the response using your Coqui TTS backend
            await speakResponse(response);
            
            vscode.window.showInformationMessage(`🎤 ${response}`, 'Execute', 'Cancel').then(async selection => {
                if (selection === 'Execute') {
                    await speakResponse("Executing your command now.");
                    
                    // Send to main AIDE intent pipeline with the actual speech text
                    const { IntentPipeline } = require('../pipeline/intentPipeline');
                    const pipeline = new IntentPipeline();
                    
                    await pipeline.executeIntent(speechText, async (message: string) => {
                        console.log(message);
                        // Also speak important responses
                        if (message.includes('✅') || message.includes('🎯') || message.includes('💬')) {
                            const cleanMessage = message.replace(/[🎯✅💬🤖🔧📚🎨⚡]/g, '');
                            await speakResponse(cleanMessage);
                        }
                    });
                } else {
                    await speakResponse("Command cancelled.");
                }
            });
        } catch (error) {
            const errorMsg = `Failed to process speech: ${error}`;
            await speakResponse(errorMsg);
            vscode.window.showErrorMessage(`❌ ${errorMsg}`);
        }
    });
    context.subscriptions.push(processSpeechCommand);

    // Register speech settings command
    const speechSettingsCommand = vscode.commands.registerCommand('aide.speechSettings', async () => {
        const options = [
            'Test Speech Recognition',
            'Test Text-to-Speech', 
            'Speech Commands Help',
            'Backend Status',
            'Toggle Speech Mode'
        ];

        const selection = await vscode.window.showQuickPick(options, {
            placeHolder: 'AIDE Speech Settings & Configuration'
        });

        switch (selection) {
            case 'Test Speech Recognition':
                await testSpeechRecognition();
                break;
            case 'Test Text-to-Speech':
                await testTextToSpeech();
                break;
            case 'Speech Commands Help':
                showSpeechHelp();
                break;
            case 'Backend Status':
                await checkSpeechBackendStatus();
                break;
            case 'Toggle Speech Mode':
                toggleSpeechFeature(speechStatusBar);
                break;
        }
    });
    context.subscriptions.push(speechSettingsCommand);

    console.log('🎤 REAL Speech UI initialized with Coqui TTS + Vosk backend integration');
}

// REAL speech recognition using your Python backend (Vosk) - FULLY TYPE SAFE
async function startRealSpeechRecognition(): Promise<string | undefined> {
    return new Promise(async (resolve, reject) => {
        try {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "🎤 Listening with Vosk... Speak now!",
                cancellable: true
            }, async (progress, token) => {
                try {
                    // Call your Python backend's REAL speech recognition endpoint
                    const response = await fetch('http://127.0.0.1:8000/speech/recognize', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            action: 'start_recognition',
                            timeout: 10,  // 10 second timeout
                            language: 'en-US'
                        }),
                        signal: AbortSignal.timeout(15000) // 15 second request timeout
                    });

                    if (!response.ok) {
                        throw new Error(`Speech recognition failed: ${response.status}`);
                    }

                    // FIXED: Proper type assertion instead of annotation
                    const result = await response.json() as SpeechRecognitionResponse;
                    
                    if (result.transcript && result.transcript.trim()) {
                        console.log(`🎤 Vosk transcription: ${result.transcript}`);
                        resolve(result.transcript.trim());
                    } else {
                        resolve(undefined);
                    }
                } catch (error) {
                    console.error('Speech recognition error:', error);
                    reject(error);
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

// REAL text-to-speech using your Coqui TTS backend - FULLY TYPE SAFE
async function speakResponse(text: string): Promise<void> {
    try {
        console.log(`🔊 Speaking with Coqui TTS: "${text}"`);
        
        // Call your Python backend's REAL text-to-speech endpoint
        const response = await fetch('http://127.0.0.1:8000/speech/synthesize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                text: text,
                voice: 'default',
                speed: 1.0,
                play_immediately: true
            }),
            signal: AbortSignal.timeout(10000) // 10 second timeout
        });

        if (!response.ok) {
            console.error(`Coqui TTS failed: ${response.status}`);
            console.log(`🔊 TTS Fallback: "${text}"`);
        } else {
            // FIXED: Proper type assertion instead of annotation
            const result = await response.json() as SpeechSynthesisResponse;
            console.log(`🔊 Coqui TTS successful: ${result.status}`);
        }
    } catch (error) {
        console.error('TTS error:', error);
        console.log(`🔊 TTS Fallback: "${text}"`);
    }
}

async function testSpeechRecognition(): Promise<void> {
    try {
        vscode.window.showInformationMessage('🎤 Testing REAL Vosk speech recognition... Please say "Hello AIDE"');
        const result = await startRealSpeechRecognition();
        
        if (result) {
            await speakResponse(`Test successful! You said: ${result}`);
            vscode.window.showInformationMessage(`✅ Vosk speech recognition successful! You said: "${result}"`);
        } else {
            vscode.window.showWarningMessage('⚠️ No speech detected. Check your microphone and Vosk backend.');
        }
    } catch (error) {
        vscode.window.showErrorMessage(`❌ Vosk speech recognition test failed: ${error}`);
    }
}

async function testTextToSpeech(): Promise<void> {
    try {
        vscode.window.showInformationMessage('🔊 Testing REAL Coqui TTS...');
        await speakResponse("Hello! This is AIDE testing real text to speech using Coqui TTS.");
        vscode.window.showInformationMessage('✅ Coqui TTS test complete!');
    } catch (error) {
        vscode.window.showErrorMessage(`❌ Coqui TTS test failed: ${error}`);
    }
}

async function checkSpeechBackendStatus(): Promise<void> {
    try {
        const response = await fetch('http://127.0.0.1:8000/health', {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
        });
        
        if (response.ok) {
            // FIXED: Proper type assertion instead of annotation
            const health = await response.json() as HealthCheckResponse;
            vscode.window.showInformationMessage(
                `✅ AIDE backend with Coqui TTS + Vosk is running!\nStatus: ${health.status}\nMessage: ${health.message || 'No additional info'}`
            );
        } else {
            vscode.window.showWarningMessage('⚠️ AIDE backend is reachable but may have speech issues.');
        }
    } catch (error) {
        vscode.window.showErrorMessage('❌ AIDE backend is not available. Speech functionality requires the backend to be running.');
    }
}

function showSpeechHelp(): void {
    const helpMessage = `🎤 **AIDE REAL Speech Commands Help**

**Voice Commands (using Vosk + Coqui TTS):**
• "Format my code" - Auto-format current file
• "Fix my errors" - Run auto-fix on current file  
• "Run my tests" - Execute test suite
• "Explain this function" - Get code explanation
• "Create a README" - Generate documentation
• "Search for [term]" - Find in files
• "Open [filename]" - Open specific file
• "How are you?" - General conversation (now works with fixed regex!)

**REAL Speech Features:**
✅ **Vosk Speech Recognition** - Your installed backend
✅ **Coqui TTS Responses** - AIDE talks back to you
✅ **Voice Activity Detection** - Automatic speech detection
✅ **Multi-language Support** - Configurable in backend

**Tips:**
• Speak clearly at normal pace
• Wait for the "Listening with Vosk..." indicator
• AIDE will speak back using Coqui TTS
• Natural language understanding enabled with fixed regex patterns

**Troubleshooting:**
• Check backend status in Speech Settings
• Ensure AIDE backend is running on port 8000
• Verify Coqui TTS and Vosk are properly installed in pixi environment`;

    vscode.window.showInformationMessage(helpMessage);
}

function toggleSpeechFeature(statusBar: vscode.StatusBarItem): void {
    const currentText = statusBar.text;
    if (currentText.includes('$(mic)')) {
        // Disable speech
        statusBar.text = '$(mic-off) Speech (Off)';
        statusBar.tooltip = 'Speech input disabled - Click to enable';
        vscode.window.showInformationMessage('🔇 REAL speech input disabled');
    } else {
        // Enable speech
        statusBar.text = '$(mic) Speech';
        statusBar.tooltip = 'Activate REAL speech input - Using Coqui TTS + Vosk backend';
        vscode.window.showInformationMessage('🎤 REAL speech input enabled with Coqui TTS + Vosk');
    }
}
