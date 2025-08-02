# File: src/backend/core/device_detection.py

import torch
import platform
import subprocess
from typing import Dict, Any, Optional, Tuple
from .logger import logger

# Backend imports with availability checking
try:
    from ..llamacpp_backend import create_llamacpp_backend
    LLAMACPP_AVAILABLE = True
except ImportError:
    LLAMACPP_AVAILABLE = False
    logger.warning("llama.cpp backend not available")

try:
    from ..openvino_backend import create_openvino_backend
    import openvino as ov
    OPENVINO_AVAILABLE = True
except ImportError:
    OPENVINO_AVAILABLE = False
    logger.warning("OpenVINO backend not available")

def detect_optimal_device() -> Dict[str, Any]:
    """
    ENHANCED device detection with llamacpp + OpenVINO priority
    Extracted from monolithic api.py
    """
    device_config = {
        "backend": "cpu",
        "device": "cpu", 
        "use_llamacpp": False,
        "use_openvino": False,
        "llamacpp_backend": None,
        "openvino_backend": None,
        "pytorch_device": "cpu",
        "hardware_info": {},
        "recommendations": []
    }

    # Get basic hardware info
    device_config["hardware_info"] = _get_hardware_info()

    # PRIORITY 1: Try llama.cpp first - Best for GGUF models
    if LLAMACPP_AVAILABLE:
        try:
            logger.info("🔍 Attempting llama.cpp backend detection...")
            llamacpp_backend, success = create_llamacpp_backend()
            if success and llamacpp_backend:
                backend_info = llamacpp_backend.get_backend_info()
                logger.info(f"🚀 llama.cpp backend info: {backend_info}")
                
                if backend_info.get("arc_optimized", False):
                    logger.info("🎮 BEAST MODE: Intel Arc A770 + llama.cpp detected!")
                    device_config.update({
                        "backend": "llamacpp",
                        "device": "arc_a770_llamacpp",
                        "use_llamacpp": True,
                        "llamacpp_backend": llamacpp_backend
                    })
                else:
                    logger.info("🚀 Using llama.cpp CPU optimization")
                    device_config.update({
                        "backend": "llamacpp",
                        "device": "cpu_llamacpp", 
                        "use_llamacpp": True,
                        "llamacpp_backend": llamacpp_backend
                    })
                return device_config
        except Exception as e:
            logger.error(f"llama.cpp detection failed: {e}")

    # PRIORITY 2: OpenVINO with Intel Arc A770
    if OPENVINO_AVAILABLE:
        try:
            backend, success = create_openvino_backend()
            if success and backend:
                backend_info = backend.get_backend_info()
                if backend_info.get("arc_optimized", False):
                    logger.info("🎮 BEAST MODE: OpenVINO + Intel Arc A770 detected!")
                    device_config.update({
                        "backend": "openvino",
                        "device": "arc_a770",
                        "use_openvino": True,
                        "openvino_backend": backend
                    })
                    return device_config
        except Exception as e:
            logger.error(f"OpenVINO backend creation failed: {e}")

    # PRIORITY 3: PyTorch XPU (Intel Arc fallback)  
    try:
        import intel_extension_for_pytorch as ipex
        if hasattr(torch, 'xpu') and torch.xpu.is_available():
            device_count = torch.xpu.device_count()
            if device_count > 0:
                logger.info(f"🎮 PyTorch XPU detected: {device_count} device(s)")
                device_config.update({
                    "backend": "pytorch_xpu",
                    "device": "xpu",
                    "pytorch_device": "xpu:0"
                })
                return device_config
    except Exception as e:
        logger.debug(f"PyTorch XPU detection failed: {e}")

    # PRIORITY 4: CUDA fallback
    try:
        if torch.cuda.is_available():
            logger.info("🔥 CUDA GPU detected")
            device_config.update({
                "backend": "pytorch_cuda",
                "device": "cuda",
                "pytorch_device": "cuda:0"
            })
            return device_config
    except Exception as e:
        logger.debug(f"CUDA detection failed: {e}")

    # FINAL FALLBACK: CPU
    logger.info("💻 Using CPU mode")
    device_config["recommendations"] = _get_hardware_recommendations(device_config["hardware_info"])
    return device_config

