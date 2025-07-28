// Enhanced shared interfaces for modular AIDE
export interface DiagnosticDump {
  message: string;
  severity: number;
  range_start: number;
  range_end: number;
}

export interface WorkspaceContext {
  openFiles: string[];
  currentFile?: string;
  language?: string;
  projectType?: string;
  hasPackageJson: boolean;
  hasTsConfig: boolean;
  folderStructure: string[];
}

export interface IntentRequest {
  user_text: string;
  diagnostics: DiagnosticDump[];
  selection: string;
  fileName: string;
  workspace_context: WorkspaceContext;
  conversation_history: string[];
  intent_type: 'code' | 'chat' | 'file' | 'learning' | 'creative' | 'research';
}

export interface ParsedIntent {
  intent: string;
  scope: 'file' | 'workspace' | 'selection' | 'global';
  auto_fix: boolean;
  tools_needed: string[];
  confidence: number;
  context_hints?: string[];
  response_type: 'action' | 'explanation' | 'creation' | 'conversation';
  requires_context: boolean;
}

export interface CodeReviewResponse {
  status: string;
  message: string;
  suggestions?: Array<{
    line: number;
    issue: string;
    fix: string;
  }>;
}

export interface DebugResponse {
  errors?: Array<{
    message: string;
    line: number;
    severity: number;
  }>;
  suggestions?: string[];
  status: string;
}
