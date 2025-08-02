# File: src/backend/models/chat_models.py

from pydantic import BaseModel
from typing import Dict, List, Any, Optional

class ChatRequest(BaseModel):
    """Chat request model"""
    message: str
    context: Optional[Dict[str, Any]] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "message": "Can you read the package.json file?",
                "context": {
                    "currentFile": {
                        "filename": "package.json",
                        "language": "json"
                    },
                    "workspace": {
                        "name": "my-project",
                        "rootPath": "/path/to/project"
                    }
                }
            }
        }

class ChatResponse(BaseModel):
    """Chat response model"""
    response: str
    success: bool = True
    model_used: Optional[str] = None
    actions: Optional[List[Dict[str, Any]]] = None
    tools_invoked: Optional[List[str]] = None
    detected_intents: Optional[List[str]] = None
    conversation_type: Optional[str] = None
    fallback_reason: Optional[str] = None
    error: Optional[str] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "response": "I can see your package.json file. Here's the content...",
                "success": True,
                "model_used": "deepseek-r1-7b",
                "tools_invoked": ["read_file"],
                "conversation_type": "llm_with_tools"
            }
        }