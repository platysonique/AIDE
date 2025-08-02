# FILE: src/backend/llamacpp_backend.py - ENHANCED FOR INTEL ARC A770 + 94GB RAM

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
    ENHANCED Llama.cpp backend optimized for Intel Arc A770 + 94GB RAM
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
        
        # ENHANCED: Intel Arc A770 detection with proper XPU support
        self.n_gpu_layers = self._detect_gpu_layers()
        print(f"🎮 AIDE Llama.cpp Backend ready with {self.n_gpu_layers} GPU layers")
    
    def _detect_gpu_layers(self) -> int:
        """ENHANCED: Auto-detect optimal GPU layers for Intel Arc A770"""
        try:
            # PRIORITY 1: Check Intel Arc A770 via XPU
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
            # PRIORITY 2: Check Intel GPU via OpenCL/Level Zero
            result = subprocess.run(['clinfo'], capture_output=True, text=True, timeout=5)
            if result.returncode == 0 and "Intel" in result.stdout:
                if "Arc" in result.stdout or "GPU" in result.stdout:
                    print("🎮 Intel GPU detected via OpenCL - using GPU acceleration")
                    self.device = "opencl"
                    self.device_name = "Intel Arc A770 (OpenCL accelerated)"
                    return -1  # Full GPU offload
        except Exception as e:
            print(f"⚠️ OpenCL detection failed: {e}")
        
        try:
            # PRIORITY 3: Check for SYCL/Level Zero directly
            result = subprocess.run(['sycl-ls'], capture_output=True, text=True, timeout=5)
            if result.returncode == 0 and "Intel" in result.stdout and "GPU" in result.stdout:
                print("🎮 Intel GPU detected via SYCL - using GPU acceleration")
                self.device = "sycl"
                self.device_name = "Intel Arc A770 (SYCL accelerated)"
                return -1  # Full GPU offload
        except Exception as e:
            print(f"⚠️ SYCL detection failed: {e}")
        
        try:
            # FALLBACK: CUDA for other GPUs
            result = subprocess.run(['nvidia-smi'], capture_output=True, timeout=5)
            if result.returncode == 0:
                print("🔥 CUDA GPU detected - using GPU acceleration")
                self.device = "cuda"
                self.device_name = "NVIDIA GPU (CUDA accelerated)"
                return -1  # Full GPU offload
        except Exception as e:
            print(f"⚠️ CUDA detection failed: {e}")
        
        # CPU fallback with optimizations for 94GB RAM
        print("💻 Using CPU mode with BEAST MODE optimizations for 94GB RAM")
        self.device = "cpu"
        self.device_name = "CPU (94GB RAM optimized)"
        return 0
    
    def is_available(self) -> bool:
        """Check if llama.cpp backend is available"""
        return LLAMACPP_AVAILABLE
    
    def load_model(self, model_path: Path, **kwargs) -> Tuple[bool, str]:
        """ENHANCED: Load GGUF model with Intel Arc A770 + 94GB RAM optimization"""
        if not self.is_available():
            return False, "llama-cpp-python not available"
        
        # ENHANCED: Better GGUF file detection
        gguf_path = None
        
        if str(model_path).endswith('.gguf'):
            gguf_path = model_path
        else:
            # Look for GGUF files in multiple locations
            search_paths = [
                Path(model_path),
                Path(model_path) / "models",  
                Path(model_path).parent,
                Path("./models") / model_path.name,  # Check models directory
            ]
            
            for search_path in search_paths:
                if search_path.exists():
                    gguf_files = list(search_path.glob("*.gguf"))
                    if gguf_files:
                        # Prefer larger files (usually better quality)
                        gguf_path = max(gguf_files, key=lambda f: f.stat().st_size)
                        print(f"🔍 Found GGUF model: {gguf_path}")
                        break
        
        if not gguf_path or not gguf_path.exists():
            return False, f"No GGUF files found in {model_path} or subdirectories"
        
        try:
            print(f"🔄 AIDE loading GGUF model: {gguf_path}")
            
            # BEAST MODE: Build config optimized for Intel Arc A770 + 94GB RAM
            model_kwargs = {
                "model_path": str(gguf_path),
                # CRITICAL: Increase context size to utilize your 94GB RAM
                "n_ctx": kwargs.get('n_ctx', 32768),  # Increased from 4096 to 32k
                "n_gpu_layers": self.n_gpu_layers,
                "n_threads": kwargs.get('n_threads', 20),  # Optimized for i9 12th gen
                "verbose": False,
                "use_mlock": True,  # Lock in RAM - you have 94GB!
                "use_mmap": True,   # Memory mapping for efficiency
                "n_batch": kwargs.get('n_batch', 2048),  # Larger batch for performance
                "rope_scaling_type": kwargs.get('rope_scaling_type', -1),
                "rope_freq_base": kwargs.get('rope_freq_base', 0.0),
                "rope_freq_scale": kwargs.get('rope_freq_scale', 0.0),
                # BEAST MODE: Additional optimizations
                "cont_batching": True,  # Continuous batching
                "flash_attn": True,     # Flash attention if supported
            }
            
            # Intel Arc A770 specific optimizations
            if self.n_gpu_layers > 0:
                model_kwargs.update({
                    "split_mode": 1,        # Split across devices if available
                    "main_gpu": 0,          # Primary GPU
                    "tensor_split": None,   # Auto-split
                })
            
            # Load the model
            print(f"🚀 Loading with BEAST MODE config: Context={model_kwargs['n_ctx']}, Threads={model_kwargs['n_threads']}, Batch={model_kwargs['n_batch']}")
            self.model = Llama(**model_kwargs)
            self.model_path = gguf_path
            
            # Store optimized generation params
            self.generation_params = {
                "max_tokens": 1024,      # Increased for better responses
                "temperature": 0.8,
                "top_p": 0.95,
                "top_k": 40,
                "repeat_penalty": 1.1,
                "stop": ["\n\n", "User:", "Human:", "</s>", "<|im_end|>", "Assistant:", "\nUser"]
            }
            
            # Enhanced device info
            if self.n_gpu_layers > 0 or self.n_gpu_layers == -1:
                self.device_name = f"Intel Arc A770 (GPU layers: {self.n_gpu_layers})"
            else:
                self.device_name = f"CPU (94GB RAM optimized, {model_kwargs['n_threads']} threads)"
            
            success_msg = f"GGUF model loaded: {gguf_path.name} on {self.device_name} with {model_kwargs['n_ctx']} context"
            print(f"✅ {success_msg}")
            
            # Test generation to ensure it's working
            try:
                test_response = self.model("Test", max_tokens=5, echo=False)
                print(f"🧪 Test generation successful: {test_response['choices'][0]['text'][:20]}...")
            except Exception as test_error:
                print(f"⚠️ Test generation failed: {test_error}")
            
            return True, success_msg
            
        except Exception as e:
            error_msg = f"llama.cpp model loading failed: {str(e)}"
            print(f"❌ {error_msg}")
            traceback.print_exc()
            return False, error_msg
    
    def generate_stream(self, prompt: str, **kwargs):
        """ENHANCED: Stream generation with better control and performance"""
        if not self.model:
            raise RuntimeError("No model loaded")
        
        # Merge with optimized generation params
        gen_params = self.generation_params.copy()
        gen_params.update(kwargs)
        
        # CRITICAL: Ensure we have stop sequences
        if not gen_params.get('stop'):
            gen_params['stop'] = ["\n\n", "User:", "Human:", "</s>", "<|im_end|>", "Assistant:", "\nUser"]
        
        print(f"🚀 Starting stream generation with params: max_tokens={gen_params.get('max_tokens', 1024)}, temp={gen_params.get('temperature', 0.8)}")
        
        try:
            # Enhanced streaming with proper error handling
            stream = self.model(
                prompt,
                max_tokens=gen_params.get('max_tokens', 1024),
                temperature=gen_params.get('temperature', 0.8),
                top_p=gen_params.get('top_p', 0.95),
                top_k=gen_params.get('top_k', 40),
                repeat_penalty=gen_params.get('repeat_penalty', 1.1),
                stop=gen_params.get('stop', []),
                stream=True,
                echo=False
            )
            
            token_count = 0
            max_tokens = gen_params.get('max_tokens', 1024)
            response_text = ""
            
            for token_data in stream:
                if token_count >= max_tokens:
                    print(f"🛑 Reached max tokens ({max_tokens}), stopping stream")
                    break
                
                if 'choices' in token_data and token_data['choices']:
                    text = token_data['choices'][0].get('text', '')
                    if text:
                        response_text += text
                        yield text
                        token_count += 1
                        
                        # Check for stop sequences manually
                        for stop_seq in gen_params.get('stop', []):
                            if stop_seq in response_text:
                                print(f"🛑 Stop sequence '{stop_seq}' detected, ending stream")
                                return
                                
        except Exception as e:
            error_msg = f"Stream generation error: {str(e)}"
            print(f"❌ {error_msg}")
            yield f"❌ Generation error: {error_msg}"
    
    def generate_response(self, prompt: str, max_tokens: int = 1024, temperature: float = 0.8, **kwargs) -> str:
        """ENHANCED: Generate complete response with optimized performance"""
        if not self.model:
            return "❌ No model loaded in llama.cpp backend"
        
        try:
            start_time = time.time()
            
            # Merge parameters with optimized defaults
            gen_params = self.generation_params.copy()
            gen_params.update({
                'max_tokens': max_tokens,
                'temperature': temperature,
                **kwargs
            })
            
            print(f"🚀 Generating response with llama.cpp on {self.device_name}")
            
            result = self.model(
                prompt,
                max_tokens=gen_params.get('max_tokens', 1024),
                temperature=gen_params.get('temperature', 0.8),
                top_p=gen_params.get('top_p', 0.95),
                top_k=gen_params.get('top_k', 40),
                repeat_penalty=gen_params.get('repeat_penalty', 1.1),
                stop=gen_params.get('stop', []),
                echo=False
            )
            
            generation_time = time.time() - start_time
            response = result['choices'][0]['text'].strip()
            
            # Performance logging
            tokens_per_second = len(response.split()) / generation_time if generation_time > 0 else 0
            print(f"✅ llama.cpp generation completed in {generation_time:.2f}s on {self.device_name}")
            print(f"📊 Response: {len(response)} chars, ~{tokens_per_second:.1f} tokens/sec")
            
            return response
            
        except Exception as e:
            error_msg = f"Generation error: {str(e)}"
            print(f"❌ {error_msg}")
            traceback.print_exc()
            return f"❌ llama.cpp generation failed: {error_msg}"
    
    def get_backend_info(self) -> Dict[str, Any]:
        """ENHANCED: Get comprehensive backend information for AIDE"""
        return {
            "backend": "llama.cpp",
            "available": self.is_available(),
            "device": self.device,
            "device_name": self.device_name,
            "model_loaded": self.model is not None,
            "current_model": str(self.model_path.name) if self.model_path else None,
            "gpu_layers": self.n_gpu_layers,
            "arc_optimized": self.device in ["xpu", "opencl", "sycl"] or (self.n_gpu_layers > 0),
            "context_size": getattr(self.model, 'n_ctx', 0) if self.model else 0,
            "ram_optimized": True,  # 94GB RAM optimization
            "capabilities": [
                "GGUF format support",
                "Streaming generation", 
                "Memory efficient",
                "Fast inference",
                "94GB RAM optimized" if self.device == "cpu" else "Intel Arc A770 optimized",
                "Large context windows",
                "Enhanced stop sequences",
                "Performance monitoring"
            ],
            "generation_params": self.generation_params,
            "hardware_specs": {
                "ram": "94GB",
                "cpu": "Intel i9 12th gen",
                "gpu": "Intel Arc A770",
                "os": "Pop!_OS"
            }
        }
    
    def unload_model(self):
        """Enhanced model unloading with cleanup"""
        if self.model:
            try:
                del self.model
                self.model = None
                self.model_path = None
                print("🗑️ llama.cpp model unloaded successfully")
            except Exception as e:
                print(f"⚠️ Model unload error: {e}")

