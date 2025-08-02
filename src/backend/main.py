# File: src/backend/main.py - GPU-FIRST PRIORITY VERSION

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import json
import argparse
from typing import Set

from .core.logger import logger
from .core.config import config
from .core.device_detection import get_device_priority_info
from .services.tool_service import tool_service
from .services.memory_service import memory_service
from .services.speech_service import speech_service

# Import routers
from .routers.chat import router as chat_router
from .routers.speech import router as speech_router, handle_speech_websocket_message

# Import GPU-FIRST backends
try:
    from .llamacpp_backend import create_llamacpp_backend
    from .openvino_backend import create_openvino_backend
except ImportError as e:
    logger.warning(f"GPU backends not available: {e}")

# Import existing modules for compatibility
try:
    from .code_review import review_code, batch_fix
    from .debug_guide import surface_errors, debug_step
    from .memory import save_memory as legacy_save_memory, recall_memory as legacy_recall_memory, manage_privacy
    from .intent_handler import router as intent_router
    from .model_manager import load_model, list_available_models, get_model_info
except ImportError as e:
    logger.warning(f"Some legacy modules not available: {e}")

# Parse command line arguments for GPU-first options
parser = argparse.ArgumentParser(description="AIDE GPU-FIRST Backend")
parser.add_argument('--gpu-first', action='store_true', default=True,
                   help='Prioritize GPU usage (default: True)')
parser.add_argument('--no-model-preload', action='store_true',
                   help='Start server without preloading models (faster startup)')
parser.add_argument('--force-gpu', action='store_true',
                   help='Force GPU usage or fail (no CPU fallback)')
parser.add_argument('--gpu-layers', type=int, default=-1,
                   help='Number of GPU layers (-1 for maximum)')

args = parser.parse_args()

# Global state
active_connections: Set[WebSocket] = set()
CURRENT_MODEL = None
_model_cache = {}
gpu_backend = None
model_loading_status = {"loaded": False, "loading": False, "error": None}

@asynccontextmanager
async def lifespan(app: FastAPI):
    """GPU-FIRST lifespan with prioritized GPU initialization"""
    global gpu_backend, model_loading_status
    
    # Startup
    logger.info("🚀 AIDE GPU-FIRST Backend starting...")
    
    # GPU-FIRST: Detect GPU immediately
    logger.info("🎮 GPU-FIRST: Detecting GPU capabilities...")
    device_info = get_device_priority_info()
    app.state.device_info = device_info
    
    if device_info["gpu_detected"]:
        logger.info(f"✅ GPU-FIRST SUCCESS: {device_info['current_priority']} priority GPU detected")
    else:
        logger.warning("⚠️ GPU-FIRST FAILED: No GPU detected, falling back to CPU")
        if args.force_gpu:
            logger.error("❌ --force-gpu specified but no GPU found, exiting")
            raise RuntimeError("No GPU found and --force-gpu specified")
    
    # Initialize services with GPU priority
    logger.info("🔧 Initializing GPU-FIRST services...")
    
    # Initialize GPU backend first
    if device_info["gpu_detected"]:
        try:
            logger.info("🎮 Initializing GPU-FIRST llama.cpp backend...")
            gpu_backend, success = create_llamacpp_backend()
            if success:
                logger.info("✅ GPU-FIRST backend initialized successfully")
                app.state.gpu_backend = gpu_backend
            else:
                logger.warning("⚠️ GPU backend initialization failed")
        except Exception as e:
            logger.error(f"❌ GPU backend error: {e}")
    
    # Load tools
    logger.info(f"🛠️ Tools loaded: {len(tool_service.get_available_tools())}")
    
    # Initialize memory system
    memory_stats = await memory_service.get_memory_statistics()
    logger.info(f"🧠 Memory system: {memory_stats}")
    
    # Initialize speech system
    speech_caps = speech_service.get_speech_capabilities()
    logger.info(f"🎙️ Speech capabilities: STT={speech_caps['speech_to_text']}, TTS={speech_caps['text_to_speech']}")
    
    # Model loading strategy
    if not args.no_model_preload and device_info["gpu_detected"]:
        logger.info("🎮 GPU-FIRST: Starting background model loading...")
        asyncio.create_task(gpu_first_model_loading())
    elif args.no_model_preload:
        logger.info("⚡ Fast startup mode: Models will load on first request")
    else:
        logger.info("💻 CPU-only mode: Model loading deferred")
    
    logger.info("✅ AIDE GPU-FIRST Backend fully initialized!")
    
    yield
    
    # Shutdown
    logger.info("🛑 AIDE GPU-FIRST Backend shutting down...")
    
    # Close all WebSocket connections
    for connection in active_connections.copy():
        try:
            await connection.close()
        except:
            pass
    active_connections.clear()
    
    # Cleanup GPU resources
    if gpu_backend:
        try:
            gpu_backend.unload_model()
            logger.info("🗑️ GPU resources cleaned up")
        except:
            pass
    
    logger.info("✅ GPU-FIRST shutdown complete")

