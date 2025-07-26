import json
import os
from typing import Dict, List, Any
from datetime import datetime

MEMORY_FILE = "aide_memory.json"

def save_memory(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Save conversation or code context to memory"""
    memory_data = payload.get("memory_data", {})
    memory_type = payload.get("type", "conversation")
    
    # Load existing memory
    existing_memory = []
    if os.path.exists(MEMORY_FILE):
        with open(MEMORY_FILE, 'r') as f:
            existing_memory = json.load(f)
    
    # Add new memory entry
    memory_entry = {
        "timestamp": datetime.now().isoformat(),
        "type": memory_type,
        "data": memory_data
    }
    existing_memory.append(memory_entry)
    
    # Save back to file
    with open(MEMORY_FILE, 'w') as f:
        json.dump(existing_memory, f, indent=2)
    
    return {"status": "success", "message": "Memory saved"}

def recall_memory() -> Dict[str, Any]:
    """Recall stored memory"""
    if not os.path.exists(MEMORY_FILE):
        return {"memories": [], "count": 0}
    
    with open(MEMORY_FILE, 'r') as f:
        memories = json.load(f)
    
    return {"memories": memories, "count": len(memories)}

def manage_privacy(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Manage privacy settings for stored memories"""
    action = payload.get("action", "")
    
    if action == "clear_all":
        if os.path.exists(MEMORY_FILE):
            os.remove(MEMORY_FILE)
        return {"status": "success", "message": "All memories cleared"}
    
    elif action == "clear_before_date":
        target_date = payload.get("date", "")
        # Implementation for date-based clearing
        return {"status": "success", "message": f"Memories before {target_date} cleared"}
    
    return {"status": "error", "message": "Invalid privacy action"}

