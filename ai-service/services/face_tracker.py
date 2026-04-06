"""
FaceTracker — Ensures the same person stays in frame throughout a session.
Uses IoU (Intersection over Union) to track face position continuity.
If the face bounding box teleports (new person replaced the original), flags it.
"""

import numpy as np
import logging
import time
from collections import deque

logger = logging.getLogger(__name__)

IOU_THRESHOLD        = 0.25   # below this = the face "jumped" → suspicious
ABSENCE_TIMEOUT_SEC  = 5.0    # flag if face absent > this many seconds
HISTORY_LEN          = 60     # frames to keep for continuity analysis


class FaceTracker:
    def __init__(self):
        # session_id → SessionTrack
        self._sessions: dict[str, SessionTrack] = {}

    def update(self, session_id: str, face: dict, img: np.ndarray) -> dict:
        """
        Update tracker for a session. Returns tracking status dict.
        """
        if session_id not in self._sessions:
            self._sessions[session_id] = SessionTrack(session_id)
        return self._sessions[session_id].update(face, img)

    def get_status(self, session_id: str) -> dict:
        if session_id not in self._sessions:
            return {"tracked": False, "frames": 0, "warnings": []}
        return self._sessions[session_id].status()

    def clear(self, session_id: str):
        self._sessions.pop(session_id, None)


class SessionTrack:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self._history   = deque(maxlen=HISTORY_LEN)
        self._last_seen = None
        self._frame_count = 0
        self._warnings    = []

    def update(self, face: dict, img: np.ndarray) -> dict:
        self._frame_count += 1
        now = time.time()

        bbox = (face["x"], face["y"], face["w"], face["h"])
        warnings = []

        # Check absence gap
        if self._last_seen is not None:
            gap = now - self._last_seen
            if gap > ABSENCE_TIMEOUT_SEC:
                msg = f"Face absent for {gap:.1f}s"
                warnings.append(msg)
                logger.warning(f"[{self.session_id}] {msg}")

        # Check IoU continuity against last known position
        if self._history:
            last_bbox = self._history[-1]
            iou = compute_iou(last_bbox, bbox)
            if iou < IOU_THRESHOLD and iou > 0:
                msg = f"Face position jump detected (IoU={iou:.2f})"
                warnings.append(msg)
                logger.warning(f"[{self.session_id}] {msg}")

        self._history.append(bbox)
        self._last_seen = now
        self._warnings.extend(warnings)

        return {
            "frame": self._frame_count,
            "warnings": warnings,
            "iou": compute_iou(self._history[-2], bbox) if len(self._history) >= 2 else 1.0,
        }

    def status(self) -> dict:
        return {
            "tracked": True,
            "frames": self._frame_count,
            "warnings": list(self._warnings[-20:]),  # last 20
        }


def compute_iou(bbox_a: tuple, bbox_b: tuple) -> float:
    """Compute Intersection over Union for two (x,y,w,h) bounding boxes."""
    ax, ay, aw, ah = bbox_a
    bx, by, bw, bh = bbox_b

    ix1 = max(ax, bx)
    iy1 = max(ay, by)
    ix2 = min(ax + aw, bx + bw)
    iy2 = min(ay + ah, by + bh)

    inter_w = max(0, ix2 - ix1)
    inter_h = max(0, iy2 - iy1)
    inter   = inter_w * inter_h

    union = aw * ah + bw * bh - inter
    return inter / (union + 1e-6)
