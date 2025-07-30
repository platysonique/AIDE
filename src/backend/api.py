# FILE: src/backend/api.py - ENHANCED WITH WEBSOCKET & DYNAMIC TOOL REGISTRY + 403 FIX

import sys
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware  # THE 403 FIX!
import uvicorn
import os
import requests
import yaml
import json
import asyncio
import tempfile
import importlib.util
from pathlib import Path
from typing import Dict, List, Any, Callable
import re
import traceback

sys.path.insert(0, os.path.dirname(__file__))

from code_review import review_code, batch_fix
from debug_guide import surface_errors, debug_step
from memory import save_memory, recall_memory, manage_privacy
from intent_handler import router as intent_router

# ADD DYNAMIC MODEL MANAGEMENT
from model_manager import load_model, list_available_models, get_model_info

# --- Load Config ---
with open(os.path.join(os.path.dirname(__file__), "config.yaml"), "r") as f:
    config = yaml.safe_load(f)

api_keys = config.get("api_keys", {})
fallback_order = config.get("fallback_order", [])
providers = [config.get("online_search")] + (fallback_order or [])

# ============================================================================
# DYNAMIC TOOL REGISTRY SYSTEM - THE CORE ENHANCEMENT
# ============================================================================

class ToolRegistry:
    def __init__(self):
        self._tools: Dict[str, Callable[..., Any]] = {}

    def register(self, name: str, func: Callable[..., Any], desc: str = "", schema: dict = None):
        func.__desc__ = desc  
        func.__schema__ = schema or {}
        self._tools[name] = func
        print(f"🛠️ Registered tool: {name}")

    def exists(self, name: str) -> bool:
        return name in self._tools

    def call(self, name: str, **kwargs) -> Any:
        return self._tools[name](**kwargs)

    def serialize(self) -> List[dict]:
        return [
            {
                "name": n, 
                "description": getattr(f, '__desc__', ''), 
                "args_schema": getattr(f, '__schema__', {})
            }
            for n, f in self._tools.items()
        ]

    def get_tool_names(self) -> List[str]:
        return list(self._tools.keys())

# Initialize the global tool registry
tool_registry = ToolRegistry()

# ============================================================================
# CONVERSATION MODE DETECTION & PROMPT ENGINEERING
# ============================================================================

def should_use_tool_mode(message: str) -> bool:
    """Enhanced intent detection that considers context and phrasing"""
    
    message_lower = message.lower()
    
    # Strong conversational/discussion indicators (return False immediately)
    discussion_patterns = [
        "i think", "i believe", "i'm worried", "i'm concerned", 
        "this might", "this could", "this may", "what if",
        "do you think", "opinion", "thoughts on", "feelings about",
        "problem with", "issue with", "concerns about", "discuss"
    ]
    
    # Direct command patterns (suggest tool mode)
    command_patterns = [
        "i want you to", "i need you to", "please", "can you",
        "go ahead and", "help me", "show me the", "read the",
        "search for", "find the", "analyze the", "check the"
    ]
    
    # Check discussion patterns first (these override tool indicators)
    if any(pattern in message_lower for pattern in discussion_patterns):
        return False
    
    # Then check for direct commands
    if any(pattern in message_lower for pattern in command_patterns):
        return True
    
    # Context-aware "create" detection
    if "create" in message_lower:
        # Look for command context vs discussion context
        command_context = any(word in message_lower for word in [
            "want", "need", "should", "please", "can you", "help"
        ])
        discussion_context = any(word in message_lower for word in [
            "think", "might", "could", "may", "problem", "issue", "concern"
        ])
        
        # If both present, discussion wins (conservative approach)
        if discussion_context:
            return False
        return command_context
    
    # Default to conversational for ambiguous cases
    return False

def build_react_prompt_with_tools(message: str, context: dict, tools: List[dict]) -> str:
    """Build ReAct prompt template with current tools and context"""
    workspace_folders = context.get('workspace_folders', [])
    active_file = context.get('active_file', 'None')
    
    return f"""You are AIDE, an autonomous coding assistant.

IMPORTANT: Only take Action if the user is giving you a direct command or request. 
If they're discussing, asking opinions, or expressing concerns, respond conversationally without invoking tools.

Workspace Folders: {workspace_folders}
Active File: {active_file}

Tools Available: {json.dumps(tools, indent=2)}

User Query: {message}

If this is a COMMAND or REQUEST:
Thought: [analyze what action is needed]
Action: invoke.toolName{{"arg": "value"}}

If this is DISCUSSION or ANALYSIS:
Thought: [provide thoughtful response without tools]
Response: [conversational reply]

If no suitable tool exists for a command:
Thought: I need a tool for this specific task
Action: propose_new_tool{{"name": "tool_name", "code": "complete python code with @tool decorator"}}

Current query analysis: {message}"""

