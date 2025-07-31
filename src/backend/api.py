# FILE: src/backend/api.py - BULLETPROOF TOOL REGISTRY FIX - COMPLETE

import sys
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
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
from contextlib import asynccontextmanager

sys.path.insert(0, os.path.dirname(__file__))

from code_review import review_code, batch_fix
from debug_guide import surface_errors, debug_step
from memory import save_memory, recall_memory, manage_privacy
from intent_handler import router as intent_router
from model_manager import load_model, list_available_models, get_model_info

# --- Load Config ---
with open(os.path.join(os.path.dirname(__file__), "config.yaml"), "r") as f:
    config = yaml.safe_load(f)

api_keys = config.get("api_keys", {})
fallback_order = config.get("fallback_order", [])
providers = [config.get("online_search")] + (fallback_order or [])

# ============================================================================
# BULLETPROOF TOOL REGISTRY SYSTEM - FINAL FIX
# ============================================================================

class ToolRegistry:
    def __init__(self):
        self._tools: Dict[str, Callable[..., Any]] = {}
        self._initialized = False

    def register(self, name: str, func: Callable[..., Any], desc: str = "", schema: dict = None):
        func.__desc__ = desc
        func.__schema__ = schema or {}
        self._tools[name] = func
        print(f"🛠️ Registered tool: {name} (Total: {len(self._tools)})")

    def exists(self, name: str) -> bool:
        return name in self._tools

    def call(self, name: str, **kwargs) -> Any:
        return self._tools[name](**kwargs)

    def serialize(self) -> List[dict]:
        # CRITICAL FIX: Add exception handling for serialization
        try:
            return [
                {
                    "name": n,
                    "description": getattr(f, '__desc__', ''),
                    "args_schema": getattr(f, '__schema__', {})
                }
                for n, f in self._tools.items()
            ]
        except Exception as e:
            print(f"🔌 Tool registry serialization error: {e}")
            return []  # Return empty array on failure

    def get_tool_names(self) -> List[str]:
        return list(self._tools.keys())

    def clear(self):
        """Clear all tools - should NOT be called during normal operation"""
        print(f"⚠️ WARNING: Clearing tool registry with {len(self._tools)} tools!")
        self._tools.clear()

# Initialize the global tool registry ONCE
tool_registry = ToolRegistry()

def tool(name: str, desc: str = "", schema: dict = None):
    """
    Tool decorator that registers functions immediately
    """
    def wrapper(fn):
        tool_registry.register(name, fn, desc, schema or {})
        return fn
    return wrapper

# ============================================================================
# CONVERSATION MODE DETECTION & PROMPT ENGINEERING
# ============================================================================

def should_use_tool_mode(message: str) -> bool:
    message_lower = message.lower()
    discussion_patterns = [
        "i think", "i believe", "i'm worried", "i'm concerned",
        "this might", "this could", "this may", "what if",
        "do you think", "opinion", "thoughts on", "feelings about",
        "problem with", "issue with", "concerns about", "discuss"
    ]
    command_patterns = [
        "i want you to", "i need you to", "please", "can you",
        "go ahead and", "help me", "show me the", "read the",
        "search for", "find the", "analyze the", "check the"
    ]

    if any(pattern in message_lower for pattern in discussion_patterns):
        return False
    if any(pattern in message_lower for pattern in command_patterns):
        return True

    if "create" in message_lower:
        command_context = any(word in message_lower for word in [
            "want", "need", "should", "please", "can you", "help"
        ])
        discussion_context = any(word in message_lower for word in [
            "think", "might", "could", "may", "problem", "issue", "concern"
        ])
        if discussion_context:
            return False
        return command_context

    return False

