import { IntentPipeline } from './src/pipeline/intentPipeline';

import * as vscode from 'vscode';
import { launchBackend } from './src/backendManager';
import { registerCommands } from './src/commands';
import { initSpeechUI } from './src/speechUI';
import { initIngestUI } from './src/ingestUI';
import { initCodeReviewUI } from './src/codeReviewUI';
import { initDebugGuideUI } from './src/debugGuideUI';
import { initMemoryUI } from './src/memoryUI';
import { initChatPanel } from './src/chatPanel';
import { ChatWebviewProvider } from './src/chatWebviewProvider';
import { ToolsWebviewProvider } from './src/toolsWebviewProvider';
import * as fs from 'fs';
import * as path from 'path';

// Enhanced Universal Communication Interfaces
interface DiagnosticDump {
    message: string;
    severity: number;
    range_start: number;
    range_end: number;
}

interface WorkspaceContext {
    openFiles: string[];
    currentFile?: string;
    language?: string;
    projectType?: string;
    hasPackageJson: boolean;
    hasTsConfig: boolean;
    folderStructure: string[];
}

interface IntentRequest {
    user_text: string;
    diagnostics: DiagnosticDump[];
    selection: string;
    fileName: string;
    workspace_context: WorkspaceContext;
    conversation_history: string[];
    intent_type: 'code' | 'chat' | 'file' | 'learning' | 'creative' | 'research';
}

interface ParsedIntent {
    intent: string;
    scope: 'file' | 'workspace' | 'selection' | 'global';
    auto_fix: boolean;
    tools_needed: string[];
    confidence: number;
    context_hints?: string[];
    response_type: 'action' | 'explanation' | 'creation' | 'conversation';
    requires_context: boolean;
}

