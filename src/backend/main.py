# File: src/backend/main.py

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import json
from typing import Set

from .core.logger import logger
from .core.config import config
from .services.tool_service import tool_service
from .services.memory_service import memory_service
from .services.speech_service import speech_service

# Import routers
from .routers.chat import router as chat_router
from .routers.speech import router as speech_router, handle_speech_websocket_message

# Import existing modules for compatibility
try:
    from .code_review import review_code, batch_fix
    from .debug_guide import surface_errors, debug_step
    from .memory import save_memory as legacy_save_memory, recall_memory as legacy_recall_memory, manage_privacy
    from .intent_handler import router as intent_router
    from .model_manager import load_model, list_available_models, get_model_info
except ImportError as e:
    logger.warning(f"Some legacy modules not available: {e}")

# Global state
active_connections: Set[WebSocket] = set()
CURRENT_MODEL = None
_model_cache = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Enhanced lifespan with modular initialization"""
    # Startup
    logger.info("🚀 AIDE Backend starting with modular architecture...")
    
    # Initialize services
    logger.info("🔧 Initializing services...")
    
    # Load tools
    logger.info(f"🛠️ Tools loaded: {len(tool_service.get_available_tools())}")
    
    # Initialize memory system
    memory_stats = await memory_service.get_memory_statistics()
    logger.info(f"🧠 Memory system: {memory_stats}")
    
    # Initialize speech system
    speech_caps = speech_service.get_speech_capabilities()
    logger.info(f"🎙️ Speech capabilities: STT={speech_caps['speech_to_text']}, TTS={speech_caps['text_to_speech']}")
    
    # Check model availability
    try:
        available_models = list_available_models() if 'list_available_models' in globals() else []
        logger.info(f"🤖 Available models: {len(available_models)}")
    except:
        logger.warning("⚠️ Model system not available")
    
    logger.info("✅ AIDE Backend fully initialized!")
    
    yield
    
    # Shutdown
    logger.info("🛑 AIDE Backend shutting down...")
    
    # Close all WebSocket connections
    for connection in active_connections.copy():
        try:
            await connection.close()
        except:
            pass
    active_connections.clear()
    
    logger.info("✅ Shutdown complete")

# Create FastAPI app
app = FastAPI(
    title="AIDE Backend - Modular Architecture",
    description="Modular backend for AIDE coding assistant",
    version="2.0.0",
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

# Health endpoints
@app.get("/health")
async def health():
    """Enhanced health check"""
    return {
        "status": "ok",
        "message": "AIDE backend running - Modular Architecture v2.0",
        "version": "2.0.0",
        "services": {
            "websocket": True,
            "streaming": True,
            "memory": True,
            "speech": speech_service.get_speech_capabilities(),
            "tools": len(tool_service.get_available_tools())
        },
        "config": {
            "host": config.host,
            "port": config.port
        }
    }

@app.get("/health/detailed")
async def detailed_health():
    """Detailed health information"""
    try:
        memory_stats = await memory_service.get_memory_statistics()
        speech_caps = speech_service.get_speech_capabilities()
        
        return {
            "status": "ok",
            "timestamp": str(asyncio.get_event_loop().time()),
            "services": {
                "memory": memory_stats,
                "speech": speech_caps,
                "tools": {
                    "count": len(tool_service.get_available_tools()),
                    "available": [tool["name"] for tool in tool_service.get_available_tools()]
                }
            },
            "active_connections": len(active_connections)
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }

# Enhanced WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Enhanced WebSocket endpoint with modular message handling
    """
    try:
        logger.info("🔌 WebSocket connection attempt")
        await websocket.accept()
        active_connections.add(websocket)
        
        logger.info("🔌 WebSocket connected successfully")
        
        # Send initial connection message
        try:
            initial_message = {
                "type": "connection_established",
                "message": "🎮 AIDE Modular Backend Ready!",
                "version": "2.0.0",
                "services": {
                    "memory": True,
                    "speech": speech_service.get_speech_capabilities(),
                    "tools": len(tool_service.get_available_tools())
                },
                "available_tools": tool_service.get_available_tools()
            }
            
            await websocket.send_json(initial_message)
            logger.info("🔌 Initial message sent successfully")
            
        except Exception as e:
            logger.error(f"Failed to send initial message: {e}")
            await websocket.send_json({
                "type": "connection_established",
                "message": "Connected with limited functionality",
                "error": str(e)
            })
        
        # Message processing loop
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=30.0)
                msg_type = data.get("type")
                
                logger.debug(f"🔌 Received message type: {msg_type}")
                
                # Route messages to appropriate handlers
                if msg_type == "query":
                    await handle_query_message(websocket, data)
                
                elif msg_type == "invoke":
                    await handle_tool_invocation(websocket, data)
                
                elif msg_type.startswith("speech_"):
                    await handle_speech_websocket_message(websocket, data)
                
                elif msg_type == "memory_search":
                    await handle_memory_search(websocket, data)
                
                elif msg_type == "get_capabilities":
                    await handle_capabilities_request(websocket, data)
                
                else:
                    await websocket.send_json({
                        "type": "error",
                        "error": f"Unknown message type: {msg_type}"
                    })
            
            except asyncio.TimeoutError:
                logger.debug("WebSocket timeout - sending keepalive")
                await websocket.send_json({"type": "keepalive"})
                continue
            
            except json.JSONDecodeError as e:
                await websocket.send_json({
                    "type": "error",
                    "error": f"Invalid JSON: {str(e)}"
                })
            
            except Exception as e:
                logger.error(f"Message processing error: {e}")
                await websocket.send_json({
                    "type": "error",
                    "error": f"Processing failed: {str(e)}"
                })
    
    except WebSocketDisconnect:
        logger.info("🔌 WebSocket disconnected normally")
    except Exception as e:
        logger.error(f"🔌 WebSocket error: {e}")
    finally:
        active_connections.discard(websocket)

