import * as vscode from 'vscode';

export class ToolsViewProvider implements vscode.TreeDataProvider<ToolItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ToolItem | undefined | null | void> = new vscode.EventEmitter<ToolItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ToolItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private tools: ToolItem[] = [];

    constructor(private context: vscode.ExtensionContext) {
        this.loadAvailableTools();
    }

    refresh(): void {
        this.loadAvailableTools();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ToolItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ToolItem): Thenable<ToolItem[]> {
        if (!element) {
            return Promise.resolve(this.tools);
        }
        return Promise.resolve([]);
    }

    private async loadAvailableTools() {
        this.tools = [];
        
        const commands = await vscode.commands.getCommands(true);
        
        // Check for common formatting tools
        if (commands.includes('editor.action.formatDocument')) {
            this.tools.push(new ToolItem('📝 Format Document', 'Available', 'available'));
        }
        
        if (commands.includes('editor.action.fixAll')) {
            this.tools.push(new ToolItem('🛠️ Fix All Issues', 'Available', 'available'));
        }
        
        if (commands.includes('eslint.executeAutofix')) {
            this.tools.push(new ToolItem('🔍 ESLint Auto-fix', 'Available', 'available'));
        }
        
        // Check for extensions
        const extensions = vscode.extensions.all;
        if (extensions.some(e => e.id === 'esbenp.prettier-vscode')) {
            this.tools.push(new ToolItem('✨ Prettier', 'Extension Active', 'extension'));
        }
        
        if (extensions.some(e => e.id === 'ms-python.python')) {
            this.tools.push(new ToolItem('🐍 Python', 'Extension Active', 'extension'));
        }

        // Add backend status
        try {
            const response = await fetch('http://localhost:8000/health');
            if (response.ok) {
                this.tools.push(new ToolItem('🚀 AIDE Backend', 'Online', 'backend'));
            }
        } catch {
            this.tools.push(new ToolItem('⚠️ AIDE Backend', 'Offline', 'backend'));
        }
    }
}

class ToolItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly contextValue: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = description;
        this.contextValue = contextValue;
    }
}