async def gpu_first_model_loading():
    """Background model loading with GPU priority"""
    global model_loading_status
    
    try:
        model_loading_status["loading"] = True
        logger.info("🎮 GPU-FIRST: Loading models in background...")
        
        # Check for available models
        try:
            available_models = list_available_models() if 'list_available_models' in globals() else []
            if not available_models:
                logger.warning("⚠️ No models found for GPU loading")
                model_loading_status["error"] = "No models found"
                return
        except Exception as e:
            logger.error(f"❌ Model discovery failed: {e}")
            model_loading_status["error"] = str(e)
            return
        
        # Load first available model with GPU priority
        model_name = available_models[0]
        logger.info(f"🎮 GPU-FIRST: Loading model {model_name}...")
        
        if gpu_backend:
            try:
                from pathlib import Path
                model_path = Path("./models") / model_name
                success, message = gpu_backend.load_model(model_path, n_gpu_layers=args.gpu_layers)
                
                if success:
                    logger.info(f"✅ GPU-FIRST model loaded: {message}")
                    model_loading_status["loaded"] = True
                    global CURRENT_MODEL
                    CURRENT_MODEL = model_name
                else:
                    logger.error(f"❌ GPU model loading failed: {message}")
                    model_loading_status["error"] = message
                    
            except Exception as e:
                logger.error(f"❌ GPU model loading exception: {e}")
                model_loading_status["error"] = str(e)
        else:
            logger.warning("⚠️ No GPU backend available for model loading")
            model_loading_status["error"] = "No GPU backend"
            
    except Exception as e:
        logger.error(f"❌ Background model loading failed: {e}")
        model_loading_status["error"] = str(e)
    finally:
        model_loading_status["loading"] = False

