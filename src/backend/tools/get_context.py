# File: src/backend/tools/get_context.py
from pathlib import Path
import os

@tool("get_context", "Get current context including workspace, open files, and environment", {})
def get_context():
    """Get comprehensive context about the current development environment"""
    try:
        current_file = Path(__file__)
        workspace_root = current_file.parents[3]  # AIDE root
        
        context = {
            "workspace_root": str(workspace_root),
            "current_directory": os.getcwd(),
            "python_path": os.environ.get('PYTHONPATH', 'Not set'),
            "environment": {
                "OS": os.name,
                "Python": f"{os.sys.version_info.major}.{os.sys.version_info.minor}.{os.sys.version_info.micro}",
            }
        }
        
        # Check for common project files
        project_files = []
        common_files = ['package.json', 'pixi.toml', 'requirements.txt', 'setup.py', 'pyproject.toml', '.gitignore', 'README.md']
        
        for file in common_files:
            file_path = workspace_root / file
            if file_path.exists():
                project_files.append({
                    "name": file,
                    "path": str(file_path),
                    "size": file_path.stat().st_size
                })
        
        context["project_files"] = project_files
        
        # Get directory structure (top level)
        top_level = []
        for item in workspace_root.iterdir():
            if item.name.startswith('.'):
                continue
            top_level.append({
                "name": item.name,
                "type": "directory" if item.is_dir() else "file",
                "path": str(item.relative_to(workspace_root))
            })
        
        context["top_level_structure"] = sorted(top_level, key=lambda x: (x['type'], x['name']))
        
        return context
        
    except Exception as e:
        return {"error": f"Context detection failed: {str(e)}"}
