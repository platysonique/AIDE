# File: src/backend/core/conversation_modes.py

from typing import Dict, Any
from .logger import logger

def should_use_tool_mode(message: str, context: Dict[str, Any] = None) -> bool:
    """
    ENHANCED: Determine tool mode based on message content, not file state
    Fixes the file dependency bug in original api.py
    """
    message_lower = message.lower()
    
    # Explicit tool trigger words
    tool_triggers = [
        "read", "file", "analyze", "codebase", "directory", "folder",
        "show me", "list", "find", "search", "look at", "examine",
        "what files", "see files", "project structure", "workspace",
        "get context", "current file", "open file"
    ]
    
    # Check for tool triggers
    for trigger in tool_triggers:
        if trigger in message_lower:
            logger.debug(f"Tool mode triggered by: {trigger}")
            return True
    
    # Question patterns that likely need tools
    question_patterns = [
        "what is in", "what's in", "show me the", "can you read",
        "what does this file", "what are the files", "list all"
    ]
    
    for pattern in question_patterns:
        if pattern in message_lower:
            logger.debug(f"Tool mode triggered by question pattern: {pattern}")
            return True
    
    # Discussion patterns (conversation mode)
    discussion_patterns = [
        "i think", "i believe", "opinion", "what if", "do you think",
        "explain", "tell me about", "how does", "why", "what is",
        "i'm worried", "i'm concerned", "this might", "this could",
        "discuss", "thoughts on", "feelings about"
    ]
    
    for pattern in discussion_patterns:
        if pattern in message_lower:
            logger.debug(f"Conversation mode preferred due to: {pattern}")
            return False
    
    # Default: allow conversation mode even without files
    # This fixes the original bug where chat would fail without open files
    return False

def get_conversation_context(context: Dict[str, Any]) -> str:
    """Build context string that works with or without open files"""
    parts = []
    
    workspace = context.get("workspace", {})
    if workspace.get("name"):
        parts.append(f"Workspace: {workspace['name']}")
    
    current_file = context.get("currentFile", {})
    if current_file.get("filename"):
        parts.append(f"Current file: {current_file['filename']}")
        
        # Add language context if available
        if current_file.get("language"):
            parts.append(f"Language: {current_file['language']}")
            
        # Add selection context if available
        if current_file.get("selection"):
            selection_length = len(current_file["selection"])
            parts.append(f"Selected: {selection_length} chars")
    else:
        parts.append("No file currently open")
    
    return " | ".join(parts) if parts else "Ready to assist"

def determine_response_strategy(message: str, context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Determine the best response strategy based on message and context
    """
    strategy = {
        "mode": "conversation",  # Default to conversation
        "requires_tools": False,
        "suggested_tools": [],
        "confidence": 0.5
    }
    
    message_lower = message.lower()
    
    # Check if tools are explicitly needed
    if should_use_tool_mode(message, context):
        strategy["mode"] = "tool"
        strategy["requires_tools"] = True
        
        # Suggest specific tools based on content
        if any(word in message_lower for word in ["read", "file", "show"]):
            strategy["suggested_tools"].append("read_file")
        
        if any(word in message_lower for word in ["analyze", "codebase", "project"]):
            strategy["suggested_tools"].append("analyze_codebase")
        
        if any(word in message_lower for word in ["search", "find", "look up"]):
            strategy["suggested_tools"].append("online_search")
        
        if any(word in message_lower for word in ["context", "workspace", "current"]):
            strategy["suggested_tools"].append("get_context")
        
        strategy["confidence"] = 0.8
    
    # Check for mixed mode (conversation + tools)
    elif any(word in message_lower for word in ["help", "explain", "how to"]):
        strategy["mode"] = "mixed"
        strategy["requires_tools"] = True
        strategy["suggested_tools"] = ["get_context"]  # Always helpful for context
        strategy["confidence"] = 0.6
    
    logger.debug(f"Response strategy: {strategy}")
    return strategy

def format_context_for_prompt(context: Dict[str, Any], include_file_content: bool = False) -> str:
    """
    Format context information for inclusion in AI prompts
    """
    context_parts = []
    
    # Workspace information
    workspace = context.get("workspace", {})
    if workspace:
        context_parts.append(f"Workspace: {workspace.get('name', 'Unknown')}")
        if workspace.get('rootPath'):
            context_parts.append(f"Root: {workspace['rootPath']}")
    
    # Current file information
    current_file = context.get("currentFile", {})
    if current_file:
        filename = current_file.get("filename", "Unknown file")
        context_parts.append(f"File: {filename}")
        
        if current_file.get("language"):
            context_parts.append(f"Language: {current_file['language']}")
        
        # Include file content if requested and available
        if include_file_content and current_file.get("content"):
            content = current_file["content"]
            if len(content) > 1000:  # Truncate long files
                content = content[:1000] + "... [truncated]"
            context_parts.append(f"Content preview:\n{content}")
        
        # Include selection if available
        if current_file.get("selection"):
            selection = current_file["selection"]
            if len(selection) > 500:  # Truncate long selections
                selection = selection[:500] + "... [truncated]"
            context_parts.append(f"Selected text:\n{selection}")
    
    return "\n".join(context_parts) if context_parts else "No specific context available"