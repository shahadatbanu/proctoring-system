"""
AntiSpoofChecker — Blink detection + texture liveness check
"""

import cv2
import numpy as np
import logging
import time
from collections import deque

logger = logging.getLogger(__name__)


class AntiSpoofChecker:
    """
    Detects whether the face is a live person or a spoofing attempt
    (printed photo, phone screen, video replay).

    Methods:
    1. Texture analysis — live skin has natural micro-texture;
       a printed/screen photo is unnaturally uniform.
    2. Blink frequency tracking — no blinks = likely static image.
    3. (Optional) Deep model — if Silent-Face-Anti-Spoofing is installed.
    """

    def __init__(self):
        self._blink_tracker: dict[str, BlinkTracker] = {}
        self._deep_model = None
        self._try_load_deep_model()

    def _try_load_deep_model(self):
        """
        Attempt to load a pretrained anti-spoof model.
        https://github.com/minivision-ai/Silent-Face-Anti-Spoofing
        """
        try:
            # If user has cloned & installed the Silent Face repo:
            from silent_face_anti_spoofing import AntiSpoofPredict
            self._deep_model = AntiSpoofPredict(device_id=0)
            logger.info("Deep anti-spoof model loaded (Silent-Face)")
        except ImportError:
            logger.info("Deep anti-spoof model not found — using texture + blink heuristics")

    def check(self, img: np.ndarray, face: dict, session_id: str = "default") -> bool:
        """
        Returns True if a spoof attempt is suspected.
        """
        if self._deep_model:
            return self._check_deep(img, face)

        texture_spoof = self._texture_analysis(img, face)
        blink_spoof   = self._blink_analysis(img, face, session_id)

        # Flag as spoof only if BOTH heuristics agree (reduces false positives)
        return texture_spoof and blink_spoof

    def _texture_analysis(self, img: np.ndarray, face: dict) -> bool:
        """
        LBP (Local Binary Pattern) variance check.
        Live faces have higher variance due to skin micro-texture.
        Photo/screen faces are smoother → lower variance.
        """
        x, y, w, h = face["x"], face["y"], face["w"], face["h"]
        face_crop = img[y:y+h, x:x+w]
        if face_crop.size == 0:
            return False

        gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
        gray = cv2.resize(gray, (64, 64))

        lbp  = self._compute_lbp(gray)
        var  = float(np.var(lbp))

        # Empirical threshold — tune with your dataset
        # Low variance (< 800) = suspiciously uniform = possible spoof
        TEXTURE_THRESHOLD = 800
        is_spoof = var < TEXTURE_THRESHOLD
        if is_spoof:
            logger.debug(f"Texture variance {var:.1f} below threshold — possible spoof")
        return is_spoof

    def _compute_lbp(self, gray: np.ndarray) -> np.ndarray:
        """Basic LBP without scikit-image dependency."""
        h, w = gray.shape
        lbp  = np.zeros_like(gray, dtype=np.uint8)
        for i in range(1, h - 1):
            for j in range(1, w - 1):
                center    = gray[i, j]
                code      = 0
                neighbors = [
                    gray[i-1,j-1], gray[i-1,j], gray[i-1,j+1],
                    gray[i,  j+1], gray[i+1,j+1], gray[i+1,j],
                    gray[i+1,j-1], gray[i,  j-1],
                ]
                for k, nb in enumerate(neighbors):
                    if nb >= center:
                        code |= (1 << k)
                lbp[i, j] = code
        return lbp

    def _blink_analysis(self, img: np.ndarray, face: dict, session_id: str) -> bool:
        """
        If no blink is detected over a window of frames → likely static image.
        Uses eye region standard deviation as a rough blink proxy.
        """
        if session_id not in self._blink_tracker:
            self._blink_tracker[session_id] = BlinkTracker()
        tracker = self._blink_tracker[session_id]

        # Crop eye region (upper 40% of face box)
        x, y, w, h = face["x"], face["y"], face["w"], face["h"]
        eye_y1 = y + int(h * 0.15)
        eye_y2 = y + int(h * 0.45)
        eye_region = img[eye_y1:eye_y2, x:x+w]
        if eye_region.size == 0:
            return False

        gray_eye = cv2.cvtColor(eye_region, cv2.COLOR_BGR2GRAY)
        std_val  = float(np.std(gray_eye))
        tracker.add(std_val)

        return tracker.is_static()

    def _check_deep(self, img: np.ndarray, face: dict) -> bool:
        """Deep model check — Silent Face Anti Spoofing."""
        try:
            x, y, w, h = face["x"], face["y"], face["w"], face["h"]
            result = self._deep_model.predict(img, bbox=[x, y, x+w, y+h])
            # result: 1=real, 0=spoof
            return result == 0
        except Exception as e:
            logger.error(f"Deep anti-spoof error: {e}")
            return False


class BlinkTracker:
    """Tracks eye-region std deviation over time to detect motion (blinks)."""
    def __init__(self, window: int = 30, variance_threshold: float = 5.0):
        self._values   = deque(maxlen=window)
        self._threshold = variance_threshold

    def add(self, std_val: float):
        self._values.append(std_val)

    def is_static(self) -> bool:
        """Returns True if the eye region shows almost no variance (static image)."""
        if len(self._values) < 10:
            return False
        arr = np.array(self._values)
        return float(np.var(arr)) < self._threshold