# Create FastAPI app with GPU-first configuration
app = FastAPI(
    title="AIDE Backend - GPU-FIRST Architecture",
    description="GPU-prioritized backend for AIDE coding assistant",
    version="2.0.0-GPU-FIRST",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(chat_router)
app.include_router(speech_router)

# Include legacy routers for compatibility
if 'intent_router' in globals():
    app.include_router(intent_router, prefix="/api/v1")

# GPU-FIRST health endpoints
@app.get("/health")
async def health():
    """GPU-FIRST health check"""
    device_info = getattr(app.state, 'device_info', {})
    
    return {
        "status": "ok",
        "message": "AIDE GPU-FIRST backend running",
        "version": "2.0.0-GPU-FIRST",
        "gpu_first_mode": True,
        "gpu_detected": device_info.get("gpu_detected", False),
        "gpu_priority": device_info.get("current_priority", "UNKNOWN"),
        "device_name": device_info.get("device_config", {}).get("device_name", "Unknown"),
        "model_status": model_loading_status,
        "services": {
            "websocket": True,
            "streaming": True,
            "memory": True,
            "speech": speech_service.get_speech_capabilities(),
            "tools": len(tool_service.get_available_tools()),
            "gpu_backend": gpu_backend is not None
        },
        "config": {
            "host": config.host,
            "port": config.port,
            "gpu_layers": args.gpu_layers,
            "force_gpu": args.force_gpu
        }
    }

@app.get("/health/gpu")
async def gpu_health():
    """Detailed GPU health information"""
    device_info = getattr(app.state, 'device_info', {})
    
    return {
        "gpu_first_mode": True,
        "device_detection": device_info,
        "model_loading": model_loading_status,
        "gpu_backend_available": gpu_backend is not None,
        "gpu_backend_info": gpu_backend.get_backend_info() if gpu_backend else None,
        "args": {
            "gpu_first": args.gpu_first,
            "no_model_preload": args.no_model_preload,
            "force_gpu": args.force_gpu,
            "gpu_layers": args.gpu_layers
        }
    }

# Enhanced WebSocket endpoint with GPU-first priority
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """GPU-FIRST WebSocket endpoint"""
    try:
        logger.info("🔌 GPU-FIRST WebSocket connection attempt")
        await websocket.accept()
        active_connections.add(websocket)
        logger.info("🔌 GPU-FIRST WebSocket connected successfully")
        
        # Send GPU-first initial message
        device_info = getattr(app.state, 'device_info', {})
        
        initial_message = {
            "type": "connection_established",
            "message": "🎮 AIDE GPU-FIRST Backend Ready!",
            "version": "2.0.0-GPU-FIRST",
            "gpu_first_mode": True,
            "gpu_detected": device_info.get("gpu_detected", False),
            "gpu_priority": device_info.get("current_priority", "UNKNOWN"),
            "device_name": device_info.get("device_config", {}).get("device_name", "Unknown"),
            "model_status": model_loading_status,
            "services": {
                "memory": True,
                "speech": speech_service.get_speech_capabilities(),
                "tools": len(tool_service.get_available_tools()),
                "gpu_backend": gpu_backend is not None
            },
            "available_tools": tool_service.get_available_tools()
        }
        
        await websocket.send_json(initial_message)
        logger.info("🔌 GPU-FIRST initial message sent successfully")
        
        # Message processing loop
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=30.0)
                msg_type = data.get("type")
                logger.debug(f"🔌 GPU-FIRST received message type: {msg_type}")
                
                # Route messages to appropriate handlers
                if msg_type == "query":
                    await handle_gpu_first_query(websocket, data)
                elif msg_type == "invoke":
                    await handle_tool_invocation(websocket, data)
                elif msg_type.startswith("speech_"):
                    await handle_speech_websocket_message(websocket, data)
                elif msg_type == "memory_search":
                    await handle_memory_search(websocket, data)
                elif msg_type == "get_capabilities":
                    await handle_capabilities_request(websocket, data)
                elif msg_type == "gpu_status":
                    await handle_gpu_status_request(websocket, data)
                else:
                    await websocket.send_json({
                        "type": "error",
                        "error": f"Unknown message type: {msg_type}"
                    })
                    
            except asyncio.TimeoutError:
                logger.debug("GPU-FIRST WebSocket timeout - sending keepalive")
                await websocket.send_json({"type": "keepalive", "gpu_first": True})
                continue
            except json.JSONDecodeError as e:
                await websocket.send_json({
                    "type": "error",
                    "error": f"Invalid JSON: {str(e)}"
                })
            except Exception as e:
                logger.error(f"GPU-FIRST message processing error: {e}")
                await websocket.send_json({
                    "type": "error",
                    "error": f"Processing failed: {str(e)}"
                })
                
    except WebSocketDisconnect:
        logger.info("🔌 GPU-FIRST WebSocket disconnected normally")
    except Exception as e:
        logger.error(f"🔌 GPU-FIRST WebSocket error: {e}")
    finally:
        active_connections.discard(websocket)

