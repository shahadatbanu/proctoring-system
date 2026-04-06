"""
FaceRecognizer — ArcFace embeddings via InsightFace
Stores embeddings in-memory dict; Node.js backend persists them to MongoDB.
"""

import numpy as np
import cv2
import logging
from typing import Optional

logger = logging.getLogger(__name__)

SIMILARITY_THRESHOLD = 0.40   # cosine distance — lower = more similar


class FaceRecognizer:
    def __init__(self):
        self._model  = None
        self._db: dict[str, np.ndarray] = {}   # user_id → embedding
        self._init_model()

    def _init_model(self):
        try:
            import insightface
            from insightface.app import FaceAnalysis
            self._app = FaceAnalysis(
                name="buffalo_l",              # ArcFace ResNet-50
                providers=["CPUExecutionProvider"]
            )
            self._app.prepare(ctx_id=0, det_size=(640, 640))
            logger.info("InsightFace (ArcFace) loaded")
        except ImportError:
            logger.warning("InsightFace not installed — using face_recognition (dlib)")
            self._app = None
            self._init_dlib()

    def _init_dlib(self):
        try:
            import face_recognition
            self._face_recognition = face_recognition
            logger.info("face_recognition (dlib) loaded")
        except ImportError:
            logger.error("No recognition backend found. Install insightface or face_recognition.")
            self._face_recognition = None

    # ──────────────────────────────────────────────────────────────────────────

    def get_embedding(self, img: np.ndarray, face: dict) -> Optional[np.ndarray]:
        """Extract 512-d ArcFace embedding from image + face bounding box."""
        if self._app:
            return self._get_embedding_insightface(img)
        if hasattr(self, "_face_recognition") and self._face_recognition:
            return self._get_embedding_dlib(img, face)
        return None

    def _get_embedding_insightface(self, img: np.ndarray) -> Optional[np.ndarray]:
        rgb    = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        faces  = self._app.get(rgb)
        if not faces:
            return None
        # Use the largest face
        face = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))
        emb  = face.embedding
        return emb / np.linalg.norm(emb)   # L2 normalise

    def _get_embedding_dlib(self, img: np.ndarray, face: dict) -> Optional[np.ndarray]:
        fr  = self._face_recognition
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        loc = [(face["y"], face["x"]+face["w"], face["y"]+face["h"], face["x"])]
        encs = fr.face_encodings(rgb, known_face_locations=loc)
        if not encs:
            return None
        emb = np.array(encs[0])
        return emb / np.linalg.norm(emb)

    # ──────────────────────────────────────────────────────────────────────────

    def register_user(self, user_id: str, embedding: np.ndarray):
        """Store embedding for a user (in memory)."""
        self._db[user_id] = embedding
        logger.info(f"Stored embedding for {user_id}. Total registered: {len(self._db)}")

    def load_embedding(self, user_id: str, embedding_list: list):
        """Load an embedding from MongoDB (passed as plain list by Node.js)."""
        self._db[user_id] = np.array(embedding_list, dtype=np.float32)

    def get_stored_embedding(self, user_id: str) -> Optional[list]:
        """Return embedding as plain list for storage in MongoDB."""
        emb = self._db.get(user_id)
        return emb.tolist() if emb is not None else None

    def verify(self, user_id: str, embedding: Optional[np.ndarray]) -> tuple[bool, float]:
        """
        Compare embedding against stored template.
        Returns (match: bool, confidence: float  0→1 where 1 = identical)
        """
        if embedding is None:
            return False, 0.0
        stored = self._db.get(user_id)
        if stored is None:
            logger.warning(f"No registered face for user {user_id}")
            return False, 0.0

        # Cosine similarity (both L2-normalised → dot product = cosine)
        similarity  = float(np.dot(stored, embedding))
        # Convert cosine similarity (-1..1) to confidence (0..1)
        confidence  = (similarity + 1.0) / 2.0
        # Cosine *distance* for threshold comparison
        distance    = 1.0 - similarity
        match       = distance < SIMILARITY_THRESHOLD
        return match, confidence

    def identify(self, embedding: Optional[np.ndarray]) -> tuple[Optional[str], float]:
        """
        Identify which registered user best matches the embedding.
        Returns (user_id | None, confidence)
        """
        if embedding is None or not self._db:
            return None, 0.0
        best_uid  = None
        best_conf = 0.0
        for uid, stored in self._db.items():
            sim  = float(np.dot(stored, embedding))
            conf = (sim + 1.0) / 2.0
            dist = 1.0 - sim
            if dist < SIMILARITY_THRESHOLD and conf > best_conf:
                best_uid  = uid
                best_conf = conf
        return best_uid, best_conf
