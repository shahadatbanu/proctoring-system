"""
BehaviourAnalyzer
Head pose estimation + gaze direction via MediaPipe Face Mesh.
Returns list of active behaviour flags.
"""

import cv2
import numpy as np
import logging

logger = logging.getLogger(__name__)

# Head pose thresholds (degrees)
YAW_THRESHOLD   = 25    # left / right turn
PITCH_THRESHOLD = 20    # look down
ROLL_THRESHOLD  = 25    # tilt

# Eye aspect ratio threshold for blink / eyes-closed detection
EAR_THRESHOLD = 0.22

# 3D model points for head pose (generic human face)
MODEL_POINTS = np.array([
    (0.0,    0.0,    0.0),    # Nose tip
    (0.0,  -63.6,  -12.5),   # Chin
    (-43.3, 32.7,  -26.0),   # Left eye corner
    (43.3,  32.7,  -26.0),   # Right eye corner
    (-28.9,-28.9,  -24.1),   # Left mouth corner
    (28.9, -28.9,  -24.1),   # Right mouth corner
], dtype=np.float64)


class BehaviourAnalyzer:
    def __init__(self):
        self._mp_mesh = None
        self._init_mediapipe()

    def _init_mediapipe(self):
        try:
            import mediapipe as mp
            self._mp_mesh = mp.solutions.face_mesh.FaceMesh(
                static_image_mode=False,
                max_num_faces=1,
                refine_landmarks=True,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5,
            )
            logger.info("MediaPipe FaceMesh loaded for behaviour analysis")
        except ImportError:
            logger.warning("MediaPipe not available — behaviour analysis limited")

    def analyze(self, img: np.ndarray, face: dict) -> list[str]:
        """Return list of behaviour flags detected in this frame."""
        flags = []
        if self._mp_mesh:
            flags += self._analyze_mediapipe(img)
        else:
            flags += self._analyze_basic(img, face)
        return flags

    # ──────────────────────────────────────────────────────────────────────────
    # MediaPipe path (full landmark analysis)
    # ──────────────────────────────────────────────────────────────────────────

    def _analyze_mediapipe(self, img: np.ndarray) -> list[str]:
        flags = []
        rgb     = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        results = self._mp_mesh.process(rgb)

        if not results.multi_face_landmarks:
            return flags

        lms = results.multi_face_landmarks[0].landmark
        h, w = img.shape[:2]

        # ── Head Pose ─────────────────────────────────────────────────────────
        yaw, pitch, roll = self._estimate_head_pose(lms, img)

        if yaw < -YAW_THRESHOLD:
            flags.append("head_turned_left")
        elif yaw > YAW_THRESHOLD:
            flags.append("head_turned_right")

        if pitch > PITCH_THRESHOLD:
            flags.append("head_down")

        if abs(roll) > ROLL_THRESHOLD:
            flags.append("head_tilted")

        # ── Gaze / Looking Away ───────────────────────────────────────────────
        looking_away = self._check_gaze(lms, w, h)
        if looking_away:
            flags.append("looking_away")

        # ── Eye Aspect Ratio (closed eyes) ────────────────────────────────────
        left_ear  = self._eye_aspect_ratio(lms, "left",  w, h)
        right_ear = self._eye_aspect_ratio(lms, "right", w, h)
        avg_ear   = (left_ear + right_ear) / 2.0
        if avg_ear < EAR_THRESHOLD:
            flags.append("eyes_closed")

        return flags

    def _estimate_head_pose(self, landmarks, img: np.ndarray):
        h, w = img.shape[:2]

        # Landmark indices for the 6 model points
        # nose_tip=1, chin=152, left_eye_outer=263, right_eye_outer=33,
        # left_mouth=287, right_mouth=57
        idx = [1, 152, 263, 33, 287, 57]
        image_points = np.array([
            (landmarks[i].x * w, landmarks[i].y * h) for i in idx
        ], dtype=np.float64)

        focal_length = w
        cam_matrix   = np.array([
            [focal_length, 0, w / 2],
            [0, focal_length, h / 2],
            [0, 0, 1],
        ], dtype=np.float64)
        dist_coeffs = np.zeros((4, 1), dtype=np.float64)

        success, rvec, tvec = cv2.solvePnP(
            MODEL_POINTS, image_points, cam_matrix, dist_coeffs,
            flags=cv2.SOLVEPNP_ITERATIVE
        )
        if not success:
            return 0.0, 0.0, 0.0

        rmat, _ = cv2.Rodrigues(rvec)
        angles, *_ = cv2.RQDecomp3x3(rmat)
        pitch, yaw, roll = angles[0], angles[1], angles[2]
        return float(yaw), float(pitch), float(roll)

    def _check_gaze(self, landmarks, w: int, h: int) -> bool:
        """
        Simple iris position check — if iris center is near eye corner, 
        the student is looking sideways.
        Uses MediaPipe refined landmarks (irises at 468-472, 473-477).
        """
        try:
            # Left iris center = landmark 468
            left_iris_x  = landmarks[468].x * w
            # Left eye: outer=263, inner=362
            left_outer_x  = landmarks[263].x * w
            left_inner_x  = landmarks[362].x * w
            left_eye_width = abs(left_outer_x - left_inner_x)
            left_ratio = (left_iris_x - left_inner_x) / (left_eye_width + 1e-6)

            # Right iris center = landmark 473
            right_iris_x  = landmarks[473].x * w
            right_outer_x  = landmarks[33].x  * w
            right_inner_x  = landmarks[133].x * w
            right_eye_width = abs(right_outer_x - right_inner_x)
            right_ratio = (right_iris_x - right_inner_x) / (right_eye_width + 1e-6)

            avg_ratio = (left_ratio + right_ratio) / 2.0
            # Normal forward gaze ≈ 0.4-0.6; outside this = looking away
            return avg_ratio < 0.3 or avg_ratio > 0.7
        except Exception:
            return False

    def _eye_aspect_ratio(self, landmarks, eye: str, w: int, h: int) -> float:
        """
        Eye Aspect Ratio = (vertical distances) / (2 * horizontal distance)
        Left eye landmarks:  159,145 (top/bottom), 133,33 (corners)
        Right eye landmarks: 386,374 (top/bottom), 362,263 (corners)
        """
        if eye == "left":
            top, bot, inner, outer = 159, 145, 133, 33
        else:
            top, bot, inner, outer = 386, 374, 362, 263

        def pt(i):
            return np.array([landmarks[i].x * w, landmarks[i].y * h])

        vert = np.linalg.norm(pt(top) - pt(bot))
        horiz = np.linalg.norm(pt(inner) - pt(outer))
        return vert / (horiz + 1e-6)

    # ──────────────────────────────────────────────────────────────────────────
    # Basic fallback (no MediaPipe)
    # ──────────────────────────────────────────────────────────────────────────

    def _analyze_basic(self, img: np.ndarray, face: dict) -> list[str]:
        """
        Very basic: check if face is reasonably centred.
        If the bounding box centre is far from the image centre, flag it.
        """
        flags = []
        h, w = img.shape[:2]
        face_cx = face["x"] + face["w"] / 2
        face_cy = face["y"] + face["h"] / 2
        img_cx, img_cy = w / 2, h / 2

        if abs(face_cx - img_cx) > w * 0.25:
            flags.append("looking_away")
        if face_cy < img_cy - h * 0.25:
            flags.append("head_down")

        return flags
