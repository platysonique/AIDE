import * as vscode from 'vscode';

interface DiscoveredTool {
  name: string;
  command: string;
  available: boolean;
  description: string;
  category: 'formatter' | 'linter' | 'test' | 'refactor' | 'diagnostics' | 'search' | 'other';
}

export class ToolsWebviewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private discoveredTools: DiscoveredTool[] = [];

  constructor(private context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = this.getWebviewContent();

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'refreshTools':
          await this.refreshTools();
          break;
        case 'executeTool':
          await this.executeTool(message.toolCommand);
          break;
        case 'discoverExtensions':
          await this.discoverExtensions();
          break;
      }
    });

    // Initial tool discovery
    this.refreshTools();
  }

  async refreshTools(): Promise<void> {
    console.log('🔍 Discovering available tools...');
    
    const commands = await vscode.commands.getCommands(true);
    this.discoveredTools = [];

    // Define the tools your Intent Pipeline knows about
    const knownTools = [
      // Formatters
      { name: 'Format Document', commands: ['editor.action.formatDocument'], category: 'formatter' as const, description: 'Format the current document' },
      { name: 'Prettier Format', commands: ['prettier.forceFormatDocument'], category: 'formatter' as const, description: 'Format with Prettier' },
      
      // Linters & Auto-fix
      { name: 'Fix All Issues', commands: ['editor.action.fixAll'], category: 'linter' as const, description: 'Auto-fix all linting issues' },
      { name: 'ESLint Auto-fix', commands: ['eslint.executeAutofix'], category: 'linter' as const, description: 'Run ESLint auto-fix' },
      { name: 'Auto Fix Indentation', commands: ['editor.action.indentLines'], category: 'linter' as const, description: 'Fix indentation issues' },
      
      // Test Runners
      { name: 'Run All Tests', commands: ['test-explorer.run-all', 'npm.runTest'], category: 'test' as const, description: 'Execute all tests' },
      { name: 'Jest Run Tests', commands: ['jest.run'], category: 'test' as const, description: 'Run Jest tests' },
      { name: 'Mocha Run Tests', commands: ['mocha.runAllTests'], category: 'test' as const, description: 'Run Mocha tests' },
      
      // Refactoring
      { name: 'Refactor', commands: ['editor.action.refactor'], category: 'refactor' as const, description: 'Show refactoring options' },
      { name: 'Rename Symbol', commands: ['editor.action.rename'], category: 'refactor' as const, description: 'Rename a symbol' },
      { name: 'Extract Method', commands: ['editor.action.extractMethod'], category: 'refactor' as const, description: 'Extract selected code to method' },
      
      // Diagnostics
      { name: 'Show Problems', commands: ['workbench.actions.view.problems'], category: 'diagnostics' as const, description: 'View problems panel' },
      { name: 'Next Problem', commands: ['editor.action.marker.nextInFiles'], category: 'diagnostics' as const, description: 'Navigate to next problem' },
      { name: 'TypeScript Check', commands: ['typescript.reloadProjects'], category: 'diagnostics' as const, description: 'Reload TypeScript projects' },
      
      // Search & Navigation
      { name: 'Find in Files', commands: ['workbench.action.findInFiles'], category: 'search' as const, description: 'Search across workspace' },
      { name: 'Go to Definition', commands: ['editor.action.revealDefinition'], category: 'search' as const, description: 'Navigate to definition' },
      { name: 'Find References', commands: ['editor.action.findReferences'], category: 'search' as const, description: 'Find all references' }
    ];

    // Check which tools are actually available
    for (const tool of knownTools) {
      const availableCommand = tool.commands.find(cmd => commands.includes(cmd));
      
      this.discoveredTools.push({
        name: tool.name,
        command: availableCommand || tool.commands[0],
        available: !!availableCommand,
        description: tool.description,
        category: tool.category
      });
    }

    console.log(`✅ Discovered ${this.discoveredTools.filter(t => t.available).length} available tools`);
    
    // Update the webview
    this.updateToolsDisplay();
  }

  private async executeTool(toolCommand: string): Promise<void> {
    try {
      console.log(`🔧 Executing tool: ${toolCommand}`);
      await vscode.commands.executeCommand(toolCommand);
      
      // Show success message
      if (this._view) {
        this._view.webview.postMessage({
          command: 'toolExecuted',
          success: true,
          toolCommand
        });
      }
      
      vscode.window.showInformationMessage(`✅ Tool executed: ${toolCommand}`);
    } catch (error: any) {
      console.error(`❌ Failed to execute tool ${toolCommand}:`, error);
      
      if (this._view) {
        this._view.webview.postMessage({
          command: 'toolExecuted',
          success: false,
          toolCommand,
          error: error.message
        });
      }
      
      vscode.window.showErrorMessage(`❌ Failed to execute tool: ${error.message}`);
    }
  }

  private async discoverExtensions(): Promise<void> {
    const extensions = vscode.extensions.all.filter(ext => !ext.packageJSON.isBuiltin);
    
    if (this._view) {
      this._view.webview.postMessage({
        command: 'extensionsDiscovered',
        extensions: extensions.map(ext => ({
          id: ext.id,
          displayName: ext.packageJSON.displayName || ext.id,
          description: ext.packageJSON.description || '',
          active: ext.isActive
        }))
      });
    }
  }

  private updateToolsDisplay(): void {
    if (!this._view) return;
    
    this._view.webview.postMessage({
      command: 'updateTools',
      tools: this.discoveredTools
    });
  }

  // Public method to get discovered tools (for other parts of the extension)
  public getAvailableTools(): DiscoveredTool[] {
    return this.discoveredTools.filter(tool => tool.available);
  }

  // Public method to execute a tool by name
  public async executeToolByName(toolName: string): Promise<boolean> {
    const tool = this.discoveredTools.find(t => t.name === toolName && t.available);
    if (tool) {
      await this.executeTool(tool.command);
      return true;
    }
    return false;
  }

  private getWebviewContent(): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AIDE Tools</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            margin: 0;
            padding: 12px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
          }
          
          h3 {
            margin: 0 0 16px 0;
            font-size: 16px;
            font-weight: 600;
            color: var(--vscode-foreground);
            display: flex;
            align-items: center;
            gap: 8px;
          }
          
          .refresh-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            padding: 6px 12px;
            cursor: pointer;
            font-size: 12px;
            margin-left: auto;
          }
          
          .refresh-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          
          .category {
            margin-bottom: 16px;
          }
          
          .category-title {
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          
          .tool-item {
            display: flex;
            align-items: center;
            padding: 8px 10px;
            margin-bottom: 4px;
            border-radius: 4px;
            cursor: pointer;
            transition: background-color 0.2s;
            border: 1px solid transparent;
          }
          
          .tool-item:hover {
            background-color: var(--vscode-list-hoverBackground);
            border-color: var(--vscode-list-hoverBackground);
          }
          
          .tool-item.available {
            border-left: 3px solid var(--vscode-charts-green);
          }
          
          .tool-item.unavailable {
            border-left: 3px solid var(--vscode-charts-red);
            opacity: 0.6;
            cursor: not-allowed;
          }
          
          .tool-status {
            margin-right: 8px;
            font-size: 12px;
          }
          
          .tool-info {
            flex: 1;
          }
          
          .tool-name {
            font-weight: 500;
            margin-bottom: 2px;
          }
          
          .tool-description {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.3;
          }
          
          .execute-btn {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 3px;
            padding: 4px 8px;
            font-size: 11px;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.2s;
          }
          
          .tool-item:hover .execute-btn {
            opacity: 1;
          }
          
          .execute-btn:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
          }
          
          .no-tools {
            text-align: center;
            padding: 20px;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
          }
          
          .stats {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 8px 12px;
            border-radius: 4px;
            margin-bottom: 16px;
            font-size: 12px;
          }
          
          .loading {
            text-align: center;
            padding: 20px;
            color: var(--vscode-descriptionForeground);
          }
        </style>
      </head>
      <body>
        <h3>
          🔧 AIDE Tools
          <button class="refresh-btn" onclick="refreshTools()">Refresh</button>
        </h3>
        
        <div id="stats" class="stats" style="display: none;">
          <div id="toolCount">Discovering tools...</div>
        </div>
        
        <div id="toolsContainer" class="loading">
          🔍 Discovering available tools...
        </div>

        <script>
          const vscode = acquireVsCodeApi();
          let currentTools = [];

          function refreshTools() {
            document.getElementById('toolsContainer').innerHTML = '<div class="loading">🔍 Refreshing tools...</div>';
            vscode.postMessage({ command: 'refreshTools' });
          }

          function executeTool(toolCommand, toolName) {
            console.log('Executing tool:', toolCommand);
            vscode.postMessage({ command: 'executeTool', toolCommand });
          }

          function groupToolsByCategory(tools) {
            return tools.reduce((groups, tool) => {
              if (!groups[tool.category]) {
                groups[tool.category] = [];
              }
              groups[tool.category].push(tool);
              return groups;
            }, {});
          }

          function renderTools(tools) {
            currentTools = tools;
            const container = document.getElementById('toolsContainer');
            const stats = document.getElementById('stats');
            const toolCount = document.getElementById('toolCount');
            
            const availableCount = tools.filter(t => t.available).length;
            const totalCount = tools.length;
            
            toolCount.textContent = \`\${availableCount} available / \${totalCount} total tools\`;
            stats.style.display = 'block';
            
            if (tools.length === 0) {
              container.innerHTML = '<div class="no-tools">No tools discovered yet</div>';
              return;
            }
            
            const groupedTools = groupToolsByCategory(tools);
            let html = '';
            
            const categoryNames = {
              'formatter': '🎨 Formatters',
              'linter': '🔍 Linters & Auto-fix',
              'test': '🧪 Test Runners',
              'refactor': '♻️ Refactoring',
              'diagnostics': '🩺 Diagnostics',
              'search': '🔎 Search & Navigation',
              'other': '🔧 Other Tools'
            };
            
            Object.keys(groupedTools).forEach(category => {
              const categoryTools = groupedTools[category];
              const categoryName = categoryNames[category] || category;
              
              html += \`<div class="category">
                <div class="category-title">\${categoryName}</div>\`;
              
              categoryTools.forEach(tool => {
                const statusIcon = tool.available ? '✅' : '❌';
                const statusClass = tool.available ? 'available' : 'unavailable';
                const executeBtn = tool.available 
                  ? \`<button class="execute-btn" onclick="executeTool('\${tool.command}', '\${tool.name}')">Run</button>\`
                  : '';
                
                html += \`
                  <div class="tool-item \${statusClass}">
                    <span class="tool-status">\${statusIcon}</span>
                    <div class="tool-info">
                      <div class="tool-name">\${tool.name}</div>
                      <div class="tool-description">\${tool.description}</div>
                    </div>
                    \${executeBtn}
                  </div>
                \`;
              });
              
              html += '</div>';
            });
            
            container.innerHTML = html;
          }

          // Handle messages from extension
          window.addEventListener('message', (event) => {
            const message = event.data;
            switch (message.command) {
              case 'updateTools':
                renderTools(message.tools);
                break;
              case 'toolExecuted':
                if (message.success) {
                  console.log('Tool executed successfully:', message.toolCommand);
                } else {
                  console.error('Tool execution failed:', message.error);
                }
                break;
            }
          });

          // Initialize
          refreshTools();
        </script>
      </body>
      </html>
    `;
  }
}

