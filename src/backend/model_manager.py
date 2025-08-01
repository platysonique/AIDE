# FILE: src/backend/model_manager.py - ULTIMATE MERGED VERSION WITH OPENVINO INTEGRATION
# INTEL ARC A770 OPTIMIZED DYNAMIC MODEL MANAGEMENT + OPENVINO GPU ACCELERATION

import os
import functools
import json
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import traceback

# ENHANCED: OpenVINO backend import with graceful fallback
try:
    from openvino_backend import AIDE_OpenVINO_Backend, OpenVINOModelWrapper, OpenVINOTokenizerWrapper, create_openvino_backend
    AIDE_OPENVINO_AVAILABLE = True
    print("✅ AIDE OpenVINO backend available - Intel Arc A770 BEAST MODE ready!")
except ImportError as e:
    AIDE_OPENVINO_AVAILABLE = False
    print(f"⚠️ AIDE OpenVINO backend not available: {e}")

# Path to models directory (fixed path resolution)
PROJECT_ROOT = Path(__file__).resolve().parents[2]  # Go up to repo root
MODELS_DIR = PROJECT_ROOT / "models"

def list_available_models() -> List[str]:
    """
    PURE DYNAMIC MODEL DISCOVERY - scans models/ for any valid model folders
    NO HARDCODING - discovers whatever you drop into models/
    """
    if not MODELS_DIR.exists():
        return []
    
    models = []
    
    # Check root models directory for a complete model (backward compatibility)
    root_config = MODELS_DIR / 'config.json'
    root_params = MODELS_DIR / 'params.json'
    root_has_model = any(f.suffix in ['.safetensors', '.bin']
                        for f in MODELS_DIR.iterdir()
                        if f.is_file())
    
    if (root_config.exists() or root_params.exists()) and root_has_model:
        models.append("root-model")
    
    # Scan subdirectories for model folders
    for item in MODELS_DIR.iterdir():
        if item.is_dir() and item.name not in ['.cache', '__pycache__', '.git', '.gitkeep']:
            # Check if directory contains a valid model
            has_config = (item / 'config.json').exists() or (item / 'params.json').exists()
            has_model = any(f.suffix in ['.safetensors', '.bin'] for f in item.iterdir())
            
            if has_config and has_model:
                models.append(item.name)
    
    return sorted(models)

