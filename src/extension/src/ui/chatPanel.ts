import * as vscode from 'vscode';

export function initChatPanel(context: vscode.ExtensionContext) {
  console.log('🎯 AIDE Chat Panel initializing...');
  const provider = new ChatWebviewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('aide.chatView', provider)
  );
}

class ChatWebviewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(private context: vscode.ExtensionContext) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    const webview = webviewView.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webview.html = this.getWebviewContent();

    webview.onDidReceiveMessage(msg => {
      switch (msg.command) {
        case 'startSpeech':
          vscode.commands.executeCommand('aide.startSpeech');
          break;
        case 'stopSpeech':
          vscode.commands.executeCommand('aide.stopSpeech');
          break;
        case 'playTTS':
          vscode.commands.executeCommand('aide.playTTS', msg.text);
          break;
      }
    });
  }

  private getWebviewContent(): string {
    const nonce = Date.now().toString();
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
        <title>AIDE Chat Panel</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 10px;
          }
          
          .container {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          
          .btn {
            padding: 8px 16px;
            border: 1px solid var(--vscode-button-border);
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
          }
          
          .btn:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h3>🎯 AIDE Chat Panel</h3>
          <button class="btn" onclick="startSpeech()">🎤 Start Speech</button>
          <button class="btn" onclick="stopSpeech()">🛑 Stop Speech</button>
          <button class="btn" onclick="playTTS()">🔊 Play TTS</button>
        </div>

        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();
          
          function startSpeech() {
            vscode.postMessage({ command: 'startSpeech' });
          }
          
          function stopSpeech() {
            vscode.postMessage({ command: 'stopSpeech' });
          }
          
          function playTTS() {
            vscode.postMessage({ command: 'playTTS', text: 'Hello from AIDE!' });
          }
        </script>
      </body>
      </html>
    `;
  }
}
