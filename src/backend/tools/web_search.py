# File: src/backend/tools/web_search.py

@tool("online_search", "Search the web using existing search providers", {"query": "string"})
def online_search(query: str):
    """Perform web search using the existing hybrid search system"""
    try:
        # Import inside the function to avoid import issues
        from ..api import hybrid_online_search
        result = hybrid_online_search(query)
        return result
    except Exception as e:
        return {"error": f"Search failed: {str(e)}"}