def _detect_optimal_device() -> Dict[str, Any]:
    """
    ENHANCED: OpenVINO + Intel Arc A770 detection with PyTorch fallbacks
    Your beast hardware deserves beast performance with PRIORITY BACKEND SELECTION!
    """
    import torch
    
    # PRIORITY 1: TRY OPENVINO FIRST - This is your Arc A770 breakthrough!
    if AIDE_OPENVINO_AVAILABLE:
        try:
            print("🔍 Attempting OpenVINO backend detection...")
            openvino_backend, success = create_openvino_backend()
            if success and openvino_backend:
                backend_info = openvino_backend.get_backend_info()
                print(f"🎮 OpenVINO backend info: {backend_info}")
                
                # Check if Arc A770 is detected and optimized
                if backend_info.get("arc_optimized", False):
                    print("🚀 BEAST MODE: Intel Arc A770 detected via OpenVINO!")
                    return {
                        "device_map": "openvino_gpu",
                        "device_name": f"Intel Arc A770 (OpenVINO) - AIDE BEAST MODE",
                        "backend": "openvino",
                        "use_openvino": True,
                        "openvino_backend": openvino_backend,
                        "use_intel_xpu": False,
                        "memory_strategy": "GPU-accelerated via OpenVINO GenAI",
                        "model_kwargs": {}
                    }
                
                # Fallback to any GPU via OpenVINO
                elif "GPU" in backend_info.get("device", ""):
                    device_name = backend_info.get("device_name", "Unknown GPU")
                    print(f"🎮 Using OpenVINO GPU fallback: {device_name}")
                    return {
                        "device_map": "openvino_gpu", 
                        "device_name": f"GPU (OpenVINO) - {device_name}",
                        "backend": "openvino",
                        "use_openvino": True,
                        "openvino_backend": openvino_backend,
                        "use_intel_xpu": False,
                        "memory_strategy": "GPU-accelerated via OpenVINO",
                        "model_kwargs": {}
                    }
        except Exception as e:
            print(f"⚠️ AIDE OpenVINO detection failed: {e}")
            traceback.print_exc()
    
    # PRIORITY 2: Your existing PyTorch XPU detection (unchanged)
    try:
        import intel_extension_for_pytorch as ipex
        if hasattr(torch, 'xpu') and torch.xpu.is_available():
            device_count = torch.xpu.device_count()
            print(f"🎮 BEAST MODE: Intel Arc A770 detected! Found {device_count} XPU device(s)")
            return {
                "device_map": "xpu:0",
                "device_name": "Intel Arc A770 (XPU:0) - BEAST MODE ACTIVATED",
                "backend": "pytorch_xpu",
                "use_openvino": False,
                "use_intel_xpu": True,
                "memory_strategy": "GPU-accelerated with 94GB RAM backup",
                "model_kwargs": {
                    "low_cpu_mem_usage": True,
                    "trust_remote_code": True
                }
            }
    except ImportError:
        print("⚠️ Intel Extension for PyTorch not found - install with: pip install intel_extension_for_pytorch")
    except Exception as e:
        print(f"⚠️ Intel XPU detection failed: {e}")
    
    # PRIORITY 3: Your existing CUDA detection (unchanged)
    if torch.cuda.is_available():
        print("🎮 CUDA GPU detected - using CUDA acceleration")
        return {
            "device_map": "auto",
            "device_name": "CUDA GPU",
            "backend": "pytorch_cuda",
            "use_openvino": False,
            "use_intel_xpu": False,
            "memory_strategy": "CUDA-optimized",
            "model_kwargs": {
                "torch_dtype": torch.float16,  # Safe to set for CUDA
                "trust_remote_code": True
            }
        }
    
    # PRIORITY 4: Your existing CPU fallback (unchanged)
    print("⚠️ No GPU acceleration detected - using CPU with 94GB RAM BEAST MODE")
    return {
        "device_map": "cpu",
        "device_name": "CPU (94GB RAM BEAST MODE)",
        "backend": "pytorch_cpu", 
        "use_openvino": False,
        "use_intel_xpu": False,
        "memory_strategy": "High-RAM CPU optimized for your 94GB setup",
        "model_kwargs": {
            "torch_dtype": torch.float32,  # Safe for CPU
            "low_cpu_mem_usage": True,
            "trust_remote_code": True
        }
    }

def _apply_intel_arc_optimizations(model) -> Any:
    """
    Apply Intel Arc A770 specific optimizations
    UNLEASH THE BEAST!
    """
    try:
        import intel_extension_for_pytorch as ipex
        import torch
        
        print("🚀 Applying Intel Arc A770 BEAST MODE optimizations...")
        
        # Move model to XPU
        model = model.to('xpu')
        
        # Apply Intel optimizations with different optimization levels
        optimization_levels = ["O1", "O0"]  # Try O1 first, fallback to O0
        for level in optimization_levels:
            try:
                model = ipex.optimize(model, dtype=torch.float16, level=level)
                print(f"✅ Intel Arc A770 optimizations applied with level {level}!")
                break
            except Exception as e:
                print(f"⚠️ Optimization level {level} failed: {e}, trying next...")
                continue
        
        return model
    
    except Exception as e:
        print(f"⚠️ Intel Arc optimization failed: {e}")
        print("📝 Make sure intel_extension_for_pytorch is properly installed")
        return model