async def handle_gpu_first_query(websocket: WebSocket, data: dict):
    """Handle query messages with GPU-first processing"""
    message = data.get("message", "")
    context = data.get("context", {})
    
    if not message:
        await websocket.send_json({
            "type": "error",
            "error": "No message provided"
        })
        return
    
    try:
        # Send GPU-first thinking indicator
        await websocket.send_json({
            "type": "thinking",
            "message": "🎮 Processing with GPU-FIRST backend..."
        })
        
        # Check if GPU model is ready
        if not model_loading_status["loaded"] and not model_loading_status["loading"]:
            if args.no_model_preload:
                # Load model on demand
                await websocket.send_json({
                    "type": "loading",
                    "message": "🎮 Loading GPU model on demand..."
                })
                await gpu_first_model_loading()
            else:
                await websocket.send_json({
                    "type": "error",
                    "error": "GPU model not loaded and preloading is disabled"
                })
                return
        
        elif model_loading_status["loading"]:
            await websocket.send_json({
                "type": "loading",
                "message": "🎮 GPU model is currently loading, please wait..."
            })
            return
        
        elif model_loading_status["error"]:
            await websocket.send_json({
                "type": "error",
                "error": f"GPU model loading failed: {model_loading_status['error']}"
            })
            return
        
        # Process with GPU backend if available
        if gpu_backend and model_loading_status["loaded"]:
            try:
                # Use GPU backend for generation
                response_text = gpu_backend.generate_response(
                    prompt=f"User: {message}\nAIDE:",
                    max_tokens=1024,
                    temperature=0.8
                )
                
                # Send GPU-generated response
                await websocket.send_json({
                    "type": "response",
                    "response": response_text,
                    "mode": "gpu_first_backend",
                    "gpu_used": True,
                    "device": gpu_backend.device_name,
                    "timestamp": str(asyncio.get_event_loop().time())
                })
                
            except Exception as e:
                logger.error(f"GPU generation error: {e}")
                await websocket.send_json({
                    "type": "error",
                    "error": f"GPU generation failed: {str(e)}"
                })
        else:
            # Fallback response
            response_text = f"GPU-FIRST backend processed: {message} (GPU not available)"
            await websocket.send_json({
                "type": "response",
                "response": response_text,
                "mode": "gpu_first_fallback",
                "gpu_used": False,
                "timestamp": str(asyncio.get_event_loop().time())
            })
            
    except Exception as e:
        logger.error(f"GPU-FIRST query handling error: {e}")
        await websocket.send_json({
            "type": "error",
            "error": str(e)
        })

async def handle_tool_invocation(websocket: WebSocket, data: dict):
    """Handle tool invocation requests"""
    tool_name = data.get("tool")
    args = data.get("args", {})
    
    if not tool_name:
        await websocket.send_json({
            "type": "error",
            "error": "No tool name provided"
        })
        return
    
    try:
        logger.info(f"🔧 GPU-FIRST: Invoking tool: {tool_name}")
        result = await tool_service.execute_tool(tool_name, args)
        
        await websocket.send_json({
            "type": "tool_response",
            "tool": tool_name,
            "success": result.get("success", False),
            "result": result,
            "gpu_first_mode": True,
            "timestamp": str(asyncio.get_event_loop().time())
        })
        
    except Exception as e:
        logger.error(f"GPU-FIRST tool invocation error: {e}")
        await websocket.send_json({
            "type": "error",
            "error": str(e)
        })

async def handle_memory_search(websocket: WebSocket, data: dict):
    """Handle memory search requests"""
    query = data.get("query", "")
    limit = data.get("limit", 5)
    
    try:
        memories = await memory_service.recall_memories(query, top_k=limit)
        
        await websocket.send_json({
            "type": "memory_search_result",
            "query": query,
            "memories": memories,
            "count": len(memories),
            "gpu_first_mode": True
        })
        
    except Exception as e:
        logger.error(f"GPU-FIRST memory search error: {e}")
        await websocket.send_json({
            "type": "error",
            "error": str(e)
        })

