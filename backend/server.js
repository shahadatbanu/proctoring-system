const express    = require('express');
const http       = require('http');
const cors       = require('cors');
const mongoose   = require('mongoose');
const { Server } = require('socket.io');
require('dotenv').config();

const authRoutes    = require('./routes/auth');
const examRoutes    = require('./routes/exam');
const sessionRoutes = require('./routes/session');
const adminRoutes   = require('./routes/admin');
const { setupProctorSocket } = require('./sockets/proctorSocket');
const { preloadEmbeddings }  = require('./utils/embeddingLoader');
const { requestLogger }      = require('./utils/logger');

const app    = express();
const server = http.createServer(app);

// ── Socket.io ──────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true },
  maxHttpBufferSize: 10 * 1024 * 1024,
});

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(requestLogger);

// ── MongoDB ────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/proctoring')
  .then(async () => {
    console.log('✅  MongoDB connected');
    await preloadEmbeddings();   // push stored embeddings into Python AI on startup
  })
  .catch(err => { console.error('❌  MongoDB:', err.message); process.exit(1); });

// ── REST Routes ────────────────────────────────────────────────────────────
app.use('/api/auth',    authRoutes);
app.use('/api/exam',    examRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/admin',   adminRoutes);

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'proctoring-backend', ts: new Date() })
);

// ── 404 / error handlers ───────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── WebSocket relay ────────────────────────────────────────────────────────
setupProctorSocket(io);

// ── Start ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀  Backend  → http://localhost:${PORT}`);
  console.log(`🤖  AI svc   → ${process.env.AI_SERVICE_URL || 'http://localhost:8000'}`);
  console.log(`🌐  Frontend → ${process.env.FRONTEND_URL   || 'http://localhost:3000'}`);
});
