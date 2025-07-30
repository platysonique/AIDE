# File: src/backend/tools/__init__.py
from ..api import tool_registry

def tool(name: str, desc: str = "", schema: dict = None):
    def wrapper(fn):
        tool_registry.register(name, fn, desc, schema)
        return fn
    return wrapper
