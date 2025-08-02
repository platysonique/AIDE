"""
AIDE Backend Initialization
Handles numpy seed validation to prevent 2**32-1 errors
"""

import numpy as _np
import time
import os
import logging

# Set up logging for seed debugging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def _safe_seed(seed_value):
    """
    Ensures seed values are within numpy's acceptable range [0, 2**32-1]
    """
    if seed_value is None:
        # Use process ID + timestamp for uniqueness
        seed_value = (os.getpid() + int(time.time())) % (2**32 - 1)
    
    try:
        seed_value = int(seed_value)
    except (ValueError, TypeError):
        # Fallback to timestamp if conversion fails
        seed_value = int(time.time()) % (2**32 - 1)
    
    # Clamp to valid range
    if seed_value < 0:
        seed_value = abs(seed_value) % (2**32 - 1)
    elif seed_value >= 2**32:
        seed_value = seed_value % (2**32 - 1)
    
    return seed_value

# Monkey-patch numpy's legacy seed function
_original_np_seed = _np.random.seed

def _patched_seed(seed=None):
    """Patched numpy.random.seed that validates input"""
    safe_seed_val = _safe_seed(seed)
    logger.debug(f"Numpy seed sanitized: {seed} -> {safe_seed_val}")
    return _original_np_seed(safe_seed_val)

# Apply the patch
_np.random.seed = _patched_seed

# Initialize with a safe seed immediately
_np.random.seed(_safe_seed(None))

logger.info("AIDE Backend initialized with numpy seed validation")

# Export the safe_seed function for use in other modules
__all__ = ['_safe_seed']
