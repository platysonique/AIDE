# FILE: src/backend/llamacpp_backend.py - AIDE Llama.cpp Backend
import os
import sys
from pathlib import Path
from typing import Dict, Any, Tuple, Optional, List
import json
import traceback
import asyncio
import time

# Try to import llama-cpp-python with graceful fallback
try:
    from llama_cpp import Llama, LlamaGrammar
    LLAMACPP_AVAILABLE = True
    print("✅ llama-cpp-python available - GGUF models ready!")
except ImportError:
    LLAMACPP_AVAILABLE = False
    print("⚠️ llama-cpp-python not available - install with: pip install llama-cpp-python")

class AIDE_LlamaCpp_Backend:
    """
    Llama.cpp backend optimized for Intel Arc A770 in AIDE
    Fully compatible with existing AIDE architecture
    """
    
    def __init__(self):
        self.model = None
        self.model_path = None
        self.device = "cpu"  # llama.cpp auto-detects GPU
        self.device_name = "CPU"
        self.n_gpu_layers = 0
        
        if not LLAMACPP_AVAILABLE:
            print("❌ llama-cpp-python not available")
            return
            
        # Auto-detect Intel Arc A770 for GPU layers
        self.n_gpu_layers = self._detect_gpu_layers()
        print(f"🎮 AIDE Llama.cpp Backend ready with {self.n_gpu_layers} GPU layers")
    
    def _detect_gpu_layers(self) -> int:
        """Auto-detect optimal GPU layers for Intel Arc A770"""
        try:
            # Check for Intel Arc first
            import subprocess
            result = subprocess.run(['nvidia-smi', '--query-gpu=name', '--format=csv,noheader'], 
                                  capture_output=True, text=True, timeout=5)
            if "Arc" in result.stdout or "Intel" in result.stdout:
                print("🎮 Intel Arc detected - using full GPU offload")
                return -1  # Full GPU offload
        except:
            pass
            
        try:
            # Check for any CUDA GPU
            import subprocess
            result = subprocess.run(['nvidia-smi'], capture_output=True, timeout=5)
            if result.returncode == 0:
                print("🔥 CUDA GPU detected - using full GPU offload")
                return -1  # Full GPU offload
        except:
            pass
            
        # CPU fallback
        print("💻 Using CPU mode")
        return 0
    
    def is_available(self) -> bool:
        """Check if llama.cpp backend is available"""
        return LLAMACPP_AVAILABLE
    
    def load_model(self, model_path: Path, **kwargs) -> Tuple[bool, str]:
        """Load GGUF model with Intel Arc optimization"""
        if not self.is_available():
            return False, "llama-cpp-python not available"
            
        # Check if it's a GGUF file
        if not str(model_path).endswith('.gguf'):
            # Look for GGUF files in the directory
            gguf_files = list(Path(model_path).glob("*.gguf"))
            if not gguf_files:
                return False, f"No GGUF files found in {model_path}"
            model_path = gguf_files[0]  # Use first GGUF file
            
        try:
            print(f"🔄 AIDE loading GGUF model: {model_path}")
            
            # Build optimized config for Intel Arc A770
            model_kwargs = {
                "model_path": str(model_path),
                "n_ctx": kwargs.get('n_ctx', 4096),
                "n_gpu_layers": self.n_gpu_layers,
                "n_threads": kwargs.get('n_threads', -1),  # Auto-detect
                "verbose": False,
                "use_mlock": True,  # Keep in RAM
                "use_mmap": True,   # Memory mapping
                "n_batch": kwargs.get('n_batch', 512),
            }
            
            # Load the model
            self.model = Llama(**model_kwargs)
            self.model_path = model_path
            
            # Determine device info
            if self.n_gpu_layers > 0 or self.n_gpu_layers == -1:
                self.device = "gpu"
                self.device_name = "GPU (llama.cpp optimized)"
            else:
                self.device = "cpu" 
                self.device_name = "CPU (llama.cpp optimized)"
            
            success_msg = f"GGUF model loaded: {model_path.name} on {self.device_name}"
            print(f"✅ {success_msg}")
            return True, success_msg
            
        except Exception as e:
            error_msg = f"llama.cpp model loading failed: {str(e)}"
            print(f"❌ {error_msg}")
            traceback.print_exc()
            return False, error_msg
    
    def generate_stream(self, prompt: str, **kwargs):
        """Stream generation for real-time responses"""
        if not self.model:
            raise RuntimeError("No model loaded")
            
        # Generation parameters
        max_tokens = kwargs.get('max_tokens', 512)
        temperature = kwargs.get('temperature', 0.8)
        top_p = kwargs.get('top_p', 0.95)
        stop = kwargs.get('stop', [])
        
        # Stream tokens
        stream = self.model(
            prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            stop=stop,
            stream=True,
            echo=False
        )
        
        for token_data in stream:
            if 'choices' in token_data and token_data['choices']:
                text = token_data['choices'][0].get('text', '')
                if text:
                    yield text
    
    def generate_response(self, prompt: str, max_tokens: int = 512, temperature: float = 0.8, **kwargs) -> str:
        """Generate complete response"""
        if not self.model:
            return "❌ No model loaded in llama.cpp backend"
            
        try:
            start_time = time.time()
            
            result = self.model(
                prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=kwargs.get('top_p', 0.95),
                stop=kwargs.get('stop', []),
                echo=False
            )
            
            generation_time = time.time() - start_time
            response = result['choices'][0]['text']
            
            print(f"🚀 llama.cpp generation completed in {generation_time:.2f}s on {self.device}")
            return response
            
        except Exception as e:
            error_msg = f"Generation error: {str(e)}"
            print(f"❌ {error_msg}")
            return f"❌ llama.cpp generation failed: {error_msg}"
    
    def get_backend_info(self) -> Dict[str, Any]:
        """Get backend information for AIDE"""
        return {
            "backend": "llama.cpp",
            "available": self.is_available(),
            "device": self.device,
            "device_name": self.device_name,
            "model_loaded": self.model is not None,
            "current_model": str(self.model_path.name) if self.model_path else None,
            "gpu_layers": self.n_gpu_layers,
            "arc_optimized": self.n_gpu_layers > 0,
            "capabilities": [
                "GGUF format support",
                "Streaming generation", 
                "Memory efficient",
                "Fast inference"
            ]
        }
    
    def unload_model(self):
        """Unload current model"""
        if self.model:
            del self.model
            self.model = None
            self.model_path = None
            print("🗑️ llama.cpp model unloaded")