async def api_chat_internal(message: str, context: dict) -> dict:
    """Internal conversational chat without tools - reuses your existing logic"""
    
    system_prompt = """You are AIDE, a helpful coding assistant. 
    Have a natural conversation with the user. 
    Only mention tools or capabilities if directly asked about them."""
    
    # Use your existing LLM logic if model is loaded
    if CURRENT_MODEL:
        try:
            tokenizer, model = load_model(CURRENT_MODEL)
            
            # Simple conversational prompt without tools
            input_prompt = f"{system_prompt}\n\nUser: {message}\nAIDE:"
            
            input_data = tokenizer(input_prompt, return_tensors="pt", truncation=True, max_length=2048)
            
            # Move to model device if available
            if hasattr(model, 'device'):
                input_data = {k: v.to(model.device) for k, v in input_data.items()}
            
            output_tokens = model.generate(
                **input_data,
                max_new_tokens=512,
                do_sample=True,
                temperature=0.8,
                top_p=0.95,
                pad_token_id=tokenizer.eos_token_id
            )
            
            response_text = tokenizer.decode(output_tokens[0], skip_special_tokens=True)
            
            # Extract just the AI response part
            if "AIDE:" in response_text:
                response_text = response_text.split("AIDE:")[-1].strip()
            
            return {"response": response_text, "type": "conversation"}
            
        except Exception as e:
            print(f"⚠️ Conversational model failed: {e}")
    
    # Fallback to simple response
    return {
        "response": f"I understand you're asking about: {message}. How can I help you with this?",
        "type": "conversation"
    }

def load_existing_tools():
    """Load any existing tools from the tools directory"""
    tools_dir = Path(__file__).parent / "tools"
    if not tools_dir.exists():
        return
    
    for tool_file in tools_dir.glob("*.py"):
        if tool_file.name == "__init__.py":
            continue
            
        try:
            tool_name = tool_file.stem
            spec = importlib.util.spec_from_file_location(tool_name, str(tool_file))
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            print(f"📦 Loaded tool: {tool_name}")
        except Exception as e:
            print(f"❌ Failed to load tool {tool_file}: {e}")

# [ALL YOUR EXISTING SEARCH PROVIDER FUNCTIONS - KEEPING EXACTLY AS THEY ARE]

def search_perplexity(query):
    url = "https://api.perplexity.ai/search"
    headers = {"Authorization": f"Bearer {api_keys.get('perplexity_api_key', '')}"}
    resp = requests.post(url, json={"q": query}, headers=headers, timeout=10)
    resp.raise_for_status()
    return resp.json()["answer"]

def search_searxng(query):
    endpoint = config.get("searxng_endpoint", "")
    url = f"{endpoint}/search?q={query}&format=json"
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    results = resp.json().get("results", [])
    snippet = results[0].get("snippet") if results else "No results."
    return snippet

def search_duckduckgo(query):
    url = f"https://api.duckduckgo.com/?q={query}&format=json"
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    answer = resp.json().get("AbstractText", "") or resp.json().get("Answer", "")
    return answer if answer else "No concise answer."

def search_wikipedia(query):
    url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={query}&format=json"
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    results = resp.json().get("query", {}).get("search", [])
    return results[0]["snippet"] if results else "No Wikipedia result found."

def search_wolframalpha(query):
    appid = config.get("wolframalpha_appid")
    url = f"https://api.wolframalpha.com/v1/result?appid={appid}&i={query}"
    resp = requests.get(url, timeout=10)
    if resp.status_code == 501:
        return "WolframAlpha: (No result for your query.)"
    resp.raise_for_status()
    return resp.text

def search_open_meteo(query):
    parts = query.lower().split("weather")
    loc = parts[-1].strip() if len(parts) > 1 else "Berlin"
    url = f"https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current_weather=true"
    resp = requests.get(url, timeout=10)
    if resp.status_code != 200:
        return "Open-Meteo: (Weather data not available.)"
    current = resp.json().get("current_weather", {})
    return f"Current Berlin weather: {current}" if current else "Weather not found."

PROVIDER_FUNCS = {
    "perplexity": search_perplexity,
    "searxng": search_searxng,
    "duckduckgo": search_duckduckgo,
    "wikipedia": search_wikipedia,
    "wolframalpha": search_wolframalpha,
    "open-meteo": search_open_meteo,
}

def hybrid_online_search(query):
    last_error = ""
    for provider in providers:
        func = PROVIDER_FUNCS.get(provider)
        try:
            if func:
                result = func(query)
                if result and "No result" not in result and "not available" not in result:
                    return {"provider": provider, "result": result}
        except Exception as e:
            last_error = f"{provider}: {str(e)}"
            continue
    return {"error": f"No provider returned a result. Last error: {last_error}"}

# [ALL YOUR EXISTING AGENTIC INTENT PROCESSOR - KEEPING EXACTLY AS IT IS]