@functools.lru_cache(maxsize=1)
def load_model(model_name: str) -> Tuple[Any, Any]:
    """
    ENHANCED: Load ANY model dynamically with OPENVINO PRIORITY + INTEL ARC A770 BEAST MODE
    OPTIMIZED for your Intel Arc A770 + Intel i9 12th gen + 94GB RAM setup
    SMART tokenizer handling based on each model's own configuration
    """
    if model_name == "root-model":
        model_path = MODELS_DIR
    else:
        model_path = MODELS_DIR / model_name
    
    if not model_path.exists():
        raise FileNotFoundError(f"Model '{model_name}' not found in {model_path}")
    
    print(f"🔄 Loading model '{model_name}' from {model_path}...")
    
    # ENHANCED DEVICE DETECTION (now includes OpenVINO as Priority 1)
    device_config = _detect_optimal_device()
    
    try:
        # NEW: OPENVINO PATH - Your Arc A770 solution!
        if device_config.get("use_openvino", False):
            try:
                print("🚀 Loading model via OpenVINO backend...")
                openvino_backend = device_config["openvino_backend"]
                success, message = openvino_backend.load_model(model_path)
                
                if success:
                    print(f"✅ OpenVINO model loaded successfully: {message}")
                    # Create compatibility wrappers for existing AIDE architecture
                    tokenizer = OpenVINOTokenizerWrapper(openvino_backend)
                    model = OpenVINOModelWrapper(openvino_backend)
                    
                    print(f"✅ Model '{model_name}' loaded via OpenVINO!")
                    print(f"🎮 Device: {device_config['device_name']}")
                    print(f"📊 Memory strategy: {device_config['memory_strategy']}")
                    
                    return tokenizer, model
                else:
                    print(f"⚠️ OpenVINO failed: {message}, falling back to PyTorch")
            except Exception as e:
                print(f"❌ OpenVINO loading failed: {e}")
                traceback.print_exc()
                print("⚠️ Falling back to PyTorch...")
        
        # PYTORCH FALLBACK PATH (your existing code, unchanged)
        # FIXED: Import torch and transformers at function level
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
        
        # 🧠 SMART TOKENIZER DETECTION - Let each model tell us what it needs!
        tokenizer_hints = _analyze_model_config(model_path)
        
        # Load tokenizer with intelligent selection based on model's own metadata
        tokenizer = _load_smart_tokenizer(model_path, tokenizer_hints)
        
        # Load model with INTEL ARC A770 BEAST MODE settings
        print(f"🎮 Using device strategy: {device_config['device_name']}")
        print(f"📊 Memory strategy: {device_config['memory_strategy']}")
        
        # Build model loading arguments intelligently - FIXED VERSION
        model_args = {
            "device_map": device_config["device_map"],
            **device_config["model_kwargs"]
        }
        
        # Only set torch_dtype if Intel extension isn't handling it
        if not device_config.get("use_intel_xpu", False):
            # For CUDA and CPU paths, we can safely set torch_dtype
            if torch.cuda.is_available():
                model_args["torch_dtype"] = torch.float16
            else:
                model_args["torch_dtype"] = torch.float32
        
        model = AutoModelForCausalLM.from_pretrained(str(model_path), **model_args)
        
        # Apply Intel Arc A770 optimizations if available
        if device_config["use_intel_xpu"]:
            model = _apply_intel_arc_optimizations(model)
        
        print(f"✅ Model '{model_name}' loaded successfully!")
        print(f"🎮 Device: {device_config['device_name']}")
        print(f"📊 Model device: {model.device if hasattr(model, 'device') else 'distributed'}")
        print(f"🧠 Model memory footprint: ~{_estimate_model_size(model_path)} GB")
        print(f"🎯 Tokenizer type: {tokenizer.__class__.__name__}")
        
        return tokenizer, model
    
    except Exception as e:
        print(f"❌ Failed to load model '{model_name}': {e}")
        print(f"💡 Troubleshooting tip: Check if intel_extension_for_pytorch is installed")
        raise

def _analyze_model_config(model_path: Path) -> Dict[str, Any]:
    """
    Analyze model configuration to determine optimal tokenizer strategy
    PURE DYNAMIC - reads what each model actually needs from its own files
    """
    hints = {
        "model_type": "",
        "tokenizer_class": "",
        "architectures": [],
        "is_mistral_format": False,
        "has_vision": False,
        "special_tokens": {}
    }
    
    # Check HuggingFace format config.json
    config_path = model_path / "config.json"
    if config_path.exists():
        try:
            with open(config_path, 'r') as f:
                config = json.load(f)
            
            hints.update({
                "model_type": config.get("model_type", ""),
                "tokenizer_class": config.get("tokenizer_class", ""),
                "architectures": config.get("architectures", []),
                "has_vision": "vision" in str(config).lower() or "pixtral" in str(config).lower()
            })
        except Exception as e:
            print(f"⚠️ Could not parse config.json: {e}")
    
    # Check Mistral/Pixtral format params.json
    params_path = model_path / "params.json"
    if params_path.exists():
        hints["is_mistral_format"] = True
        try:
            with open(params_path, 'r') as f:
                params = json.load(f)
            # Mistral format usually indicates special tokenizer needs
            hints["model_type"] = "mistral" if "pixtral" not in model_path.name.lower() else "pixtral"
        except Exception as e:
            print(f"⚠️ Could not parse params.json: {e}")
    
    return hints

