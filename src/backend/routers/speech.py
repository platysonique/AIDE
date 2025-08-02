# File: src/backend/routers/speech.py

from fastapi import APIRouter, UploadFile, File, Form
from typing import Dict, Any, Optional
import base64

from ..core.logger import logger
from ..services.speech_service import SpeechService

router = APIRouter(prefix="/speech", tags=["speech"])

# Service instance
speech_service = SpeechService()

@router.post("/stt")
async def speech_to_text_endpoint(audio_file: UploadFile = File(...)):
    """
    Speech-to-text endpoint for file uploads
    Converts uploaded audio to text using Whisper
    """
    try:
        # Read audio file
        audio_data = await audio_file.read()
        
        # Get file format from filename
        file_format = "wav"  # default
        if audio_file.filename:
            file_format = audio_file.filename.split(".")[-1].lower()
        
        # Convert to text
        result = await speech_service.speech_to_text(audio_data, file_format)
        
        logger.info(f"🎙️ STT request processed: {result.get('success', False)}")
        
        return {
            "success": result["success"],
            "text": result.get("text", ""),
            "confidence": result.get("confidence", 0.0),
            "language": result.get("language", "unknown"),
            "duration": result.get("duration", 0.0),
            "error": result.get("error")
        }
    
    except Exception as e:
        logger.error(f"STT endpoint error: {e}")
        return {
            "success": False,
            "text": "",
            "error": str(e)
        }

@router.post("/stt/base64")
async def speech_to_text_base64_endpoint(
    audio_base64: str = Form(...),
    format: str = Form("wav")
):
    """
    Speech-to-text endpoint for base64 encoded audio
    Useful for WebSocket and direct API calls
    """
    try:
        result = await speech_service.speech_to_text_from_base64(audio_base64, format)
        
        logger.info(f"🎙️ STT base64 request processed: {result.get('success', False)}")
        
        return {
            "success": result["success"],
            "text": result.get("text", ""),
            "confidence": result.get("confidence", 0.0),
            "language": result.get("language", "unknown"),
            "duration": result.get("duration", 0.0),
            "error": result.get("error")
        }
    
    except Exception as e:
        logger.error(f"STT base64 endpoint error: {e}")
        return {
            "success": False,
            "text": "",
            "error": str(e)
        }

@router.post("/tts")
async def text_to_speech_endpoint(
    text: str = Form(...),
    return_audio: bool = Form(False)
):
    """
    Text-to-speech endpoint
    Can either play audio directly or return base64 encoded audio
    """
    try:
        if return_audio:
            # Return base64 encoded audio
            result = await speech_service.text_to_speech_base64(text)
            
            return {
                "success": result["success"],
                "audio_base64": result.get("audio_base64"),
                "message": result.get("message"),
                "error": result.get("error")
            }
        else:
            # Play audio directly on server
            result = await speech_service.text_to_speech(text)
            
            return {
                "success": result["success"],
                "message": result.get("message"),
                "error": result.get("error")
            }
    
    except Exception as e:
        logger.error(f"TTS endpoint error: {e}")
        return {
            "success": False,
            "error": str(e)
        }

@router.get("/capabilities")
async def get_speech_capabilities():
    """
    Get available speech capabilities
    Returns what STT/TTS features are available
    """
    try:
        capabilities = speech_service.get_speech_capabilities()
        
        return {
            "success": True,
            **capabilities
        }
    
    except Exception as e:
        logger.error(f"Speech capabilities error: {e}")
        return {
            "success": False,
            "error": str(e),
            "speech_to_text": False,
            "text_to_speech": False
        }

@router.post("/test")
async def test_speech_functionality():
    """
    Test speech functionality
    Runs basic tests for STT and TTS
    """
    try:
        results = await speech_service.test_speech_functionality()
        
        return {
            "success": True,
            "test_results": results
        }
    
    except Exception as e:
        logger.error(f"Speech test error: {e}")
        return {
            "success": False,
            "error": str(e),
            "test_results": {}
        }

# WebSocket support for real-time speech processing
# This would integrate with the main WebSocket handler

async def handle_speech_websocket_message(websocket, message_data: Dict[str, Any]):
    """
    Handle speech-related WebSocket messages
    This function would be called from the main WebSocket handler
    """
    message_type = message_data.get("type")
    
    try:
        if message_type == "speech_to_text":
            audio_base64 = message_data.get("audio_base64", "")
            audio_format = message_data.get("format", "wav")
            
            if audio_base64:
                result = await speech_service.speech_to_text_from_base64(audio_base64, audio_format)
                
                await websocket.send_json({
                    "type": "speech_to_text_result",
                    "success": result["success"],
                    "text": result.get("text", ""),
                    "confidence": result.get("confidence", 0.0),
                    "error": result.get("error")
                })
            else:
                await websocket.send_json({
                    "type": "speech_to_text_result",
                    "success": False,
                    "error": "No audio data provided"
                })
        
        elif message_type == "text_to_speech":
            text = message_data.get("text", "")
            
            if text:
                result = await speech_service.text_to_speech_base64(text)
                
                await websocket.send_json({
                    "type": "text_to_speech_result",
                    "success": result["success"],
                    "audio_base64": result.get("audio_base64"),
                    "error": result.get("error")
                })
            else:
                await websocket.send_json({
                    "type": "text_to_speech_result",
                    "success": False,
                    "error": "No text provided"
                })
        
        elif message_type == "speech_capabilities":
            capabilities = speech_service.get_speech_capabilities()
            
            await websocket.send_json({
                "type": "speech_capabilities_result",
                "success": True,
                **capabilities
            })
        
        else:
            await websocket.send_json({
                "type": "error",
                "error": f"Unknown speech message type: {message_type}"
            })
    
    except Exception as e:
        logger.error(f"Speech WebSocket handling error: {e}")
        await websocket.send_json({
            "type": "error",
            "error": str(e)
        })