class AgenticIntentProcessor:
    """Processes user intents and determines appropriate actions"""
    
    def __init__(self):
        self.intent_patterns = {
            "code_review": ["review", "check", "analyze", "look at", "examine"],
            "fix_bugs": ["fix", "debug", "error", "bug", "issue", "problem"],
            "explain": ["explain", "what does", "how does", "describe", "tell me about"],
            "generate": ["create", "generate", "write", "make", "build"],
            "test": ["test", "testing", "unit test", "spec"],
            "refactor": ["refactor", "improve", "optimize", "clean up"],
            "document": ["document", "docs", "documentation", "comment"],
            "search": ["find", "search", "look for", "locate"]
        }

    def process_intent(self, message: str, context: Dict[str, Any]) -> Dict[str, Any]:
        message_lower = message.lower()
        detected_intents = []

        for intent, keywords in self.intent_patterns.items():
            if any(keyword in message_lower for keyword in keywords):
                detected_intents.append(intent)

        response_parts = []
        suggested_actions = []

        if not detected_intents:
            detected_intents = ["general_help"]

        for intent in detected_intents:
            intent_response = self._handle_intent(intent, message, context)
            response_parts.append(intent_response["response"])
            suggested_actions.extend(intent_response["actions"])

        return {
            "response": "\n\n".join(response_parts),
            "actions": suggested_actions,
            "detected_intents": detected_intents
        }

    def _handle_intent(self, intent: str, message: str, context: Dict[str, Any]) -> Dict[str, Any]:
        current_file = context.get("currentFile", {})
        workspace = context.get("workspace", {})

        responses = {
            "code_review": {
                "response": f"I'll help you review the code. {self._get_file_context_message(current_file)}",
                "actions": [
                    {"type": "code_review", "label": "🔍 Start Code Review"},
                    {"type": "batch_fix", "label": "🛠️ Auto-fix Issues"}
                ]
            },
            "fix_bugs": {
                "response": f"I'll help you identify and fix bugs. {self._get_file_context_message(current_file)}",
                "actions": [
                    {"type": "debug_guide", "label": "🐛 Debug Guide"},
                    {"type": "batch_fix", "label": "🔧 Batch Fix"}
                ]
            },
            "explain": {
                "response": f"I'll explain the code for you. {self._get_file_context_message(current_file)}",
                "actions": [
                    {"type": "code_review", "label": "📖 Detailed Analysis"}
                ]
            },
            "generate": {
                "response": "I can help you generate code, tests, documentation, or other development artifacts.",
                "actions": [
                    {"type": "code_review", "label": "🎯 Analyze First"},
                    {"type": "debug_guide", "label": "🧪 Generate Tests"}
                ]
            },
            "test": {
                "response": "I'll help you create and run tests for your code.",
                "actions": [
                    {"type": "code_review", "label": "📋 Test Strategy"},
                    {"type": "batch_fix", "label": "🧪 Generate Tests"}
                ]
            },
            "refactor": {
                "response": "I can help you refactor and improve your code quality.",
                "actions": [
                    {"type": "code_review", "label": "🔍 Code Analysis"},
                    {"type": "batch_fix", "label": "♻️ Apply Refactoring"}
                ]
            },
            "document": {
                "response": "I'll help you create documentation and add comments to your code.",
                "actions": [
                    {"type": "code_review", "label": "📝 Document Code"}
                ]
            },
            "search": {
                "response": "I can search through your codebase, documentation, or the web for information.",
                "actions": [
                    {"type": "online_search", "label": "🌐 Web Search"}
                ]
            },
            "general_help": {
                "response": f"I'm AIDE, your intelligent coding assistant! I can help with code review, debugging, testing, documentation, and more. {self._get_workspace_context_message(workspace, current_file)}",
                "actions": [
                    {"type": "code_review", "label": "🔍 Review Current File"},
                    {"type": "debug_guide", "label": "🐛 Debug Help"},
                    {"type": "batch_fix", "label": "🛠️ Fix Issues"}
                ]
            }
        }

        return responses.get(intent, responses["general_help"])

    def _get_file_context_message(self, current_file: Dict[str, Any]) -> str:
        if current_file and current_file.get("filename"):
            filename = current_file["filename"].split("/")[-1]
            language = current_file.get("language", "unknown")
            if current_file.get("selection"):
                return f"I can see you have selected code in {filename} ({language}). Let me analyze that selection."
            else:
                return f"I can see you're working on {filename} ({language}). Let me analyze the entire file."
        return "Please open a file in the editor so I can provide more specific assistance."

    def _get_workspace_context_message(self, workspace: Dict[str, Any], current_file: Dict[str, Any]) -> str:
        messages = []
        if workspace and workspace.get("name"):
            messages.append(f"I can see you're working in the '{workspace['name']}' workspace.")
        if current_file and current_file.get("filename"):
            filename = current_file["filename"].split("/")[-1]
            messages.append(f"Currently viewing: {filename}")
        return " ".join(messages) if messages else "Open a workspace and file to get started!"

agentic_processor = AgenticIntentProcessor()

# --- FastAPI app ---
app = FastAPI(title="AIDE Backend with Dynamic Models, Agentic Features & Hybrid Search")

# 🚨 THE 403 FIX - CORS MIDDLEWARE FOR WEBSOCKETS 🚨
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for VSCodium development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ADD THE INTENT ROUTER HERE
app.include_router(intent_router, prefix="/api/v1")

