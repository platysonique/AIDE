import os
import functools
from transformers import AutoModelForCausalLM, AutoTokenizer

# Path to models directory
MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "models")

@functools.lru_cache(maxsize=1)
def load_model(model_name: str):
    """Load a model and tokenizer from the models directory."""
    model_path = os.path.join(MODELS_DIR, model_name)
    
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model {model_name} not found in {model_path}")
    
    print(f"Loading model from {model_path}...")
    
    tokenizer = AutoTokenizer.from_pretrained(
        model_path, 
        trust_remote_code=True
    )
    
    model = AutoModelForCausalLM.from_pretrained(
        model_path,
        device_map="auto",
        torch_dtype="auto", 
        trust_remote_code=True,
        low_cpu_mem_usage=True
    )
    
    print(f"Model {model_name} loaded successfully!")
    return tokenizer, model

def list_available_models():
    """List all available models in the models directory."""
    if not os.path.exists(MODELS_DIR):
        return []
    
    models = []
    for item in os.listdir(MODELS_DIR):
        model_path = os.path.join(MODELS_DIR, item)
        if os.path.isdir(model_path) and item not in ['.gitkeep', '__pycache__']:
            models.append(item)
    
    return sorted(models)
