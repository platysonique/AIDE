# File: src/backend/core/vector_memory.py

import numpy as np
import json
import pickle
import hashlib
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime

try:
    import faiss
    FAISS_AVAILABLE = True
except ImportError:
    FAISS_AVAILABLE = False
    print("⚠️ FAISS not available - install with: pip install faiss-cpu")

try:
    from sentence_transformers import SentenceTransformer
    SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    SENTENCE_TRANSFORMERS_AVAILABLE = False
    print("⚠️ sentence-transformers not available - install with: pip install sentence-transformers")

from .logger import logger
from .config import config

class VectorMemoryStore:
    """Enhanced vector memory using FAISS for semantic search"""
    
    def __init__(self, memory_dir: Optional[Path] = None):
        if memory_dir is None:
            memory_dir = Path(__file__).parent.parent.parent.parent / "data" / "memory"
        
        self.memory_dir = memory_dir
        self.memory_dir.mkdir(parents=True, exist_ok=True)
        
        self.index_path = self.memory_dir / "memory_index.faiss"
        self.metadata_path = self.memory_dir / "memory_metadata.json"
        
        # Get configuration
        memory_config = config.get_memory_config()
        self.dimension = 384  # Default for all-MiniLM-L6-v2
        self.max_entries = memory_config.get("max_entries", 10000)
        self.similarity_threshold = memory_config.get("similarity_threshold", 0.3)
        
        self.index = None
        self.metadata = {}
        self.next_id = 0
        
        self._init_embedder()
        self._load_or_create_index()
    
    def _init_embedder(self):
        """Initialize sentence transformer for embeddings"""
        if not SENTENCE_TRANSFORMERS_AVAILABLE:
            logger.warning("Sentence transformers not available - using fallback embeddings")
            self.embedder = None
            return
        
        try:
            model_name = config.get("memory.embedding_model", "all-MiniLM-L6-v2")
            self.embedder = SentenceTransformer(model_name)
            self.dimension = self.embedder.get_sentence_embedding_dimension()
            logger.info(f"✅ Sentence transformer loaded: {model_name} (dim: {self.dimension})")
        except Exception as e:
            logger.error(f"Failed to load sentence transformer: {e}")
            self.embedder = None
    
    def _load_or_create_index(self):
        """Load existing index or create new one"""
        if not FAISS_AVAILABLE:
            logger.warning("FAISS not available - memory will use fallback storage")
            self.metadata = self._load_fallback_metadata()
            return
        
        if self.index_path.exists() and self.metadata_path.exists():
            try:
                self.index = faiss.read_index(str(self.index_path))
                with open(self.metadata_path, 'r') as f:
                    self.metadata = json.load(f)
                
                if self.metadata:
                    self.next_id = max(int(k) for k in self.metadata.keys()) + 1
                
                logger.info(f"✅ Loaded memory index with {len(self.metadata)} entries")
            except Exception as e:
                logger.error(f"Failed to load memory index: {e}")
                self._create_new_index()
        else:
            self._create_new_index()
    
    def _create_new_index(self):
        """Create new FAISS index"""
        if not FAISS_AVAILABLE:
            self.metadata = {}
            return
        
        # Use Inner Product for cosine similarity (vectors will be normalized)
        self.index = faiss.IndexFlatIP(self.dimension)
        self.metadata = {}
        self.next_id = 0
        logger.info("✅ Created new memory index")
    
    def _get_embedding(self, text: str) -> np.ndarray:
        """Get embedding for text"""
        if self.embedder:
            try:
                embedding = self.embedder.encode([text], normalize_embeddings=True)
                return embedding[0].astype(np.float32)
            except Exception as e:
                logger.error(f"Embedding generation failed: {e}")
        
        # Fallback: simple hash-based embedding
        hash_val = int(hashlib.md5(text.encode()).hexdigest()[:16], 16)
        embedding = np.random.RandomState(hash_val).rand(self.dimension).astype(np.float32)
        # Normalize fallback embedding
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm
        return embedding
    
    def save_memory(self, content: str, memory_type: str = "conversation", 
                   context: Optional[Dict[str, Any]] = None) -> str:
        """Save a memory entry with vector embedding"""
        memory_id = str(self.next_id)
        timestamp = datetime.now().isoformat()
        
        # Create metadata entry
        metadata_entry = {
            "content": content,
            "type": memory_type,
            "timestamp": timestamp,
            "context": context or {},
        }
        
        if FAISS_AVAILABLE and self.index is not None:
            # Create embedding and store in FAISS
            embedding = self._get_embedding(content)
            
            try:
                # Add to FAISS index
                self.index.add(embedding.reshape(1, -1))
                metadata_entry["faiss_index"] = self.index.ntotal - 1
                
                logger.debug(f"Added embedding to FAISS index at position {metadata_entry['faiss_index']}")
            except Exception as e:
                logger.error(f"Failed to add to FAISS index: {e}")
                # Continue without FAISS
        
        # Store metadata
        self.metadata[memory_id] = metadata_entry
        self.next_id += 1
        
        # Cleanup old entries if over limit
        if len(self.metadata) > self.max_entries:
            self._cleanup_old_entries()
        
        # Save to disk
        self._save_to_disk()
        
        logger.info(f"💾 Saved memory: {content[:50]}...")
        return memory_id
    
    def recall_memory(self, query: str, top_k: int = 5, 
                     threshold: Optional[float] = None) -> List[Dict[str, Any]]:
        """Recall memories using semantic similarity"""
        if threshold is None:
            threshold = self.similarity_threshold
        
        if not FAISS_AVAILABLE or self.index is None or self.index.ntotal == 0:
            # Fallback to simple text matching
            return self._fallback_recall(query, top_k)
        
        try:
            # Get query embedding
            query_embedding = self._get_embedding(query)
            
            # Search FAISS index
            scores, indices = self.index.search(query_embedding.reshape(1, -1), min(top_k, self.index.ntotal))
            
            results = []
            for score, idx in zip(scores[0], indices[0]):
                if score < threshold:
                    continue
                
                # Find metadata by FAISS index
                for mem_id, meta in self.metadata.items():
                    if meta.get("faiss_index") == idx:
                        results.append({
                            "id": mem_id,
                            "content": meta["content"],
                            "type": meta["type"],
                            "timestamp": meta["timestamp"],
                            "context": meta["context"],
                            "similarity": float(score)
                        })
                        break
            
            # Sort by similarity (higher is better for Inner Product)
            results.sort(key=lambda x: x["similarity"], reverse=True)
            
            logger.info(f"🔍 Recalled {len(results)} memories for: {query[:50]}...")
            return results
            
        except Exception as e:
            logger.error(f"Vector recall failed: {e}")
            return self._fallback_recall(query, top_k)
    
    def _fallback_recall(self, query: str, top_k: int) -> List[Dict[str, Any]]:
        """Fallback recall using simple text matching"""
        query_lower = query.lower()
        results = []
        
        for mem_id, meta in self.metadata.items():
            content_lower = meta["content"].lower()
            # Simple keyword matching
            matches = sum(1 for word in query_lower.split() if word in content_lower)
            if matches > 0:
                results.append({
                    "id": mem_id,
                    "content": meta["content"],
                    "type": meta["type"],
                    "timestamp": meta["timestamp"],
                    "context": meta["context"],
                    "similarity": matches / len(query_lower.split())  # Simple relevance score
                })
        
        # Sort by relevance
        results.sort(key=lambda x: x["similarity"], reverse=True)
        return results[:top_k]
    
    def _cleanup_old_entries(self):
        """Remove oldest entries when over limit"""
        if len(self.metadata) <= self.max_entries:
            return
        
        # Sort by timestamp and remove oldest
        sorted_entries = sorted(
            self.metadata.items(),
            key=lambda x: x[1]["timestamp"]
        )
        
        entries_to_remove = len(self.metadata) - self.max_entries
        for i in range(entries_to_remove):
            mem_id = sorted_entries[i][0]
            del self.metadata[mem_id]
        
        # Note: FAISS index cleanup would require rebuilding the entire index
        # For now, we keep the embeddings but remove metadata
        logger.info(f"🧹 Cleaned up {entries_to_remove} old memory entries")
    
    def _save_to_disk(self):
        """Save index and metadata to disk"""
        try:
            if FAISS_AVAILABLE and self.index is not None:
                faiss.write_index(self.index, str(self.index_path))
            
            with open(self.metadata_path, 'w') as f:
                json.dump(self.metadata, f, indent=2)
                
        except Exception as e:
            logger.error(f"Failed to save memory to disk: {e}")
    
    def _load_fallback_metadata(self) -> Dict[str, Any]:
        """Load metadata when FAISS is not available"""
        if self.metadata_path.exists():
            try:
                with open(self.metadata_path, 'r') as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Failed to load fallback metadata: {e}")
        return {}
    
    def clear_all(self):
        """Clear all memories"""
        self.metadata = {}
        self.next_id = 0
        
        if FAISS_AVAILABLE:
            self.index = faiss.IndexFlatIP(self.dimension)
        
        # Remove files
        try:
            if self.index_path.exists():
                self.index_path.unlink()
            if self.metadata_path.exists():
                self.metadata_path.unlink()
        except Exception as e:
            logger.error(f"Failed to remove memory files: {e}")
        
        logger.info("🗑️ Cleared all memories")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get memory store statistics"""
        return {
            "total_entries": len(self.metadata),
            "faiss_available": FAISS_AVAILABLE,
            "embedder_available": SENTENCE_TRANSFORMERS_AVAILABLE,
            "index_size": self.index.ntotal if FAISS_AVAILABLE and self.index else 0,
            "dimension": self.dimension,
            "max_entries": self.max_entries
        }

# Global memory store instance
memory_store = VectorMemoryStore()

# Convenience functions
def save_memory(content: str, memory_type: str = "conversation", 
               context: Optional[Dict[str, Any]] = None) -> str:
    """Save memory entry"""
    return memory_store.save_memory(content, memory_type, context)

def recall_memory(query: str, top_k: int = 3) -> List[Dict[str, Any]]:
    """Recall relevant memories"""
    return memory_store.recall_memory(query, top_k)

def clear_memory():
    """Clear all memories"""
    return memory_store.clear_all()

def get_memory_stats() -> Dict[str, Any]:
    """Get memory statistics"""
    return memory_store.get_stats()