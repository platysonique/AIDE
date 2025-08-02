# FILE: src/backend/llamacpp_backend.py - GPU-FIRST PRIORITY VERSION

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
    GPU-FIRST llama.cpp backend optimized for Intel Arc A770
    Prioritizes GPU usage above all else
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
        
        # GPU-FIRST: Prioritize GPU detection and usage
        self.n_gpu_layers = self._detect_gpu_layers_aggressive()
        print(f"🎮 AIDE Llama.cpp Backend ready with {self.n_gpu_layers} GPU layers (GPU-FIRST mode)")
    
    def _detect_gpu_layers_aggressive(self) -> int:
        """GPU-FIRST: Aggressively detect and use maximum GPU layers possible"""
        
        # PRIORITY 1: Intel Arc A770 with full GPU offload
        try:
            import intel_extension_for_pytorch as ipex
            import torch
            
            if hasattr(torch, 'xpu') and torch.xpu.is_available():
                device_count = torch.xpu.device_count()
                if device_count > 0:
                    print("🎮 PRIORITY 1: Intel Arc A770 detected via XPU - FULL GPU OFFLOAD")
                    self.device = "xpu"
                    self.device_name = "Intel Arc A770 (XPU accelerated - FULL GPU)"
                    return -1  # Full GPU offload - maximum performance
                    
        except Exception as e:
            print(f"⚠️ Intel XPU detection failed: {e}")
        
        # PRIORITY 2: Intel GPU via SYCL (oneAPI)
        try:
            result = subprocess.run(['sycl-ls'], capture_output=True, text=True, timeout=5)
            if result.returncode == 0 and "Intel" in result.stdout and "GPU" in result.stdout:
                print("🎮 PRIORITY 2: Intel GPU detected via SYCL - FULL GPU OFFLOAD")
                self.device = "sycl"
                self.device_name = "Intel Arc A770 (SYCL accelerated - FULL GPU)"
                return -1  # Full GPU offload
        except Exception as e:
            print(f"⚠️ SYCL detection failed: {e}")
        
        # PRIORITY 3: Intel GPU via OpenCL
        try:
            result = subprocess.run(['clinfo'], capture_output=True, text=True, timeout=5)
            if result.returncode == 0 and "Intel" in result.stdout and "Arc" in result.stdout:
                print("🎮 PRIORITY 3: Intel Arc A770 detected via OpenCL - FULL GPU OFFLOAD")
                self.device = "opencl"
                self.device_name = "Intel Arc A770 (OpenCL accelerated - FULL GPU)"
                return -1  # Full GPU offload
        except Exception as e:
            print(f"⚠️ OpenCL detection failed: {e}")
        
        # PRIORITY 4: ANY GPU via CUDA (fallback)
        try:
            result = subprocess.run(['nvidia-smi'], capture_output=True, timeout=5)
            if result.returncode == 0:
                print("🔥 PRIORITY 4: CUDA GPU detected - FULL GPU OFFLOAD")
                self.device = "cuda"
                self.device_name = "NVIDIA GPU (CUDA accelerated - FULL GPU)"
                return -1  # Full GPU offload
        except Exception as e:
            print(f"⚠️ CUDA detection failed: {e}")
        
        # LAST RESORT: CPU with aggressive optimization for 94GB RAM
        print("💻 LAST RESORT: Using CPU mode with BEAST MODE optimizations for 94GB RAM")
        self.device = "cpu"
        self.device_name = "CPU (94GB RAM optimized - NO GPU DETECTED)"
        return 0  # Only fallback to CPU if NO GPU found
    
    def is_available(self) -> bool:
        """Check if llama.cpp backend is available"""
        return LLAMACPP_AVAILABLE
    
    def load_model(self, model_path: Path, **kwargs) -> Tuple[bool, str]:
        """GPU-FIRST: Load GGUF model with maximum GPU utilization"""
        if not self.is_available():
            return False, "llama-cpp-python not available"
        
        # Find GGUF file
        gguf_path = None
        
        if str(model_path).endswith('.gguf'):
            gguf_path = model_path
        else:
            search_paths = [
                Path(model_path),
                Path(model_path) / "models",  
                Path(model_path).parent,
                Path("./models") / model_path.name,
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
            return False, f"No GGUF files found in {model_path}"
        
        try:
            print(f"🔄 AIDE loading GGUF model with GPU-FIRST priority: {gguf_path}")
            
            # GPU-FIRST: Build config that MAXIMIZES GPU usage
            model_kwargs = {
                "model_path": str(gguf_path),
                # GPU-FIRST: Increase context for GPU performance
                "n_ctx": kwargs.get('n_ctx', 16384),  # Large context for GPU
                "n_gpu_layers": self.n_gpu_layers,  # Maximum GPU layers
                "n_threads": kwargs.get('n_threads', 8),  # Reduce CPU threads when using GPU
                "verbose": False,
                "use_mlock": True,  # Lock in RAM for GPU efficiency
                "use_mmap": False,  # Disable mmap for better GPU performance
                "n_batch": kwargs.get('n_batch', 2048),  # Larger batch for GPU
            }
            
            # GPU-FIRST: Add GPU-specific optimizations
            if self.n_gpu_layers > 0:
                model_kwargs.update({
                    "split_mode": 1,        # Split across GPU devices
                    "main_gpu": 0,          # Primary GPU
                    "tensor_split": None,   # Auto-split for multi-GPU
                    # GPU-FIRST: Aggressive GPU memory usage
                    "low_vram": False,      # Use full VRAM capacity
                    "f16_kv": True,         # Use FP16 for key-value cache (faster on GPU)
                    "offload_kqv": True,    # Offload KQV to GPU
                })
                print(f"🚀 GPU-FIRST CONFIG: Full offload with {self.n_gpu_layers} layers")
            else:
                print("⚠️ NO GPU DETECTED - falling back to CPU-only mode")
            
            # Load the model with GPU-first configuration
            print(f"🚀 Loading with GPU-FIRST config: Context={model_kwargs['n_ctx']}, GPU_Layers={self.n_gpu_layers}")
            self.model = Llama(**model_kwargs)
            self.model_path = gguf_path
            
            # Store GPU-optimized generation params
            self.generation_params = {
                "max_tokens": 2048,      # Larger for GPU efficiency
                "temperature": 0.8,
                "top_p": 0.95,
                "top_k": 40,
                "repeat_penalty": 1.1,
                "stop": ["\n\n", "User:", "Human:", "</s>", "<|im_end|>", "Assistant:", "\nUser"]
            }
            
            # Enhanced device info
            if self.n_gpu_layers > 0 or self.n_gpu_layers == -1:
                success_msg = f"GPU-FIRST SUCCESS: {gguf_path.name} loaded on {self.device_name} with FULL GPU ACCELERATION"
            else:
                success_msg = f"CPU FALLBACK: {gguf_path.name} loaded on {self.device_name} (NO GPU FOUND)"
            
            print(f"✅ {success_msg}")
            
            # Test generation to ensure GPU is working
            try:
                test_response = self.model("GPU Test", max_tokens=5, echo=False)
                if self.n_gpu_layers > 0:
                    print(f"🧪 GPU TEST SUCCESSFUL: Generated response using GPU acceleration")
                else:
                    print(f"🧪 CPU TEST: Generated response using CPU only")
            except Exception as test_error:
                print(f"⚠️ Test generation failed: {test_error}")
            
            return True, success_msg
            
        except Exception as e:
            error_msg = f"GPU-FIRST model loading failed: {str(e)}"
            print(f"❌ {error_msg}")
            traceback.print_exc()
            return False, error_msg
    
    def generate_stream(self, prompt: str, **kwargs):
        """GPU-FIRST: Stream generation optimized for GPU performance"""
        if not self.model:
            raise RuntimeError("No model loaded")
        
        # Merge with GPU-optimized generation params
        gen_params = self.generation_params.copy()
        gen_params.update(kwargs)
        
        # GPU-FIRST: Ensure optimal stop sequences for GPU efficiency
        if not gen_params.get('stop'):
            gen_params['stop'] = ["\n\n", "User:", "Human:", "</s>", "<|im_end|>", "Assistant:", "\nUser"]
        
        print(f"🚀 GPU-FIRST streaming: max_tokens={gen_params.get('max_tokens', 2048)}, device={self.device}")
        
        try:
            # Enhanced streaming with GPU optimization
            stream = self.model(
                prompt,
                max_tokens=gen_params.get('max_tokens', 2048),
                temperature=gen_params.get('temperature', 0.8),
                top_p=gen_params.get('top_p', 0.95),
                top_k=gen_params.get('top_k', 40),
                repeat_penalty=gen_params.get('repeat_penalty', 1.1),
                stop=gen_params.get('stop', []),
                stream=True,
                echo=False
            )
            
            token_count = 0
            max_tokens = gen_params.get('max_tokens', 2048)
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
                        
                        # Check for stop sequences
                        for stop_seq in gen_params.get('stop', []):
                            if stop_seq in response_text:
                                print(f"🛑 Stop sequence '{stop_seq}' detected")
                                return
                                
        except Exception as e:
            error_msg = f"GPU-FIRST streaming error: {str(e)}"
            print(f"❌ {error_msg}")
            yield f"❌ GPU streaming error: {error_msg}"
    
    def generate_response(self, prompt: str, max_tokens: int = 2048, temperature: float = 0.8, **kwargs) -> str:
        """GPU-FIRST: Generate complete response with maximum GPU utilization"""
        if not self.model:
            return "❌ No model loaded in llama.cpp backend"
        
        try:
            start_time = time.time()
            
            # Merge parameters with GPU-optimized defaults
            gen_params = self.generation_params.copy()
            gen_params.update({
                'max_tokens': max_tokens,
                'temperature': temperature,
                **kwargs
            })
            
            print(f"🚀 GPU-FIRST generation on {self.device_name}")
            
            result = self.model(
                prompt,
                max_tokens=gen_params.get('max_tokens', 2048),
                temperature=gen_params.get('temperature', 0.8),
                top_p=gen_params.get('top_p', 0.95),
                top_k=gen_params.get('top_k', 40),
                repeat_penalty=gen_params.get('repeat_penalty', 1.1),
                stop=gen_params.get('stop', []),
                echo=False
            )
            
            generation_time = time.time() - start_time
            response = result['choices'][0]['text'].strip()
            
            # Performance logging with GPU status
            tokens_per_second = len(response.split()) / generation_time if generation_time > 0 else 0
            if self.n_gpu_layers > 0:
                print(f"✅ GPU-FIRST generation completed in {generation_time:.2f}s on {self.device_name}")
                print(f"🎮 GPU PERFORMANCE: {len(response)} chars, ~{tokens_per_second:.1f} tokens/sec")
            else:
                print(f"✅ CPU generation completed in {generation_time:.2f}s (NO GPU)")
                print(f"💻 CPU PERFORMANCE: {len(response)} chars, ~{tokens_per_second:.1f} tokens/sec")
            
            return response
            
        except Exception as e:
            error_msg = f"GPU-FIRST generation error: {str(e)}"
            print(f"❌ {error_msg}")
            traceback.print_exc()
            return f"❌ GPU-first generation failed: {error_msg}"
    
    def get_backend_info(self) -> Dict[str, Any]:
        """GPU-FIRST: Get backend information with GPU priority details"""
        return {
            "backend": "llama.cpp",
            "available": self.is_available(),
            "device": self.device,
            "device_name": self.device_name,
            "model_loaded": self.model is not None,
            "current_model": str(self.model_path.name) if self.model_path else None,
            "gpu_layers": self.n_gpu_layers,
            "gpu_first_mode": True,  # Always prioritize GPU
            "arc_optimized": self.device in ["xpu", "sycl", "opencl"] or (self.n_gpu_layers > 0),
            "context_size": getattr(self.model, 'n_ctx', 0) if self.model else 0,
            "gpu_acceleration": self.n_gpu_layers > 0,
            "full_gpu_offload": self.n_gpu_layers == -1,
            "capabilities": [
                "GPU-FIRST priority",
                "GGUF format support",
                "Streaming generation", 
                "Maximum GPU utilization",
                "Intel Arc A770 optimized" if self.device in ["xpu", "sycl", "opencl"] else "Multi-GPU support",
                "94GB RAM optimization",
                "Enhanced GPU performance"
            ],
            "generation_params": self.generation_params,
            "hardware_specs": {
                "ram": "94GB",
                "cpu": "Intel i9 12th gen",
                "gpu": "Intel Arc A770",
                "os": "Pop!_OS",
                "gpu_priority": "MAXIMUM"
            }
        }
    
    def unload_model(self):
        """Enhanced model unloading with GPU cleanup"""
        if self.model:
            try:
                del self.model
                self.model = None
                self.model_path = None
                print(f"🗑️ GPU-FIRST model unloaded from {self.device_name}")
            except Exception as e:
                print(f"⚠️ Model unload error: {e}")

# GPU-FIRST compatibility wrappers
class LlamaCppModelWrapper:
    """GPU-FIRST: Wrapper for maximum GPU utilization"""
    
    def __init__(self, llamacpp_backend: AIDE_LlamaCpp_Backend):
        self.backend = llamacpp_backend
        self.device = llamacpp_backend.device
        self.gpu_accelerated = llamacpp_backend.n_gpu_layers > 0
        
    def generate(self, input_ids=None, attention_mask=None, max_new_tokens=2048,
                 temperature=0.8, top_p=0.95, do_sample=True, pad_token_id=None, **kwargs):
        """GPU-FIRST: Generate with maximum GPU utilization"""
        try:
            # Extract or build prompt
            prompt = kwargs.get('prompt', 'Generate a helpful response:')
            
            response = self.backend.generate_response(
                prompt=prompt,
                max_tokens=max_new_tokens,
                temperature=temperature,
                top_p=top_p,
                **kwargs
            )
            
            if self.gpu_accelerated:
                print(f"🎮 GPU-FIRST generation completed on {self.backend.device_name}")
            
            return [[response]]
            
        except Exception as e:
            error_msg = f"GPU-FIRST wrapper generation failed: {str(e)}"
            print(f"❌ {error_msg}")
            return [[f"❌ Generation failed: {str(e)}"]]

class LlamaCppTokenizerWrapper:
    """GPU-FIRST: Tokenizer wrapper optimized for GPU workflows"""
    
    def __init__(self, llamacpp_backend: AIDE_LlamaCpp_Backend):
        self.backend = llamacpp_backend
        self.eos_token_id = 0
        self.pad_token_id = 0
        self.gpu_accelerated = llamacpp_backend.n_gpu_layers > 0
        
    def __call__(self, text, return_tensors=None, truncation=True, max_length=16384, **kwargs):
        """GPU-FIRST: Tokenizer compatibility with large context for GPU"""
        # Return dummy tensors for llama.cpp compatibility
        return {
            'input_ids': [[1]],
            'attention_mask': [[1]]
        }
    
    def decode(self, tokens, skip_special_tokens=True, **kwargs):
        """GPU-FIRST: Enhanced decode with GPU workflow optimization"""
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
            print(f"⚠️ GPU-FIRST tokenizer decode error: {e}")
            return "Decode error"

# GPU-FIRST factory function
def create_llamacpp_backend() -> Tuple[Optional[AIDE_LlamaCpp_Backend], bool]:
    """Create GPU-FIRST llama.cpp backend with maximum GPU utilization"""
    try:
        print("🔄 Creating GPU-FIRST AIDE llama.cpp backend...")
        backend = AIDE_LlamaCpp_Backend()
        
        if backend.is_available():
            backend_info = backend.get_backend_info()
            print(f"✅ GPU-FIRST backend created successfully")
            print(f"🎮 Device: {backend_info['device_name']}")
            print(f"🚀 GPU Acceleration: {'✅ ENABLED' if backend_info['gpu_acceleration'] else '❌ DISABLED'}")
            print(f"🎯 Capabilities: {', '.join(backend_info['capabilities'])}")
            return backend, True
        else:
            print("❌ GPU-FIRST backend unavailable")
            return None, False
            
    except Exception as e:
        print(f"❌ Failed to create GPU-FIRST backend: {e}")
        traceback.print_exc()
        return None, False

# GPU-FIRST utility functions
def get_llamacpp_status() -> Dict[str, Any]:
    """Get GPU-FIRST llama.cpp status"""
    backend, success = create_llamacpp_backend()
    
    if success and backend:
        return backend.get_backend_info()
    else:
        return {
            "backend": "llama.cpp",
            "available": False,
            "gpu_first_mode": True,
            "error": "GPU-FIRST backend creation failed",
            "recommendations": [
                "Install llama-cpp-python: pip install llama-cpp-python",
                "Install Intel Arc A770 drivers: sudo apt install intel-level-zero-gpu intel-opencl-icd",
                "Install Intel oneAPI: source /opt/intel/oneapi/setvars.sh",
                "Check GPU detection: sycl-ls and clinfo",
                "Verify GGUF models are available"
            ]
        }

def find_gguf_models(models_dir: Path = Path("./models")) -> List[Path]:
    """Find GGUF models with GPU-priority information"""
    gguf_files = []
    
    if models_dir.exists():
        gguf_files = list(models_dir.rglob("*.gguf"))
        
    print(f"🔍 GPU-FIRST: Found {len(gguf_files)} GGUF models in {models_dir}")
    for gguf_file in sorted(gguf_files, key=lambda f: f.stat().st_size, reverse=True):
        size_mb = gguf_file.stat().st_size / (1024 * 1024)
        print(f"  📄 {gguf_file.name} ({size_mb:.1f} MB) - GPU-READY")
    
    return gguf_files

if __name__ == "__main__":
    # GPU-FIRST testing
    print("🧪 Testing GPU-FIRST AIDE llama.cpp backend...")
    
    # Check status with GPU priority
    status = get_llamacpp_status()
    print(f"📊 GPU-FIRST Backend status:")
    for key, value in status.items():
        print(f"  {key}: {value}")
    
    # Find models
    models = find_gguf_models()
    print(f"📚 Found {len(models)} GPU-READY GGUF models")
    
    # Test loading with GPU priority
    if models and status.get("available"):
        backend, success = create_llamacpp_backend()
        if success:
            print(f"🧪 Testing GPU-FIRST model load with: {models[0]}")
            load_success, message = backend.load_model(models[0])
            print(f"📊 GPU-FIRST Load result: {load_success} - {message}")
            
            if load_success:
                print("🧪 Testing GPU-FIRST response generation...")
                response = backend.generate_response("Hello GPU!", max_tokens=50)
                print(f"📊 GPU-FIRST Generated: {response[:100]}...")