def _get_hardware_info() -> Dict[str, Any]:
    """Get detailed hardware information"""
    info = {
        "platform": platform.platform(),
        "processor": platform.processor(),
        "machine": platform.machine(),
        "python_version": platform.python_version(),
        "torch_version": torch.__version__ if torch else "N/A",
        "cuda_available": False,
        "cuda_version": "N/A",
        "gpu_devices": []
    }

    # CUDA info
    try:
        if torch.cuda.is_available():
            info["cuda_available"] = True
            info["cuda_version"] = torch.version.cuda
            
            for i in range(torch.cuda.device_count()):
                gpu_info = {
                    "id": i,
                    "name": torch.cuda.get_device_name(i),
                    "memory": torch.cuda.get_device_properties(i).total_memory // (1024**3)  # GB
                }
                info["gpu_devices"].append(gpu_info)
    except Exception as e:
        logger.debug(f"CUDA info gathering failed: {e}")

    # Intel GPU info
    try:
        if hasattr(torch, 'xpu') and torch.xpu.is_available():
            for i in range(torch.xpu.device_count()):
                try:
                    device_props = torch.xpu.get_device_properties(i)
                    gpu_info = {
                        "id": f"xpu:{i}",
                        "name": getattr(device_props, 'name', 'Intel XPU'),
                        "type": "Intel XPU"
                    }
                    info["gpu_devices"].append(gpu_info)
                except Exception as prop_error:
                    logger.debug(f"XPU device {i} properties failed: {prop_error}")
    except Exception as e:
        logger.debug(f"Intel GPU info gathering failed: {e}")

    # System memory
    try:
        import psutil
        memory = psutil.virtual_memory()
        info["system_memory_gb"] = memory.total // (1024**3)
        info["available_memory_gb"] = memory.available // (1024**3)
    except ImportError:
        logger.debug("psutil not available for memory info")

    return info

def _get_hardware_recommendations(hardware_info: Dict[str, Any]) -> list:
    """Generate hardware-specific recommendations"""
    recommendations = []

    # Check for Intel Arc
    gpu_devices = hardware_info.get("gpu_devices", [])
    has_intel_gpu = any("intel" in gpu.get("name", "").lower() for gpu in gpu_devices)
    
    if not has_intel_gpu:
        recommendations.extend([
            "Consider Intel Arc A770 for optimal AIDE performance",
            "Install Intel GPU drivers for hardware acceleration"
        ])

    # Check CUDA
    if not hardware_info.get("cuda_available", False):
        recommendations.append("Install CUDA toolkit for GPU acceleration")

    # Check memory
    system_memory = hardware_info.get("system_memory_gb", 0)
    if system_memory < 16:
        recommendations.append("Consider upgrading to 16GB+ RAM for better model performance")
    elif system_memory < 32:
        recommendations.append("32GB+ RAM recommended for large models")

    # Backend recommendations
    if not LLAMACPP_AVAILABLE:
        recommendations.append("Install llama.cpp for optimal GGUF model performance")

    if not OPENVINO_AVAILABLE:
        recommendations.append("Install OpenVINO for Intel hardware optimization")

    return recommendations

