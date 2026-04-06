# ProctorAI — Full-Stack AI Proctoring System

## Architecture

```
React (port 3000)
  ↕ REST + Socket.io
Node.js / Express (port 5000)
  ↕ REST
Python FastAPI AI Service (port 8000)
  ↕
MongoDB (port 27017)
```

---

## Quick Start

### 1. Python AI Service

```bash
cd ai-service
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install -r requirements.txt

# Run
python main.py
# → http://localhost:8000
# → Docs: http://localhost:8000/docs
```

> **Note:** `insightface` can be tricky to install on Windows.
> If it fails, the service automatically falls back to `face_recognition` (dlib).
> Make sure CMake is installed before installing dlib: `pip install cmake dlib`

---

### 2. Node.js Backend

```bash
cd backend
npm install

cp .env.example .env
# Edit .env — at minimum set JWT_SECRET to a random string

npm run dev
# → http://localhost:5000
```

---

### 3. React Frontend

```bash
cd frontend
npm install

cp .env.example .env
# REACT_APP_BACKEND_URL=http://localhost:5000

npm start
# → http://localhost:3000
```

---

## User Flow

### Student
1. Register at `/register`
2. Register face at `/register-face` (camera required)
3. Go to `/dashboard` — see available exams
4. Click **Start Exam** → identity verification screen
5. Verify face → exam room opens
6. Webcam captures a frame every 3 seconds → sent to AI via Socket.io
7. Submit exam → see score

### Admin
1. Register with `role: "admin"` (set in DB or via API directly)
2. Login → redirected to `/admin`
3. See live sessions, alerts, risk scores in real-time
4. Click any session for full report

---

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login → JWT |
| GET  | `/api/auth/me` | Current user |
| POST | `/api/auth/register-face` | Register face embedding |
| POST | `/api/auth/verify-face` | Pre-exam identity check |

### Exam
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/exam` | List all exams |
| GET  | `/api/exam/:id` | Get exam (answers hidden for students) |
| POST | `/api/exam` | Create exam (admin) |
| PUT  | `/api/exam/:id` | Update exam (admin) |
| POST | `/api/exam/:id/submit` | Submit answers + get score |

### Session
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST  | `/api/session/start` | Start proctoring session |
| GET   | `/api/session` | List my sessions |
| GET   | `/api/session/:id` | Session details |
| POST  | `/api/session/:id/frame` | Analyze frame (REST fallback) |
| GET   | `/api/session/:id/alerts` | Session alerts |
| PATCH | `/api/session/:id/end` | End session |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/stats` | Dashboard counts |
| GET | `/api/admin/sessions` | All sessions |
| GET | `/api/admin/sessions/:id/report` | Full session report |
| GET | `/api/admin/users` | All students |
| GET | `/api/admin/alerts` | Recent alerts feed |
| PATCH | `/api/admin/sessions/:id/terminate` | Force-end session |

### AI Service (Python — internal)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/register-face` | Store face embedding |
| POST | `/verify-face` | One-shot verification |
| POST | `/analyze-frame` | Full proctoring analysis |
| WS   | `/ws/proctor/{session}/{user}` | Real-time streaming |

---

## Socket.io Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `join-session` | `{ sessionId }` | Join session room |
| `proctor-frame` | `{ sessionId, imageBase64 }` | Send webcam frame |
| `tab-hidden` | `{ sessionId }` | Tab switch detected |
| `join-admin-monitor` | — | Admin joins live monitor |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `session-joined` | `{ sessionId, status }` | Confirmation |
| `proctor-result` | Full analysis object | AI result per frame |
| `proctor-error` | `{ message }` | Frame processing failed |
| `high-risk-alert` | Alert object | Risk ≥ 0.7 (admin) |
| `student-frame-analysis` | Analysis + sessionId | Live feed (admin) |
| `tab-switch-alert` | `{ sessionId, userId }` | Tab hidden (admin) |

---

## AI Analysis Response

```json
{
  "session_id": "abc123",
  "frame_number": 42,
  "timestamp": 1719000000.0,
  "face_detected": true,
  "face_count": 1,
  "identity_match": true,
  "identity_confidence": 0.94,
  "behaviour_flags": ["looking_away"],
  "spoof_detected": false,
  "risk_score": 0.15,
  "alerts": ["LOOKING_AWAY"]
}
```

### Risk Score Guide
| Score | Level | Meaning |
|-------|-------|---------|
| 0.0 – 0.39 | 🟢 Low | No issues |
| 0.4 – 0.69 | 🟡 Medium | Minor violations |
| 0.7 – 1.0  | 🔴 High | Serious concern — session flagged |

---

## Create an Admin Account

```bash
# Option A: via API (then update role in Mongo directly)
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@test.com","password":"admin1234"}'

# Then in mongo shell:
use proctoring
db.users.updateOne({ email: "admin@test.com" }, { $set: { role: "admin" } })

# Option B: pass role in register body (works in dev; disable in prod)
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@test.com","password":"admin1234","role":"admin"}'
```

---

## Create a Sample Exam

```bash
# Login as admin first to get token
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"admin1234"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl -X POST http://localhost:5000/api/exam \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Sample Exam",
    "description": "A test exam with 3 questions",
    "duration": 30,
    "questions": [
      { "text": "What is 2 + 2?", "options": ["3","4","5","6"], "correct": 1 },
      { "text": "Capital of France?", "options": ["London","Berlin","Paris","Madrid"], "correct": 2 },
      { "text": "Which is a programming language?", "options": ["HTML","CSS","Python","HTTP"], "correct": 2 }
    ]
  }'
```