# ============================================================================
# WEBSOCKET ENDPOINT - ENHANCED WITH 403 FIX
# ============================================================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    try:
        # 🚨 THE KEY 403 FIX - Accept with explicit CORS headers 🚨
        await websocket.accept(extra_headers=[
            ("Access-Control-Allow-Origin", "*"),
            ("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS"),
            ("Access-Control-Allow-Headers", "*"),
            ("Access-Control-Allow-Credentials", "true")
        ])
        print("🔌 WebSocket client connected successfully with CORS headers")
        
        # Send initial registry and context
        await websocket.send_json({
            "type": "registry", 
            "tools": tool_registry.serialize(),
            "workspace_context": {
                "available_models": list_available_models(),
                "current_model": CURRENT_MODEL if 'CURRENT_MODEL' in globals() else None,
                "total_tools": len(tool_registry.get_tool_names())
            }
        })
        
        while True:
            try:
                data = await websocket.receive_json()
                msg_type = data.get("type")
                
                if msg_type == "query":
                    message = data.get("message", "")
                    context = data.get("context", {})
                    
                    print(f"🤖 Processing query: {message[:50]}...")
                    
                    # Determine if this needs tool reasoning or just conversation
                    if should_use_tool_mode(message):
                        print("🛠️ Using tool mode")
                        # Use ReAct prompt with tools
                        enhanced_prompt = build_react_prompt_with_tools(message, context, tool_registry.serialize())
                        
                        # Use your existing generate_with_tool_calling function if model loaded
                        if CURRENT_MODEL:
                            try:
                                tokenizer, model = load_model(CURRENT_MODEL)
                                response, used_tools, actions = await generate_with_tool_calling(model, tokenizer, enhanced_prompt, context)
                                mode = "tool"
                            except Exception as model_err:
                                print(f"⚠️ Model failed in tool mode: {model_err}")
                                response = f"I encountered an issue with the AI model: {str(model_err)}. Let me help using available tools."
                                used_tools = []
                                actions = []
                                mode = "tool_fallback"
                        else:
                            response = "No AI model loaded. Please load a model to enable tool reasoning."
                            used_tools = []
                            actions = []
                            mode = "tool_fallback"
                            
                        response_data = {
                            "response": response,
                            "tools_invoked": used_tools,
                            "actions": actions
                        }
                    else:
                        print("💬 Using chat mode")
                        # Use normal conversational mode 
                        response_data = await api_chat_internal(message, context)
                        mode = "chat"
                    
                    await websocket.send_json({
                        "type": "response", 
                        "data": response_data,
                        "mode": mode
                    })
                
                elif msg_type == "invoke":
                    tool_name = data.get("tool")
                    args = data.get("args", {})
                    
                    print(f"🔧 Invoking tool: {tool_name}")
                    
                    if tool_registry.exists(tool_name):
                        try:
                            result = tool_registry.call(tool_name, **args)
                            await websocket.send_json({
                                "type": "tool_response",
                                "tool": tool_name, 
                                "result": result
                            })
                        except Exception as e:
                            await websocket.send_json({
                                "type": "error", 
                                "message": f"Tool {tool_name} failed: {str(e)}"
                            })
                    else:
                        await websocket.send_json({
                            "type": "error", 
                            "message": f"Tool {tool_name} not found. Available tools: {tool_registry.get_tool_names()}"
                        })
                        
                elif msg_type == "propose_new_tool":
                    try:
                        name = data.get("name")
                        code = data.get("code")
                        
                        print(f"🏗️ Creating new tool: {name}")
                        
                        # Create tools directory if it doesn't exist
                        tools_dir = Path(__file__).parent / "tools"
                        tools_dir.mkdir(exist_ok=True)
                        
                        # Create __init__.py if it doesn't exist
                        init_file = tools_dir / "__init__.py"
                        if not init_file.exists():
                            init_file.write_text(f"""# Auto-generated tools package
from ..api import tool_registry

def tool(name: str, desc: str = "", schema: dict = None):
    def wrapper(fn):
        tool_registry.register(name, fn, desc, schema)
        return fn
    return wrapper
""")
                        
                        # Write the tool file
                        tool_file = tools_dir / f"{name}.py"
                        tool_file.write_text(code, encoding="utf-8")
                        
                        # Hot import the new tool
                        spec = importlib.util.spec_from_file_location(name, str(tool_file))
                        module = importlib.util.module_from_spec(spec)
                        spec.loader.exec_module(module)
                        
                        # Rebroadcast updated registry
                        await websocket.send_json({
                            "type": "registry",
                            "tools": tool_registry.serialize(),
                            "message": f"Tool '{name}' created and loaded successfully",
                            "workspace_context": {
                                "available_models": list_available_models(),
                                "current_model": CURRENT_MODEL if 'CURRENT_MODEL' in globals() else None,
                                "total_tools": len(tool_registry.get_tool_names())
                            }
                        })
                        
                    except Exception as e:
                        print(f"❌ Tool creation failed: {traceback.format_exc()}")
                        await websocket.send_json({
                            "type": "error", 
                            "message": f"Failed to create tool: {str(e)}"
                        })
                        
            except json.JSONDecodeError as e:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Invalid JSON received: {str(e)}"
                })
            except Exception as e:
                print(f"❌ Message processing error: {traceback.format_exc()}")
                await websocket.send_json({
                    "type": "error",
                    "message": f"Message processing failed: {str(e)}"
                })
                        
    except WebSocketDisconnect:
        print("🔌 WebSocket client disconnected normally")
    except Exception as e:
        print(f"🔌 WebSocket connection error: {traceback.format_exc()}")