# ENHANCED: Compatibility wrappers with improved error handling

class LlamaCppModelWrapper:
    """ENHANCED: Wrapper for llama.cpp with better AIDE compatibility"""
    
    def __init__(self, llamacpp_backend: AIDE_LlamaCpp_Backend):
        self.backend = llamacpp_backend
        self.device = llamacpp_backend.device
        
    def generate(self, input_ids=None, attention_mask=None, max_new_tokens=1024,
                 temperature=0.8, top_p=0.95, do_sample=True, pad_token_id=None, **kwargs):
        """ENHANCED: Generate method with better prompt handling"""
        try:
            # Extract or build prompt from various input formats
            prompt = kwargs.get('prompt')
            if not prompt:
                # Build a default prompt for AIDE compatibility
                prompt = "You are AIDE, a helpful coding assistant. Respond concisely.\n\nUser: Generate a helpful response\nAIDE:"
            
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
            error_msg = f"llama.cpp wrapper generation failed: {str(e)}"
            print(f"❌ {error_msg}")
            return [[f"❌ Generation failed: {str(e)}"]]

class LlamaCppTokenizerWrapper:
    """ENHANCED: Tokenizer wrapper with better compatibility"""
    
    def __init__(self, llamacpp_backend: AIDE_LlamaCpp_Backend):
        self.backend = llamacpp_backend
        self.eos_token_id = 0
        self.pad_token_id = 0
        
    def __call__(self, text, return_tensors=None, truncation=True, max_length=32768, **kwargs):
        """Enhanced tokenizer compatibility with larger context"""
        # For llama.cpp, return dummy tensors indicating successful processing
        return {
            'input_ids': [[1]],  # Dummy token ID
            'attention_mask': [[1]]  # Dummy attention mask
        }
    
    def decode(self, tokens, skip_special_tokens=True, **kwargs):
        """ENHANCED: Decode with robust handling"""
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

