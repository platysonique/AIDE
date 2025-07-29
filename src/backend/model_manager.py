# FILE: src/backend/model_manager.py - UPGRADED DYNAMIC MODEL MANAGEMENT

import os
import functools
import json
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

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

@functools.lru_cache(maxsize=1)
def load_model(model_name: str) -> Tuple[Any, Any]:
    """
    Load a model and tokenizer from the models directory
    UPGRADED for your Intel Arc A770 + 94GB RAM setup
    """
    if model_name == "root-model":
        model_path = MODELS_DIR
    else:
        model_path = MODELS_DIR / model_name
    
    if not model_path.exists():
        raise FileNotFoundError(f"Model '{model_name}' not found in {model_path}")
    
    print(f"🔄 Loading model '{model_name}' from {model_path}...")
    
    try:
        from transformers import AutoModelForCausalLM, AutoTokenizer
        
        # Load tokenizer with proper error handling
        tokenizer = AutoTokenizer.from_pretrained(
            str(model_path), 
            trust_remote_code=True
        )
        
        # Load model with optimal settings for your BEAST hardware
        model = AutoModelForCausalLM.from_pretrained(
            str(model_path),
            device_map="auto",  # Let transformers handle device placement
            torch_dtype="auto",  # Auto-detect optimal dtype  
            trust_remote_code=True,
            low_cpu_mem_usage=True,  # Perfect for your 94GB RAM
            # Enable flash attention if available for your Arc A770
            attn_implementation="flash_attention_2" if hasattr(AutoModelForCausalLM, 'flash_attention_2') else None
        )
        
        print(f"✅ Model '{model_name}' loaded successfully!")
        print(f"📊 Model device: {model.device if hasattr(model, 'device') else 'auto'}")
        print(f"🧠 Model memory footprint: ~{_estimate_model_size(model_path)} GB")
        
        return tokenizer, model
        
    except Exception as e:
        print(f"❌ Failed to load model '{model_name}': {e}")
        raise

def get_model_info(model_name: str) -> Optional[Dict[str, Any]]:
    """
    Get detailed information about a specific model
    NEW FUNCTION - provides rich model metadata
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
    
    # Try to read config (check both config.json and params.json for Pixtral support)
    for config_file in ['config.json', 'params.json']:
        config_path = model_path / config_file
        if config_path.exists():
            try:
                with open(config_path, 'r') as f:
                    config = json.load(f)
                    
                if config_file == 'params.json':
                    # Pixtral/Mistral format
                    info.update({
                        "architecture": "Pixtral-12B" if "pixtral" in model_name.lower() else "Mistral",
                        "vocab_size": config.get("vocab_size", "unknown"),
                        "dim": config.get("dim", "unknown"),
                        "config_format": "params.json"
                    })
                else:
                    # Standard HuggingFace format
                    info.update({
                        "architecture": config.get("architectures", ["unknown"])[0] if config.get("architectures") else "unknown",
                        "vocab_size": config.get("vocab_size", "unknown"), 
                        "hidden_size": config.get("hidden_size", "unknown"),
                        "config_format": "config.json"
                    })
                break
            except Exception as e:
                info["config_error"] = f"Failed to parse {config_file}: {str(e)}"
    
    return info

def _calculate_model_size(model_path: Path) -> float:
    """Calculate total size of model files in GB"""
    total_size = 0
    for file_path in model_path.rglob('*'):
        if file_path.is_file():
            total_size += file_path.stat().st_size
    return round(total_size / (1024**3), 2)  # Convert to GB

def _list_model_files(model_path: Path) -> List[str]:
    """List important model files"""
    important_extensions = ['.safetensors', '.bin', '.json', '.txt']
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
    NEW FUNCTION - checks model integrity
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
    
    # Check for tokenizer
    tokenizer_files = ['tokenizer.json', 'vocab.txt', 'tokenizer_config.json']
    has_tokenizer = any((model_path / f).exists() for f in tokenizer_files)
    validation["has_tokenizer"] = has_tokenizer
    
    if not has_tokenizer:
        validation["errors"].append("No tokenizer files found")
    
    validation["is_valid"] = (has_config and len(model_files) > 0 and has_tokenizer)
    
    return validation

# Utility function for startup model discovery
def discover_and_validate_models() -> Dict[str, Any]:
    """
    Discover all models and validate their integrity at startup
    NEW FUNCTION - gives you full system status
    """
    models = list_available_models()
    summary = {
        "total_models": len(models),
        "valid_models": [],
        "invalid_models": [],
        "discovery_time": "runtime",
        "models_directory": str(MODELS_DIR)
    }
    
    for model_name in models:
        validation = validate_model(model_name)
        if validation["is_valid"]:
            info = get_model_info(model_name)
            summary["valid_models"].append({
                "name": model_name,
                "size_gb": info["size_gb"] if info else 0,
                "architecture": info.get("architecture", "unknown") if info else "unknown"
            })
        else:
            summary["invalid_models"].append({
                "name": model_name,
                "errors": validation["errors"]
            })
    
    return summary

if __name__ == "__main__":
    # Test the upgraded model manager
    print("🔍 AIDE Dynamic Model Discovery & Validation Test")
    print("=" * 60)
    
    print(f"📁 Models directory: {MODELS_DIR}")
    print(f"📁 Directory exists: {MODELS_DIR.exists()}")
    
    models = list_available_models()
    print(f"🤖 Available models: {models}")
    
    if models:
        for model in models:
            print(f"\n📊 Model: {model}")
            
            # Validate model
            validation = validate_model(model)
            print(f"   Valid: {'✅' if validation['is_valid'] else '❌'}")
            if validation['errors']:
                print(f"   Errors: {validation['errors']}")
            
            # Get detailed info if valid
            if validation['is_valid']:
                info = get_model_info(model)
                if info:
                    print(f"   Size: {info['size_gb']} GB")
                    print(f"   Architecture: {info.get('architecture', 'unknown')}")
                    print(f"   Files: {len(info['files'])} files")
    
    # Full system summary
    summary = discover_and_validate_models()
    print(f"\n🎯 System Summary:")
    print(f"   Total models found: {summary['total_models']}")
    print(f"   Valid models: {len(summary['valid_models'])}")
    print(f"   Invalid models: {len(summary['invalid_models'])}")
    
    if summary['valid_models']:
        print(f"\n✅ Ready to load:")
        for model in summary['valid_models']:
            print(f"   - {model['name']} ({model['size_gb']} GB, {model['architecture']})")