def _load_smart_tokenizer(model_path: Path, hints: Dict[str, Any]) -> Any:
    """
    Intelligently load the right tokenizer based on model's own requirements
    NO HARDCODING - uses model metadata to determine best approach
    """
    from transformers import AutoTokenizer
    
    # Strategy 1: Pixtral models need special handling
    if (hints.get("model_type") == "pixtral" or
        "pixtral" in hints.get("architectures", []) or
        hints.get("is_mistral_format")):
        
        print("🎯 Detected Pixtral/Mistral format - using specialized tokenizer loading")
        
        # Try multiple approaches for Pixtral tokenizer compatibility
        approaches = [
            lambda: AutoTokenizer.from_pretrained(str(model_path), use_fast=False, legacy=False),
            lambda: AutoTokenizer.from_pretrained(str(model_path), use_fast=False, legacy=True),
            lambda: _load_llama_tokenizer_fallback(model_path),
        ]
        
        for i, approach in enumerate(approaches, 1):
            try:
                print(f"  🔄 Trying tokenizer approach {i}/3...")
                tokenizer = approach()
                print(f"  ✅ Tokenizer approach {i} succeeded!")
                return tokenizer
            except Exception as e:
                print(f"  ⚠️ Tokenizer approach {i} failed: {e}")
                if i == len(approaches):  # Last attempt
                    raise e
                continue
    
    # Strategy 2: LlamaTokenizer for models that explicitly request it
    elif hints.get("tokenizer_class") == "LlamaTokenizer":
        print("🎯 Model config requests LlamaTokenizer specifically")
        return _load_llama_tokenizer_fallback(model_path)
    
    # Strategy 3: Standard AutoTokenizer for most models
    else:
        print("🎯 Using standard AutoTokenizer")
        try:
            return AutoTokenizer.from_pretrained(str(model_path), trust_remote_code=True)
        except Exception as e:
            print(f"⚠️ Standard tokenizer failed, trying fallback: {e}")
            # Fallback to slow tokenizer
            return AutoTokenizer.from_pretrained(str(model_path), use_fast=False, trust_remote_code=True)

def _load_llama_tokenizer_fallback(model_path: Path) -> Any:
    """Fallback to LlamaTokenizer for problematic models"""
    try:
        from transformers import LlamaTokenizer
        return LlamaTokenizer.from_pretrained(str(model_path), legacy=False)
    except ImportError:
        # If LlamaTokenizer isn't available, use AutoTokenizer with special settings
        from transformers import AutoTokenizer
        return AutoTokenizer.from_pretrained(str(model_path), use_fast=False, legacy=False)

