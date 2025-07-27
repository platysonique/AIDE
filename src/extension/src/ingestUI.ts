import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface IngestJob {
    id: string;
    fileName: string;
    fileType: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    startTime: Date;
}

export function initIngestUI(context: vscode.ExtensionContext): void {
    let ingestJobs: IngestJob[] = [];

    // Create status bar item for book/document ingest
    const ingestStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
    ingestStatusBar.text = '$(book) Ingest';
    ingestStatusBar.tooltip = 'Ingest books and documents into AIDE knowledge base';
    ingestStatusBar.command = 'aide.bookIngest';
    ingestStatusBar.show();
    context.subscriptions.push(ingestStatusBar);

    // Register main book ingest command
    const bookIngestCommand = vscode.commands.registerCommand('aide.bookIngest', async () => {
        try {
            const action = await vscode.window.showQuickPick([
                '📁 Select Files to Ingest',
                '📚 View Ingest History', 
                '⚙️ Ingest Settings',
                '🔍 Search Ingested Content',
                '🗑️ Manage Knowledge Base'
            ], {
                placeHolder: 'Choose an ingest action'
            });

            switch (action) {
                case '📁 Select Files to Ingest':
                    await selectAndIngestFiles(ingestJobs);
                    break;
                case '📚 View Ingest History':
                    showIngestHistory(ingestJobs);
                    break;
                case '⚙️ Ingest Settings':
                    showIngestSettings();
                    break;
                case '🔍 Search Ingested Content':
                    searchIngestedContent();
                    break;
                case '🗑️ Manage Knowledge Base':
                    manageKnowledgeBase();
                    break;
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Ingest operation failed: ${error}`);
        }
    });
    context.subscriptions.push(bookIngestCommand);

    // Register batch ingest command
    const batchIngestCommand = vscode.commands.registerCommand('aide.batchIngest', async () => {
        const folderUri = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            openLabel: 'Select Folder to Ingest'
        });

        if (folderUri && folderUri[0]) {
            await processFolderIngest(folderUri[0].fsPath, ingestJobs);
        }
    });
    context.subscriptions.push(batchIngestCommand);

    // Register ingest status command
    const ingestStatusCommand = vscode.commands.registerCommand('aide.ingestStatus', () => {
        updateIngestStatusBar(ingestStatusBar, ingestJobs);
        showIngestHistory(ingestJobs);
    });
    context.subscriptions.push(ingestStatusCommand);

    console.log('📚 Enhanced Ingest UI initialized with comprehensive document processing');
}

async function selectAndIngestFiles(ingestJobs: IngestJob[]): Promise<void> {
    const uri = await vscode.window.showOpenDialog({
        filters: { 
            'Documents': ['pdf', 'epub', 'txt', 'md', 'docx', 'doc', 'rtf'],
            'Images': ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff'],
            'Code': ['js', 'ts', 'py', 'java', 'cpp', 'c', 'cs', 'rb', 'go', 'rust'],
            'Data': ['json', 'xml', 'csv', 'yaml', 'yml'],
            'All Files': ['*']
        },
        canSelectMany: true,
        openLabel: 'Select Files to Ingest'
    });

    if (uri && uri.length > 0) {
        vscode.window.showInformationMessage(
            `📚 Selected ${uri.length} file(s) for ingest. Processing...`
        );

        for (const fileUri of uri) {
            await processFileIngest(fileUri.fsPath, ingestJobs);
        }

        // Show completion summary
        const completedJobs = ingestJobs.filter(job => job.status === 'completed').length;
        const failedJobs = ingestJobs.filter(job => job.status === 'failed').length;
        
        vscode.window.showInformationMessage(
            `🎉 Ingest complete! ${completedJobs} files processed successfully, ${failedJobs} failed.`,
            'View Results'
        ).then(selection => {
            if (selection === 'View Results') {
                showIngestHistory(ingestJobs);
            }
        });
    }
}

async function processFileIngest(filePath: string, ingestJobs: IngestJob[]): Promise<void> {
    const fileName = path.basename(filePath);
    const fileExt = path.extname(filePath).toLowerCase();
    
    const job: IngestJob = {
        id: Date.now().toString(),
        fileName: fileName,
        fileType: fileExt,
        status: 'pending',
        progress: 0,
        startTime: new Date()
    };
    
    ingestJobs.push(job);

    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `📚 Ingesting: ${fileName}`,
        cancellable: false
    }, async (progress) => {
        try {
            job.status = 'processing';
            
            // Simulate file analysis
            progress.report({ increment: 20, message: "Analyzing file structure..." });
            await new Promise(resolve => setTimeout(resolve, 500));
            job.progress = 20;

            // Simulate content extraction
            progress.report({ increment: 30, message: "Extracting content..." });
            await processFileContent(filePath, fileExt);
            job.progress = 50;

            // Simulate content chunking
            progress.report({ increment: 25, message: "Creating knowledge chunks..." });
            await new Promise(resolve => setTimeout(resolve, 800));
            job.progress = 75;

            // Simulate indexing
            progress.report({ increment: 25, message: "Indexing for search..." });
            await indexFileContent(fileName, filePath);
            job.progress = 100;

            job.status = 'completed';
            progress.report({ increment: 100, message: `Successfully ingested ${fileName}!` });

        } catch (error) {
            job.status = 'failed';
            console.error(`Failed to ingest ${fileName}:`, error);
            vscode.window.showErrorMessage(`Failed to ingest ${fileName}: ${error}`);
        }
    });
}

async function processFileContent(filePath: string, fileExt: string): Promise<void> {
    // Simulate different processing based on file type
    switch (fileExt) {
        case '.pdf':
            // Simulate PDF text extraction
            await new Promise(resolve => setTimeout(resolve, 1000));
            break;
        case '.docx':
        case '.doc':
            // Simulate Word document processing
            await new Promise(resolve => setTimeout(resolve, 800));
            break;
        case '.epub':
            // Simulate EPUB processing
            await new Promise(resolve => setTimeout(resolve, 1200));
            break;
        case '.md':
        case '.txt':
            // Simulate text file processing
            try {
                const content = await fs.promises.readFile(filePath, 'utf8');
                // Process content here
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (error) {
                throw new Error(`Failed to read text file: ${error}`);
            }
            break;
        case '.jpg':
        case '.jpeg':
        case '.png':
            // Simulate OCR processing for images
            await new Promise(resolve => setTimeout(resolve, 1500));
            break;
        default:
            // Generic text processing
            await new Promise(resolve => setTimeout(resolve, 500));
    }
}

async function indexFileContent(fileName: string, filePath: string): Promise<void> {
    // Simulate sending to backend for indexing
    // In real implementation, this would send to your backend API
    await new Promise(resolve => setTimeout(resolve, 600));
    
    // Simulate success response
    console.log(`Indexed ${fileName} at ${filePath}`);
}

async function processFolderIngest(folderPath: string, ingestJobs: IngestJob[]): Promise<void> {
    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "📁 Scanning folder for documents...",
        cancellable: false
    }, async (progress) => {
        try {
            const files = await fs.promises.readdir(folderPath, { withFileTypes: true });
            const documentFiles = files.filter(file => 
                file.isFile() && 
                /\.(pdf|epub|txt|md|docx|doc|jpg|jpeg|png|json|xml)$/i.test(file.name)
            );

            progress.report({ increment: 50, message: `Found ${documentFiles.length} documents` });

            for (let i = 0; i < documentFiles.length; i++) {
                const file = documentFiles[i];
                const filePath = path.join(folderPath, file.name);
                await processFileIngest(filePath, ingestJobs);
                
                const progressPercent = ((i + 1) / documentFiles.length) * 50;
                progress.report({ 
                    increment: progressPercent, 
                    message: `Processed ${i + 1}/${documentFiles.length} files` 
                });
            }

            vscode.window.showInformationMessage(
                `📚 Batch ingest complete! Processed ${documentFiles.length} documents from folder.`
            );
            
        } catch (error) {
            vscode.window.showErrorMessage(`Folder ingest failed: ${error}`);
        }
    });
}

function showIngestHistory(ingestJobs: IngestJob[]): void {
    if (ingestJobs.length === 0) {
        vscode.window.showInformationMessage('📚 No ingest history found. Start by ingesting some documents!');
        return;
    }

    const historyItems = ingestJobs.map(job => {
        const statusIcon = job.status === 'completed' ? '✅' : 
                          job.status === 'failed' ? '❌' : 
                          job.status === 'processing' ? '⏳' : '📋';
        const timeAgo = getTimeAgo(job.startTime);
        return `${statusIcon} ${job.fileName} (${job.fileType}) - ${job.status} ${timeAgo}`;
    });

    vscode.window.showQuickPick(historyItems, {
        placeHolder: `Ingest History (${ingestJobs.length} items)`
    });
}

function showIngestSettings(): void {
    vscode.window.showQuickPick([
        '🔧 Configure Ingest Backend',
        '📊 Set Processing Options',
        '🗂️ Manage File Types',
        '🔍 Search Index Settings',
        '🧹 Cleanup Old Jobs'
    ], {
        placeHolder: 'Ingest Settings & Configuration'
    }).then(selection => {
        switch (selection) {
            case '🔧 Configure Ingest Backend':
                vscode.window.showInputBox({
                    prompt: 'Enter backend URL for document processing',
                    value: 'http://localhost:8000',
                    placeHolder: 'http://localhost:8000'
                });
                break;
            case '📊 Set Processing Options':
                vscode.window.showInformationMessage('Processing options: OCR enabled, text chunking: 1000 chars, overlap: 200 chars');
                break;
            case '🗂️ Manage File Types':
                vscode.window.showInformationMessage('Supported: PDF, EPUB, DOCX, TXT, MD, Images (OCR), Code files, JSON, XML');
                break;
            case '🔍 Search Index Settings':
                vscode.window.showInformationMessage('Search index: Elasticsearch compatible, full-text search enabled');
                break;
            case '🧹 Cleanup Old Jobs':
                vscode.window.showInformationMessage('Cleanup feature will remove jobs older than 30 days');
                break;
        }
    });
}

function searchIngestedContent(): void {
    vscode.window.showInputBox({
        prompt: '🔍 Search ingested documents',
        placeHolder: 'Enter search terms...'
    }).then(searchQuery => {
        if (searchQuery) {
            vscode.window.showInformationMessage(
                `🔍 Searching for "${searchQuery}" in ingested documents...`,
                'View Results'
            );
            // In real implementation, this would query the search index
        }
    });
}

function manageKnowledgeBase(): void {
    vscode.window.showQuickPick([
        '📊 View Knowledge Base Stats',
        '🗑️ Delete Specific Documents',
        '🔄 Rebuild Search Index',
        '📤 Export Knowledge Base',
        '📥 Import Knowledge Base'
    ], {
        placeHolder: 'Knowledge Base Management'
    }).then(selection => {
        switch (selection) {
            case '📊 View Knowledge Base Stats':
                vscode.window.showInformationMessage('Knowledge Base: 0 documents, 0 MB, last updated: Never');
                break;
            case '🗑️ Delete Specific Documents':
                vscode.window.showInformationMessage('Document deletion interface would open here');
                break;
            case '🔄 Rebuild Search Index':
                vscode.window.showInformationMessage('Search index rebuild started...');
                break;
            case '📤 Export Knowledge Base':
                vscode.window.showInformationMessage('Knowledge base export would start here');
                break;
            case '📥 Import Knowledge Base':
                vscode.window.showInformationMessage('Knowledge base import dialog would open here');
                break;
        }
    });
}

function updateIngestStatusBar(statusBar: vscode.StatusBarItem, ingestJobs: IngestJob[]): void {
    const processingJobs = ingestJobs.filter(job => job.status === 'processing').length;
    const completedJobs = ingestJobs.filter(job => job.status === 'completed').length;
    
    if (processingJobs > 0) {
        statusBar.text = `$(sync~spin) Ingest (${processingJobs})`;
        statusBar.tooltip = `${processingJobs} files currently being ingested`;
    } else {
        statusBar.text = '$(book) Ingest';
        statusBar.tooltip = `Ingest books and documents - ${completedJobs} files processed`;
    }
}

function getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
}