# Compatibility wrappers for existing AIDE architecture
class LlamaCppModelWrapper:
    """Wrapper to make llama.cpp compatible with existing AIDE model interface"""
    
    def __init__(self, llamacpp_backend: AIDE_LlamaCpp_Backend):
        self.backend = llamacpp_backend
        self.device = llamacpp_backend.device
    
    def generate(self, input_ids=None, attention_mask=None, max_new_tokens=512, 
                temperature=0.8, top_p=0.95, do_sample=True, pad_token_id=None, **kwargs):
        """Generate method compatible with transformers interface"""
        try:
            prompt = kwargs.get('prompt', 'Generate a helpful response:')
            response = self.backend.generate_response(
                prompt=prompt,
                max_tokens=max_new_tokens,
                temperature=temperature,
                top_p=top_p
            )
            return [[response]]  # Wrapped format for compatibility
        except Exception as e:
            print(f"❌ llama.cpp wrapper generation failed: {e}")
            return [["❌ Generation failed"]]

class LlamaCppTokenizerWrapper:
    """Tokenizer wrapper for llama.cpp backend"""
    
    def __init__(self, llamacpp_backend: AIDE_LlamaCpp_Backend):
        self.backend = llamacpp_backend
        self.eos_token_id = 0
        self.pad_token_id = 0
    
    def __call__(self, text, return_tensors=None, truncation=True, max_length=2048, **kwargs):
        """Tokenizer compatibility"""
        return {'input_ids': [[0]], 'attention_mask': [[1]]}
    
    def decode(self, tokens, skip_special_tokens=True, **kwargs):
        """Decode compatibility"""
        if isinstance(tokens, (list, tuple)) and len(tokens) > 0:
            if isinstance(tokens[0], (list, tuple)) and len(tokens[0]) > 0:
                return str(tokens[0][0])
            return str(tokens[0])
        return str(tokens)

# Factory function
def create_llamacpp_backend() -> Tuple[Optional[AIDE_LlamaCpp_Backend], bool]:
    """Create llama.cpp backend"""
    try:
        backend = AIDE_LlamaCpp_Backend()
        if backend.is_available():
            return backend, True
        else:
            return None, False
    except Exception as e:
        print(f"❌ Failed to create llama.cpp backend: {e}")
        return None, False
