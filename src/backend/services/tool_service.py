# File: src/backend/services/tool_service.py

import re
import json
import importlib.util
from pathlib import Path
from typing import Dict, List, Any, Callable, Optional
import sys

from ..core.logger import logger
from ..core.config import config

class ToolRegistry:
    """Enhanced tool registry with better management"""
    
    def __init__(self):
        self._tools: Dict[str, Callable[..., Any]] = {}
        self._tool_metadata: Dict[str, Dict[str, Any]] = {}
        self._initialized = False

    def register(self, name: str, func: Callable[..., Any], desc: str = "", schema: dict = None):
        """Register a tool function with the registry"""
        self._tools[name] = func
        self._tool_metadata[name] = {
            "description": desc,
            "schema": schema or {},
            "function": func
        }
        logger.debug(f"🛠️ Registered tool: {name}")

    def exists(self, name: str) -> bool:
        """Check if tool exists"""
        return name in self._tools

    def call(self, name: str, **kwargs) -> Any:
        """Call a tool function"""
        if name not in self._tools:
            raise KeyError(f"Tool '{name}' not found. Available: {list(self._tools.keys())}")
        
        try:
            result = self._tools[name](**kwargs)
            logger.debug(f"🔧 Tool {name} executed successfully")
            return result
        except Exception as e:
            logger.error(f"Tool {name} execution failed: {e}")
            raise

    def serialize(self) -> List[dict]:
        """Serialize tools for JSON transmission"""
        try:
            return [
                {
                    "name": name,
                    "description": metadata["description"],
                    "args_schema": metadata["schema"]
                }
                for name, metadata in self._tool_metadata.items()
            ]
        except Exception as e:
            logger.error(f"Tool registry serialization error: {e}")
            return []

    def get_tool_names(self) -> List[str]:
        """Get list of available tool names"""
        return list(self._tools.keys())

    def get_tool_metadata(self, name: str) -> Optional[Dict[str, Any]]:
        """Get metadata for a specific tool"""
        return self._tool_metadata.get(name)

    def count(self) -> int:
        """Get number of registered tools"""
        return len(self._tools)

# Global tool registry
tool_registry = ToolRegistry()

def tool(name: str, desc: str = "", schema: dict = None):
    """Tool decorator that registers functions immediately"""
    def wrapper(fn):
        tool_registry.register(name, fn, desc, schema or {})
        return fn
    return wrapper

