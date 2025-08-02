# File: src/backend/routers/chat.py

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from typing import Dict, Any, Optional
import json

from ..core.logger import logger
from ..core.conversation_modes import should_use_tool_mode, determine_response_strategy
from ..services.streaming_service import StreamingService
from ..services.memory_service import MemoryService
from ..models.chat_models import ChatRequest, ChatResponse

router = APIRouter(prefix="/chat", tags=["chat"])

# Service instances
streaming_service = StreamingService()
memory_service = MemoryService()

@router.post("/", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    """
    Main chat endpoint with memory injection and enhanced fallback
    Extracted from monolithic api.py
    """
    message = request.message
    context = request.context or {}
    
    if not message:
        return ChatResponse(
            response="No message provided",
            success=False,
            error="Empty message"
        )
    
    try:
        logger.info(f"🤖 Processing chat message: {message[:50]}...")
        
        # Determine response strategy
        strategy = determine_response_strategy(message, context)
        
        # Check if we have a valid model loaded
        # This would normally import from model_manager or check global state
        current_model = None  # TODO: Get from model service
        
        if current_model and hasattr(current_model, 'tokenizer') and hasattr(current_model, 'model'):
            try:
                tokenizer, model = current_model.tokenizer, current_model.model
                
                if strategy["mode"] in ["tool", "mixed"]:
                    # Use streaming service for tool-enabled responses
                    response_text, used_tools, actions = await _generate_with_tools(
                        model, tokenizer, message, context
                    )
                    
                    return ChatResponse(
                        response=response_text,
                        model_used=str(model),
                        actions=actions,
                        tools_invoked=used_tools,
                        conversation_type="llm_with_tools",
                        success=True
                    )
                else:
                    # Simple conversation mode
                    response_text = await _generate_conversation(
                        model, tokenizer, message, context
                    )
                    
                    return ChatResponse(
                        response=response_text,
                        model_used=str(model),
                        conversation_type="llm_conversation",
                        success=True
                    )
            
            except Exception as model_error:
                logger.error(f"Model generation failed: {model_error}")
                # Fall through to enhanced fallback
        
        # Enhanced fallback mode
        logger.info("📝 Using enhanced fallback mode")
        
        # Get relevant memories for context
        memories = await memory_service.recall_memories(message, top_k=2)
        memory_context = ""
        if memories:
            memory_context = f"\\n\\nFrom our previous conversations:\\n"
            for memory in memories:
                timestamp = memory["timestamp"][:16]
                content = memory["content"][:200]
                memory_context += f"• [{timestamp}] {content}\\n"
        
        # Generate enhanced fallback response
        response_text = await _generate_enhanced_fallback(message, context, strategy, memory_context)
        
        # Save interaction to memory
        await memory_service.save_interaction(
            user_message=message,
            ai_response=response_text,
            context=context
        )
        
        return ChatResponse(
            response=response_text,
            conversation_type="enhanced_fallback",
            fallback_reason="Model not available",
            success=True
        )
    
    except Exception as e:
        logger.error(f"Chat endpoint error: {e}")
        return ChatResponse(
            response=f"I encountered an error: {str(e)}",
            conversation_type="error",
            success=False,
            error=str(e)
        )

async def _generate_with_tools(model, tokenizer, message: str, context: dict):
    """Generate response using tools"""
    # This would normally use the streaming service
    # For now, return a placeholder
    return f"I understand you want me to use tools for: {message}", [], []

async def _generate_conversation(model, tokenizer, message: str, context: dict):
    """Generate simple conversation response"""
    # This would normally use the model directly
    # For now, return a placeholder
    return f"I understand you're saying: {message}"

async def _generate_enhanced_fallback(message: str, context: dict, strategy: dict, memory_context: str) -> str:
    """Generate enhanced fallback response with memory and context"""
    
    # Analyze message for response generation
    message_lower = message.lower()
    
    # Contextual responses based on workspace
    workspace_context = ""
    current_file = context.get("currentFile", {})
    workspace = context.get("workspace", {})
    
    if current_file.get("filename"):
        workspace_context = f"I can see you're working on {current_file['filename']}. "
    elif workspace.get("name"):
        workspace_context = f"I can see you're in the {workspace['name']} workspace. "
    
    # Base response with context
    base_response = f"{workspace_context}I'm AIDE, your coding assistant. "
    
    # Question handling
    if message_lower.startswith(("what", "how", "why", "when", "where", "who")):
        if "file" in message_lower or "code" in message_lower:
            base_response += "I can help you analyze files and code. Try asking me to 'read the current file' or 'analyze the codebase'."
        elif "tool" in message_lower:
            base_response += "I have access to several tools including file reading, codebase analysis, web search, and workspace context."
        else:
            base_response += "I can help with code review, debugging, file operations, and web searches. What specific task would you like me to help with?"
    
    # Greeting handling
    elif any(greeting in message_lower for greeting in ["hello", "hi", "hey", "greetings"]):
        base_response += "Hello! I'm ready to help with your coding tasks. I can read files, analyze your codebase, search the web, and assist with debugging."
    
    # Help requests
    elif "help" in message_lower:
        base_response += "I can assist with:\\n• Reading and analyzing files\\n• Codebase structure analysis\\n• Web searches for information\\n• Code review and debugging\\n• Workspace navigation"
    
    # Tool-specific requests with guidance
    elif any(word in message_lower for word in ["read", "file", "show"]):
        base_response += "I can read files for you! Try saying 'read the current file' or specify a file path like 'read config.json'."
    
    elif any(word in message_lower for word in ["search", "find", "look up"]):
        base_response += "I can search for information! Try asking me to 'search for [topic]' and I'll find relevant information online."
    
    elif any(word in message_lower for word in ["analyze", "codebase", "project"]):
        base_response += "I can analyze your codebase! Ask me to 'analyze the codebase' or 'show project structure' to get started."
    
    # General conversational responses
    else:
        base_response += f"Regarding '{message}' - I'm here to help with your development tasks. "
        
        if strategy["suggested_tools"]:
            tools_text = ", ".join(strategy["suggested_tools"])
            base_response += f"I could use tools like {tools_text} to help with this."
    
    # Add memory context if available
    if memory_context:
        base_response += memory_context
    
    # Add helpful tips
    base_response += "\\n\\n💡 **Tip**: I work best when you give me specific tasks like 'read the package.json file' or 'search for FastAPI documentation'."
    
    return base_response

@router.websocket("/stream")
async def chat_websocket_stream(websocket: WebSocket):
    """
    WebSocket endpoint for streaming chat responses
    This will integrate with the existing WebSocket handler in main.py
    """
    await websocket.accept()
    
    try:
        while True:
            # Wait for message
            data = await websocket.receive_json()
            
            if data.get("type") == "chat_message":
                message = data.get("message", "")
                context = data.get("context", {})
                
                # Send thinking indicator
                await websocket.send_json({
                    "type": "thinking",
                    "message": "🤔 Processing your message..."
                })
                
                # Process with streaming service
                try:
                    # This would integrate with the main WebSocket handler
                    await websocket.send_json({
                        "type": "response",
                        "message": f"Processed: {message}",
                        "complete": True
                    })
                except Exception as e:
                    await websocket.send_json({
                        "type": "error",
                        "message": str(e)
                    })
    
    except WebSocketDisconnect:
        logger.info("Chat WebSocket disconnected")
    except Exception as e:
        logger.error(f"Chat WebSocket error: {e}")

@router.get("/history")
async def get_chat_history(limit: int = 50):
    """Get recent chat history from memory"""
    try:
        recent_memories = await memory_service.get_recent_memories(hours=24, limit=limit)
        
        # Filter for interaction type memories
        chat_history = [
            {
                "timestamp": memory["timestamp"],
                "user_message": memory["context"].get("user_message", ""),
                "ai_response": memory["context"].get("ai_response", ""),
                "interaction_type": memory["context"].get("interaction_type", "unknown")
            }
            for memory in recent_memories
            if memory.get("type") == "interaction"
        ]
        
        return {
            "success": True,
            "history": chat_history,
            "count": len(chat_history)
        }
    
    except Exception as e:
        logger.error(f"Failed to get chat history: {e}")
        return {
            "success": False,
            "error": str(e),
            "history": []
        }

@router.delete("/history")
async def clear_chat_history():
    """Clear chat history"""
    try:
        result = await memory_service.clear_all_memories()
        return result
    except Exception as e:
        logger.error(f"Failed to clear chat history: {e}")
        return {
            "success": False,
            "error": str(e)
        }