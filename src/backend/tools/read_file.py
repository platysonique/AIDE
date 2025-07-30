# File: src/backend/tools/read_file.py
from pathlib import Path
from backend.api import tool


@tool("read_file", "Read any file in the workspace", {"path": "string"})
def read_file(path: str):
    """Read a file from the workspace"""
    try:
        # Get workspace root (adjust path as needed for your setup)
        workspace_root = Path(__file__).parents[2]
        file_path = workspace_root / path
        
        # Security check - ensure file is within workspace
        resolved_path = file_path.resolve()
        workspace_resolved = workspace_root.resolve()
        
        if not str(resolved_path).startswith(str(workspace_resolved)):
            return {"error": f"Access denied: {path} is outside workspace"}
        
        if not resolved_path.exists():
            return {"error": f"File not found: {path}"}
            
        if not resolved_path.is_file():
            return {"error": f"Path is not a file: {path}"}
        
        content = resolved_path.read_text(encoding="utf-8")
        return {
            "content": content,
            "path": path,
            "size": len(content),
            "lines": len(content.split('\n'))
        }
        
    except Exception as e:
        return {"error": f"Failed to read {path}: {str(e)}"}