def get_model_info(model_name: str) -> Optional[Dict[str, Any]]:
    """
    Get detailed information about a specific model
    ENHANCED with OpenVINO and Intel Arc A770 compatibility analysis
    """
    if model_name == "root-model":
        model_path = MODELS_DIR
    else:
        model_path = MODELS_DIR / model_name
    
    if not model_path.exists():
        return None
    
    info = {
        "name": model_name,
        "path": str(model_path),
        "size_gb": _calculate_model_size(model_path),
        "files": _list_model_files(model_path)
    }
    
    # Enhanced config analysis
    hints = _analyze_model_config(model_path)
    info.update({
        "model_type": hints.get("model_type", "unknown"),
        "architecture": hints.get("architectures", ["unknown"])[0] if hints.get("architectures") else "unknown",
        "is_mistral_format": hints.get("is_mistral_format", False),
        "has_vision_capability": hints.get("has_vision", False),
        "recommended_tokenizer": _get_recommended_tokenizer_type(hints),
        "intel_arc_compatible": True,  # All models can benefit from Intel Arc acceleration
        "openvino_ready": AIDE_OPENVINO_AVAILABLE,  # NEW: OpenVINO compatibility
        "acceleration_options": []
    })
    
    # ENHANCED: Determine acceleration options
    if AIDE_OPENVINO_AVAILABLE:
        info["acceleration_options"].append("OpenVINO (Priority)")
    
    try:
        import intel_extension_for_pytorch as ipex
        import torch
        if hasattr(torch, 'xpu') and torch.xpu.is_available():
            info["acceleration_options"].append("PyTorch XPU (Intel Arc A770)")
    except:
        pass
    
    if not info["acceleration_options"]:
        info["acceleration_options"].append("CPU (94GB RAM)")
    
    # Try to read config (check both config.json and params.json for complete support)
    for config_file in ['config.json', 'params.json']:
        config_path = model_path / config_file
        if config_path.exists():
            try:
                with open(config_path, 'r') as f:
                    config = json.load(f)
                
                if config_file == 'params.json':
                    # Pixtral/Mistral format
                    info.update({
                        "vocab_size": config.get("vocab_size", "unknown"),
                        "dim": config.get("dim", "unknown"),
                        "config_format": "params.json"
                    })
                else:
                    # Standard HuggingFace format
                    info.update({
                        "vocab_size": config.get("vocab_size", "unknown"),
                        "hidden_size": config.get("hidden_size", "unknown"),
                        "config_format": "config.json"
                    })
                break
            except Exception as e:
                info["config_error"] = f"Failed to parse {config_file}: {str(e)}"
    
    return info

def _get_recommended_tokenizer_type(hints: Dict[str, Any]) -> str:
    """Determine the recommended tokenizer type for a model"""
    if hints.get("model_type") == "pixtral" or hints.get("is_mistral_format"):
        return "LlamaTokenizer (Pixtral-compatible)"
    elif hints.get("tokenizer_class") == "LlamaTokenizer":
        return "LlamaTokenizer"
    elif hints.get("has_vision"):
        return "AutoTokenizer (with vision support)"
    else:
        return "AutoTokenizer (standard)"

def _calculate_model_size(model_path: Path) -> float:
    """Calculate total size of model files in GB"""
    total_size = 0
    for file_path in model_path.rglob('*'):
        if file_path.is_file():
            total_size += file_path.stat().st_size
    return round(total_size / (1024**3), 2)  # Convert to GB

def _list_model_files(model_path: Path) -> List[str]:
    """List important model files"""
    important_extensions = ['.safetensors', '.bin', '.json', '.txt', '.model']
    files = []
    for file_path in model_path.iterdir():
        if file_path.is_file() and file_path.suffix in important_extensions:
            files.append(file_path.name)
    return sorted(files)

def _estimate_model_size(model_path: Path) -> float:
    """Quick estimate of model size for loading feedback"""
    return _calculate_model_size(model_path)

def clear_model_cache():
    """Clear the model cache to free up memory"""
    load_model.cache_clear()
    print("🧹 Model cache cleared - ready for next model")

def get_cache_info() -> Dict[str, Any]:
    """Get information about the model cache"""
    cache_info = load_model.cache_info()
    return {
        "hits": cache_info.hits,
        "misses": cache_info.misses,
        "maxsize": cache_info.maxsize,
        "currsize": cache_info.currsize
    }