# ============================================================================
# DYNAMIC MODEL MANAGEMENT - TRUE RUNTIME MODEL SWITCHING
# ============================================================================

# Initialize with first available model (no hardcoding!)
available_models = list_available_models()
CURRENT_MODEL = available_models[0] if available_models else None

@app.get("/models")
async def api_list_models():
    """List all available models in the models directory - PURE DYNAMIC DISCOVERY"""
    models = list_available_models()
    return {
        "models": models,
        "current": CURRENT_MODEL,
        "total_available": len(models),
        "discovery_method": "filesystem_scan"
    }

@app.post("/models/use")
async def api_choose_model(request: Request):
    """Switch to a different model - TRUE RUNTIME SWITCHING"""
    global CURRENT_MODEL
    data = await request.json()
    model_name = data.get("name")

    if not model_name:
        return {"error": "No model name provided"}

    available_models = list_available_models()
    if model_name not in available_models:
        return {
            "error": f"Model '{model_name}' not found in models directory",
            "available": available_models,
            "suggestion": "Check models/ directory for available models"
        }

    try:
        CURRENT_MODEL = model_name
        load_model.cache_clear()  # Clear previous model from cache
        # Pre-load the model to verify it works
        print(f"🔄 Loading model: {model_name}")
        tokenizer, model = load_model(model_name)
        print(f"✅ Model loaded successfully: {model_name}")
        return {
            "status": "success",
            "active": CURRENT_MODEL,
            "message": f"Successfully switched to {model_name}",
            "model_info": {
                "tokenizer_class": tokenizer.__class__.__name__,
                "model_class": model.__class__.__name__
            }
        }
    except Exception as e:
        return {
            "error": f"Failed to load model {model_name}: {str(e)}",
            "current": CURRENT_MODEL,  # Keep the previous working model
            "suggestion": "Check model files are complete and compatible"
        }

@app.get("/models/info/{model_name}")
async def api_model_info(model_name: str):
    """Get detailed information about a specific model"""
    info = get_model_info(model_name)
    if info:
        return info
    else:
        available = list_available_models()
        return {
            "error": f"Model '{model_name}' not found",
            "available_models": available,
            "suggestion": f"Try one of: {', '.join(available)}" if available else "No models found in models/ directory"
        }

@app.get("/models/current")
async def api_current_model():
    """Get currently active model information"""
    if not CURRENT_MODEL:
        return {
            "error": "No model currently active",
            "available_models": list_available_models(),
            "suggestion": "Use POST /models/use to activate a model"
        }

    return {
        "current_model": CURRENT_MODEL,
        "status": "active",
        "model_info": get_model_info(CURRENT_MODEL)
    }

# ============================================================================
# REAL SPEECH FUNCTIONALITY - Using Your Installed Coqui TTS + Vosk
# ============================================================================