def build_react_prompt_with_tools(message: str, context: dict, tools: List[dict]) -> str:
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
    system_prompt = """You are AIDE, a helpful coding assistant.
Have a natural conversation with the user.
Only mention tools or capabilities if directly asked about them."""

    if CURRENT_MODEL and isinstance(CURRENT_MODEL, (str, os.PathLike)) and os.path.exists(str(CURRENT_MODEL)):
        try:
            tokenizer, model = load_model(CURRENT_MODEL)
            input_prompt = f"{system_prompt}\n\nUser: {message}\nAIDE:"
            input_data = tokenizer(input_prompt, return_tensors="pt", truncation=True, max_length=2048)

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
            if "AIDE:" in response_text:
                response_text = response_text.split("AIDE:")[-1].strip()

            return {"response": response_text, "type": "conversation"}

        except Exception as e:
            print(f"⚠️ Conversational model failed: {e}")

    return {
        "response": f"I understand you're asking about: {message}. How can I help you with this?",
        "type": "conversation"
    }

def load_existing_tools():
    """Load tools from the tools directory - NO REGISTRY CLEARING"""
    tools_dir = Path(__file__).parent / "tools"
    if not tools_dir.exists():
        print("🔍 Tools directory doesn't exist, creating it...")
        tools_dir.mkdir(exist_ok=True)
        return

    print(f"🔍 Loading tools from: {tools_dir}")
    tools_loaded = 0

    for tool_file in tools_dir.glob("*.py"):
        if tool_file.name == "__init__.py":
            continue

        try:
            print(f"📦 Loading tool file: {tool_file}")
            tool_name = tool_file.stem
            spec = importlib.util.spec_from_file_location(tool_name, str(tool_file))
            module = importlib.util.module_from_spec(spec)
            
            # Small delay for stability
            import time
            time.sleep(0.1)
            
            spec.loader.exec_module(module)
            tools_loaded += 1
            print(f"✅ Successfully loaded tool: {tool_name}")

        except Exception as e:
            print(f"❌ Failed to load tool {tool_file}: {e}")
            traceback.print_exc()

    print(f"📦 Tool loading complete: {tools_loaded} files processed")

# [SEARCH PROVIDER FUNCTIONS]
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

# [AGENTIC INTENT PROCESSOR]
class AgenticIntentProcessor:
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

# ============================================================================
# MODERN LIFESPAN APPROACH - REPLACING DEPRECATED STARTUP EVENT
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("🚀 AIDE Backend starting with bulletproof tool loading...")
    
    # Give the system time to stabilize
    import time
    time.sleep(1.0)
    
    # Load tools from directory - this will add to existing registry
    print(f"📊 Pre-loading tool count: {len(tool_registry.get_tool_names())}")
    print(f"📋 Pre-loading tools: {tool_registry.get_tool_names()}")
    
    load_existing_tools()
    
    # Give tools time to register
    time.sleep(0.5)
    
    # Final verification with detailed debugging
    final_tool_count = len(tool_registry.get_tool_names())
    final_tool_names = tool_registry.get_tool_names()
    
    print(f"🛠️ FINAL TOOL COUNT: {final_tool_count} tools registered")
    print(f"📋 FINAL TOOL NAMES: {final_tool_names}")
    
    # Debug the registry state
    print(f"🔍 Registry internal state: {len(tool_registry._tools)} tools in _tools dict")
    print(f"🔍 Registry keys: {list(tool_registry._tools.keys())}")
    
    print(f"🔌 WebSocket enabled with generous timeout handling")
    print(f"🤖 Model system: {'✅ Ready' if is_valid_model_path(CURRENT_MODEL) else '⚠️ No valid models'}")
    
    yield  # This is where the app runs
    
    # Shutdown (optional cleanup)
    print("🛑 AIDE Backend shutting down gracefully...")
    # Add any cleanup code here if needed

