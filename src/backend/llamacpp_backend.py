# FILE: src/backend/llamacpp_backend.py - ENHANCED AIDE Llama.cpp Backend

import os
import sys
from pathlib import Path
from typing import Dict, Any, Tuple, Optional, List
import json
import traceback
import asyncio
import time
import subprocess

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
    Enhanced Llama.cpp backend optimized for Intel Arc A770 in AIDE
    Fully compatible with existing AIDE architecture
    """
    
    def __init__(self):
        self.model = None
        self.model_path = None
        self.device = "cpu"
        self.device_name = "CPU"
        self.n_gpu_layers = 0
        self.generation_params = {}
        
        if not LLAMACPP_AVAILABLE:
            print("❌ llama-cpp-python not available")
            return
        
        # ENHANCED: Intel Arc A770 detection
        self.n_gpu_layers = self._detect_gpu_layers()
        print(f"🎮 AIDE Llama.cpp Backend ready with {self.n_gpu_layers} GPU layers")
    
    def _detect_gpu_layers(self) -> int:
        """ENHANCED: Auto-detect optimal GPU layers for Intel Arc A770"""
        try:
            # FIXED: Check for Intel Arc A770 specifically
            import intel_extension_for_pytorch as ipex
            import torch
            
            if hasattr(torch, 'xpu') and torch.xpu.is_available():
                device_count = torch.xpu.device_count()
                if device_count > 0:
                    print("🎮 Intel Arc A770 detected via XPU - using GPU acceleration")
                    self.device = "xpu"
                    self.device_name = "Intel Arc A770 (XPU accelerated)"
                    return -1  # Full GPU offload
        except Exception as e:
            print(f"⚠️ Intel XPU detection failed: {e}")
        
        try:
            # Check for Intel GPU via OpenCL
            result = subprocess.run(['clinfo'], capture_output=True, text=True, timeout=5)
            if "Intel" in result.stdout and ("Arc" in result.stdout or "GPU" in result.stdout):
                print("🎮 Intel GPU detected via OpenCL - using GPU acceleration")
                self.device = "opencl"
                self.device_name = "Intel GPU (OpenCL accelerated)"
                return -1  # Full GPU offload
        except Exception as e:
            print(f"⚠️ OpenCL detection failed: {e}")
        
        try:
            # Check for CUDA as fallback
            result = subprocess.run(['nvidia-smi'], capture_output=True, timeout=5)
            if result.returncode == 0:
                print("🔥 CUDA GPU detected - using GPU acceleration")
                self.device = "cuda"
                self.device_name = "NVIDIA GPU (CUDA accelerated)"
                return -1  # Full GPU offload
        except Exception as e:
            print(f"⚠️ CUDA detection failed: {e}")
        
        # CPU fallback
        print("💻 Using CPU mode with optimizations")
        self.device = "cpu"
        self.device_name = "CPU (optimized)"
        return 0
    
    def is_available(self) -> bool:
        """Check if llama.cpp backend is available"""
        return LLAMACPP_AVAILABLE
    
    def load_model(self, model_path: Path, **kwargs) -> Tuple[bool, str]:
        """ENHANCED: Load GGUF model with Intel Arc optimization"""
        if not self.is_available():
            return False, "llama-cpp-python not available"
        
        # ENHANCED: Better GGUF file detection
        gguf_path = None
        
        if str(model_path).endswith('.gguf'):
            gguf_path = model_path
        else:
            # Look for GGUF files in the directory
            search_paths = [
                Path(model_path),
                Path(model_path) / "models",
                Path(model_path).parent,
            ]
            
            for search_path in search_paths:
                if search_path.exists():
                    gguf_files = list(search_path.glob("*.gguf"))
                    if gguf_files:
                        # Prefer larger files (usually better quality)
                        gguf_path = max(gguf_files, key=lambda f: f.stat().st_size)
                        break
        
        if not gguf_path or not gguf_path.exists():
            return False, f"No GGUF files found in {model_path} or subdirectories"
        
        try:
            print(f"🔄 AIDE loading GGUF model: {gguf_path}")
            
            # ENHANCED: Build optimized config for Intel Arc A770 + 94GB RAM
            model_kwargs = {
                "model_path": str(gguf_path),
                "n_ctx": kwargs.get('n_ctx', 8192),  # Increased for your 94GB RAM
                "n_gpu_layers": self.n_gpu_layers,
                "n_threads": kwargs.get('n_threads', 16),  # Optimized for i9 12th gen
                "verbose": False,
                "use_mlock": True,  # Lock in RAM - you have 94GB!
                "use_mmap": True,   # Memory mapping
                "n_batch": kwargs.get('n_batch', 1024),  # Larger batch for performance
                "rope_scaling_type": kwargs.get('rope_scaling_type', -1),
                "rope_freq_base": kwargs.get('rope_freq_base', 0.0),
                "rope_freq_scale": kwargs.get('rope_freq_scale', 0.0),
            }
            
            # BEAST MODE: Additional optimizations for your setup
            if self.n_gpu_layers > 0:
                model_kwargs.update({
                    "split_mode": 1,  # Split across devices if available
                    "main_gpu": 0,    # Primary GPU
                })
            
            # Load the model
            print(f"🚀 Loading with config: {json.dumps({k: v for k, v in model_kwargs.items() if k != 'model_path'}, indent=2)}")
            self.model = Llama(**model_kwargs)
            self.model_path = gguf_path
            
            # Store generation params for consistency
            self.generation_params = {
                "max_tokens": 512,
                "temperature": 0.8,
                "top_p": 0.95,
                "top_k": 40,
                "repeat_penalty": 1.1,
                "stop": ["\n\n", "User:", "Human:", "</s>", "<|im_end|>"]
            }
            
            # Determine device info
            if self.n_gpu_layers > 0 or self.n_gpu_layers == -1:
                self.device_name = f"{self.device_name} (GPU layers: {self.n_gpu_layers})"
            
            success_msg = f"GGUF model loaded: {gguf_path.name} on {self.device_name}"
            print(f"✅ {success_msg}")
            
            # Test generation to ensure it's working
            test_response = self.model("Hello", max_tokens=5, echo=False)
            print(f"🧪 Test generation successful: {test_response['choices'][0]['text'][:20]}...")
            
            return True, success_msg
            
        except Exception as e:
            error_msg = f"llama.cpp model loading failed: {str(e)}"
            print(f"❌ {error_msg}")
            traceback.print_exc()
            return False, error_msg
    
    def generate_stream(self, prompt: str, **kwargs):
        """ENHANCED: Stream generation for real-time responses"""
        if not self.model:
            raise RuntimeError("No model loaded")
        
        # Merge with default generation params
        gen_params = self.generation_params.copy()
        gen_params.update(kwargs)
        
        # CRITICAL: Ensure we have stop sequences to prevent infinite generation
        if not gen_params.get('stop'):
            gen_params['stop'] = ["\n\n", "User:", "Human:", "</s>", "<|im_end|>"]
        
        print(f"🚀 Starting stream generation with params: {gen_params}")
        
        try:
            # Stream tokens
            stream = self.model(
                prompt,
                max_tokens=gen_params.get('max_tokens', 512),
                temperature=gen_params.get('temperature', 0.8),
                top_p=gen_params.get('top_p', 0.95),
                top_k=gen_params.get('top_k', 40),
                repeat_penalty=gen_params.get('repeat_penalty', 1.1),
                stop=gen_params.get('stop', []),
                stream=True,
                echo=False
            )
            
            token_count = 0
            max_tokens = gen_params.get('max_tokens', 512)
            
            for token_data in stream:
                if token_count >= max_tokens:
                    print(f"🛑 Reached max tokens ({max_tokens}), stopping stream")
                    break
                
                if 'choices' in token_data and token_data['choices']:
                    text = token_data['choices'][0].get('text', '')
                    if text:
                        yield text
                        token_count += 1
                        
                        # Check for stop sequences manually
                        for stop_seq in gen_params.get('stop', []):
                            if stop_seq in text:
                                print(f"🛑 Stop sequence '{stop_seq}' detected, ending stream")
                                return
                                
        except Exception as e:
            print(f"❌ Stream generation error: {e}")
            yield f"❌ Generation error: {str(e)}"
    
    def generate_response(self, prompt: str, max_tokens: int = 512, temperature: float = 0.8, **kwargs) -> str:
        """ENHANCED: Generate complete response with better error handling"""
        if not self.model:
            return "❌ No model loaded in llama.cpp backend"
        
        try:
            start_time = time.time()
            
            # Merge parameters
            gen_params = self.generation_params.copy()
            gen_params.update({
                'max_tokens': max_tokens,
                'temperature': temperature,
                **kwargs
            })
            
            print(f"🚀 Generating response with llama.cpp on {self.device}")
            
            result = self.model(
                prompt,
                max_tokens=gen_params.get('max_tokens', 512),
                temperature=gen_params.get('temperature', 0.8),
                top_p=gen_params.get('top_p', 0.95),
                top_k=gen_params.get('top_k', 40),
                repeat_penalty=gen_params.get('repeat_penalty', 1.1),
                stop=gen_params.get('stop', []),
                echo=False
            )
            
            generation_time = time.time() - start_time
            response = result['choices'][0]['text'].strip()
            
            print(f"✅ llama.cpp generation completed in {generation_time:.2f}s on {self.device}")
            print(f"📊 Response length: {len(response)} characters")
            
            return response
            
        except Exception as e:
            error_msg = f"Generation error: {str(e)}"
            print(f"❌ {error_msg}")
            traceback.print_exc()
            return f"❌ llama.cpp generation failed: {error_msg}"
    
    def get_backend_info(self) -> Dict[str, Any]:
        """ENHANCED: Get backend information for AIDE"""
        return {
            "backend": "llama.cpp",
            "available": self.is_available(),
            "device": self.device,
            "device_name": self.device_name,
            "model_loaded": self.model is not None,
            "current_model": str(self.model_path.name) if self.model_path else None,
            "gpu_layers": self.n_gpu_layers,
            "arc_optimized": self.device == "xpu" or (self.n_gpu_layers > 0),
            "context_size": getattr(self.model, 'n_ctx', 0) if self.model else 0,
            "capabilities": [
                "GGUF format support",
                "Streaming generation", 
                "Memory efficient",
                "Fast inference",
                "Intel Arc A770 optimized" if self.device == "xpu" else "CPU optimized"
            ],
            "generation_params": self.generation_params
        }
    
    def unload_model(self):
        """Unload current model"""
        if self.model:
            del self.model
            self.model = None
            self.model_path = None
            print("🗑️ llama.cpp model unloaded")

# ENHANCED: Compatibility wrappers for existing AIDE architecture

class LlamaCppModelWrapper:
    """ENHANCED: Wrapper to make llama.cpp compatible with existing AIDE model interface"""
    
    def __init__(self, llamacpp_backend: AIDE_LlamaCpp_Backend):
        self.backend = llamacpp_backend
        self.device = llamacpp_backend.device
        
    def generate(self, input_ids=None, attention_mask=None, max_new_tokens=512,
                 temperature=0.8, top_p=0.95, do_sample=True, pad_token_id=None, **kwargs):
        """ENHANCED: Generate method compatible with transformers interface"""
        try:
            # Extract prompt from kwargs or create default
            prompt = kwargs.get('prompt', 'Generate a helpful response:')
            
            response = self.backend.generate_response(
                prompt=prompt,
                max_tokens=max_new_tokens,
                temperature=temperature,
                top_p=top_p,
                **kwargs
            )
            
            # Return in expected format for AIDE compatibility
            return [[response]]
            
        except Exception as e:
            print(f"❌ llama.cpp wrapper generation failed: {e}")
            return [["❌ Generation failed: " + str(e)]]

class LlamaCppTokenizerWrapper:
    """ENHANCED: Tokenizer wrapper for llama.cpp backend"""
    
    def __init__(self, llamacpp_backend: AIDE_LlamaCpp_Backend):
        self.backend = llamacpp_backend
        self.eos_token_id = 0
        self.pad_token_id = 0
        
    def __call__(self, text, return_tensors=None, truncation=True, max_length=2048, **kwargs):
        """Enhanced tokenizer compatibility"""
        # For llama.cpp, we don't need actual tokenization
        # Return dummy tensors that indicate successful processing
        return {
            'input_ids': [[1]],  # Dummy token ID
            'attention_mask': [[1]]  # Dummy attention mask
        }
    
    def decode(self, tokens, skip_special_tokens=True, **kwargs):
        """ENHANCED: Decode compatibility with better handling"""
        try:
            if isinstance(tokens, (list, tuple)):
                if len(tokens) > 0:
                    if isinstance(tokens[0], (list, tuple)):
                        if len(tokens[0]) > 0:
                            return str(tokens[0][0])
                        else:
                            return ""
                    else:
                        return str(tokens[0])
                else:
                    return ""
            else:
                return str(tokens)
        except Exception as e:
            print(f"⚠️ Tokenizer decode error: {e}")
            return "Decode error"

# ENHANCED: Factory function with better error handling
def create_llamacpp_backend() -> Tuple[Optional[AIDE_LlamaCpp_Backend], bool]:
    """Create enhanced llama.cpp backend"""
    try:
        print("🔄 Creating AIDE llama.cpp backend...")
        backend = AIDE_LlamaCpp_Backend()
        
        if backend.is_available():
            print("✅ llama.cpp backend created successfully")
            return backend, True
        else:
            print("❌ llama.cpp backend unavailable")
            return None, False
            
    except Exception as e:
        print(f"❌ Failed to create llama.cpp backend: {e}")
        traceback.print_exc()
        return None, False

# ENHANCED: Utility functions for AIDE integration
def get_llamacpp_status() -> Dict[str, Any]:
    """Get llama.cpp status for diagnostics"""
    backend, success = create_llamacpp_backend()
    
    if success and backend:
        return backend.get_backend_info()
    else:
        return {
            "backend": "llama.cpp",
            "available": False,
            "error": "Backend creation failed",
            "recommendations": [
                "Install llama-cpp-python: pip install llama-cpp-python",
                "Ensure Intel Arc A770 drivers are installed",
                "Check if GGUF models are available"
            ]
        }

def find_gguf_models(models_dir: Path = Path("./models")) -> List[Path]:
    """Find all GGUF models in the models directory"""
    gguf_files = []
    
    if models_dir.exists():
        # Search recursively for GGUF files
        gguf_files = list(models_dir.rglob("*.gguf"))
        
    print(f"🔍 Found {len(gguf_files)} GGUF models in {models_dir}")
    for gguf_file in gguf_files:
        size_mb = gguf_file.stat().st_size / (1024 * 1024)
        print(f"  📄 {gguf_file.name} ({size_mb:.1f} MB)")
    
    return gguf_files

if __name__ == "__main__":
    # Test the backend
    print("🧪 Testing AIDE llama.cpp backend...")
    
    # Check status
    status = get_llamacpp_status()
    print(f"📊 Backend status: {json.dumps(status, indent=2)}")
    
    # Find models
    models = find_gguf_models()
    print(f"📚 Found {len(models)} GGUF models")
    
    # Test loading if models available
    if models and status.get("available"):
        backend, success = create_llamacpp_backend()
        if success:
            print(f"🧪 Testing model load with: {models[0]}")
            load_success, message = backend.load_model(models[0])
            print(f"📊 Load result: {load_success} - {message}")
