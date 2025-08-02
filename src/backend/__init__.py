"""
AIDE Backend Initialization - PERFORMANCE OPTIMIZED v2.1
Prevents duplicate service loading + startup performance fixes
"""

import numpy as _np
import time
import os
import logging
import threading
from concurrent import futures

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =============================================================================
# SINGLETON SERVICE PROTECTION - Prevent duplicate loading
# =============================================================================

_services_initialized = {}
_initialization_lock = threading.Lock()

def _singleton_service(service_name):
    """Decorator to ensure services only initialize once"""
    def decorator(func):
        def wrapper(*args, **kwargs):
            with _initialization_lock:
                if service_name not in _services_initialized:
                    logger.info(f"🔄 Initializing {service_name} (first time)")
                    result = func(*args, **kwargs)
                    _services_initialized[service_name] = result
                    logger.info(f"✅ {service_name} initialized successfully")
                    return result
                else:
                    logger.info(f"⚡ {service_name} already initialized - skipping")
                    return _services_initialized[service_name]
        return wrapper
    return decorator

# =============================================================================
# PERFORMANCE OPTIMIZATIONS
# =============================================================================

# 1. FAISS Optimization
os.environ["OMP_NUM_THREADS"] = "8"
os.environ["FAISS_ENABLE_GPU"] = "0"

# 2. Model Loading Optimization  
os.environ["LLAMA_CPP_NO_MMAP"] = "1"

# 3. Sentence Transformers Optimization
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

# 4. Prevent extension host crashes
os.environ["VSCODE_PREVENT_FOREIGN_INSPECT"] = "1"

def _safe_seed(seed_value):
    """Ensures seed values are within numpy's acceptable range [0, 2**32-1]"""
    if seed_value is None:
        seed_value = hash(time.time()) % (2**32 - 1)
    
    try:
        seed_value = int(seed_value)
    except (ValueError, TypeError):
        seed_value = int(time.time()) % (2**32 - 1)
    
    return abs(seed_value) % (2**32 - 1)

# Monkey-patch numpy seed function
_original_np_seed = _np.random.seed

def _patched_seed(seed=None):
    """FAST patched numpy.random.seed"""
    safe_seed_val = _safe_seed(seed)
    return _original_np_seed(safe_seed_val)

_np.random.seed = _patched_seed
_np.random.seed(_safe_seed(None))

# =============================================================================
# SERVICE INITIALIZATION HELPERS
# =============================================================================

@_singleton_service("whisper")
def _init_whisper():
    """Initialize Whisper only once"""
    try:
        from .services.speech_service import speech_service
        return speech_service._init_whisper()
    except ImportError:
        logger.warning("Speech service not available")
        return None

@_singleton_service("tts") 
def _init_tts():
    """Initialize TTS only once"""
    try:
        from .services.speech_service import speech_service
        return speech_service._init_tts()
    except ImportError:
        logger.warning("Speech service not available")
        return None

# Log successful optimization
logger.info("AIDE Backend initialized with PERFORMANCE OPTIMIZATIONS v2.1:")
logger.info(f"  ✅ NumPy seed validation: ACTIVE")
logger.info(f"  ✅ Duplicate service protection: ACTIVE") 
logger.info(f"  ✅ Startup performance: OPTIMIZED")

# Export functions
__all__ = ['_safe_seed', '_singleton_service', '_init_whisper', '_init_tts']