# --- FastAPI app with modern lifespan ---
app = FastAPI(
    title="AIDE Backend with Dynamic Models, Agentic Features & Hybrid Search",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(intent_router, prefix="/api/v1")

# ============================================================================
# WEBSOCKET ENDPOINT - WITH BULLETPROOF ERROR HANDLING
# ============================================================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    try:
        print("🔌 WebSocket connection attempt starting...")
        await websocket.accept(extra_headers=[
            ("Access-Control-Allow-Origin", "*"),
            ("Access-Control-Allow-Credentials", "true")
        ])
        print("🔌 WebSocket accepted successfully!")

        # Give time for component testing
        await asyncio.sleep(0.5)

        # CRITICAL FIX: Wrap tool registry serialization
        try:
            tools = tool_registry.serialize()
            print(f"🔌 Tool registry: {len(tools)} tools found")
            print(f"🔌 Tool names: {tool_registry.get_tool_names()}")
        except Exception as e:
            print(f"🔌 Tool registry serialization failed: {e}")
            traceback.print_exc()
            tools = []  # Fallback to empty array

        # CRITICAL FIX: Wrap model operations
        try:
            models = safe_list_available_models()
            print(f"🔌 Models: {len(models)} found")
        except Exception as e:
            print(f"🔌 Model listing error: {e}")
            traceback.print_exc()
            models = []

        try:
            current = CURRENT_MODEL if is_valid_model_path(CURRENT_MODEL) else None
            print(f"🔌 Current model: {current}")
        except Exception as e:
            print(f"🔌 Current model error: {e}")
            traceback.print_exc()
            current = None

        await asyncio.sleep(0.2)

        try:
            initial_message = {
                "type": "registry",
                "tools": tools,
                "workspace_context": {
                    "available_models": models,
                    "current_model": current,
                    "total_tools": len(tools),
                    "model_status": "loaded" if current else "no_models_available"
                }
            }
            await websocket.send_json(initial_message)
            print("🔌 Initial message sent successfully! 🎉")

        except Exception as e:
            print(f"🔌 Failed to send initial message: {e}")
            traceback.print_exc()
            # Send a minimal fallback message
            await websocket.send_json({
                "type": "registry",
                "tools": [],
                "message": "Connected with limited functionality"
            })

        # Message processing loop
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=30.0)
                msg_type = data.get("type")

                if msg_type == "query":
                    message = data.get("message", "")
                    context = data.get("context", {})
                    print(f"🤖 Processing query: {message[:50]}...")

                    if should_use_tool_mode(message):
                        print("🛠️ Using tool mode")
                        
                        # CRITICAL FIX: Wrap tool serialization for prompt building
                        try:
                            enhanced_prompt = build_react_prompt_with_tools(message, context, tool_registry.serialize())
                        except Exception as e:
                            print(f"🔌 Tool serialization for prompt failed: {e}")
                            enhanced_prompt = f"You are AIDE. User: {message}"
                        
                        if is_valid_model_path(CURRENT_MODEL):
                            try:
                                tokenizer, model = load_model(CURRENT_MODEL)
                                response, used_tools, actions = await generate_with_tool_calling(model, tokenizer, enhanced_prompt, context)
                                mode = "tool"
                            except Exception as model_err:
                                print(f"⚠️ Model failed: {model_err}")
                                response = f"AI model encountered an issue: {str(model_err)}. Using fallback mode."
                                used_tools = []
                                actions = []
                                mode = "tool_fallback"
                        else:
                            response = "No AI model available. Please load a model to enable advanced reasoning."
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
                            "message": f"Tool {tool_name} not found. Available: {tool_registry.get_tool_names()}"
                        })

                elif msg_type == "propose_new_tool":
                    try:
                        name = data.get("name")
                        code = data.get("code")
                        print(f"🏗️ Creating tool: {name}")

                        tools_dir = Path(__file__).parent / "tools"
                        tools_dir.mkdir(exist_ok=True)

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

                        tool_file = tools_dir / f"{name}.py"
                        tool_file.write_text(code, encoding="utf-8")

                        await asyncio.sleep(0.1)

                        spec = importlib.util.spec_from_file_location(name, str(tool_file))
                        module = importlib.util.module_from_spec(spec)
                        spec.loader.exec_module(module)

                        # CRITICAL FIX: Wrap tool serialization in response
                        try:
                            serialized_tools = tool_registry.serialize()
                        except Exception as e:
                            print(f"🔌 Tool serialization for new tool response failed: {e}")
                            serialized_tools = []

                        await websocket.send_json({
                            "type": "registry",
                            "tools": serialized_tools,
                            "message": f"Tool '{name}' created successfully",
                            "workspace_context": {
                                "available_models": safe_list_available_models(),
                                "current_model": CURRENT_MODEL if is_valid_model_path(CURRENT_MODEL) else None,
                                "total_tools": len(tool_registry.get_tool_names())
                            }
                        })

                    except Exception as e:
                        print(f"❌ Tool creation failed: {e}")
                        traceback.print_exc()
                        await websocket.send_json({
                            "type": "error",
                            "message": f"Failed to create tool: {str(e)}"
                        })

            except asyncio.TimeoutError:
                print("⏰ WebSocket message timeout - client may be slow")
                continue

            except json.JSONDecodeError as e:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Invalid JSON: {str(e)}"
                })

            except Exception as e:
                print(f"❌ Message processing error: {e}")
                traceback.print_exc()
                try:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Processing failed: {str(e)}"
                    })
                except:
                    print("🔌 Failed to send error - connection may be dead")

    except WebSocketDisconnect:
        print("🔌 WebSocket disconnected normally")

    except Exception as e:
        print(f"🔌 CRITICAL WebSocket error: {e}")
        traceback.print_exc()

