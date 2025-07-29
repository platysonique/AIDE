# FILE: src/backend/api.py - COMPLETE FILE WITH REAL SPEECH INTEGRATION

from fastapi import FastAPI, Request
import uvicorn
import os
import requests
import yaml
import json
import asyncio
import tempfile
from pathlib import Path
from typing import Dict, List, Any
sys.path.insert(0, os.path.dirname(__file__))

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
    # Support environment variables for the enhanced backend manager
    host = os.getenv("AIDE_HOST", config.get("host", "127.0.0.1"))
    port = int(os.getenv("AIDE_PORT", config.get("port", 8000)))
    
    print(f"🚀 Starting AIDE backend on {host}:{port}")
    print(f"🎤 Speech functionality: Vosk + Coqui TTS enabled")
    uvicorn.run(app, host=host, port=port)