// class UniversalIntentPipeline {
//     private conversationHistory: string[] = [];
//     
//     private async gatherWorkspaceContext(): Promise<WorkspaceContext> {
//         const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
//         const activeEditor = vscode.window.activeTextEditor;
//         
//         const context: WorkspaceContext = {
//             openFiles: vscode.workspace.textDocuments.map(doc => doc.fileName),
//             currentFile: activeEditor?.document.fileName,
//             language: activeEditor?.document.languageId,
//             hasPackageJson: false,
//             hasTsConfig: false,
//             folderStructure: []
//         };
// 
//         if (workspaceFolder) {
//             try {
//                 const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**', 100);
//                 context.folderStructure = files.map(file => 
//                     vscode.workspace.asRelativePath(file)
//                 ).slice(0, 20); // Limit for performance
// 
//                 // Check for project indicators
//                 context.hasPackageJson = await this.fileExists(path.join(workspaceFolder.uri.fsPath, 'package.json'));
//                 context.hasTsConfig = await this.fileExists(path.join(workspaceFolder.uri.fsPath, 'tsconfig.json'));
//                 
//                 // Determine project type
//                 if (context.hasPackageJson) {
//                     context.projectType = 'javascript/typescript';
//                 } else if (context.folderStructure.some(f => f.endsWith('.py'))) {
//                     context.projectType = 'python';
//                 } else if (context.folderStructure.some(f => f.endsWith('.java'))) {
//                     context.projectType = 'java';
//                 } else {
//                     context.projectType = 'general';
//                 }
//             } catch (error) {
//                 console.log('Error gathering workspace context:', error);
//             }
//         }
// 
//         return context;
//     }
// 
//     private async fileExists(filePath: string): Promise<boolean> {
//         try {
//             await fs.promises.access(filePath);
//             return true;
//         } catch {
//             return false;
//         }
//     }
// 
//     private classifyIntentType(userText: string): 'code' | 'chat' | 'file' | 'learning' | 'creative' | 'research' {
//         const text = userText.toLowerCase();
//         
//         // Code automation patterns
//         if (/\b(format|fix|debug|test|run|compile|build|lint)\b/.test(text)) {
//             return 'code';
//         }
//         
//         // File operations
//         if (/\b(create|delete|move|rename|open|save|file|folder)\b/.test(text)) {
//             return 'file';
//         }
//         
//         // Learning/explanation
//         if (/\b(explain|how|what|why|teach|learn|understand|mean)\b/.test(text)) {
//             return 'learning';
//         }
//         
//         // Creative tasks
//         if (/\b(write|create|generate|make|build|design|comment|document)\b/.test(text)) {
//             return 'creative';
//         }
//         
//         // Research tasks
//         if (/\b(search|find|look up|research|latest|best|compare)\b/.test(text)) {
//             return 'research';
//         }
//         
//         // Default to chat for conversational
//         return 'chat';
//     }
// 
//     private async callBackend(payload: IntentRequest): Promise<ParsedIntent> {
//         try {
//             const response = await fetch('http://localhost:8000/api/v1/intent', {
//                 method: 'POST',
//                 headers: { 'Content-Type': 'application/json' },
//                 body: JSON.stringify(payload)
//             });
//             
//             if (!response.ok) {
//                 throw new Error(`Backend error: ${response.status} ${response.statusText}`);
//             }
// 
//             const result = await response.json() as ParsedIntent;
//             if (!result.intent || !Array.isArray(result.tools_needed)) {
//                 throw new Error('Invalid response from backend');
//             }
// 
//             return result;
//         } catch (error: any) {
//             // Enhanced fallback based on intent type
//             const intentType = this.classifyIntentType(payload.user_text);
//             
//             return {
//                 intent: this.getFallbackIntent(intentType, payload.user_text),
//                 scope: 'file',
//                 auto_fix: false,
//                 tools_needed: this.getFallbackTools(intentType),
//                 confidence: 0.6, // Higher confidence for local classification
//                 context_hints: ['backend_offline', `local_${intentType}_classification`],
//                 response_type: this.getResponseType(intentType),
//                 requires_context: intentType !== 'chat'
//             };
//         }
//     }
// 
//     private getFallbackIntent(type: string, text: string): string {
//         switch (type) {
//             case 'code': return 'code_automation';
//             case 'file': return 'file_operation';
//             case 'learning': return 'explain_code';
//             case 'creative': return 'generate_content';
//             case 'research': return 'find_information';
//             default: return 'general_conversation';
//         }
//     }
// 
//     private getFallbackTools(type: string): string[] {
//         switch (type) {
//             case 'code': return ['formatter', 'linter', 'auto_fix'];
//             case 'file': return ['file_manager', 'workspace_navigator'];
//             case 'learning': return ['code_explainer', 'documentation'];
//             case 'creative': return ['content_generator', 'template_creator'];
//             case 'research': return ['search_engine', 'documentation'];
//             default: return ['chat', 'conversation'];
//         }
//     }
// 
//     private getResponseType(type: string): 'action' | 'explanation' | 'creation' | 'conversation' {
//         switch (type) {
//             case 'code': return 'action';
//             case 'learning': return 'explanation';
//             case 'creative': return 'creation';
//             default: return 'conversation';
//         }
//     }
// 
//     private async discoverAndExecuteTools(
//         toolsNeeded: string[], 
//         intentType: string,
//         userText: string,
//         callback?: (message: string) => void
//     ): Promise<number> {
//         const commands = await vscode.commands.getCommands(true);
//         let executed = 0;
//         let conversationalResponseGiven = false;
// 
//         for (const tool of toolsNeeded) {
//             try {
//                 switch (tool) {
//                     // 🎯 CONVERSATIONAL INTELLIGENCE - MASSIVELY ENHANCED!
//                     case 'general_conversation':
//                     case 'chat':
//                     case 'conversation':
//                         if (!conversationalResponseGiven) {
//                             const response = await this.generateConversationalResponse(userText, intentType);
//                             if (callback) callback(`🤖 ${response}`);
//                             else vscode.window.showInformationMessage(response);
//                             conversationalResponseGiven = true;
//                             executed++;
//                         }
//                         break;
// 
//                     // 🧠 LEARNING & EXPLANATION TOOLS
//                     case 'code_explainer':
//                     case 'explain_code':
//                     case 'documentation':
//                         const explanation = await this.explainCurrentCode();
//                         if (callback) callback(`📚 ${explanation}`);
//                         else vscode.window.showInformationMessage(explanation);
//                         executed++;
//                         break;
// 
//                     // 🎨 CREATIVE CONTENT GENERATION
//                     case 'content_generator':
//                     case 'template_creator':
//                     case 'generate_content':
//                         const content = await this.generateCreativeContent(userText);
//                         if (callback) callback(`✨ ${content}`);
//                         else vscode.window.showInformationMessage(content);
//                         executed++;
//                         break;
// 
//                     // 📁 FILE OPERATIONS
//                     case 'file_manager':
//                     case 'workspace_navigator':
//                     case 'file_operation':
//                         const fileResult = await this.handleFileOperation(userText);
//                         if (callback) callback(`📁 ${fileResult}`);
//                         else vscode.window.showInformationMessage(fileResult);
//                         executed++;
//                         break;
// 
//                     // 🔍 RESEARCH & SEARCH
//                     case 'search_engine':
//                     case 'find_information':
//                     case 'research':
//                         const searchResult = await this.handleResearchRequest(userText);
//                         if (callback) callback(`🔍 ${searchResult}`);
//                         else vscode.window.showInformationMessage(searchResult);
//                         executed++;
//                         break;
// 
//                     // 🛠️ CODE AUTOMATION (ENHANCED)
//                     case 'formatter':
//                         if (commands.includes('editor.action.formatDocument')) {
//                             await vscode.commands.executeCommand('editor.action.formatDocument');
//                             const msg = '🎯 Code formatted successfully! Your code looks clean and professional now.';
//                             if (callback) callback(msg);
//                             else vscode.window.showInformationMessage(msg);
//                             executed++;
//                         } else if (commands.includes('prettier.forceFormatDocument')) {
//                             await vscode.commands.executeCommand('prettier.forceFormatDocument');
//                             const msg = '🎯 Prettier formatting applied! Beautiful code styling complete.';
//                             if (callback) callback(msg);
//                             else vscode.window.showInformationMessage(msg);
//                             executed++;
//                         } else {
//                             const msg = "⚠️ No formatters found. Would you like me to help you install Prettier?";
//                             if (callback) callback(msg);
//                             else vscode.window.showWarningMessage(msg);
//                         }
//                         break;
// 
//                     case 'linter':
//                     case 'auto_fix':
//                         if (commands.includes('editor.action.fixAll')) {
//                             await vscode.commands.executeCommand('editor.action.fixAll');
//                             const msg = '🔧 Auto-fixes applied! I cleaned up the issues I could detect.';
//                             if (callback) callback(msg);
//                             else vscode.window.showInformationMessage(msg);
//                             executed++;
//                         } else if (commands.includes('eslint.executeAutofix')) {
//                             await vscode.commands.executeCommand('eslint.executeAutofix');
//                             const msg = '🔧 ESLint fixes applied! Your code meets the style guidelines now.';
//                             if (callback) callback(msg);
//                             else vscode.window.showInformationMessage(msg);
//                             executed++;
//                         } else {
//                             const msg = "⚠️ No linters found. Consider installing ESLint for better code quality.";
//                             if (callback) callback(msg);
//                             else vscode.window.showWarningMessage(msg);
//                         }
//                         break;
// 
//                     case 'test_runner':
//                         if (commands.includes('test-explorer.run-all')) {
//                             await vscode.commands.executeCommand('test-explorer.run-all');
//                             const msg = '🧪 Running all tests! Let me check if everything is working correctly.';
//                             if (callback) callback(msg);
//                             else vscode.window.showInformationMessage(msg);
//                             executed++;
//                         } else if (commands.includes('npm.runTest')) {
//                             await vscode.commands.executeCommand('npm.runTest');
//                             const msg = '🧪 Running npm tests! Executing your test suite now.';
//                             if (callback) callback(msg);
//                             else vscode.window.showInformationMessage(msg);
//                             executed++;
//                         } else {
//                             const msg = "🧪 No test runners configured. Would you like help setting up testing?";
//                             if (callback) callback(msg);
//                             else vscode.window.showInformationMessage(msg);
//                         }
//                         break;
// 
//                     // 🔧 WORKSPACE TOOLS (ENHANCED)
//                     case 'search':
//                         if (commands.includes('workbench.action.findInFiles')) {
//                             await vscode.commands.executeCommand('workbench.action.findInFiles');
//                             const msg = '🔍 Search panel opened! What would you like to find in your project?';
//                             if (callback) callback(msg);
//                             else vscode.window.showInformationMessage(msg);
//                             executed++;
//                         }
//                         break;
// 
//                     case 'refactor_tools':
//                         if (commands.includes('editor.action.refactor')) {
//                             await vscode.commands.executeCommand('editor.action.refactor');
//                             const msg = '🔄 Refactoring options available! Choose how you want to improve your code.';
//                             if (callback) callback(msg);
//                             else vscode.window.showInformationMessage(msg);
//                             executed++;
//                         }
//                         break;
// 
//                     default:
//                         console.log(`Unknown tool requested: ${tool}`);
//                         if (callback) {
//                             callback(`🤔 I don't have a specific tool for "${tool}" yet, but I'm learning! Is there something else I can help you with?`);
//                         }
//                         break;
//                 }
//             } catch (error) {
//                 console.error(`Failed to execute tool ${tool}:`, error);
//                 const errorMsg = `❌ Had trouble with ${tool}: ${error}. Let me try something else!`;
//                 if (callback) callback(errorMsg);
//                 else vscode.window.showErrorMessage(errorMsg);
//             }
//         }
// 
//         return executed;
//     }
// 
//     // 🧠 ENHANCED CONVERSATIONAL INTELLIGENCE
//     private async generateConversationalResponse(userText: string, intentType: string): Promise<string> {
//         const text = userText.toLowerCase();
//         const workspace = await this.gatherWorkspaceContext();
//         
//         // Greeting responses
//         if (/\b(hello|hi|hey|sup|what's up|how are you|how's it going)\b/.test(text)) {
//             const greetings = [
//                 `Hey there! 👋 I'm doing fantastic and ready to help! I can see you're working on a ${workspace.projectType} project with ${workspace.openFiles.length} files open. What can I do for you?`,
//                 `Hello! 🚀 All systems operational and excited to assist! I notice you have ${workspace.currentFile ? path.basename(workspace.currentFile) : 'no file'} open. How can I help with your project?`,
//                 `What's up! 💪 I'm powered up and ready to tackle anything you throw at me. Your workspace looks interesting - want me to help with some code, or just chat?`,
//                 `Hey boss! 🔥 Doing great and standing by for whatever you need. I can code, explain, create, search, or just talk - what's your vibe?`
//             ];
//             return greetings[Math.floor(Math.random() * greetings.length)];
//         }
// 
//         // Context questions
//         if (/\b(see|workspace|file|open|current|project)\b/.test(text)) {
//             let contextResponse = `🔍 **Here's what I can see in your workspace:**\n\n`;
//             contextResponse += `📁 **Project Type:** ${workspace.projectType}\n`;
//             contextResponse += `📄 **Current File:** ${workspace.currentFile ? path.basename(workspace.currentFile) : 'None'}\n`;
//             contextResponse += `💻 **Language:** ${workspace.language || 'Not detected'}\n`;
//             contextResponse += `📚 **Open Files:** ${workspace.openFiles.length}\n`;
//             if (workspace.folderStructure.length > 0) {
//                 contextResponse += `🗂️ **Recent Files:** ${workspace.folderStructure.slice(0, 5).join(', ')}\n`;
//             }
//             contextResponse += `\n💡 I can help you with code formatting, debugging, explanations, file operations, or just chat about your project!`;
//             return contextResponse;
//         }
// 
//         // Capability questions
//         if (/\b(can you|what can|help|do|abilities|features)\b/.test(text)) {
//             return `🚀 **I'm your universal coding assistant!** Here's what I can do:\n\n` +
//                    `🛠️ **Code Operations:** Format, fix, test, refactor, debug\n` +
//                    `📚 **Learning:** Explain code, teach concepts, provide examples\n` +
//                    `🎨 **Creative:** Write documentation, generate templates, create content\n` +
//                    `📁 **File Management:** Create, organize, navigate your project\n` +
//                    `🔍 **Research:** Find information, look up best practices\n` +
//                    `💬 **Chat:** Just talk about anything coding or tech related!\n\n` +
//                    `Try something like: "format my code", "explain this function", "create a README", or just ask me questions!`;
//         }
// 
//         // Default friendly response
//         const responses = [
//             `I'm here and ready to help with whatever you need! Whether it's coding, explaining, creating, or just chatting about your project. What's on your mind?`,
//             `Always happy to assist! I can help with code, answer questions, create content, or we can just talk tech. What would you like to explore?`,
//             `Ready for action! 💪 Whether you need code help, explanations, file work, or just want to chat - I'm your AI partner. What can we tackle together?`,
//             `At your service! 🎯 I'm equipped to handle coding tasks, provide explanations, generate content, manage files, or just have a good conversation. What interests you?`
//         ];
//         
//         return responses[Math.floor(Math.random() * responses.length)];
//     }
// 
//     // 📚 CODE EXPLANATION ENGINE - FIXED ASYNC
//     private async explainCurrentCode(): Promise<string> {
//         const activeEditor = vscode.window.activeTextEditor;
//         if (!activeEditor) {
//             return "Open a file and I'll explain what's happening in your code! I can break down functions, classes, algorithms, or entire files.";
//         }
// 
//         const selection = activeEditor.selection;
//         const document = activeEditor.document;
//         const language = document.languageId;
//         
//         if (!selection.isEmpty) {
//             const selectedText = document.getText(selection);
//             return `📖 **Explaining Selected ${language.toUpperCase()} Code:**\n\n` +
//                    `This code snippet appears to be handling ${this.analyzeCodePurpose(selectedText, language)}. ` +
//                    `The key components include ${this.identifyCodeComponents(selectedText)}. ` +
//                    `Would you like me to explain any specific part in more detail?`;
//         } else {
//             const fileName = path.basename(document.fileName);
//             const lineCount = document.lineCount;
//             return `📄 **File Analysis: ${fileName}**\n\n` +
//                    `This ${language} file contains ${lineCount} lines and appears to be ${this.analyzeFileStructure(document)}. ` +
//                    `Select specific code and I can provide detailed explanations!`;
//         }
//     }
// 
//     private analyzeCodePurpose(code: string, language: string): string {
//         const purposes = [];
//         
//         if (/function|def|method/.test(code)) purposes.push("function definitions");
//         if (/if|else|switch|case/.test(code)) purposes.push("conditional logic");
//         if (/for|while|forEach|map/.test(code)) purposes.push("iteration/loops");
//         if (/class|interface|type/.test(code)) purposes.push("type definitions");
//         if (/import|require|from/.test(code)) purposes.push("module imports");
//         if (/async|await|Promise/.test(code)) purposes.push("asynchronous operations");
//         
//         return purposes.length > 0 ? purposes.join(", ") : "data processing or business logic";
//     }
// 
//     private identifyCodeComponents(code: string): string {
//         const components = [];
//         
//         const functionMatches = code.match(/\b(function|def|const|let|var)\s+(\w+)/g);
//         if (functionMatches) components.push(`functions: ${functionMatches.slice(0, 3).join(", ")}`);
//         
//         const variableMatches = code.match(/\b(const|let|var)\s+(\w+)/g);
//         if (variableMatches) components.push(`variables: ${variableMatches.slice(0, 3).join(", ")}`);
//         
//         return components.length > 0 ? components.join(" and ") : "various programming constructs";
//     }
// 
//     private analyzeFileStructure(document: vscode.TextDocument): string {
//         const text = document.getText();
//         const language = document.languageId;
//         
//         if (language === 'typescript' || language === 'javascript') {
//             if (/export.*class/.test(text)) return "a class definition module";
//             if (/export.*function/.test(text)) return "a function library";
//             if (/import.*react/i.test(text)) return "a React component";
//             if (/describe|test|it\(/.test(text)) return "a test file";
//         }
//         
//         return `a ${language} source file with various functions and logic`;
//     }
// 
//     // 🎨 CREATIVE CONTENT GENERATOR - FIXED ASYNC
//     private async generateCreativeContent(userText: string): Promise<string> {
//         const text = userText.toLowerCase();
//         const workspace = await this.gatherWorkspaceContext();
//         
//         if (/readme|documentation|doc/.test(text)) {
//             return this.generateReadme(workspace);
//         }
//         
//         if (/comment|comments/.test(text)) {
//             return this.generateCodeComments();
//         }
//         
//         if (/test|testing/.test(text)) {
//             return await this.generateTestTemplate(); // ← FIXED: Added await
//         }
//         
//         return `🎨 I can help create various content! Try asking me to:\n` +
//                `• "Write a README for this project"\n` +
//                `• "Add comments to this code"\n` +
//                `• "Generate test templates"\n` +
//                `• "Create documentation"\n\n` +
//                `What kind of content would you like me to create?`;
//     }
// 
//     private generateReadme(workspace: WorkspaceContext): string {
//         const projectName = workspace.currentFile ? 
//             path.basename(path.dirname(workspace.currentFile)) : 
//             "Your Project";
//             
//         return `📝 **Generated README template:**\n\n` +
//                `# ${projectName}\n\n` +
//                `## Description\n` +
//                `A ${workspace.projectType} project with ${workspace.openFiles.length} files.\n\n` +
//                `## Installation\n` +
//                `\`\`\`bash\n` +
//                `${workspace.hasPackageJson ? 'npm install' : '# Add installation instructions'}\n` +
//                `\`\`\`\n\n` +
//                `## Usage\n` +
//                `${workspace.hasPackageJson ? 'npm start' : '# Add usage instructions'}\n\n` +
//                `## Features\n` +
//                `- Feature 1\n` +
//                `- Feature 2\n` +
//                `- Feature 3\n\n` +
//                `Would you like me to create this as a new file?`;
//     }
// 
//     private generateCodeComments(): string {
//         const activeEditor = vscode.window.activeTextEditor;
//         if (!activeEditor) {
//             return "Open a code file and select some code, then I'll generate helpful comments for it!";
//         }
//         
//         return `💬 **Comment Generation Ready!**\n\n` +
//                `I can add comments to explain:\n` +
//                `• Function purposes and parameters\n` +
//                `• Complex logic and algorithms\n` +
//                `• Variable meanings and usage\n` +
//                `• Class and method documentation\n\n` +
//                `Select the code you want commented and ask again!`;
//     }
// 
//     // 🧪 TEST TEMPLATE GENERATOR - FIXED ASYNC
//     private async generateTestTemplate(): Promise<string> { // ← FIXED: Added async and Promise<string>
//         const workspace = await this.gatherWorkspaceContext();
//         
//         if (workspace.language === 'javascript' || workspace.language === 'typescript') {
//             return `🧪 **Jest Test Template:**\n\n` +
//                    `\`\`\`javascript\n` +
//                    `describe('Component/Function Name', () => {\n` +
//                    `  test('should do something', () => {\n` +
//                    `    // Arrange\n` +
//                    `    const input = 'test input';\n` +
//                    `    \n` +
//                    `    // Act\n` +
//                    `    const result = functionToTest(input);\n` +
//                    `    \n` +
//                    `    // Assert\n` +
//                    `    expect(result).toBe('expected output');\n` +
//                    `  });\n` +
//                    `});\n` +
//                    `\`\`\`\n\n` +
//                    `Would you like me to create a test file for your current code?`;
//         }
//         
//         return `🧪 Test templates available for ${workspace.language}! What kind of test would you like to create?`;
//     }
// 
//     // 📁 FILE OPERATION HANDLER - FIXED ASYNC
//     private async handleFileOperation(userText: string): Promise<string> {
//         const text = userText.toLowerCase();
//         
//         if (/create|new/.test(text)) {
//             // Extract potential filename from user text
//             const filenameMatch = userText.match(/(?:create|new)\s+(?:file\s+)?(?:called\s+)?([^\s]+\.\w+)/i);
//             if (filenameMatch) {
//                 const filename = filenameMatch[1];
//                 return `📁 Ready to create "${filename}"! Should I:\n` +
//                        `• Create an empty file?\n` +
//                        `• Generate a template based on the file type?\n` +
//                        `• Copy structure from an existing file?\n\n` +
//                        `Just let me know what you'd prefer!`;
//             }
//             return `📁 I can create new files! Just tell me the filename, like "create new file called app.js"`;
//         }
//         
//         if (/open|show/.test(text)) {
//             const workspace = await this.gatherWorkspaceContext(); // ← FIXED: Added await
//             return `📂 **Your workspace contains:**\n\n` +
//                    workspace.folderStructure.slice(0, 10).map(f => `• ${f}`).join('\n') +
//                    `\n\nWhich file would you like to open?`;
//         }
//         
//         return `📁 I can help with file operations! Try:\n` +
//                `• "Create a new file called example.js"\n` +
//                `• "Show me the files in this project"\n` +
//                `• "Open the main configuration file"\n\n` +
//                `What file operation do you need?`;
//     }
// 
//     // 🔍 RESEARCH REQUEST HANDLER - FIXED ASYNC
//     private async handleResearchRequest(userText: string): Promise<string> {
//         const text = userText.toLowerCase();
//         
//         if (/latest|newest|recent/.test(text)) {
//             return `🔍 **Research Mode:** Looking for the latest information!\n\n` +
//                    `I can help you find:\n` +
//                    `• Latest JavaScript/TypeScript features\n` +
//                    `• Recent best practices and patterns\n` +
//                    `• Updated library versions and changes\n` +
//                    `• New VS Code extensions and tools\n\n` +
//                    `What specific technology or topic interests you?`;
//         }
//         
//         if (/best practice|pattern|how to/.test(text)) {
//             return `📚 **Best Practices Research:**\n\n` +
//                    `I can share knowledge about:\n` +
//                    `• Code organization and architecture\n` +
//                    `• Testing strategies and patterns\n` +
//                    `• Performance optimization techniques\n` +
//                    `• Security considerations\n\n` +
//                    `What area would you like to explore?`;
//         }
//         
//         return `🔍 **Research Assistant Ready!**\n\n` +
//                `I can help you research:\n` +
//                `• Programming concepts and patterns\n` +
//                `• Library and framework comparisons\n` +
//                `• Best practices and conventions\n` +
//                `• Implementation examples\n\n` +
//                `What would you like to learn about?`;
//     }
// 
//     // 🚀 MAIN EXECUTION ENGINE - ENHANCED
//     async executeIntent(userText: string, callback?: (message: string) => void): Promise<void> {
//         // Add to conversation history
//         this.conversationHistory.push(userText);
//         if (this.conversationHistory.length > 10) {
//             this.conversationHistory = this.conversationHistory.slice(-10);
//         }
// 
//         const activeEditor = vscode.window.activeTextEditor;
//         const workspaceContext = await this.gatherWorkspaceContext();
//         const intentType = this.classifyIntentType(userText);
//         
//         const payload: IntentRequest = {
//             user_text: userText,
//             diagnostics: activeEditor
//                 ? vscode.languages.getDiagnostics(activeEditor.document.uri).map(diag => ({
//                     message: diag.message,
//                     severity: diag.severity,
//                     range_start: diag.range.start.character,
//                     range_end: diag.range.end.character
//                 }))
//                 : [],
//             selection: activeEditor ? activeEditor.document.getText(activeEditor.selection) : '',
//             fileName: activeEditor ? activeEditor.document.fileName : '',
//             workspace_context: workspaceContext,
//             conversation_history: this.conversationHistory,
//             intent_type: intentType
//         };
// 
//         if (callback) {
//             // Chat panel mode - enhanced with context awareness
//             try {
//                 callback("🤔 Analyzing your request...");
//                 
//                 const intent = await this.callBackend(payload);
//                 
//                 callback(`🎯 Intent: ${intent.intent} | Type: ${intentType} | Confidence: ${Math.round(intent.confidence * 100)}%`);
//                 
//                 const executedCount = await this.discoverAndExecuteTools(
//                     intent.tools_needed, 
//                     intentType, 
//                     userText, 
//                     callback
//                 );
//                 
//                 if (intent.auto_fix && executedCount > 0) {
//                     try {
//                         await vscode.commands.executeCommand('editor.action.fixAll');
//                         callback("🛠️ Applied additional auto-fixes");
//                     } catch (error) {
//                         callback("⚠️ Auto-fix not available for current context");
//                     }
//                 }
//                 
//                 // Provide follow-up suggestions
//                 if (executedCount > 0) {
//                     const suggestions = this.generateFollowUpSuggestions(intentType, intent.intent);
//                     if (suggestions) {
//                         callback(`💡 ${suggestions}`);
//                     }
//                 }
//                 
//             } catch (error: any) {
//                 callback(`❌ Error processing request: ${error.message || error}`);
//             }
//         } else {
//             // Command palette mode - enhanced progress tracking
//             return vscode.window.withProgress({
//                 location: vscode.ProgressLocation.Notification,
//                 title: `🎯 AIDE ${intentType.charAt(0).toUpperCase() + intentType.slice(1)} Pipeline`,
//                 cancellable: false
//             }, async (progress) => {
//                 try {
//                     progress.report({ increment: 15, message: "Analyzing context..." });
//                     const intent = await this.callBackend(payload);
// 
//                     progress.report({
//                         increment: 30,
//                         message: `Processing ${intent.intent} (${Math.round(intent.confidence * 100)}% confidence)`
//                     });
// 
//                     progress.report({ increment: 50, message: "Executing tools..." });
//                     const executedCount = await this.discoverAndExecuteTools(
//                         intent.tools_needed, 
//                         intentType, 
//                         userText
//                     );
// 
//                     if (intent.auto_fix && executedCount > 0) {
//                         try {
//                             await vscode.commands.executeCommand('editor.action.fixAll');
//                             progress.report({ increment: 85, message: "Applying enhancements..." });
//                         } catch (error) {
//                             console.log('Auto-fix not applicable:', error);
//                         }
//                     }
// 
//                     progress.report({ increment: 100, message: `Completed! Executed ${executedCount} operations.` });
// 
//                     const message = executedCount > 0
//                         ? `🎉 AIDE successfully handled your ${intentType} request "${intent.intent}" with ${Math.round(intent.confidence * 100)}% confidence!`
//                         : `🤖 I understood your ${intentType} request "${intent.intent}" but couldn't find matching tools. Let me know if you'd like me to try something else!`;
// 
//                     const actions = ['Ask Another', 'Open Chat', 'Format Code'];
//                     vscode.window.showInformationMessage(message, ...actions).then(selection => {
//                         switch (selection) {
//                             case 'Ask Another':
//                                 vscode.commands.executeCommand('aide.intentExecute');
//                                 break;
//                             case 'Open Chat':
//                                 vscode.commands.executeCommand('aide.openChat');
//                                 break;
//                             case 'Format Code':
//                                 vscode.commands.executeCommand('aide.formatCode');
//                                 break;
//                         }
//                     });
// 
//                 } catch (error: any) {
//                     progress.report({ increment: 100, message: "Processing failed" });
//                     vscode.window.showErrorMessage(`❌ Request failed: ${error.message}. Try rephrasing or ask me for help!`);
//                     console.error('Intent pipeline error:', error);
//                 }
//             });
//         }
//     }
// 
//     private generateFollowUpSuggestions(intentType: string, intent: string): string | null {
//         switch (intentType) {
//             case 'code':
//                 return "Next steps: Want me to run tests, check for issues, or explain what I just did?";
//             case 'learning':
//                 return "Want me to explain anything else, show examples, or dive deeper into this topic?";
//             case 'creative':
//                 return "Should I create related content, add more details, or help with the next step?";
//             case 'file':
//                 return "Need help with more file operations, project organization, or opening related files?";
//             default:
//                 return null;
//         }
//     }
// }

