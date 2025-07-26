from fastapi import FastAPI, Request
import uvicorn
import os
import requests
import yaml
import json
from typing import Dict, List, Any

from code_review import review_code, batch_fix
from debug_guide import surface_errors, debug_step
from memory import save_memory, recall_memory, manage_privacy

# ADD THIS IMPORT for our new intent handler
from intent_handler import router as intent_router

# --- Load Config ---
with open(os.path.join(os.path.dirname(__file__), "config.yaml"), "r") as f:
    config = yaml.safe_load(f)

api_keys = config.get("api_keys", {})
fallback_order = config.get("fallback_order", [])
providers = [config.get("online_search")] + (fallback_order or [])

# [ALL YOUR EXISTING SEARCH PROVIDER FUNCTIONS - keeping them exactly as is]
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

# [ALL YOUR EXISTING AGENTIC INTENT PROCESSOR - keeping exactly as is]
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
app = FastAPI(title="AIDE Backend with Agentic Features & Hybrid Search")

# ADD THE INTENT ROUTER HERE - this is our new pipeline addition
app.include_router(intent_router, prefix="/api/v1")

# [ALL YOUR EXISTING ENDPOINTS - keeping exactly as they are]
@app.get("/health")
async def health():
    return {"status": "ok", "message": "AIDE backend is running"}

@app.post("/chat")
async def api_chat(request: Request):
    data = await request.json()
    message = data.get("message", "")
    context = data.get("context", {})
    
    if not message:
        return {"error": "No message provided"}
    
    try:
        result = agentic_processor.process_intent(message, context)
        
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
            "detected_intents": ["error"]
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
    uvicorn.run(app, host=config.get("host", "127.0.0.1"), port=int(config.get("port", 8000)))

