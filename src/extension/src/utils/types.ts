// src/types.ts
export interface ParsedIntent {
  intent: string;
  scope: 'file' | 'workspace' | 'selection';
  auto_fix: boolean;
  tools_needed: string[];
  confidence: number;
  context_hints?: string[];
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

