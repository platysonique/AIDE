# File: src/backend/services/speech_service.py

import asyncio
import tempfile
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any
import base64

from ..core.logger import logger
from ..core.config import config

# Speech-to-text imports
try:
    import whisper
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False
    logger.warning("Whisper not available - install with: pip install openai-whisper")

# Text-to-speech imports
try:
    import pyttsx3
    PYTTSX3_AVAILABLE = True
except ImportError:
    PYTTSX3_AVAILABLE = False
    logger.warning("pyttsx3 not available - install with: pip install pyttsx3")

class SpeechService:
    """Speech-to-text and text-to-speech service"""

    def __init__(self):
        self.speech_config = config.get_speech_config()
        self.stt_available = self._check_whisper()
        self.tts_available = self._check_tts()

        # Initialize models/engines
        self.whisper_model = None
        self.tts_engine = None

        if self.stt_available:
            self._init_whisper()

        if self.tts_available:
            self._init_tts()

    def _check_whisper(self) -> bool:
        """Check if Whisper is available"""
        return WHISPER_AVAILABLE

    def _check_tts(self) -> bool:
        """Check if TTS is available"""
        return PYTTSX3_AVAILABLE

    def _init_whisper(self):
        """Initialize Whisper model for speech-to-text"""
        # FIXED: Check if already initialized
        if self.whisper_model is not None:
            logger.info("⚡ Whisper already initialized - skipping")
            return
            
        if not WHISPER_AVAILABLE:
            return

        try:
            model_name = self.speech_config.get("stt_model", "base")
            logger.info(f"Loading Whisper model: {model_name}")
            self.whisper_model = whisper.load_model(model_name)
            logger.info("✅ Whisper loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            self.stt_available = False

    def _init_tts(self):
        """Initialize TTS engine"""
        # FIXED: Check if already initialized
        if self.tts_engine is not None:
            logger.info("⚡ TTS already initialized - skipping")
            return
            
        if not PYTTSX3_AVAILABLE:
            return

        try:
            self.tts_engine = pyttsx3.init()

            # Configure TTS engine
            rate = self.tts_engine.getProperty('rate')
            self.tts_engine.setProperty('rate', rate - 50)  # Slightly slower

            voices = self.tts_engine.getProperty('voices')
            if voices:
                # Try to use a good quality voice
                for voice in voices:
                    if 'english' in voice.name.lower() or 'en' in voice.id.lower():
                        self.tts_engine.setProperty('voice', voice.id)
                        break

            logger.info("✅ TTS engine initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize TTS engine: {e}")
            self.tts_available = False

    async def speech_to_text(self, audio_data: bytes, format: str = "wav") -> Dict[str, Any]:
        """Convert speech to text using Whisper"""
        if not self.stt_available or not self.whisper_model:
            return {
                "success": False,
                "error": "Speech-to-text not available",
                "text": ""
            }

        try:
            # Save audio to temporary file
            with tempfile.NamedTemporaryFile(suffix=f".{format}", delete=False) as f:
                f.write(audio_data)
                temp_path = f.name

            logger.debug(f"Processing audio file: {temp_path}")

            # Transcribe with Whisper
            result = self.whisper_model.transcribe(temp_path)

            # Cleanup
            Path(temp_path).unlink(missing_ok=True)

            text = result["text"].strip()
            confidence = result.get("avg_logprob", 0.0)

            logger.info(f"🎙️ STT result: {text[:50]}... (confidence: {confidence:.2f})")

            return {
                "success": True,
                "text": text,
                "confidence": confidence,
                "language": result.get("language", "unknown"),
                "duration": result.get("duration", 0.0)
            }

        except Exception as e:
            logger.error(f"Speech-to-text failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "text": ""
            }

    async def speech_to_text_from_base64(self, audio_base64: str, format: str = "wav") -> Dict[str, Any]:
        """Convert base64 encoded audio to text"""
        try:
            # Decode base64 audio
            audio_data = base64.b64decode(audio_base64)
            return await self.speech_to_text(audio_data, format)
        except Exception as e:
            logger.error(f"Base64 audio decoding failed: {e}")
            return {
                "success": False,
                "error": f"Audio decoding failed: {str(e)}",
                "text": ""
            }

    async def text_to_speech(self, text: str, output_path: Optional[str] = None) -> Dict[str, Any]:
        """Convert text to speech"""
        if not self.tts_available or not self.tts_engine:
            return {
                "success": False,
                "error": "Text-to-speech not available",
                "audio_path": None
            }

        try:
            logger.debug(f"Converting text to speech: {text[:50]}...")

            if output_path:
                # Save to file
                self.tts_engine.save_to_file(text, output_path)
                self.tts_engine.runAndWait()

                return {
                    "success": True,
                    "audio_path": output_path,
                    "message": "Speech saved to file"
                }

            else:
                # Play directly
                self.tts_engine.say(text)
                self.tts_engine.runAndWait()

                return {
                    "success": True,
                    "audio_path": None,
                    "message": "Speech played successfully"
                }

        except Exception as e:
            logger.error(f"Text-to-speech failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "audio_path": None
            }

    async def text_to_speech_base64(self, text: str) -> Dict[str, Any]:
        """Convert text to speech and return as base64"""
        try:
            # Create temporary file for audio
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                temp_path = f.name

            # Generate speech to file
            result = await self.text_to_speech(text, temp_path)

            if not result["success"]:
                return result

            # Read file and encode as base64
            with open(temp_path, "rb") as f:
                audio_data = f.read()
                audio_base64 = base64.b64encode(audio_data).decode('utf-8')

            # Cleanup
            Path(temp_path).unlink(missing_ok=True)

            return {
                "success": True,
                "audio_base64": audio_base64,
                "message": "Speech generated successfully"
            }

        except Exception as e:
            logger.error(f"Text-to-speech base64 failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "audio_base64": None
            }

    def get_speech_capabilities(self) -> Dict[str, Any]:
        """Get available speech capabilities"""
        return {
            "speech_to_text": self.stt_available,
            "text_to_speech": self.tts_available,
            "whisper_available": WHISPER_AVAILABLE,
            "pyttsx3_available": PYTTSX3_AVAILABLE,
            "supported_formats": ["wav", "mp3", "m4a"] if self.stt_available else [],
            "whisper_model": self.speech_config.get("stt_model", "base") if self.stt_available else None
        }

    async def test_speech_functionality(self) -> Dict[str, Any]:
        """Test speech functionality"""
        results = {
            "stt_test": {"success": False, "message": "Not tested"},
            "tts_test": {"success": False, "message": "Not tested"}
        }

        # Test TTS
        if self.tts_available:
            try:
                test_result = await self.text_to_speech("Hello, this is a test.")
                results["tts_test"] = test_result
            except Exception as e:
                results["tts_test"] = {"success": False, "message": str(e)}
        else:
            results["tts_test"] = {"success": False, "message": "TTS not available"}

        # Note: STT test would require actual audio input, so we just check availability
        results["stt_test"] = {
            "success": self.stt_available,
            "message": "Whisper model loaded" if self.stt_available else "Whisper not available"
        }

        return results

# Global speech service instance
speech_service = SpeechService()
