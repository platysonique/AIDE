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

export class IntelligenceEngine {
  async handleQuery(text: string): Promise<ParsedIntent> {
    const userText = text.toLowerCase();
    
    // Enhanced intent classification with real reasoning
    const intentType = this.classifyIntentType(userText);
    const confidence = this.calculateConfidence(userText, intentType);
    
    return {
      intent: this.getSpecificIntent(intentType, userText),
      scope: this.determineScope(userText),
      auto_fix: /fix|repair|correct|debug/.test(userText),
      tools_needed: this.getRequiredTools(intentType, userText),
      confidence: confidence,
      context_hints: [
        `classified_as_${intentType}`, 
        `confidence_${Math.round(confidence * 100)}%`,
        `requires_${this.getResponseType(intentType)}`
      ],
      response_type: this.getResponseType(intentType),
      requires_context: intentType !== 'chat'
    };
  }

  private classifyIntentType(text: string): string {
    // Code automation & development tasks
    if (/\b(format|fix|debug|test|run|compile|build|lint|refactor|optimize)\b/.test(text)) {
      return 'code';
    }
    
    // File and workspace operations  
    if (/\b(create|delete|move|rename|open|save|file|folder|directory)\b/.test(text)) {
      return 'file';
    }
    
    // Learning and explanation requests
    if (/\b(explain|how|what|why|teach|learn|understand|mean|show|help)\b/.test(text)) {
      return 'learning';
    }
    
    // Creative and generation tasks
    if (/\b(write|create|generate|make|build|design|comment|document|readme)\b/.test(text)) {
      return 'creative';
    }
    
    // Research and search tasks (online search integration ready)
    if (/\b(search|find|look up|research|latest|best|compare|time|weather|when)\b/.test(text)) {
      return 'research';
    }
    
    // Configuration and setup
    if (/\b(config|setting|setup|install|configure|env|environment)\b/.test(text)) {
      return 'config';
    }
    
    // Default to conversational for general chat
    return 'chat';
  }

  private calculateConfidence(text: string, intentType: string): number {
    let confidence = 0.6; // Base confidence
    
    // Keywords that boost confidence for each intent type
    const confidenceBoostKeywords = {
      'code': ['format', 'debug', 'fix', 'test', 'compile', 'lint'],
      'file': ['create', 'open', 'delete', 'save', 'file', 'folder'],
      'learning': ['explain', 'teach', 'how', 'what', 'why', 'show'],
      'creative': ['write', 'generate', 'create', 'make', 'document'],
      'research': ['search', 'find', 'research', 'latest', 'time', 'when'],
      'config': ['config', 'setup', 'install', 'configure', 'env']
    };
    
    const keywords = confidenceBoostKeywords[intentType as keyof typeof confidenceBoostKeywords] || [];
    const matches = keywords.filter(keyword => text.includes(keyword)).length;
    
    // Boost confidence based on keyword matches
    confidence += matches * 0.12;
    
    // Additional confidence for specific patterns
    if (text.includes('?')) confidence += 0.1; // Questions are clearer intent
    if (text.length > 20) confidence += 0.05; // Longer queries usually more specific
    if (/\b(please|can you|could you)\b/.test(text)) confidence += 0.08; // Polite requests
    
    return Math.min(confidence, 0.95); // Cap at 95%
  }

  private getSpecificIntent(type: string, text: string): string {
    switch (type) {
      case 'code':
        if (/format/.test(text)) return 'format_code';
        if (/fix|debug/.test(text)) return 'fix_errors';
        if (/test/.test(text)) return 'run_tests';
        if (/refactor/.test(text)) return 'refactor_code';
        if (/compile|build/.test(text)) return 'build_project';
        if (/lint/.test(text)) return 'lint_code';
        return 'code_automation';
      
      case 'file':
        if (/create/.test(text)) return 'create_file';
        if (/open/.test(text)) return 'open_file';
        if (/delete/.test(text)) return 'delete_file';
        if (/save/.test(text)) return 'save_file';
        return 'file_operation';
      
      case 'learning':
        if (/explain/.test(text)) return 'explain_code';
        if (/how/.test(text)) return 'show_howto';
        if (/what/.test(text)) return 'define_concept';
        return 'provide_help';
      
      case 'creative':
        if (/readme/.test(text)) return 'generate_readme';
        if (/comment/.test(text)) return 'add_comments';
        if (/test/.test(text)) return 'generate_tests';
        if (/document/.test(text)) return 'create_documentation';
        return 'generate_content';
      
      case 'research':
        if (/time/.test(text)) return 'get_time_info';
        if (/weather/.test(text)) return 'get_weather';
        if (/latest|news/.test(text)) return 'search_news';
        if (/api|key/.test(text)) return 'find_api_keys';
        return 'find_information';
      
      case 'config':
        if (/setup/.test(text)) return 'setup_environment';
        if (/install/.test(text)) return 'install_packages';
        return 'configure_system';
      
      default:
        return 'general_conversation';
    }
  }

  private determineScope(text: string): 'file' | 'workspace' | 'selection' | 'global' {
    if (/selection|selected|this|current/.test(text)) return 'selection';
    if (/workspace|project|all files|entire/.test(text)) return 'workspace';
    if (/global|everywhere|system/.test(text)) return 'global';
    return 'file'; // Default to current file
  }

  private getRequiredTools(type: string, text: string): string[] {
    switch (type) {
      case 'code':
        const codeTools = [];
        if (/format/.test(text)) codeTools.push('formatter');
        if (/fix|debug/.test(text)) codeTools.push('linter', 'auto_fix');
        if (/test/.test(text)) codeTools.push('test_runner');
        if (/compile|build/.test(text)) codeTools.push('compiler');
        return codeTools.length > 0 ? codeTools : ['formatter', 'linter'];
      
      case 'file':
        return ['file_manager', 'workspace_navigator'];
      
      case 'learning':
        return ['code_explainer', 'documentation', 'help_system'];
      
      case 'creative':
        return ['content_generator', 'template_creator', 'ast_parser'];
      
      case 'research':
        if (/api|key/.test(text)) return ['workspace_search', 'file_scanner'];
        return ['online_search', 'web_scraper', 'api_caller'];
      
      case 'config':
        return ['file_manager', 'environment_setup', 'package_manager'];
      
      default:
        return ['chat_handler', 'conversation_manager'];
    }
  }

  private getResponseType(type: string): 'action' | 'explanation' | 'creation' | 'conversation' {
    switch (type) {
      case 'code': return 'action';
      case 'file': return 'action';  
      case 'learning': return 'explanation';
      case 'creative': return 'creation';
      case 'research': return 'explanation';
      case 'config': return 'action';
      default: return 'conversation';
    }
  }
}

export { ParsedIntent };
