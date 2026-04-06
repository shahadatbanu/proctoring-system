"""
config.py — Central configuration for the AI service.
All values can be overridden via environment variables.
"""

import os

# ── Server ─────────────────────────────────────────────────────────────────────
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", 8000))
RELOAD = os.getenv("RELOAD", "true").lower() == "true"

# ── Face Recognition ──────────────────────────────────────────────────────────
# Cosine distance threshold: lower = stricter match
SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.40"))

# InsightFace model name (buffalo_l = ArcFace ResNet50, buffalo_s = lighter)
INSIGHTFACE_MODEL = os.getenv("INSIGHTFACE_MODEL", "buffalo_l")

# ── Behaviour Analysis ────────────────────────────────────────────────────────
YAW_THRESHOLD   = float(os.getenv("YAW_THRESHOLD",   "25"))   # degrees left/right
PITCH_THRESHOLD = float(os.getenv("PITCH_THRESHOLD", "20"))   # degrees down
ROLL_THRESHOLD  = float(os.getenv("ROLL_THRESHOLD",  "25"))   # degrees tilt
EAR_THRESHOLD   = float(os.getenv("EAR_THRESHOLD",   "0.22")) # eye aspect ratio

# ── Anti-Spoofing ─────────────────────────────────────────────────────────────
TEXTURE_VARIANCE_THRESHOLD = float(os.getenv("TEXTURE_VARIANCE_THRESHOLD", "800"))
BLINK_WINDOW_FRAMES        = int(os.getenv("BLINK_WINDOW_FRAMES", "30"))
BLINK_VARIANCE_THRESHOLD   = float(os.getenv("BLINK_VARIANCE_THRESHOLD", "5.0"))

# ── Face Tracking ─────────────────────────────────────────────────────────────
IOU_THRESHOLD       = float(os.getenv("IOU_THRESHOLD",       "0.25"))
ABSENCE_TIMEOUT_SEC = float(os.getenv("ABSENCE_TIMEOUT_SEC", "5.0"))

# ── Risk Score Weights ────────────────────────────────────────────────────────
RISK_WEIGHTS = {
    "no_face":          float(os.getenv("RISK_NO_FACE",         "0.40")),
    "multiple_faces":   float(os.getenv("RISK_MULTIPLE_FACES",  "0.50")),
    "identity_mismatch":float(os.getenv("RISK_IDENTITY",        "0.30")),
    "spoof":            float(os.getenv("RISK_SPOOF",           "0.40")),
    "looking_away":     float(os.getenv("RISK_LOOKING_AWAY",    "0.15")),
    "eyes_closed":      float(os.getenv("RISK_EYES_CLOSED",     "0.10")),
    "head_turned_left": float(os.getenv("RISK_HEAD_LEFT",       "0.15")),
    "head_turned_right":float(os.getenv("RISK_HEAD_RIGHT",      "0.15")),
    "head_down":        float(os.getenv("RISK_HEAD_DOWN",       "0.10")),
    "head_tilted":      float(os.getenv("RISK_HEAD_TILTED",     "0.08")),
}

# ── Logging ───────────────────────────────────────────────────────────────────
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