def check_intel_arc_availability() -> Dict[str, Any]:
    """
    ENHANCED Intel Arc A770 detection
    Extracted from monolithic api.py
    """
    status = {
        "hardware_detected": False,
        "xpu_available": False,
        "openvino_available": False,
        "llamacpp_available": False,
        "device_count": 0,
        "status_message": "",
        "recommendations": [],
        "backends_available": [],
        "detailed_info": {}
    }

    # Get hardware info
    hardware_info = _get_hardware_info()
    status["detailed_info"] = hardware_info

    # Check llama.cpp first
    if LLAMACPP_AVAILABLE:
        try:
            llamacpp_backend, success = create_llamacpp_backend()
            if success and llamacpp_backend:
                backend_info = llamacpp_backend.get_backend_info()
                if backend_info.get("arc_optimized", False):
                    status.update({
                        "hardware_detected": True,
                        "llamacpp_available": True,
                        "status_message": f"Intel Arc A770 detected via llama.cpp: {backend_info.get('device_name', 'Arc GPU')}",
                        "backends_available": ["llama.cpp (Arc A770 optimized)"]
                    })
                    return status
                else:
                    status["llamacpp_available"] = True
                    status["backends_available"].append("llama.cpp (CPU optimized)")
        except Exception as e:
            logger.debug(f"llama.cpp detection failed: {e}")

    # Check OpenVINO
    if OPENVINO_AVAILABLE:
        try:
            backend, success = create_openvino_backend()
            if success and backend:
                backend_info = backend.get_backend_info()
                if backend_info.get("arc_optimized", False):
                    status.update({
                        "hardware_detected": True,
                        "openvino_available": True,
                        "status_message": f"Intel Arc A770 detected via OpenVINO: {backend_info.get('device_name', 'Unknown')}",
                        "backends_available": ["OpenVINO (Arc A770 optimized)"]
                    })
                    return status
                elif "GPU" in backend_info.get("device", ""):
                    status.update({
                        "openvino_available": True,
                        "status_message": f"GPU detected via OpenVINO: {backend_info.get('device_name', 'Unknown GPU')}",
                        "backends_available": ["OpenVINO (GPU)"]
                    })
        except Exception as e:
            logger.debug(f"OpenVINO detection failed: {e}")

    # Check PyTorch XPU
    try:
        import intel_extension_for_pytorch as ipex
        
        if hasattr(torch, 'xpu') and torch.xpu.is_available():
            device_count = torch.xpu.device_count()
            if device_count > 0:
                status.update({
                    "hardware_detected": True,
                    "xpu_available": True,
                    "device_count": device_count,
                    "status_message": f"Intel Arc A770 detected with {device_count} XPU device(s)"
                })
                status["backends_available"].append("PyTorch XPU")
                return status
            else:
                status["status_message"] = "XPU available but no devices found"
                status["recommendations"].append("Check Intel Arc A770 drivers")
        else:
            status["status_message"] = "XPU not available - drivers may not be loaded"
            status["recommendations"].extend([
                "Install/update Intel Arc drivers",
                "Check if intel-level-zero and intel-opencl-icd are installed"
            ])

    except ImportError:
        status["status_message"] = "Intel Extension for PyTorch not installed"
        status["recommendations"].append("Install: pip install intel_extension_for_pytorch")
        status["backends_available"].append("CPU only")

    except Exception as e:
        status["status_message"] = f"Intel Arc detection error: {e}"
        status["recommendations"].append("Check Intel Arc A770 installation and drivers")

    # Add general recommendations
    if not status["hardware_detected"]:
        status["recommendations"].extend(_get_hardware_recommendations(hardware_info))

    return status

def get_device_capabilities() -> Dict[str, Any]:
    """Get comprehensive device capabilities"""
    device_config = detect_optimal_device()
    arc_status = check_intel_arc_availability()
    
    return {
        "optimal_config": device_config,
        "intel_arc_status": arc_status,
        "available_backends": {
            "llamacpp": LLAMACPP_AVAILABLE,
            "openvino": OPENVINO_AVAILABLE,
            "pytorch_xpu": hasattr(torch, 'xpu') and torch.xpu.is_available() if torch else False,
            "pytorch_cuda": torch.cuda.is_available() if torch else False
        },
        "recommendations": device_config.get("recommendations", [])
    }