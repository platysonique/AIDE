# File: src/backend/core/logger.py

import logging
import sys
from pathlib import Path
from typing import Optional
from datetime import datetime

class AIDELogger:
    """Centralized logging system for AIDE backend"""
    
    def __init__(self, name: str = "AIDE", log_level: str = "INFO", log_file: Optional[Path] = None):
        self.name = name
        self.logger = logging.getLogger(name)
        
        # Prevent duplicate handlers
        if self.logger.handlers:
            return
        
        # Set log level
        level = getattr(logging, log_level.upper(), logging.INFO)
        self.logger.setLevel(level)
        
        # Create formatter
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(funcName)s:%(lineno)d - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        
        # Console handler
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(level)
        console_handler.setFormatter(formatter)
        self.logger.addHandler(console_handler)
        
        # File handler (optional)
        if log_file:
            try:
                log_file.parent.mkdir(parents=True, exist_ok=True)
                file_handler = logging.FileHandler(log_file)
                file_handler.setLevel(level)
                file_handler.setFormatter(formatter)
                self.logger.addHandler(file_handler)
                self.logger.info(f"Logging to file: {log_file}")
            except Exception as e:
                self.logger.warning(f"Failed to setup file logging: {e}")
    
    def info(self, message: str, *args, **kwargs):
        self.logger.info(message, *args, **kwargs)
    
    def debug(self, message: str, *args, **kwargs):
        self.logger.debug(message, *args, **kwargs)
    
    def warning(self, message: str, *args, **kwargs):
        self.logger.warning(message, *args, **kwargs)
    
    def error(self, message: str, *args, **kwargs):
        self.logger.error(message, *args, **kwargs)
    
    def critical(self, message: str, *args, **kwargs):
        self.logger.critical(message, *args, **kwargs)
    
    def exception(self, message: str, *args, **kwargs):
        self.logger.exception(message, *args, **kwargs)

# Create default logger
logger = AIDELogger()

# Export logger functions for easy import
info = logger.info
debug = logger.debug
warning = logger.warning
error = logger.error
critical = logger.critical
exception = logger.exception