class ToolService:
    """Service for managing and executing tools"""
    
    def __init__(self):
        self.registry = tool_registry
        self.search_providers = self._load_search_providers()
        
        # Load existing tools if not already loaded
        if not self.registry._initialized:
            self._load_existing_tools()
            self.registry._initialized = True
    
    def _load_search_providers(self) -> Dict[str, Callable]:
        """Load search provider functions"""
        # This would normally import from the existing search functions in api.py
        # For now, we'll create placeholder functions
        providers = {}
        
        try:
            # Import search functions from the original api.py or create new ones
            providers.update({
                "duckduckgo": self._search_duckduckgo,
                "wikipedia": self._search_wikipedia,
                "perplexity": self._search_perplexity,
            })
        except Exception as e:
            logger.warning(f"Failed to load search providers: {e}")
        
        return providers
    
    def _search_duckduckgo(self, query: str) -> Dict[str, Any]:
        """DuckDuckGo search implementation"""
        try:
            import requests
            url = f"https://api.duckduckgo.com/?q={query}&format=json"
            resp = requests.get(url, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            answer = data.get("AbstractText", "") or data.get("Answer", "")
            return {"success": True, "result": answer if answer else "No concise answer found."}
        except Exception as e:
            return {"success": False, "error": f"DuckDuckGo search failed: {str(e)}"}
    
    def _search_wikipedia(self, query: str) -> Dict[str, Any]:
        """Wikipedia search implementation"""
        try:
            import requests
            url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={query}&format=json"
            resp = requests.get(url, timeout=10)
            resp.raise_for_status()
            results = resp.json().get("query", {}).get("search", [])
            result_text = results[0]["snippet"] if results else "No Wikipedia result found."
            return {"success": True, "result": result_text}
        except Exception as e:
            return {"success": False, "error": f"Wikipedia search failed: {str(e)}"}
    
    def _search_perplexity(self, query: str) -> Dict[str, Any]:
        """Perplexity search implementation"""
        try:
            import requests
            api_keys = config.api_keys
            api_key = api_keys.get('perplexity_api_key', '')
            
            if not api_key:
                return {"success": False, "error": "Perplexity API key not configured"}
            
            url = "https://api.perplexity.ai/search"
            headers = {"Authorization": f"Bearer {api_key}"}
            resp = requests.post(url, json={"q": query}, headers=headers, timeout=10)
            resp.raise_for_status()
            return {"success": True, "result": resp.json()["answer"]}
        except Exception as e:
            return {"success": False, "error": f"Perplexity search failed: {str(e)}"}
    
    def _load_existing_tools(self):
        """Load tools from the tools directory"""
        tools_dir = Path(__file__).parent.parent / "tools"
        
        if not tools_dir.exists():
            logger.info("🔍 Tools directory doesn't exist, creating it...")
            tools_dir.mkdir(exist_ok=True)
            return
        
        logger.info(f"🔍 Loading tools from: {tools_dir}")
        
        if str(tools_dir) not in sys.path:
            sys.path.insert(0, str(tools_dir))
        
        tools_loaded = 0
        for tool_file in tools_dir.glob("*.py"):
            if tool_file.name == "__init__.py":
                continue
            
            try:
                logger.debug(f"📦 Loading tool file: {tool_file}")
                tool_name = tool_file.stem
                
                # Load the tool module
                spec = importlib.util.spec_from_file_location(tool_name, tool_file)
                module = importlib.util.module_from_spec(spec)
                
                # Inject required globals
                module.tool = tool
                module.tool_registry = self.registry
                
                # Execute the module
                spec.loader.exec_module(module)
                
                tools_loaded += 1
                logger.info(f"✅ Successfully loaded tool: {tool_name}")
                
            except Exception as e:
                logger.error(f"❌ Failed to load tool {tool_file}: {e}")
        
        logger.info(f"📦 Tool loading complete: {tools_loaded} files processed, {self.registry.count()} tools registered")
    
    def get_available_tools(self) -> List[Dict[str, Any]]:
        """Get list of available tools"""
        return self.registry.serialize()
    
    def detect_implicit_tools(self, message: str) -> List[str]:
        """Detect tools that should be called based on message content"""
        message_lower = message.lower()
        implicit_tools = []
        
        # File operations
        if any(word in message_lower for word in ["read", "file", "show", "content"]):
            implicit_tools.append("read_file")
        
        # Codebase analysis
        if any(word in message_lower for word in ["analyze", "codebase", "project", "structure"]):
            implicit_tools.append("analyze_codebase")
        
        # Context requests
        if any(word in message_lower for word in ["context", "workspace", "current", "where am i"]):
            implicit_tools.append("get_context")
        
        # Search requests
        if any(word in message_lower for word in ["search", "find", "look up", "what is"]):
            # Check if it's likely a web search vs file search
            if any(word in message_lower for word in ["online", "web", "internet", "latest", "current"]):
                implicit_tools.append("online_search")
            else:
                implicit_tools.append("read_file")  # Local search first
        
        return implicit_tools
    
    def extract_tool_arguments(self, message: str, tool_name: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Extract arguments for specific tools from context and message"""
        args = {}
        
        if tool_name == "read_file":
            # Extract file paths
            file_patterns = [
                r"(?:file|path)(?:\s+is)?\s*[:=]?\s*['\"]?([^\s'\"]+)['\"]?",
                r"([^\s]+\.(?:py|js|ts|json|md|txt|yaml|yml|java|cpp|c|h))",
                r"(?:in|from|at)\s+([^\s]+)",
            ]
            
            for pattern in file_patterns:
                match = re.search(pattern, message, re.IGNORECASE)
                if match:
                    args["path"] = match.group(1)
                    break
            
            # Fallback to current file from context
            if not args.get("path"):
                current_file = context.get("currentFile", {})
                if current_file.get("filename"):
                    args["path"] = current_file["filename"]
                else:
                    args["path"] = "."  # Current directory
        
        elif tool_name == "online_search":
            # Extract search query
            query_patterns = [
                r"search (?:for\s+)?['\"]?([^'\"]+)['\"]?",
                r"look up ['\"]?([^'\"]+)['\"]?",
                r"what is ['\"]?([^'\"]+)['\"]?",
                r"find ['\"]?([^'\"]+)['\"]?",
            ]
            
            for pattern in query_patterns:
                match = re.search(pattern, message, re.IGNORECASE)
                if match:
                    args["query"] = match.group(1).strip()
                    break
            
            # Fallback to the entire message as query
            if not args.get("query"):
                args["query"] = message
        
        elif tool_name == "analyze_codebase":
            # Extract path or use workspace root
            workspace = context.get("workspace", {})
            if workspace.get("rootPath"):
                args["path"] = workspace["rootPath"]
            else:
                args["path"] = "."
        
        return args
    
    async def execute_tool(self, tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool with proper error handling"""
        try:
            # Check if it's a search provider
            if tool_name.lower() in self.search_providers:
                query = args.get("query", "")
                if not query:
                    return {"success": False, "error": "No query provided for search"}
                
                result = self.search_providers[tool_name.lower()](query)
                return result
            
            # Check if it's a registered tool
            elif self.registry.exists(tool_name):
                result = self.registry.call(tool_name, **args)
                
                # Normalize result format
                if isinstance(result, dict):
                    # Already in proper format
                    if "success" not in result:
                        result["success"] = True
                    return result
                else:
                    # Wrap simple results
                    return {"success": True, "result": result}
            
            else:
                available_tools = self.registry.get_tool_names() + list(self.search_providers.keys())
                return {
                    "success": False,
                    "error": f"Tool '{tool_name}' not found. Available: {available_tools}"
                }
        
        except Exception as e:
            logger.error(f"Tool execution failed: {e}")
            return {"success": False, "error": str(e)}
    
    def hybrid_online_search(self, query: str) -> Dict[str, Any]:
        """Hybrid search that tries multiple providers"""
        providers = config.providers
        last_error = ""
        
        for provider in providers:
            if provider in self.search_providers:
                try:
                    result = self.search_providers[provider](query)
                    if result.get("success") and result.get("result"):
                        result["provider"] = provider
                        return result
                except Exception as e:
                    last_error = f"{provider}: {str(e)}"
                    continue
        
        return {"success": False, "error": f"No provider returned a valid result. Last error: {last_error}"}

# Global tool service instance
tool_service = ToolService()