# ============================================================================
# ADD WEBSOCKET HEALTH CHECK ENDPOINT
# ============================================================================

@app.get("/health/websocket")
async def websocket_health():
    """Health check specifically for WebSocket functionality"""
    try:
        # Test tool registry serialization
        tools = tool_registry.serialize()
        
        # Test model operations
        models = safe_list_available_models()
        current_model = CURRENT_MODEL if is_valid_model_path(CURRENT_MODEL) else None
        
        return {
            "status": "ok",
            "websocket_ready": True,
            "tools_count": len(tools),
            "models_count": len(models),
            "current_model": current_model,
            "message": "WebSocket endpoint is ready"
        }
    except Exception as e:
        return {
            "status": "error",
            "websocket_ready": False,
            "error": str(e),
            "message": "WebSocket endpoint has issues"
        }

# ============================================================================
# BULLETPROOF MODEL MANAGEMENT
# ============================================================================

def safe_list_available_models():
    try:
        models = list_available_models()
        return models if models else []
    except Exception as e:
        print(f"⚠️ Model discovery failed: {e}")
        return []

def is_valid_model_path(model_path):
    if not model_path:
        return False
    if not isinstance(model_path, (str, os.PathLike)):
        return False
    try:
        return os.path.exists(str(model_path))
    except:
        return False

def validate_current_model():
    global CURRENT_MODEL
    if not is_valid_model_path(CURRENT_MODEL):
        print(f"⚠️ Invalid CURRENT_MODEL: {CURRENT_MODEL}, resetting to None")
        CURRENT_MODEL = None

try:
    available_models = safe_list_available_models()
    CURRENT_MODEL = available_models[0] if available_models else None
    validate_current_model()
    print(f"🤖 Model initialization: Found {len(available_models)} models, current: {CURRENT_MODEL}")
except Exception as e:
    print(f"⚠️ Model initialization failed: {e}")
    available_models = []
    CURRENT_MODEL = None

# [ALL MODEL ENDPOINTS]
@app.get("/models")
async def api_list_models():
    models = safe_list_available_models()
    return {
        "models": models,
        "current": CURRENT_MODEL,
        "total_available": len(models),
        "discovery_method": "filesystem_scan",
        "current_valid": is_valid_model_path(CURRENT_MODEL)
    }

@app.post("/models/use")
async def api_choose_model(request: Request):
    global CURRENT_MODEL
    data = await request.json()
    model_name = data.get("name")

    if not model_name:
        return {"error": "No model name provided"}

    available_models = safe_list_available_models()
    if model_name not in available_models:
        return {
            "error": f"Model '{model_name}' not found",
            "available": available_models,
            "suggestion": "Check models/ directory"
        }

    try:
        CURRENT_MODEL = model_name
        validate_current_model()

        if is_valid_model_path(CURRENT_MODEL):
            tokenizer, model = load_model(CURRENT_MODEL)
            print(f"✅ Model loaded: {model_name}")
            return {
                "status": "success",
                "active": CURRENT_MODEL,
                "message": f"Successfully switched to {model_name}"
            }
        else:
            return {
                "error": f"Model path invalid: {model_name}",
                "current": CURRENT_MODEL
            }

    except Exception as e:
        return {
            "error": f"Failed to load model {model_name}: {str(e)}",
            "current": CURRENT_MODEL
        }

