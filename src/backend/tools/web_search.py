# File: src/backend/tools/web_search.py
from backend.api import tool, hybrid_online_search


@tool("online_search", "Search the web using existing search providers", {"query": "string"})
def online_search(query: str):
    """Perform web search using the existing hybrid search system"""
    try:
        result = hybrid_online_search(query)
        return result
    except Exception as e:
        return {"error": f"Search failed: {str(e)}"}
