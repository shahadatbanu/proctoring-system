"""
main.py — ProctorAI FastAPI microservice
Endpoints:
  GET  /health
  POST /register-face
  GET  /embedding/{user_id}
  POST /load-embedding
  POST /verify-face
  POST /analyze-frame
  GET  /session/{session_id}/status
  DELETE /session/{session_id}
  GET  /users
  WS   /ws/proctor/{session_id}/{user_id}
"""

import cv2, numpy as np, base64, logging, time
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn
from dotenv import load_dotenv
load_dotenv()

from config import HOST, PORT, RELOAD, LOG_LEVEL, RISK_WEIGHTS
from services.face_detector     import FaceDetector
from services.face_recognizer   import FaceRecognizer
from services.behaviour_analyzer import BehaviourAnalyzer
from services.anti_spoof        import AntiSpoofChecker
from services.face_tracker      import FaceTracker
from services.embedding_store   import embedding_store
from services.object_detector   import ObjectDetector

logging.basicConfig(level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger(__name__)

face_detector = face_recognizer = behaviour_analyzer = anti_spoof = face_tracker = object_detector = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global face_detector, face_recognizer, behaviour_analyzer, anti_spoof, face_tracker, object_detector
    logger.info("Loading AI models...")
    face_detector      = FaceDetector()
    face_recognizer    = FaceRecognizer()
    behaviour_analyzer = BehaviourAnalyzer()
    anti_spoof         = AntiSpoofChecker()
    face_tracker       = FaceTracker()
    object_detector    = ObjectDetector()
    logger.info(f"Models ready. Stored embeddings: {embedding_store.count()}")
    yield
    logger.info("Shutdown complete")

app = FastAPI(title="ProctorAI Service", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

# ── Models ────────────────────────────────────────────────────────────────────
class RegisterFaceRequest(BaseModel):
    user_id: str
    image_base64: str

class VerifyFaceRequest(BaseModel):
    user_id: str
    image_base64: str

class AnalyzeFrameRequest(BaseModel):
    session_id: str
    user_id: str
    image_base64: str
    frame_number: Optional[int] = 0

class AnalyzeFrameResponse(BaseModel):
    session_id: str
    frame_number: int
    timestamp: float
    face_detected: bool
    face_count: int
    identity_match: bool
    identity_confidence: float
    behaviour_flags: list[str]
    spoof_detected: bool
    risk_score: float
    alerts: list[str]
    object_detections: list[str]

# ── Utils ─────────────────────────────────────────────────────────────────────
def decode_image(b64: str) -> np.ndarray:
    try:
        if "," in b64: b64 = b64.split(",", 1)[1]
        arr = np.frombuffer(base64.b64decode(b64), np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None: raise ValueError("imdecode returned None")
        return img
    except Exception as e:
        raise HTTPException(400, f"Invalid image: {e}")

def compute_risk(face_count, identity_match, flags, spoof, object_detections) -> float:
    w = RISK_WEIGHTS
    s = 0.0
    if face_count == 0:                        s += w["no_face"]
    elif face_count > 1:                       s += w["multiple_faces"]
    if not identity_match and face_count > 0:  s += w["identity_mismatch"]
    if spoof:                                  s += w["spoof"]
    for f in flags:                            s += w.get(f, 0.05)
    if object_detections:                      s += w["suspicious_object"] * len(object_detections)
    return min(round(s, 3), 1.0)

def ensure_embedding(user_id: str):
    """Load from disk store into recognizer memory if missing."""
    if face_recognizer._db.get(user_id) is None:
        stored = embedding_store.get(user_id)
        if stored is not None:
            face_recognizer.register_user(user_id, stored)

# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "models_loaded": face_detector is not None,
            "registered_users": embedding_store.count()}

@app.post("/register-face")
async def register_face(req: RegisterFaceRequest):
    img   = decode_image(req.image_base64)
    faces = face_detector.detect(img)
    if len(faces) == 0:  raise HTTPException(422, "No face detected")
    if len(faces) > 1:   raise HTTPException(422, "Multiple faces detected")
    emb = face_recognizer.get_embedding(img, faces[0])
    if emb is None:      raise HTTPException(422, "Embedding extraction failed")
    face_recognizer.register_user(req.user_id, emb)
    embedding_store.set(req.user_id, emb)
    logger.info(f"Registered face: {req.user_id}")
    return {"success": True, "user_id": req.user_id}

@app.get("/embedding/{user_id}")
async def get_embedding(user_id: str):
    emb = embedding_store.get_raw(user_id)
    if emb is None: raise HTTPException(404, f"No embedding for {user_id}")
    return {"user_id": user_id, "embedding": emb, "dims": len(emb)}

@app.post("/load-embedding")
async def load_embedding(data: dict):
    uid, emb = data.get("user_id"), data.get("embedding")
    if not uid or not emb: raise HTTPException(400, "user_id and embedding required")
    arr = np.array(emb, dtype=np.float32)
    face_recognizer.register_user(uid, arr)
    embedding_store.set(uid, arr)
    return {"success": True, "user_id": uid}

@app.post("/verify-face")
async def verify_face(req: VerifyFaceRequest):
    img   = decode_image(req.image_base64)
    faces = face_detector.detect(img)
    if not faces:
        return {"match": False, "confidence": 0.0, "reason": "no_face"}
    ensure_embedding(req.user_id)
    emb = face_recognizer.get_embedding(img, faces[0])
    match, conf = face_recognizer.verify(req.user_id, emb)
    return {"match": match, "confidence": round(float(conf), 4), "user_id": req.user_id}

@app.post("/analyze-frame", response_model=AnalyzeFrameResponse)
async def analyze_frame(req: AnalyzeFrameRequest):
    img = decode_image(req.image_base64)
    ts  = time.time()
    ensure_embedding(req.user_id)

    faces         = face_detector.detect(img)
    face_count    = len(faces)
    face_detected = face_count > 0

    identity_match, identity_confidence = False, 0.0
    behaviour_flags, spoof_detected     = [], False
    object_detections = object_detector.detect(img)

    if face_detected:
        emb = face_recognizer.get_embedding(img, faces[0])
        identity_match, identity_confidence = face_recognizer.verify(req.user_id, emb)
        face_tracker.update(req.session_id, faces[0], img)
        behaviour_flags = behaviour_analyzer.analyze(img, faces[0])
        spoof_detected  = anti_spoof.check(img, faces[0], req.session_id)

    risk   = compute_risk(face_count, identity_match, behaviour_flags, spoof_detected, object_detections)
    alerts = []
    if face_count == 0:                      alerts.append("NO_FACE_DETECTED")
    if face_count > 1:                       alerts.append("MULTIPLE_FACES_DETECTED")
    if not identity_match and face_detected: alerts.append("IDENTITY_MISMATCH")
    if spoof_detected:                       alerts.append("SPOOF_ATTEMPT_DETECTED")
    for f in behaviour_flags:                alerts.append(f.upper())
    for obj in object_detections:            alerts.append(f"SUSPICIOUS_OBJECT_{obj.upper().replace(' ', '_')}")

    return AnalyzeFrameResponse(
        session_id=req.session_id, frame_number=req.frame_number, timestamp=ts,
        face_detected=face_detected, face_count=face_count,
        identity_match=identity_match, identity_confidence=float(identity_confidence),
        behaviour_flags=behaviour_flags, spoof_detected=spoof_detected,
        risk_score=risk, alerts=alerts, object_detections=object_detections,
    )

@app.get("/session/{session_id}/status")
async def session_status(session_id: str):
    return face_tracker.get_status(session_id)

@app.delete("/session/{session_id}")
async def clear_session(session_id: str):
    face_tracker.clear(session_id)
    return {"success": True}

@app.get("/users")
async def list_users():
    return {"users": embedding_store.all_ids(), "count": embedding_store.count()}

# ── WebSocket ─────────────────────────────────────────────────────────────────
@app.websocket("/ws/proctor/{session_id}/{user_id}")
async def ws_proctor(websocket: WebSocket, session_id: str, user_id: str):
    await websocket.accept()
    logger.info(f"WS connected session={session_id} user={user_id}")
    frame_no = 0
    try:
        while True:
            data   = await websocket.receive_text()
            result = await analyze_frame(AnalyzeFrameRequest(
                session_id=session_id, user_id=user_id,
                image_base64=data, frame_number=frame_no))
            await websocket.send_json(result.dict())
            frame_no += 1
    except WebSocketDisconnect:
        logger.info(f"WS disconnected session={session_id}")
        face_tracker.clear(session_id)
    except Exception as e:
        logger.error(f"WS error: {e}")
        await websocket.close(code=1011)

if __name__ == "__main__":
    uvicorn.run("main:app", host=HOST, port=PORT, reload=RELOAD)
