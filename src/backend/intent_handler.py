from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import logging

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter()


class DiagnosticDump(BaseModel):
    message: str
    severity: int = Field(..., ge=0, le=3, description="0=Error, 1=Warning, 2=Info, 3=Hint")
    range_start: int = Field(..., ge=0)
    range_end: int = Field(..., ge=0)


class IntentRequest(BaseModel):
    user_text: str = Field(..., min_length=1, max_length=1000)
    diagnostics: List[DiagnosticDump] = Field(default_factory=list)
    selection: str = Field(default="", max_length=2000)
    fileName: str = Field(default="")

    class Config:
        schema_extra = {
            "example": {
                "user_text": "format my code",
                "diagnostics": [
                    {
                        "message": "Missing semicolon",
                        "severity": 0,
                        "range_start": 10,
                        "range_end": 15
                    }
                ],
                "selection": "const foo = bar",
                "fileName": "/workspace/src/main.ts"
            }
        }


class ParsedIntent(BaseModel):
    intent: str = Field(..., description="The identified intent verb_noun format")
    scope: Literal['file', 'workspace', 'selection'] = Field(..., description="Execution scope")
    auto_fix: bool = Field(..., description="Whether to apply fixes automatically")
    tools_needed: List[str] = Field(..., description="List of tools/commands required")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Intent classification confidence")
    context_hints: Optional[List[str]] = Field(default_factory=list, description="Additional context for execution")

    class Config:
        schema_extra = {
            "example": {
                "intent": "format_code",
                "scope": "file",
                "auto_fix": True,
                "tools_needed": ["formatter", "indent_checker"],
                "confidence": 0.95,
                "context_hints": ["typescript", "prettier_available"]
            }
        }