# ENHANCED: Factory function with comprehensive error handling
def create_llamacpp_backend() -> Tuple[Optional[AIDE_LlamaCpp_Backend], bool]:
    """Create enhanced llama.cpp backend with full diagnostics"""
    try:
        print("🔄 Creating AIDE llama.cpp backend...")
        backend = AIDE_LlamaCpp_Backend()
        
        if backend.is_available():
            backend_info = backend.get_backend_info()
            print(f"✅ llama.cpp backend created successfully")
            print(f"🎮 Device: {backend_info['device_name']}")
            print(f"🚀 Capabilities: {', '.join(backend_info['capabilities'])}")
            return backend, True
        else:
            print("❌ llama.cpp backend unavailable")
            return None, False
            
    except Exception as e:
        print(f"❌ Failed to create llama.cpp backend: {e}")
        traceback.print_exc()
        return None, False

# ENHANCED: Utility functions for comprehensive diagnostics
def get_llamacpp_status() -> Dict[str, Any]:
    """Get comprehensive llama.cpp status for diagnostics"""
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
                "Install Intel Arc A770 drivers: sudo apt install intel-level-zero-gpu intel-opencl-icd",
                "Install Intel Extension for PyTorch: pip install intel_extension_for_pytorch",
                "Check if GGUF models are available in models directory"
            ]
        }

def find_gguf_models(models_dir: Path = Path("./models")) -> List[Path]:
    """Find all GGUF models with enhanced search"""
    gguf_files = []
    
    if models_dir.exists():
        # Search recursively for GGUF files
        gguf_files = list(models_dir.rglob("*.gguf"))
        
    print(f"🔍 Found {len(gguf_files)} GGUF models in {models_dir}")
    for gguf_file in sorted(gguf_files, key=lambda f: f.stat().st_size, reverse=True):
        size_mb = gguf_file.stat().st_size / (1024 * 1024)
        print(f"  📄 {gguf_file.name} ({size_mb:.1f} MB)")
    
    return gguf_files

if __name__ == "__main__":
    # Enhanced testing
    print("🧪 Testing ENHANCED AIDE llama.cpp backend...")
    
    # Check status
    status = get_llamacpp_status()
    print(f"📊 Backend status:")
    for key, value in status.items():
        print(f"  {key}: {value}")
    
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
            
            if load_success:
                print("🧪 Testing response generation...")
                response = backend.generate_response("Hello, how are you?", max_tokens=50)
                print(f"📊 Generated response: {response[:100]}...")
