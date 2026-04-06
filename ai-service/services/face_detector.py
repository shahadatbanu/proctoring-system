"""
FaceDetector — MediaPipe primary, MTCNN fallback
Returns list of face bounding boxes as dicts:
  { x, y, w, h, landmarks, confidence }
"""

import cv2
import numpy as np
import logging

logger = logging.getLogger(__name__)


class FaceDetector:
    def __init__(self):
        self._mp_detector  = None
        self._mtcnn_detector = None
        self._init_mediapipe()

    def _init_mediapipe(self):
        try:
            import mediapipe as mp
            mp_face = mp.solutions.face_detection
            self._mp_detector = mp_face.FaceDetection(
                model_selection=1,          # 1 = full-range model (up to 5m)
                min_detection_confidence=0.6
            )
            logger.info("MediaPipe face detector loaded")
        except ImportError:
            logger.warning("MediaPipe not found — falling back to MTCNN")
            self._init_mtcnn()

    def _init_mtcnn(self):
        try:
            from mtcnn import MTCNN
            self._mtcnn_detector = MTCNN()
            logger.info("MTCNN face detector loaded")
        except ImportError:
            logger.warning("MTCNN not found — using OpenCV Haar cascade (basic)")

    def detect(self, img: np.ndarray) -> list[dict]:
        """Detect all faces in BGR image. Returns list of face dicts."""
        if self._mp_detector:
            return self._detect_mediapipe(img)
        if self._mtcnn_detector:
            return self._detect_mtcnn(img)
        return self._detect_haar(img)

    def _detect_mediapipe(self, img: np.ndarray) -> list[dict]:
        import mediapipe as mp
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        h, w = img.shape[:2]
        results = self._mp_detector.process(rgb)
        faces = []
        if not results.detections:
            return faces
        for det in results.detections:
            bb   = det.location_data.relative_bounding_box
            x    = max(0, int(bb.xmin * w))
            y    = max(0, int(bb.ymin * h))
            bw   = int(bb.width  * w)
            bh   = int(bb.height * h)
            conf = det.score[0] if det.score else 0.0

            # Extract 6 key landmarks (right_eye, left_eye, nose_tip,
            #   mouth_center, right_ear_tragion, left_ear_tragion)
            lms = {}
            kp_names = ["right_eye","left_eye","nose_tip",
                        "mouth_center","right_ear","left_ear"]
            for i, kp in enumerate(det.location_data.relative_keypoints):
                lms[kp_names[i]] = (int(kp.x * w), int(kp.y * h))

            faces.append({
                "x": x, "y": y, "w": bw, "h": bh,
                "landmarks": lms,
                "confidence": float(conf),
            })
        return faces

    def _detect_mtcnn(self, img: np.ndarray) -> list[dict]:
        rgb    = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        result = self._mtcnn_detector.detect_faces(rgb)
        faces  = []
        for det in result:
            x, y, bw, bh = det["box"]
            x = max(0, x); y = max(0, y)
            kps = det.get("keypoints", {})
            faces.append({
                "x": x, "y": y, "w": bw, "h": bh,
                "landmarks": kps,
                "confidence": det.get("confidence", 0.0),
            })
        return faces

    def _detect_haar(self, img: np.ndarray) -> list[dict]:
        gray      = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        cascade   = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        detections = cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))
        faces = []
        for (x, y, bw, bh) in detections:
            faces.append({
                "x": int(x), "y": int(y), "w": int(bw), "h": int(bh),
                "landmarks": {},
                "confidence": 0.85,
            })
        return faces

    def crop_face(self, img: np.ndarray, face: dict, pad: float = 0.15) -> np.ndarray:
        """Crop + optionally pad the face region from an image."""
        h, w  = img.shape[:2]
        x, y  = face["x"], face["y"]
        bw, bh = face["w"], face["h"]
        px = int(bw * pad); py = int(bh * pad)
        x1 = max(0,   x  - px)
        y1 = max(0,   y  - py)
        x2 = min(w,   x + bw + px)
        y2 = min(h,   y + bh + py)
        return img[y1:y2, x1:x2]