class IntentClassifier:
    """Enhanced intent classification with pattern matching and context awareness"""
    
    def __init__(self):
        # Intent patterns with synonyms and context
        self.intent_patterns = {
            "format_code": {
                "keywords": ["format", "indent", "prettier", "beautify", "style", "clean up formatting"],
                "file_extensions": [".js", ".ts", ".py", ".java", ".cpp", ".css", ".html"],
                "confidence_boost": 0.1
            },
            "fix_errors": {
                "keywords": ["fix", "debug", "error", "bug", "issue", "problem", "resolve", "repair"],
                "requires_diagnostics": True,
                "confidence_boost": 0.2
            },
            "run_tests": {
                "keywords": ["test", "testing", "spec", "unit", "integration", "e2e", "coverage"],
                "file_extensions": [".test.js", ".spec.ts", ".py"],
                "confidence_boost": 0.15
            },
            "refactor_code": {
                "keywords": ["refactor", "optimize", "clean", "improve", "restructure", "reorganize"],
                "confidence_boost": 0.1
            },
            "search_code": {
                "keywords": ["search", "find", "grep", "locate", "look for", "hunt"],
                "confidence_boost": 0.05
            },
            "generate_code": {
                "keywords": ["generate", "create", "write", "make", "build", "scaffold"],
                "confidence_boost": 0.1
            },
            "explain_code": {
                "keywords": ["explain", "describe", "what does", "how does", "analyze", "breakdown"],
                "confidence_boost": 0.05
            },
            "document_code": {
                "keywords": ["document", "comment", "docs", "documentation", "annotate"],
                "confidence_boost": 0.05
            }
        }
    
    def classify_intent(self, request: IntentRequest) -> ParsedIntent:
        """Classify user intent with enhanced context awareness"""
        
        user_input = request.user_text.lower().strip()
        best_intent = "general_help"
        best_confidence = 0.3
        context_hints = []
        
        # Extract file extension for context
        file_ext = self._extract_file_extension(request.fileName)
        if file_ext:
            context_hints.append(f"file_type_{file_ext[1:]}")
        
        # Check for selection context
        if request.selection.strip():
            context_hints.append("has_selection")
        
        # Check for diagnostics context
        if request.diagnostics:
            context_hints.append("has_errors")
            context_hints.extend([f"error_severity_{d.severity}" for d in request.diagnostics])
        
        # Pattern matching with confidence scoring
        for intent, pattern in self.intent_patterns.items():
            confidence = self._calculate_confidence(user_input, pattern, request)
            
            if confidence > best_confidence:
                best_confidence = confidence
                best_intent = intent
        
        # Generate response based on classified intent
        return self._generate_intent_response(best_intent, request, best_confidence, context_hints)
    
    def _calculate_confidence(self, user_input: str, pattern: dict, request: IntentRequest) -> float:
        """Calculate confidence score for intent classification"""
        confidence = 0.0
        
        # Keyword matching
        matched_keywords = sum(1 for keyword in pattern["keywords"] if keyword in user_input)
        if matched_keywords > 0:
            confidence = 0.6 + (matched_keywords * 0.1)
        
        # File extension boost
        if "file_extensions" in pattern:
            file_ext = self._extract_file_extension(request.fileName)
            if file_ext and file_ext in pattern["file_extensions"]:
                confidence += pattern.get("confidence_boost", 0.0)
        
        # Diagnostics requirement
        if pattern.get("requires_diagnostics", False):
            if request.diagnostics:
                confidence += 0.2
            else:
                confidence *= 0.5  # Penalize if diagnostics required but not present
        
        return min(confidence, 1.0)
    
    def _extract_file_extension(self, filename: str) -> Optional[str]:
        """Extract file extension from filename"""
        if not filename:
            return None
        
        # Handle compound extensions like .test.js, .spec.ts
        parts = filename.lower().split('.')
        if len(parts) >= 3 and parts[-2] in ['test', 'spec']:
            return f".{parts[-2]}.{parts[-1]}"
        elif len(parts) >= 2:
            return f".{parts[-1]}"
        
        return None
    
    def _generate_intent_response(self, intent: str, request: IntentRequest, 
                                confidence: float, context_hints: List[str]) -> ParsedIntent:
        """Generate appropriate response for classified intent"""
        
        # Smart scope detection
        scope = self._determine_scope(intent, request)
        
        # Intent-specific responses
        intent_configs = {
            "format_code": {
                "auto_fix": True,
                "tools_needed": ["formatter", "indent_checker", "style_guide"]
            },
            "fix_errors": {
                "auto_fix": True,
                "tools_needed": ["linter", "auto_fix", "diagnostics", "syntax_checker"]
            },
            "run_tests": {
                "auto_fix": False,
                "tools_needed": ["test_runner", "coverage", "test_discovery"]
            },
            "refactor_code": {
                "auto_fix": False,
                "tools_needed": ["refactor_tools", "code_analysis", "dependency_graph"]
            },
            "search_code": {
                "auto_fix": False,
                "tools_needed": ["search", "regex", "file_explorer"]
            },
            "generate_code": {
                "auto_fix": False,
                "tools_needed": ["code_generator", "template_engine", "scaffolding"]
            },
            "explain_code": {
                "auto_fix": False,
                "tools_needed": ["code_analyzer", "documentation", "ast_parser"]
            },
            "document_code": {
                "auto_fix": True,
                "tools_needed": ["doc_generator", "comment_formatter", "api_docs"]
            },
            "general_help": {
                "auto_fix": False,
                "tools_needed": ["documentation", "chat", "help_system"]
            }
        }
        
        config = intent_configs.get(intent, intent_configs["general_help"])
        
        return ParsedIntent(
            intent=intent,
            scope=scope,
            auto_fix=config["auto_fix"],
            tools_needed=config["tools_needed"],
            confidence=confidence,
            context_hints=context_hints
        )
    
    def _determine_scope(self, intent: str, request: IntentRequest) -> Literal['file', 'workspace', 'selection']:
        """Intelligently determine execution scope"""
        
        # If user has selected text, prefer selection scope for certain intents
        if request.selection.strip() and intent in ["refactor_code", "explain_code", "document_code"]:
            return "selection"
        
        # Workspace-level intents
        if intent in ["run_tests", "search_code", "generate_code"]:
            return "workspace"
        
        # Default to file scope
        return "file"


# Initialize classifier
classifier = IntentClassifier()


@router.post("/intent", response_model=ParsedIntent)
async def parse_intent(request: IntentRequest):
    """
    Enhanced structured intent interpretation for VS Code tool discovery
    
    This endpoint analyzes user input and context to determine:
    - What the user wants to do (intent)
    - Where to apply it (scope)  
    - Whether to auto-fix (auto_fix)
    - What tools are needed (tools_needed)
    - Confidence level and context hints
    """
    
    try:
        logger.info(f"Processing intent request: {request.user_text[:50]}...")
        
        # Validate input
        if not request.user_text.strip():
            raise HTTPException(status_code=400, detail="Empty user text not allowed")
        
        # Classify intent using enhanced classifier
        result = classifier.classify_intent(request)
        
        logger.info(f"Classified intent: {result.intent} (confidence: {result.confidence:.2f})")
        
        return result
        
    except Exception as e:
        logger.error(f"Intent classification failed: {str(e)}")
        
        # Fallback response
        return ParsedIntent(
            intent="general_help",
            scope="workspace",
            auto_fix=False,
            tools_needed=["documentation", "chat"],
            confidence=0.1,
            context_hints=["error_fallback"]
        )


@router.get("/intent/health")
async def intent_health():
    """Health check endpoint for intent service"""
    return {
        "status": "healthy",
        "service": "intent_interpreter",
        "patterns_loaded": len(classifier.intent_patterns),
        "version": "1.0.0"
    }


@router.get("/intent/patterns")
async def get_intent_patterns():
    """Debug endpoint to view available intent patterns"""
    return {
        "patterns": list(classifier.intent_patterns.keys()),
        "details": classifier.intent_patterns
    }