def validate_model(model_name: str) -> Dict[str, Any]:
    """
    Validate a model without loading it
    ENHANCED with OpenVINO and Intel Arc A770 compatibility checking
    """
    if model_name == "root-model":
        model_path = MODELS_DIR
    else:
        model_path = MODELS_DIR / model_name
    
    validation = {
        "model_name": model_name,
        "path_exists": model_path.exists(),
        "has_config": False,
        "has_model_files": False,
        "has_tokenizer": False,
        "tokenizer_compatibility": "unknown",
        "intel_arc_ready": False,
        "openvino_ready": False,  # NEW
        "acceleration_ready": False,  # NEW
        "errors": []
    }
    
    if not model_path.exists():
        validation["errors"].append(f"Model directory not found: {model_path}")
        return validation
    
    # Check for config files
    config_files = ['config.json', 'params.json']
    has_config = any((model_path / f).exists() for f in config_files)
    validation["has_config"] = has_config
    
    if not has_config:
        validation["errors"].append("No config.json or params.json found")
    
    # Check for model weight files
    model_files = list(model_path.glob('*.safetensors')) + list(model_path.glob('*.bin'))
    validation["has_model_files"] = len(model_files) > 0
    validation["model_file_count"] = len(model_files)
    
    if not model_files:
        validation["errors"].append("No .safetensors or .bin model files found")
    
    # Enhanced tokenizer checking
    tokenizer_files = ['tokenizer.json', 'vocab.txt', 'tokenizer_config.json', 'tokenizer.model']
    has_tokenizer = any((model_path / f).exists() for f in tokenizer_files)
    validation["has_tokenizer"] = has_tokenizer
    
    if has_tokenizer:
        # Analyze tokenizer compatibility
        hints = _analyze_model_config(model_path)
        validation["tokenizer_compatibility"] = _get_recommended_tokenizer_type(hints)
    else:
        validation["errors"].append("No tokenizer files found")
        validation["tokenizer_compatibility"] = "missing"
    
    # ENHANCED: Acceleration readiness checks
    validation["intel_arc_ready"] = has_config and len(model_files) > 0
    validation["openvino_ready"] = AIDE_OPENVINO_AVAILABLE and validation["intel_arc_ready"]
    validation["acceleration_ready"] = validation["openvino_ready"] or validation["intel_arc_ready"]
    
    if validation["acceleration_ready"]:
        acceleration_note = []
        if validation["openvino_ready"]:
            acceleration_note.append("OpenVINO GPU acceleration")
        if validation["intel_arc_ready"]:
            acceleration_note.append("Intel Arc A770 PyTorch XPU")
        validation["acceleration_note"] = f"Ready for: {', '.join(acceleration_note)}"
    
    validation["is_valid"] = (has_config and len(model_files) > 0 and has_tokenizer)
    
    return validation

def discover_and_validate_models() -> Dict[str, Any]:
    """
    Discover all models and validate their OpenVINO + Intel Arc A770 compatibility at startup
    ENHANCED with comprehensive acceleration analysis
    """
    models = list_available_models()
    summary = {
        "total_models": len(models),
        "valid_models": [],
        "invalid_models": [],
        "tokenizer_issues": [],
        "intel_arc_ready": [],
        "openvino_ready": [],  # NEW
        "acceleration_ready": [],  # NEW
        "discovery_time": "runtime",
        "models_directory": str(MODELS_DIR),
        "hardware_optimization": "OpenVINO + Intel Arc A770 + Intel i9 12th gen + 94GB RAM",
        "acceleration_backends": []
    }
    
    # Check available acceleration backends
    if AIDE_OPENVINO_AVAILABLE:
        summary["acceleration_backends"].append("OpenVINO (Priority)")
    
    try:
        import intel_extension_for_pytorch as ipex
        import torch
        if hasattr(torch, 'xpu') and torch.xpu.is_available():
            summary["acceleration_backends"].append("PyTorch XPU (Intel Arc A770)")
    except:
        pass
    
    if torch.cuda.is_available():
        summary["acceleration_backends"].append("CUDA")
    
    summary["acceleration_backends"].append("CPU (94GB RAM)")
    
    for model_name in models:
        validation = validate_model(model_name)
        
        if validation["is_valid"]:
            info = get_model_info(model_name)
            
            model_summary = {
                "name": model_name,
                "size_gb": info["size_gb"] if info else 0,
                "architecture": info.get("architecture", "unknown") if info else "unknown",
                "tokenizer_type": validation["tokenizer_compatibility"],
                "intel_arc_ready": validation["intel_arc_ready"],
                "openvino_ready": validation["openvino_ready"],
                "acceleration_ready": validation["acceleration_ready"],
                "acceleration_options": info.get("acceleration_options", []) if info else []
            }
            
            # Flag potential tokenizer issues
            if "Pixtral" in validation["tokenizer_compatibility"] or validation["tokenizer_compatibility"] == "missing":
                summary["tokenizer_issues"].append(model_name)
            
            # Track acceleration ready models
            if validation["intel_arc_ready"]:
                summary["intel_arc_ready"].append(model_name)
            
            if validation["openvino_ready"]:
                summary["openvino_ready"].append(model_name)
            
            if validation["acceleration_ready"]:
                summary["acceleration_ready"].append(model_name)
            
            summary["valid_models"].append(model_summary)
        
        else:
            summary["invalid_models"].append({
                "name": model_name,
                "errors": validation["errors"]
            })
    
    return summary