async def handle_query_message(websocket: WebSocket, data: dict):
    """Handle query messages with enhanced processing"""
    message = data.get("message", "")
    context = data.get("context", {})
    
    if not message:
        await websocket.send_json({
            "type": "error",
            "error": "No message provided"
        })
        return
    
    try:
        # Send thinking indicator
        await websocket.send_json({
            "type": "thinking",
            "message": "🤔 Processing with modular backend..."
        })
        
        # Process through chat router logic
        # For now, send a placeholder response
        response_text = f"Modular backend processed: {message}"
        
        # Send response
        await websocket.send_json({
            "type": "response",
            "response": response_text,
            "mode": "modular_backend",
            "timestamp": str(asyncio.get_event_loop().time())
        })
    
    except Exception as e:
        logger.error(f"Query handling error: {e}")
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
        logger.info(f"🔧 Invoking tool: {tool_name}")
        
        result = await tool_service.execute_tool(tool_name, args)
        
        await websocket.send_json({
            "type": "tool_response",
            "tool": tool_name,
            "success": result.get("success", False),
            "result": result,
            "timestamp": str(asyncio.get_event_loop().time())
        })
    
    except Exception as e:
        logger.error(f"Tool invocation error: {e}")
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
            "count": len(memories)
        })
    
    except Exception as e:
        logger.error(f"Memory search error: {e}")
        await websocket.send_json({
            "type": "error",
            "error": str(e)
        })

async def handle_capabilities_request(websocket: WebSocket, data: dict):
    """Handle capabilities request"""
    try:
        capabilities = {
            "tools": tool_service.get_available_tools(),
            "speech": speech_service.get_speech_capabilities(),
            "memory": await memory_service.get_memory_statistics(),
            "version": "2.0.0",
            "features": [
                "modular_architecture",
                "vector_memory",
                "enhanced_tools",
                "speech_processing",
                "streaming_responses"
            ]
        }
        
        await websocket.send_json({
            "type": "capabilities_result",
            "capabilities": capabilities
        })
    
    except Exception as e:
        logger.error(f"Capabilities request error: {e}")
        await websocket.send_json({
            "type": "error",
            "error": str(e)
        })

# Legacy endpoints for compatibility
@app.get("/models")
async def api_list_models():
    """Legacy model listing endpoint"""
    try:
        if 'list_available_models' in globals():
            models = list_available_models()
            return {
                "models": models,
                "current": CURRENT_MODEL,
                "total_available": len(models),
                "backend_version": "2.0.0"
            }
        else:
            return {
                "models": [],
                "current": None,
                "total_available": 0,
                "backend_version": "2.0.0",
                "note": "Model system not available"
            }
    except Exception as e:
        return {
            "models": [],
            "error": str(e)
        }

if __name__ == "__main__":
    import uvicorn
    
    logger.info(f"🚀 Starting AIDE Modular Backend on {config.host}:{config.port}")
    uvicorn.run(app, host=config.host, port=config.port)