async def handle_capabilities_request(websocket: WebSocket, data: dict):
    """Handle capabilities request with GPU-first info"""
    try:
        device_info = getattr(app.state, 'device_info', {})
        
        capabilities = {
            "gpu_first_mode": True,
            "gpu_detected": device_info.get("gpu_detected", False),
            "gpu_priority": device_info.get("current_priority", "UNKNOWN"),
            "device_info": device_info,
            "model_status": model_loading_status,
            "tools": tool_service.get_available_tools(),
            "speech": speech_service.get_speech_capabilities(),
            "memory": await memory_service.get_memory_statistics(),
            "gpu_backend": gpu_backend.get_backend_info() if gpu_backend else None,
            "version": "2.0.0-GPU-FIRST",
            "features": [
                "gpu_first_architecture",
                "intel_arc_optimization",
                "vector_memory",
                "enhanced_tools",
                "speech_processing",
                "streaming_responses",
                "gpu_accelerated_inference"
            ]
        }
        
        await websocket.send_json({
            "type": "capabilities_result",
            "capabilities": capabilities
        })
        
    except Exception as e:
        logger.error(f"GPU-FIRST capabilities request error: {e}")
        await websocket.send_json({
            "type": "error",
            "error": str(e)
        })

async def handle_gpu_status_request(websocket: WebSocket, data: dict):
    """Handle GPU status request"""
    try:
        device_info = getattr(app.state, 'device_info', {})
        
        gpu_status = {
            "gpu_first_mode": True,
            "gpu_detected": device_info.get("gpu_detected", False),
            "device_info": device_info,
            "model_loading": model_loading_status,
            "gpu_backend_info": gpu_backend.get_backend_info() if gpu_backend else None,
            "active_connections": len(active_connections),
            "args": {
                "gpu_first": args.gpu_first,
                "force_gpu": args.force_gpu,
                "gpu_layers": args.gpu_layers,
                "no_model_preload": args.no_model_preload
            }
        }
        
        await websocket.send_json({
            "type": "gpu_status_result",
            "gpu_status": gpu_status
        })
        
    except Exception as e:
        logger.error(f"GPU status request error: {e}")
        await websocket.send_json({
            "type": "error",
            "error": str(e)
        })

# Legacy endpoints for compatibility
@app.get("/models")
async def api_list_models():
    """Legacy model listing endpoint with GPU-first info"""
    try:
        if 'list_available_models' in globals():
            models = list_available_models()
            device_info = getattr(app.state, 'device_info', {})
            
            return {
                "models": models,
                "current": CURRENT_MODEL,
                "total_available": len(models),
                "backend_version": "2.0.0-GPU-FIRST",
                "gpu_first_mode": True,
                "gpu_detected": device_info.get("gpu_detected", False),
                "gpu_priority": device_info.get("current_priority", "UNKNOWN"),
                "model_status": model_loading_status
            }
        else:
            return {
                "models": [],
                "current": None,
                "total_available": 0,
                "backend_version": "2.0.0-GPU-FIRST",
                "gpu_first_mode": True,
                "note": "Model system not available"
            }
    except Exception as e:
        return {
            "models": [],
            "error": str(e),
            "gpu_first_mode": True
        }

if __name__ == "__main__":
    import uvicorn
    
    logger.info(f"🚀 Starting AIDE GPU-FIRST Backend on {config.host}:{config.port}")
    logger.info(f"🎮 GPU-FIRST Mode: {args.gpu_first}")
    logger.info(f"🔥 Force GPU: {args.force_gpu}")
    logger.info(f"⚡ GPU Layers: {args.gpu_layers}")
    logger.info(f"🏃 No Model Preload: {args.no_model_preload}")
    
    uvicorn.run(app, host=config.host, port=config.port)