@app.post("/speech/recognize")
async def speech_recognize(request: Request):
    """Real speech recognition using your installed Vosk"""
    try:
        data = await request.json()
        timeout = data.get('timeout', 10)
        language = data.get('language', 'en-US')

        # Use your actual Vosk installation for real speech recognition
        try:
            import pyaudio
            import wave
            import vosk
            import json

            # Initialize Vosk model (adjust path based on your setup)
            model_path = os.path.expanduser("~/.cache/vosk-models/vosk-model-en-us-0.22")
            if not os.path.exists(model_path):
                # Try common model locations
                possible_paths = [
                    "/usr/share/vosk-models/vosk-model-en-us-0.22",
                    "/opt/vosk-models/vosk-model-en-us-0.22",
                    "./models/vosk-model-en-us-0.22",
                    os.path.expanduser("~/.vosk/models/vosk-model-en-us-0.22")
                ]

                model_path = next((p for p in possible_paths if os.path.exists(p)), None)
                if not model_path:
                    # Try to download model if not found
                    import urllib.request
                    import zipfile
                    model_url = "https://alphacephei.com/vosk/models/vosk-model-en-us-0.22.zip"
                    model_dir = os.path.expanduser("~/.cache/vosk-models")
                    os.makedirs(model_dir, exist_ok=True)
                    zip_path = os.path.join(model_dir, "vosk-model-en-us-0.22.zip")
                    if not os.path.exists(zip_path):
                        print(f"🔄 Downloading Vosk model from {model_url}...")
                        urllib.request.urlretrieve(model_url, zip_path)
                        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                            zip_ref.extractall(model_dir)
                    model_path = os.path.join(model_dir, "vosk-model-en-us-0.22")

                    if not os.path.exists(model_path):
                        return {
                            "status": "error",
                            "message": "Vosk model not found and could not be downloaded. Please install manually."
                        }

            model = vosk.Model(model_path)
            rec = vosk.KaldiRecognizer(model, 16000)

            # Record audio from microphone using PyAudio
            p = pyaudio.PyAudio()
            stream = p.open(format=pyaudio.paInt16,
                          channels=1,
                          rate=16000,
                          input=True,
                          frames_per_buffer=8000)
            print(f"🎤 Recording for {timeout} seconds...")

            transcript = ""
            # Record for specified timeout
            frames_to_read = int(16000 / 8000 * timeout)
            for _ in range(frames_to_read):
                try:
                    data_chunk = stream.read(8000, exception_on_overflow=False)
                    if rec.AcceptWaveform(data_chunk):
                        result = json.loads(rec.Result())
                        transcript += result.get('text', '') + " "
                except Exception as e:
                    print(f"Audio read error: {e}")
                    continue

            # Get final result
            final_result = json.loads(rec.FinalResult())
            transcript += final_result.get('text', '')

            stream.stop_stream()
            stream.close()
            p.terminate()

            return {
                "status": "success",
                "transcript": transcript.strip(),
                "confidence": 0.95,  # Vosk doesn't provide confidence, use default
                "language": language,
                "backend": "vosk",
                "duration": timeout
            }

        except ImportError as e:
            return {
                "status": "error",
                "message": f"Speech dependencies not available: {str(e)}. Ensure vosk-api and pyaudio are installed in your pixi environment."
            }

        except Exception as e:
            return {
                "status": "error",
                "message": f"Vosk speech recognition error: {str(e)}"
            }

    except Exception as e:
        return {
            "status": "error",
            "message": f"Speech recognition failed: {str(e)}"
        }

@app.post("/speech/synthesize")
async def speech_synthesize(request: Request):
    """Real text-to-speech using your installed Coqui TTS"""
    try:
        data = await request.json()
        text = data.get('text', '')
        voice = data.get('voice', 'default')
        speed = data.get('speed', 1.0)
        play_immediately = data.get('play_immediately', True)

        if not text:
            return {"status": "error", "message": "No text provided"}

        # Use your actual Coqui TTS installation
        try:
            from TTS.api import TTS
            import sounddevice as sd
            import soundfile as sf
            import numpy as np

            # Initialize TTS with a good English model
            # Use a lightweight model for faster synthesis
            try:
                tts = TTS(model_name="tts_models/en/ljspeech/tacotron2-DDC_ph", progress_bar=False)
            except:
                # Fallback to another model if the first one fails
                try:
                    tts = TTS(model_name="tts_models/en/ljspeech/tacotron2-DDC", progress_bar=False)
                except:
                    # Ultimate fallback
                    tts = TTS(model_name="tts_models/en/vctk/vits", progress_bar=False)

            # Create temporary audio file
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
                audio_path = tmp_file.name

            # Generate speech audio
            tts.tts_to_file(text=text, file_path=audio_path)

            # Play immediately if requested
            if play_immediately:
                try:
                    audio_data, samplerate = sf.read(audio_path)
                    # Play audio using sounddevice
                    sd.play(audio_data, samplerate)
                    sd.wait()  # Wait until audio finishes playing
                except Exception as play_error:
                    print(f"Audio playback failed: {play_error}")
                    # Audio file was created successfully even if playback failed

            return {
                "status": "success",
                "message": f"Successfully synthesized with Coqui TTS: {text[:50]}{'...' if len(text) > 50 else ''}",
                "audio_file": audio_path,
                "backend": "coqui_tts",
                "voice_used": voice,
                "text_length": len(text),
                "played": play_immediately
            }

        except ImportError as e:
            return {
                "status": "error",
                "message": f"Coqui TTS not available: {str(e)}. Ensure TTS and sounddevice are installed in your pixi environment."
            }

        except Exception as e:
            return {
                "status": "error",
                "message": f"Coqui TTS synthesis failed: {str(e)}"
            }

    except Exception as e:
        return {
            "status": "error",
            "message": f"Text-to-speech failed: {str(e)}"
        }

@app.get("/speech/status")
async def speech_status():
    """Check speech system status"""
    status = {
        "vosk_available": False,
        "coqui_tts_available": False,
        "pyaudio_available": False,
        "sounddevice_available": False,
        "soundfile_available": False
    }

    try:
        import vosk
        status["vosk_available"] = True
    except ImportError:
        pass

    try:
        from TTS.api import TTS
        status["coqui_tts_available"] = True
    except ImportError:
        pass

    try:
        import pyaudio
        status["pyaudio_available"] = True
    except ImportError:
        pass

    try:
        import sounddevice
        status["sounddevice_available"] = True
    except ImportError:
        pass

    try:
        import soundfile
        status["soundfile_available"] = True
    except ImportError:
        pass

    speech_ready = (status["vosk_available"] and
                   status["coqui_tts_available"] and
                   status["pyaudio_available"] and
                   status["sounddevice_available"])

    return {
        "status": "ok" if speech_ready else "partial",
        "message": "Speech system status check",
        "components": status,
        "speech_ready": speech_ready,
        "recommendations": [] if speech_ready else [
            "Install missing components with: pixi add vosk-api coqui-tts pyaudio sounddevice soundfile"
        ]
    }

