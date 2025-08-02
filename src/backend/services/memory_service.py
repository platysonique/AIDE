# File: src/backend/services/memory_service.py

from typing import Dict, List, Any, Optional
from datetime import datetime

from ..core.vector_memory import memory_store, save_memory, recall_memory, clear_memory, get_memory_stats
from ..core.logger import logger

class MemoryService:
    """Service for managing conversation memory and context"""
    
    def __init__(self):
        self.memory_store = memory_store
    
    async def save_interaction(self, user_message: str, ai_response: str, 
                             context: Optional[Dict[str, Any]] = None) -> str:
        """Save a complete user-AI interaction to memory"""
        interaction_content = f"User: {user_message}\nAI: {ai_response}"
        
        # Enhanced context with interaction metadata
        interaction_context = {
            "user_message": user_message,
            "ai_response": ai_response,
            "interaction_type": "chat",
            **(context or {})
        }
        
        memory_id = save_memory(
            content=interaction_content,
            memory_type="interaction",
            context=interaction_context
        )
        
        logger.info(f"💾 Saved interaction to memory: {memory_id}")
        return memory_id
    
    async def save_tool_usage(self, tool_name: str, tool_args: Dict[str, Any], 
                            tool_result: Any, context: Optional[Dict[str, Any]] = None) -> str:
        """Save tool usage to memory for learning patterns"""
        tool_content = f"Tool: {tool_name}\nArgs: {tool_args}\nResult: {str(tool_result)[:500]}"
        
        tool_context = {
            "tool_name": tool_name,
            "tool_args": tool_args,
            "success": tool_result is not None,
            **(context or {})
        }
        
        memory_id = save_memory(
            content=tool_content,
            memory_type="tool_usage",
            context=tool_context
        )
        
        logger.debug(f"🔧 Saved tool usage to memory: {tool_name}")
        return memory_id
    
    async def recall_memories(self, query: str, top_k: int = 3, 
                            memory_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """Recall relevant memories with optional filtering by type"""
        memories = recall_memory(query, top_k * 2)  # Get more, then filter
        
        # Filter by type if specified
        if memory_type:
            memories = [m for m in memories if m.get("type") == memory_type]
        
        # Return top_k after filtering
        return memories[:top_k]
    
    async def get_conversation_context(self, query: str, max_context_length: int = 1000) -> str:
        """Get relevant conversation context for prompt injection"""
        memories = await self.recall_memories(query, top_k=3, memory_type="interaction")
        
        if not memories:
            return ""
        
        context_parts = []
        total_length = 0
        
        for memory in memories:
            content = memory["content"]
            timestamp = memory["timestamp"][:16]  # YYYY-MM-DD HH:MM
            
            # Format memory for context
            context_line = f"[{timestamp}] {content}"
            
            # Check if adding this would exceed length limit
            if total_length + len(context_line) > max_context_length:
                break
            
            context_parts.append(context_line)
            total_length += len(context_line)
        
        if context_parts:
            return "Relevant Past Context:\n" + "\n".join(context_parts) + "\n\n"
        
        return ""
    
    async def save_code_context(self, file_path: str, file_content: str, 
                              action: str, context: Optional[Dict[str, Any]] = None) -> str:
        """Save code-related context to memory"""
        code_content = f"Action: {action}\nFile: {file_path}\nContent: {file_content[:1000]}"
        
        code_context = {
            "file_path": file_path,
            "action": action,
            "file_size": len(file_content),
            **(context or {})
        }
        
        memory_id = save_memory(
            content=code_content,
            memory_type="code_context",
            context=code_context
        )
        
        logger.debug(f"📄 Saved code context to memory: {file_path}")
        return memory_id
    
    async def clear_all_memories(self) -> Dict[str, Any]:
        """Clear all memories (admin function)"""
        try:
            clear_memory()
            return {"status": "success", "message": "All memories cleared"}
        except Exception as e:
            logger.error(f"Failed to clear memories: {e}")
            return {"status": "error", "message": str(e)}
    
    async def get_memory_statistics(self) -> Dict[str, Any]:
        """Get memory system statistics"""
        stats = get_memory_stats()
        
        # Add service-level statistics
        if hasattr(self.memory_store, 'metadata'):
            type_counts = {}
            for memory in self.memory_store.metadata.values():
                memory_type = memory.get("type", "unknown")
                type_counts[memory_type] = type_counts.get(memory_type, 0) + 1
            
            stats["memory_types"] = type_counts
        
        return stats
    
    async def export_memories(self, memory_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """Export memories for backup or analysis"""
        if not hasattr(self.memory_store, 'metadata'):
            return []
        
        memories = []
        for mem_id, metadata in self.memory_store.metadata.items():
            if memory_type is None or metadata.get("type") == memory_type:
                memories.append({
                    "id": mem_id,
                    **metadata
                })
        
        # Sort by timestamp
        memories.sort(key=lambda x: x.get("timestamp", ""))
        return memories
    
    async def search_memories_by_content(self, search_term: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Search memories by content using semantic similarity"""
        return await self.recall_memories(search_term, top_k=limit)
    
    async def get_recent_memories(self, hours: int = 24, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent memories within specified time window"""
        from datetime import datetime, timedelta
        
        cutoff_time = datetime.now() - timedelta(hours=hours)
        cutoff_iso = cutoff_time.isoformat()
        
        if not hasattr(self.memory_store, 'metadata'):
            return []
        
        recent_memories = []
        for mem_id, metadata in self.memory_store.metadata.items():
            if metadata.get("timestamp", "") >= cutoff_iso:
                recent_memories.append({
                    "id": mem_id,
                    **metadata
                })
        
        # Sort by timestamp (newest first)
        recent_memories.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        return recent_memories[:limit]

# Global memory service instance
memory_service = MemoryService()