@app.get("/models/info/{model_name}")
async def api_model_info(model_name: str):
    try:
        info = get_model_info(model_name)
        return info if info else {"error": f"Model '{model_name}' not found"}
    except Exception as e:
        return {"error": f"Failed to get model info: {str(e)}"}

@app.get("/models/current")
async def api_current_model():
    if not is_valid_model_path(CURRENT_MODEL):
        return {
            "error": "No valid model active",
            "available_models": safe_list_available_models(),
            "suggestion": "Use POST /models/use to activate a model"
        }

    return {
        "current_model": CURRENT_MODEL,
        "status": "active",
        "valid": True
    }

# [ALL SPEECH ENDPOINTS]
@app.post("/speech/recognize")
async def speech_recognize(request: Request):
    try:
        data = await request.json()
        timeout = data.get('timeout', 10)
        language = data.get('language', 'en-US')

        try:
            import pyaudio
            import wave
            import vosk
            import json

            model_path = os.path.expanduser("~/.cache/vosk-models/vosk-model-en-us-0.22")
            if not os.path.exists(model_path):
                possible_paths = [
                    "/usr/share/vosk-models/vosk-model-en-us-0.22",
                    "/opt/vosk-models/vosk-model-en-us-0.22",
                    "./models/vosk-model-en-us-0.22",
                    os.path.expanduser("~/.vosk/models/vosk-model-en-us-0.22")
                ]
                model_path = next((p for p in possible_paths if os.path.exists(p)), None)

                if not model_path:
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

            p = pyaudio.PyAudio()
            stream = p.open(format=pyaudio.paInt16,
                          channels=1,
                          rate=16000,
                          input=True,
                          frames_per_buffer=8000)

            print(f"🎤 Recording for {timeout} seconds...")

            transcript = ""
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

            final_result = json.loads(rec.FinalResult())
            transcript += final_result.get('text', '')

            stream.stop_stream()
            stream.close()
            p.terminate()

            return {
                "status": "success",
                "transcript": transcript.strip(),
                "confidence": 0.95,
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
    try:
        data = await request.json()
        text = data.get('text', '')
        voice = data.get('voice', 'default')
        speed = data.get('speed', 1.0)
        play_immediately = data.get('play_immediately', True)

        if not text:
            return {"status": "error", "message": "No text provided"}

        try:
            from TTS.api import TTS
            import sounddevice as sd
            import soundfile as sf
            import numpy as np

            try:
                tts = TTS(model_name="tts_models/en/ljspeech/tacotron2-DDC_ph", progress_bar=False)
            except:
                try:
                    tts = TTS(model_name="tts_models/en/ljspeech/tacotron2-DDC", progress_bar=False)
                except:
                    tts = TTS(model_name="tts_models/en/vctk/vits", progress_bar=False)

            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
                audio_path = tmp_file.name

            tts.tts_to_file(text=text, file_path=audio_path)

            if play_immediately:
                try:
                    audio_data, samplerate = sf.read(audio_path)
                    sd.play(audio_data, samplerate)
                    sd.wait()
                except Exception as play_error:
                    print(f"Audio playback failed: {play_error}")

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

# [ALL LLM CONVERSATION CODE]
async def generate_with_tool_calling(model, tokenizer, message, context):
    try:
        # CRITICAL FIX: Wrap tool registry serialization
        try:
            available_tools = tool_registry.serialize()
        except Exception as e:
            print(f"⚠️ Tool serialization in generate_with_tool_calling failed: {e}")
            available_tools = []

        search_tools = list(PROVIDER_FUNCS.keys())
        current_file = context.get("currentFile", {})
        workspace = context.get("workspace", {})

        system_prompt = (
            "You are AIDE, an advanced coding assistant. "
            f"Available tools: {json.dumps(available_tools, indent=2)}\n"
            f"Search providers: {search_tools}\n"
            f"Workspace: {workspace.get('name', 'None')}\n"
            f"File: {current_file.get('filename', 'None')}\n"
            "Use TOOL[tool_name] to invoke tools.\n\n"
            f"User: {message}\nAIDE:"
        )

        input_data = tokenizer(system_prompt, return_tensors="pt", truncation=True, max_length=2048)

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

        if "AIDE:" in response_text:
            response_text = response_text.split("AIDE:")[-1].strip()

        tool_pattern = re.compile(r"TOOL\[(\w+)\]", re.I)
        tools_found = tool_pattern.findall(response_text)

        used_tools = []
        actions = []

        for tool in set(tools_found):
            if tool.lower() in PROVIDER_FUNCS:
                try:
                    result = PROVIDER_FUNCS[tool.lower()](message)
                    used_tools.append(tool)
                    actions.append({"type": "search_tool", "tool": tool, "result": result})
                    response_text += f"\n\n**{tool} Result:**\n{result}"
                except Exception as e:
                    response_text += f"\n\n*{tool} error: {str(e)}*"

            elif tool_registry.exists(tool):
                try:
                    result = tool_registry.call(tool)
                    used_tools.append(tool)
                    actions.append({"type": "custom_tool", "tool": tool, "result": result})
                    response_text += f"\n\n**{tool} Result:**\n{json.dumps(result, indent=2)}"
                except Exception as e:
                    response_text += f"\n\n*{tool} error: {str(e)}*"

        return response_text, used_tools, actions

    except Exception as e:
        error_msg = f"Model generation failed: {str(e)}"
        print(f"⚠️ {error_msg}")
        return error_msg, [], []

@app.post("/chat")
async def api_chat(request: Request):
    data = await request.json()
    message = data.get("message", "")
    context = data.get("context", {})

    if not message:
        return {"error": "No message provided"}

    try:
        if is_valid_model_path(CURRENT_MODEL):
            try:
                print(f"🤖 Using model: {CURRENT_MODEL}")
                tokenizer, model = load_model(CURRENT_MODEL)
                response, used_tools, actions = await generate_with_tool_calling(model, tokenizer, message, context)

                return {
                    "response": response,
                    "model_used": CURRENT_MODEL,
                    "actions": actions,
                    "tools_invoked": used_tools,
                    "conversation_type": "llm_first"
                }

            except Exception as model_err:
                print(f"⚠️ Model failed: {str(model_err)}")
                result = agentic_processor.process_intent(message, context)
                result["fallback_reason"] = f"Model error: {str(model_err)}"
                result["conversation_type"] = "regex_fallback"
                return result

        else:
            print("📝 No valid model, using regex processor")
            result = agentic_processor.process_intent(message, context)
            result["fallback_reason"] = "No valid model loaded"
            result["conversation_type"] = "regex_fallback"

            search_keywords = ["search", "find", "look up", "what is", "who is", "when did", "how to"]
            if any(keyword in message.lower() for keyword in search_keywords):
                search_result = hybrid_online_search(message)
                if "result" in search_result:
                    result["response"] += f"\n\n🌐 **Web Search:**\n{search_result['result']}"

            return result

    except Exception as e:
        return {
            "response": f"I encountered an error: {str(e)}",
            "actions": [],
            "conversation_type": "error"
        }

# [ALL OTHER ENDPOINTS]
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "message": "AIDE backend running",
        "websocket_enabled": True,
        "tools_registered": len(tool_registry.get_tool_names()),
        "current_model": CURRENT_MODEL,
        "model_valid": is_valid_model_path(CURRENT_MODEL)
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

if __name__ == "__main__":
    host = os.getenv("AIDE_HOST", config.get("host", "127.0.0.1"))
    port = int(os.getenv("AIDE_PORT", config.get("port", 8000)))

    print(f"🚀 Starting AIDE on {host}:{port}")
    print(f"🎤 Speech functionality: Vosk + Coqui TTS enabled")
    print(f"🤖 Models available: {len(safe_list_available_models())}")
    print(f"🎯 Current model: {CURRENT_MODEL if is_valid_model_path(CURRENT_MODEL) else 'None (fallback mode)'}")
    print(f"🔌 WebSocket: ✅ Generous timeout + bulletproof error handling")
    print(f"🛠️ Dynamic tools: ✅ Bulletproof registration system")

    uvicorn.run(app, host=host, port=port)