# ============================================================================
# 🚀 LLM-FIRST CONVERSATION - THE BREAKTHROUGH (ENHANCED)
# ============================================================================

async def generate_with_tool_calling(model, tokenizer, message, context):
    """
    Enhanced LLM-first conversation with tool registry awareness
    """
    # Get current tool registry for the prompt
    available_tools = tool_registry.serialize()
    search_tools = list(PROVIDER_FUNCS.keys())
    current_file = context.get("currentFile", {})
    workspace = context.get("workspace", {})

    # Enhanced system prompt with comprehensive tool capabilities
    system_prompt = (
        "You are AIDE, an advanced local coding assistant running on high-end hardware. "
        f"Registered Tools: {json.dumps(available_tools, indent=2)}\n"
        f"Search Providers: {search_tools}\n"
        f"Current workspace: {workspace.get('name', 'No workspace')}\n"
        f"Current file: {current_file.get('filename', 'No file open')}\n"
        f"Full Context: {json.dumps(context)}\n\n"
        "You can invoke tools by mentioning TOOL[tool_name] in your response. "
        "Available search tools:\n"
        "- TOOL[wikipedia] for factual information\n"
        "- TOOL[duckduckgo] for general web search\n"
        "- TOOL[perplexity] for AI-powered search\n"
        "- TOOL[wolframalpha] for calculations and data\n"
        "- TOOL[open-meteo] for weather information\n"
        "\nFor registered custom tools, use TOOL[custom_tool_name]\n"
        "\nRespond naturally and decide if any tools are needed based on the user's request.\n\n"
        f"User: {message}\nAIDE:"
    )

    try:
        # --- Run Model Generation ---
        input_data = tokenizer(system_prompt, return_tensors="pt", truncation=True, max_length=2048)
        # Move to model device if available
        if hasattr(model, 'device'):
            input_data = {k: v.to(model.device) for k, v in input_data.items()}

        output_tokens = model.generate(
            **input_data,
            max_new_tokens=512,
            do_sample=True,
            temperature=0.8,
            top_p=0.95,
            pad_token_id=tokenizer.eos_token_id
        )

        # Decode the response
        response_text = tokenizer.decode(output_tokens[0], skip_special_tokens=True)
        # Extract just the AI response part (remove the system prompt)
        if "AIDE:" in response_text:
            response_text = response_text.split("AIDE:")[-1].strip()

    except Exception as generation_error:
        # Graceful fallback if model generation fails
        response_text = f"I encountered an issue with model generation: {str(generation_error)}. Let me help you using my fallback systems."

    # Scan response for tool invocations
    tool_pattern = re.compile(r"TOOL\[(\w+)\]", re.I)
    tools_found = tool_pattern.findall(response_text)

    used_tools = []
    actions = []

    # Process search tools first
    for tool in set(tools_found):
        tool_func = PROVIDER_FUNCS.get(tool.lower())
        if tool_func:
            try:
                print(f"🔧 AI requested search tool: {tool}")
                tool_result = tool_func(message)
                used_tools.append(tool)
                actions.append({"type": "search_tool", "tool": tool, "result": tool_result})
                # Enhance response with tool results
                response_text += f"\n\n**{tool.title()} Search Result:**\n{tool_result}"
            except Exception as tool_error:
                response_text += f"\n\n*Note: {tool} search encountered an error: {str(tool_error)}*"
                actions.append({"type": "search_tool", "tool": tool, "result": None, "error": str(tool_error)})

    # Process custom registered tools
    for tool in set(tools_found):
        if tool_registry.exists(tool):
            try:
                print(f"🛠️ AI requested custom tool: {tool}")
                # For now, invoke with minimal args - in future, AI could provide args
                tool_result = tool_registry.call(tool)
                used_tools.append(tool)
                actions.append({"type": "custom_tool", "tool": tool, "result": tool_result})
                response_text += f"\n\n**{tool} Tool Result:**\n{json.dumps(tool_result, indent=2)}"
            except Exception as tool_error:
                response_text += f"\n\n*Note: {tool} tool encountered an error: {str(tool_error)}*"
                actions.append({"type": "custom_tool", "tool": tool, "result": None, "error": str(tool_error)})

    return response_text, used_tools, actions