# ENHANCED: Hardware detection with OpenVINO priority
def check_intel_arc_status() -> Dict[str, Any]:
    """
    ENHANCED: Check Intel Arc A770 hardware and software status with OpenVINO priority
    """
    status = {
        "hardware_detected": False,
        "intel_extension_available": False,
        "xpu_available": False,
        "openvino_available": False,  # NEW
        "openvino_gpu_available": False,  # NEW
        "device_count": 0,
        "acceleration_priority": [],  # NEW
        "recommendations": []
    }
    
    # Check OpenVINO first (Priority 1)
    if AIDE_OPENVINO_AVAILABLE:
        status["openvino_available"] = True
        status["acceleration_priority"].append("OpenVINO (Priority)")
        
        try:
            openvino_backend, success = create_openvino_backend()
            if success and openvino_backend:
                backend_info = openvino_backend.get_backend_info()
                if backend_info.get("arc_optimized", False):
                    status["hardware_detected"] = True
                    status["openvino_gpu_available"] = True
                    status["acceleration_priority"] = ["OpenVINO Intel Arc A770 (BEAST MODE)"] + status["acceleration_priority"]
                elif "GPU" in backend_info.get("device", ""):
                    status["openvino_gpu_available"] = True
        except Exception as e:
            status["recommendations"].append(f"OpenVINO backend creation failed: {e}")
    else:
        status["recommendations"].append("Install OpenVINO: pip install openvino openvino-genai")
    
    # Check PyTorch XPU (Priority 2)  
    try:
        import torch
        import intel_extension_for_pytorch as ipex
        
        status["intel_extension_available"] = True
        
        if hasattr(torch, 'xpu') and torch.xpu.is_available():
            status["xpu_available"] = True
            status["device_count"] = torch.xpu.device_count()
            
            if not status["hardware_detected"]:  # Only set if OpenVINO didn't already detect
                status["hardware_detected"] = True
            
            status["acceleration_priority"].append("PyTorch XPU (Intel Arc A770)")
            
            if status["device_count"] > 0:
                # Get device info
                device_info = []
                for i in range(status["device_count"]):
                    try:
                        device_props = torch.xpu.get_device_properties(i)
                        device_info.append({
                            "device_id": i,
                            "name": getattr(device_props, 'name', 'Intel XPU Device'),
                            "total_memory": getattr(device_props, 'total_memory', 'Unknown')
                        })
                    except:
                        device_info.append({"device_id": i, "name": "Intel XPU Device", "total_memory": "Unknown"})
                status["devices"] = device_info
            else:
                status["recommendations"].append("Intel XPU not detected - check Intel Arc drivers")
        else:
            status["recommendations"].append("Intel XPU not available - check drivers and installation")
    
    except ImportError:
        status["recommendations"].append("Install Intel Extension for PyTorch: pip install intel_extension_for_pytorch")
    except Exception as e:
        status["recommendations"].append(f"Intel Arc detection error: {e}")
    
    # Add other acceleration options
    if torch.cuda.is_available():
        status["acceleration_priority"].append("CUDA GPU")
    
    status["acceleration_priority"].append("CPU (94GB RAM BEAST MODE)")
    
    return status