// Global enhanced pipeline instance
let pipeline: UniversalIntentPipeline;

export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 AIDE Universal Intelligence Pipeline activating...');
    
    try {
        launchBackend(context);
        registerCommands(context);
        
        // Initialize ALL UI components
        initSpeechUI(context);
        initIngestUI(context);
        initCodeReviewUI(context);
        initDebugGuideUI(context);
        initMemoryUI(context);
        
        // Initialize enhanced pipeline FIRST
        pipeline = new IntentPipeline();

        // Register webview providers with enhanced pipeline
        const chatProvider = new ChatWebviewProvider(context, pipeline);
        const toolsProvider = new ToolsWebviewProvider(context);
        
        vscode.window.registerWebviewViewProvider('aide.chatView', chatProvider);
        vscode.window.registerWebviewViewProvider('aide.toolsView', toolsProvider);
        
        // Initialize chat panel after providers
        initChatPanel(context);
        
        // Enhanced command registration
        const openChatDisposable = vscode.commands.registerCommand('aide.openChat', () =>
            vscode.commands.executeCommand('workbench.view.extension.aideChatContainer')
        );
        context.subscriptions.push(openChatDisposable);

        // Add speech and ingest buttons to command palette and status bar
        const speechCommand = vscode.commands.registerCommand('aide.speechInput', () => {
            vscode.window.showInformationMessage('🎤 Speech input activated! (Feature coming soon)');
        });
        
        const ingestCommand = vscode.commands.registerCommand('aide.bookIngest', () => {
            vscode.window.showInformationMessage('📚 Book ingest activated! (Feature coming soon)');
        });
        
        context.subscriptions.push(speechCommand, ingestCommand);

        context.subscriptions.push(
            vscode.commands.registerCommand('aide.intentExecute', async () => {
                try {
                    const userInput = await vscode.window.showInputBox({
                        prompt: '🎯 What would you like AIDE to do? (I can code, explain, create, chat, or research!)',
                        placeHolder: 'e.g., "format my code", "explain this function", "create a README", "how are you?"',
                        ignoreFocusOut: true
                    });

                    if (userInput?.trim()) {
                        await pipeline.executeIntent(userInput.trim());
                    }
                } catch (error) {
                    console.error('Intent execute command failed:', error);
                    vscode.window.showErrorMessage(`Failed to execute intent: ${error}`);
                }
            }),

            // Enhanced quick commands
            vscode.commands.registerCommand('aide.formatCode', async () => {
                try {
                    await pipeline.executeIntent('format and clean up my code with best practices');
                } catch (error) {
                    console.error('Format code command failed:', error);
                }
            }),

            vscode.commands.registerCommand('aide.fixErrors', async () => {
                try {
                    await pipeline.executeIntent('analyze and fix all the errors and issues in my code');
                } catch (error) {
                    console.error('Fix errors command failed:', error);
                }
            }),

            vscode.commands.registerCommand('aide.runTests', async () => {
                try {
                    await pipeline.executeIntent('run all tests and show me the results');
                } catch (error) {
                    console.error('Run tests command failed:', error);
                }
            }),

            // New enhanced commands
            vscode.commands.registerCommand('aide.explainCode', async () => {
                try {
                    await pipeline.executeIntent('explain the current code and what it does');
                } catch (error) {
                    console.error('Explain code command failed:', error);
                }
            }),

            vscode.commands.registerCommand('aide.generateDocs', async () => {
                try {
                    await pipeline.executeIntent('create documentation for this project');
                } catch (error) {
                    console.error('Generate docs command failed:', error);
                }
            })
        );

        // Enhanced status bar with more options
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.text = '$(robot) AIDE';
        statusBarItem.tooltip = 'AIDE Universal AI Assistant - Click for quick access!';
        statusBarItem.command = 'aide.intentExecute';
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);

        // Enhanced welcome message
        vscode.window.showInformationMessage(
            'AIDE Universal Intelligence is ready! 🚀 I can code, explain, create, chat, research, and much more!',
            'Open Chat',
            'Try Smart Intent',
            'Format Code',
            'Explain Code',
            'Generate Docs'
        ).then(selection => {
            switch(selection) {
                case 'Open Chat':
                    vscode.commands.executeCommand('aide.openChat');
                    break;
                case 'Try Smart Intent':
                    vscode.commands.executeCommand('aide.intentExecute');
                    break;
                case 'Format Code':
                    vscode.commands.executeCommand('aide.formatCode');
                    break;
                case 'Explain Code':
                    vscode.commands.executeCommand('aide.explainCode');
                    break;
                case 'Generate Docs':
                    vscode.commands.executeCommand('aide.generateDocs');
                    break;
            }
        });

        console.log('✅ AIDE Universal Intelligence activation complete! Ready for any task! 🎯');
        
    } catch (error) {
        console.error('AIDE activation failed:', error);
        vscode.window.showErrorMessage(`AIDE failed to activate: ${error}`);
    }
}

export function deactivate() {
    console.log('🔴 AIDE Universal Intelligence deactivated');
}

