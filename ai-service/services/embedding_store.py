"""
embedding_store.py
Persists face embeddings to a local JSON file so they survive service restarts.
The Node.js backend also stores embeddings in MongoDB — this is a local cache.
"""

import os
import json
import numpy as np
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

STORE_PATH = Path(os.getenv("EMBEDDING_STORE_PATH", "./data/embeddings.json"))


class EmbeddingStore:
    """
    Thread-safe key-value store for face embeddings.
    Backed by a JSON file on disk for persistence across restarts.
    """

    def __init__(self):
        self._db: dict[str, list[float]] = {}
        self._load()

    # ── Persistence ────────────────────────────────────────────────────────────

    def _load(self):
        STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
        if STORE_PATH.exists():
            try:
                with open(STORE_PATH, "r") as f:
                    self._db = json.load(f)
                logger.info(f"Loaded {len(self._db)} embeddings from {STORE_PATH}")
            except Exception as e:
                logger.error(f"Failed to load embeddings: {e}")
                self._db = {}

    def _save(self):
        try:
            with open(STORE_PATH, "w") as f:
                json.dump(self._db, f)
        except Exception as e:
            logger.error(f"Failed to save embeddings: {e}")

    # ── CRUD ───────────────────────────────────────────────────────────────────

    def set(self, user_id: str, embedding: np.ndarray):
        self._db[user_id] = embedding.tolist()
        self._save()

    def get(self, user_id: str) -> np.ndarray | None:
        vec = self._db.get(user_id)
        if vec is None:
            return None
        return np.array(vec, dtype=np.float32)

    def get_raw(self, user_id: str) -> list[float] | None:
        return self._db.get(user_id)

    def delete(self, user_id: str):
        self._db.pop(user_id, None)
        self._save()

    def exists(self, user_id: str) -> bool:
        return user_id in self._db

    def all_ids(self) -> list[str]:
        return list(self._db.keys())

    def count(self) -> int:
        return len(self._db)


# Singleton instance used by main.py and face_recognizer.py
embedding_store = EmbeddingStore()
