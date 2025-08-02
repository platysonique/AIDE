# File: src/backend/core/config.py

import os
import yaml
from pathlib import Path
from typing import Dict, List, Any, Optional

class AIDEConfig:
    """Centralized configuration management for AIDE backend"""
    
    def __init__(self, config_path: Optional[Path] = None):
        if config_path is None:
            config_path = Path(__file__).parent.parent / "config.yaml"
        
        self.config_path = config_path
        self._config: Dict[str, Any] = {}
        self._load_config()
    
    def _load_config(self):
        """Load configuration from YAML file with defaults"""
        try:
            if self.config_path.exists():
                with open(self.config_path, "r") as f:
                    self._config = yaml.safe_load(f) or {}
                print(f"✅ Config loaded from {self.config_path}")
            else:
                print(f"⚠️ Config file not found at {self.config_path}, using defaults")
                self._config = {}
        except Exception as e:
            print(f"⚠️ Config loading failed: {e}, using defaults")
            self._config = {}
        
        # Apply defaults
        self._apply_defaults()
    
    def _apply_defaults(self):
        """Apply default values for missing configuration"""
        defaults = {
            "api_keys": {},
            "fallback_order": ["duckduckgo", "wikipedia"],
            "online_search": "duckduckgo",
            "host": "127.0.0.1",
            "port": 8000,
            "model": None,
            "memory": {
                "vector_store": "faiss",
                "embedding_model": "all-MiniLM-L6-v2",
                "max_entries": 10000,
                "similarity_threshold": 0.3
            },
            "speech": {
                "stt_model": "base",
                "tts_engine": "pyttsx3",
                "sample_rate": 16000
            },
            "tools": {
                "auto_load": True,
                "directory": "tools"
            }
        }
        
        for key, value in defaults.items():
            if key not in self._config:
                self._config[key] = value
            elif isinstance(value, dict) and isinstance(self._config[key], dict):
                # Merge nested dictionaries
                for nested_key, nested_value in value.items():
                    if nested_key not in self._config[key]:
                        self._config[key][nested_key] = nested_value
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value with dot notation support"""
        keys = key.split('.')
        value = self._config
        
        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default
        
        return value
    
    def set(self, key: str, value: Any) -> None:
        """Set configuration value with dot notation support"""
        keys = key.split('.')
        config = self._config
        
        for k in keys[:-1]:
            if k not in config:
                config[k] = {}
            config = config[k]
        
        config[keys[-1]] = value
    
    def save(self) -> None:
        """Save current configuration to file"""
        try:
            with open(self.config_path, "w") as f:
                yaml.dump(self._config, f, indent=2)
            print(f"✅ Config saved to {self.config_path}")
        except Exception as e:
            print(f"⚠️ Config save failed: {e}")
    
    @property
    def api_keys(self) -> Dict[str, str]:
        return self.get("api_keys", {})
    
    @property
    def fallback_order(self) -> List[str]:
        return self.get("fallback_order", ["duckduckgo", "wikipedia"])
    
    @property
    def providers(self) -> List[str]:
        return [self.get("online_search", "duckduckgo")] + self.fallback_order
    
    @property
    def host(self) -> str:
        return os.getenv("AIDE_HOST", self.get("host", "127.0.0.1"))
    
    @property
    def port(self) -> int:
        return int(os.getenv("AIDE_PORT", self.get("port", 8000)))
    
    @property
    def current_model(self) -> Optional[str]:
        return self.get("model")
    
    @current_model.setter
    def current_model(self, value: str):
        self.set("model", value)
    
    def get_memory_config(self) -> Dict[str, Any]:
        return self.get("memory", {})
    
    def get_speech_config(self) -> Dict[str, Any]:
        return self.get("speech", {})
    
    def get_tools_config(self) -> Dict[str, Any]:
        return self.get("tools", {})

# Global config instance
config = AIDEConfig()