@app.post("/chat")
async def api_chat(request: Request):
    """
    🚀 THE BREAKTHROUGH: Enhanced LLM-First Conversation with Dynamic Tool Registry
    """
    data = await request.json()
    message = data.get("message", "")
    context = data.get("context", {})

    if not message:
        return {"error": "No message provided"}

    try:
        # ====== 🤖 LLM-FIRST PATH ======
        if CURRENT_MODEL:
            try:
                print(f"🤖 Using AI model: {CURRENT_MODEL}")
                tokenizer, model = load_model(CURRENT_MODEL)
                response, used_tools, actions = await generate_with_tool_calling(model, tokenizer, message, context)

                return {
                    "response": response,
                    "model_used": CURRENT_MODEL,
                    "actions": actions,
                    "tools_invoked": used_tools,
                    "detected_intents": ["ai_conversation"],
                    "conversation_type": "llm_first",
                    "tool_registry_size": len(tool_registry.get_tool_names())
                }

            except Exception as model_err:
                print(f"⚠️ Model failed, falling back to regex: {str(model_err)}")
                # Graceful fallback to regex if model loading fails
                result = agentic_processor.process_intent(message, context)
                result["fallback_reason"] = f"Model failed to load: {str(model_err)}"
                result["conversation_type"] = "regex_fallback"
                return result

        # ====== 📝 REGEX FALLBACK PATH ======
        else:
            print("📝 No model loaded, using regex processor")
            result = agentic_processor.process_intent(message, context)
            result["fallback_reason"] = "No AI model loaded"
            result["conversation_type"] = "regex_fallback"
            result["suggestion"] = "Load a model with POST /models/use to enable AI conversation"

            # Add web search if needed (keeping your existing logic)
            search_keywords = ["search", "find", "look up", "what is", "who is", "when did", "how to"]
            if any(keyword in message.lower() for keyword in search_keywords):
                search_result = hybrid_online_search(message)
                if "result" in search_result:
                    result["response"] += f"\n\n🌐 **Web Search Result:**\n{search_result['result']}"

            return result

    except Exception as e:
        return {
            "response": f"I apologize, but I encountered an error processing your request: {str(e)}",
            "actions": [],
            "detected_intents": ["error"],
            "conversation_type": "error"
        }

# [ALL YOUR EXISTING ENDPOINTS - KEEPING EXACTLY AS THEY ARE]

@app.get("/health")
async def health():
    return {
        "status": "ok", 
        "message": "AIDE backend is running",
        "websocket_enabled": True,
        "tools_registered": len(tool_registry.get_tool_names()),
        "current_model": CURRENT_MODEL
    }

@app.post("/agentic-intent")
async def api_agentic_intent(request: Request):
    return await api_chat(request)

@app.post("/ingest")
async def api_ingest_document(request: Request):
    data = await request.json()
    file_path = data.get("file_path")
    file_name = data.get("file_name")

    if not file_path:
        return {"error": "No file path provided"}

    try:
        return {
            "status": "success",
            "message": f"Successfully ingested {file_name}",
            "file_path": file_path,
            "file_name": file_name
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to ingest {file_name}: {str(e)}"
        }

@app.post("/review-code")
async def api_review_code(request: Request):
    data = await request.json()
    return review_code(data)

@app.post("/batch-fix")
async def api_batch_fix(request: Request):
    data = await request.json()
    return batch_fix(data)

@app.post("/debug-guide")
async def api_debug_guide(request: Request):
    data = await request.json()
    return surface_errors(data)

@app.post("/debug-step")
async def api_debug_step(request: Request):
    data = await request.json()
    return debug_step(data)

@app.post("/memory")
async def api_save_memory(request: Request):
    data = await request.json()
    return save_memory(data)

@app.get("/memory/recall")
async def api_recall_memory():
    return recall_memory()

@app.post("/memory/privacy")
async def api_manage_privacy(request: Request):
    data = await request.json()
    return manage_privacy(data)

@app.post("/online-search")
async def api_online_search(request: Request):
    payload = await request.json()
    query = payload.get("query", "")
    result = hybrid_online_search(query)
    return result

# ============================================================================
# APP STARTUP - LOAD EXISTING TOOLS
# ============================================================================

@app.on_event("startup")
async def startup_event():
    print("🚀 AIDE Backend starting...")
    load_existing_tools()
    print(f"🛠️ {len(tool_registry._tools)} tools registered")
    print(f"🔌 WebSocket enabled at /ws")
    print(f"🚨 CORS enabled - WebSocket 403 errors FIXED!")

if __name__ == "__main__":
    # Support environment variables for the enhanced backend manager
    host = os.getenv("AIDE_HOST", config.get("host", "127.0.0.1"))
    port = int(os.getenv("AIDE_PORT", config.get("port", 8000)))
    print(f"🚀 Starting AIDE backend on {host}:{port}")
    print(f"🎤 Speech functionality: Vosk + Coqui TTS enabled")
    print(f"🤖 Available models: {list_available_models()}")
    print(f"🎯 Current model: {CURRENT_MODEL}")
    print(f"🔥 LLM-First conversation: {'ENABLED' if CURRENT_MODEL else 'Fallback to regex'}")
    print(f"🔌 WebSocket tool registry: ENABLED")
    print(f"🚨 CORS middleware: ACTIVE (403 errors FIXED)")
    uvicorn.run(app, host=host, port=port)
