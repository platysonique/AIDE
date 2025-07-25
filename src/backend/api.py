from fastapi import FastAPI, Request
import uvicorn
import os
import requests
import yaml

from code_review import review_code, batch_fix
from debug_guide import surface_errors, debug_step
from memory import save_memory, recall_memory, manage_privacy

# --- Load Config ---
with open(os.path.join(os.path.dirname(__file__), "config.yaml"), "r") as f:
    config = yaml.safe_load(f)

api_keys = config.get("api_keys", {})
fallback_order = config.get("fallback_order", [])
providers = [config.get("online_search")] + (fallback_order or [])

# --- Search Provider Functions ---

def search_perplexity(query):
    url = "https://api.perplexity.ai/search"
    headers = {"Authorization": f"Bearer {api_keys.get('perplexity_api_key', '')}"}
    resp = requests.post(url, json={"q": query}, headers=headers, timeout=10)
    resp.raise_for_status()
    return resp.json()["answer"]

def search_searxng(query):
    endpoint = config.get("searxng_endpoint", "")
    url = f"{endpoint}/search?q={query}&format=json"
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    results = resp.json().get("results", [])
    snippet = results[0].get("snippet") if results else "No results."
    return snippet

def search_duckduckgo(query):
    url = f"https://api.duckduckgo.com/?q={query}&format=json"
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    answer = resp.json().get("AbstractText", "") or resp.json().get("Answer", "")
    return answer if answer else "No concise answer."

def search_wikipedia(query):
    url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={query}&format=json"
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    results = resp.json().get("query", {}).get("search", [])
    return results[0]["snippet"] if results else "No Wikipedia result found."

def search_wolframalpha(query):
    appid = config.get("wolframalpha_appid")
    url = f"https://api.wolframalpha.com/v1/result?appid={appid}&i={query}"
    resp = requests.get(url, timeout=10)
    if resp.status_code == 501:  # no short answer available
        return "WolframAlpha: (No result for your query.)"
    resp.raise_for_status()
    return resp.text

def search_open_meteo(query):
    # For simple weather queries, e.g., "weather Berlin"
    parts = query.lower().split("weather")
    loc = parts[-1].strip() if len(parts) > 1 else "Berlin"
    url = f"https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current_weather=true"  # Example for Berlin.
    resp = requests.get(url, timeout=10)
    if resp.status_code != 200:
        return "Open-Meteo: (Weather data not available.)"
    current = resp.json().get("current_weather", {})
    return f"Current Berlin weather: {current}" if current else "Weather not found."

PROVIDER_FUNCS = {
    "perplexity": search_perplexity,
    "searxng": search_searxng,
    "duckduckgo": search_duckduckgo,
    "wikipedia": search_wikipedia,
    "wolframalpha": search_wolframalpha,
    "open-meteo": search_open_meteo,
}

def hybrid_online_search(query):
    last_error = ""
    for provider in providers:
        func = PROVIDER_FUNCS.get(provider)
        try:
            if func:
                result = func(query)
                if result and "No result" not in result and "not available" not in result:
                    return {"provider": provider, "result": result}
        except Exception as e:
            last_error = f"{provider}: {str(e)}"
            continue
    return {"error": f"No provider returned a result. Last error: {last_error}"}

# --- FastAPI app ---

app = FastAPI(title="AIDE Backend with Agentic Features & Hybrid Search")

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/review-code")
async def api_review_code(request: Request):
    data = await request.json()
    return review_code(data)

@app.post("/batch-fix")
async def api_batch_fix(request: Request):
    data = await request.json()
    return batch_fix(data)

@app.post("/debug-guide")
async def api_debug_guide(request: Request):
    data = await request.json()
    return surface_errors(data)

@app.post("/debug-step")
async def api_debug_step(request: Request):
    data = await request.json()
    return debug_step(data)

@app.post("/memory")
async def api_save_memory(request: Request):
    data = await request.json()
    return save_memory(data)

@app.get("/memory/recall")
async def api_recall_memory():
    return recall_memory()

@app.post("/memory/privacy")
async def api_manage_privacy(request: Request):
    data = await request.json()
    return manage_privacy(data)

@app.post("/online-search")
async def api_online_search(request: Request):
    payload = await request.json()
    query = payload.get("query", "")
    result = hybrid_online_search(query)
    return result

if __name__ == "__main__":
    uvicorn.run(app, host=config.get("host", "127.0.0.1"), port=int(config.get("port", 8000)))