if __name__ == "__main__":
    # ENHANCED test with OpenVINO + Intel Arc A770 compatibility analysis
    print("🔍 AIDE ULTIMATE Enhanced Dynamic Model Discovery & OpenVINO + Intel Arc A770 Test")
    print("=" * 90)
    print(f"📁 Models directory: {MODELS_DIR}")
    print(f"📁 Directory exists: {MODELS_DIR.exists()}")
    
    # Check ENHANCED Intel Arc A770 + OpenVINO status
    print(f"\n🎮 ULTIMATE Hardware Status (OpenVINO Priority):")
    arc_status = check_intel_arc_status()
    print(f"  Hardware detected: {'✅' if arc_status['hardware_detected'] else '❌'}")
    print(f"  OpenVINO available: {'✅' if arc_status['openvino_available'] else '❌'}")
    print(f"  OpenVINO GPU ready: {'✅' if arc_status['openvino_gpu_available'] else '❌'}")
    print(f"  Intel Extension available: {'✅' if arc_status['intel_extension_available'] else '❌'}")
    print(f"  XPU available: {'✅' if arc_status['xpu_available'] else '❌'}")
    print(f"  Device count: {arc_status['device_count']}")
    
    print(f"  🚀 Acceleration Priority Order:")
    for i, accel in enumerate(arc_status['acceleration_priority'], 1):
        print(f"    {i}. {accel}")
    
    if arc_status.get('devices'):
        for device in arc_status['devices']:
            print(f"    Device {device['device_id']}: {device['name']}")
    
    if arc_status['recommendations']:
        print(f"  💡 Recommendations:")
        for rec in arc_status['recommendations']:
            print(f"    - {rec}")
    
    models = list_available_models()
    print(f"\n🤖 Available models: {models}")
    
    if models:
        for model in models:
            print(f"\n📊 Model: {model}")
            
            # Validate model with ENHANCED compatibility checks
            validation = validate_model(model)
            print(f"  Valid: {'✅' if validation['is_valid'] else '❌'}")
            print(f"  Tokenizer: {validation['tokenizer_compatibility']}")
            print(f"  Intel Arc Ready: {'✅' if validation['intel_arc_ready'] else '❌'}")
            print(f"  OpenVINO Ready: {'✅' if validation['openvino_ready'] else '❌'}")
            print(f"  Acceleration Ready: {'✅' if validation['acceleration_ready'] else '❌'}")
            
            if validation.get('acceleration_note'):
                print(f"  🚀 {validation['acceleration_note']}")
            
            if validation['errors']:
                print(f"  Errors: {validation['errors']}")
            
            # Get detailed info if valid
            if validation['is_valid']:
                info = get_model_info(model)
                if info:
                    print(f"  Size: {info['size_gb']} GB")
                    print(f"  Architecture: {info.get('architecture', 'unknown')}")
                    print(f"  Config format: {info.get('config_format', 'unknown')}")
                    print(f"  Vision capable: {'✅' if info.get('has_vision_capability') else '❌'}")
                    print(f"  Files: {len(info['files'])} files")
                    print(f"  🎮 Acceleration options: {', '.join(info.get('acceleration_options', []))}")
    
    # ENHANCED system summary with OpenVINO analysis
    summary = discover_and_validate_models()
    print(f"\n🎯 ULTIMATE System Summary:")
    print(f"  Total models found: {summary['total_models']}")
    print(f"  Valid models: {len(summary['valid_models'])}")
    print(f"  Invalid models: {len(summary['invalid_models'])}")
    print(f"  Models with tokenizer issues: {len(summary['tokenizer_issues'])}")
    print(f"  Intel Arc A770 ready models: {len(summary['intel_arc_ready'])}")
    print(f"  OpenVINO ready models: {len(summary['openvino_ready'])}")
    print(f"  Total acceleration ready: {len(summary['acceleration_ready'])}")
    print(f"  Hardware optimization: {summary['hardware_optimization']}")
    print(f"  🚀 Available backends: {', '.join(summary['acceleration_backends'])}")
    
    if summary['valid_models']:
        print(f"\n✅ Ready to load with ULTIMATE acceleration:")
        for model in summary['valid_models']:
            # Priority indicators
            if model['openvino_ready']:
                accel_indicator = "🚀🎮"  # OpenVINO + Arc = Ultimate  
            elif model['intel_arc_ready']:
                accel_indicator = "🎮"    # Arc ready
            else:
                accel_indicator = "💻"    # CPU only
                
            print(f"  {accel_indicator} {model['name']} ({model['size_gb']} GB, {model['architecture']}, {model['tokenizer_type']})")
            if model.get('acceleration_options'):
                print(f"      Options: {', '.join(model['acceleration_options'])}")
    
    if summary['openvino_ready']:
        print(f"\n🚀 BEAST MODE: Models optimized for OpenVINO + Intel Arc A770:")
        for model_name in summary['openvino_ready']:
            print(f"    - {model_name}")
    
    if summary['intel_arc_ready']:
        print(f"\n🎮 Models ready for Intel Arc A770 acceleration:")
        for model_name in summary['intel_arc_ready']:
            print(f"    - {model_name}")
