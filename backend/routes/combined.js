// ─────────────────────────────────────────────────────────────────────────────
// routes/exam.js
// ─────────────────────────────────────────────────────────────────────────────
const examRouter = require('express').Router();
const { Exam, ProctoringSession } = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// Create exam (admin)
examRouter.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const exam = await Exam.create({ ...req.body, createdBy: req.user.userId });
    res.status(201).json(exam);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List exams (students see active only; admins see all)
examRouter.get('/', authMiddleware, async (req, res) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { active: true };
    const exams  = await Exam.find(filter).select('-questions.correct').sort('-createdAt');
    res.json(exams);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get single exam (strip correct answers for students)
examRouter.get('/:id', authMiddleware, async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    if (req.user.role !== 'admin') {
      const safe = exam.toObject();
      safe.questions = safe.questions.map(q => {
        const { correct, ...rest } = q;
        return rest;
      });
      return res.json(safe);
    }
    res.json(exam);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Submit answers + auto-grade
examRouter.post('/:id/submit', authMiddleware, async (req, res) => {
  try {
    const { sessionId, answers } = req.body;
    const exam    = await Exam.findById(req.params.id);
    const session = await ProctoringSession.findById(sessionId);

    if (!exam || !session)
      return res.status(404).json({ error: 'Exam or session not found' });
    if (session.userId.toString() !== req.user.userId)
      return res.status(403).json({ error: 'Not your session' });

    // Grade
    let correct = 0;
    answers.forEach(ans => {
      const q = exam.questions[ans.questionIndex];
      if (q && q.correct === ans.selectedOption) correct++;
    });
    const score = Math.round((correct / exam.questions.length) * 100);

    session.answers = answers;
    session.score   = score;
    session.status  = 'completed';
    session.endedAt = new Date();
    await session.save();

    res.json({ score, correct, total: exam.questions.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// routes/session.js
// ─────────────────────────────────────────────────────────────────────────────
const sessionRouter = require('express').Router();
const { AlertLog } = require('../models');
const axios = require('axios');
const AI_SERVICE = process.env.AI_SERVICE_URL || 'http://localhost:8000';

// Start a new proctoring session
sessionRouter.post('/start', authMiddleware, async (req, res) => {
  try {
    const { examId } = req.body;
    const existing = await ProctoringSession.findOne({
      userId: req.user.userId, examId, status: 'active'
    });
    if (existing) return res.json({ sessionId: existing._id });

    const session = await ProctoringSession.create({
      examId,
      userId: req.user.userId,
    });
    res.status(201).json({ sessionId: session._id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Analyze a single frame (REST fallback when not using WebSocket)
sessionRouter.post('/:sessionId/frame', authMiddleware, async (req, res) => {
  try {
    const { imageBase64, frameNumber } = req.body;
    const session = await ProctoringSession.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const aiRes = await axios.post(`${AI_SERVICE}/analyze-frame`, {
      session_id:   req.params.sessionId,
      user_id:      req.user.userId.toString(),
      image_base64: imageBase64,
      frame_number: frameNumber || 0,
    });
    const analysis = aiRes.data;

    // Persist alerts
    if (analysis.alerts?.length) {
      const logs = analysis.alerts.map(type => ({
        sessionId:   session._id,
        userId:      session.userId,
        examId:      session.examId,
        type,
        riskScore:   analysis.risk_score,
        frameNumber: frameNumber || 0,
      }));
      await AlertLog.insertMany(logs);
    }

    // Update session stats
    const history = [...(session.riskScoreHistory || []), analysis.risk_score];
    const avg = history.reduce((a, b) => a + b, 0) / history.length;

    await ProctoringSession.findByIdAndUpdate(session._id, {
      $inc: { totalFramesAnalyzed: 1, alertCount: analysis.alerts?.length || 0 },
      $push: { riskScoreHistory: analysis.risk_score },
      $max: { maxRiskScore: analysis.risk_score },
      avgRiskScore: avg,
      ...(analysis.risk_score > 0.8 ? { status: 'flagged' } : {}),
    });

    res.json(analysis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get session alerts
sessionRouter.get('/:sessionId/alerts', authMiddleware, async (req, res) => {
  try {
    const alerts = await AlertLog.find({ sessionId: req.params.sessionId })
      .sort('-timestamp').limit(100);
    res.json(alerts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// routes/admin.js
// ─────────────────────────────────────────────────────────────────────────────
const adminRouter = require('express').Router();
const { User } = require('../models');

adminRouter.use(authMiddleware);
adminRouter.use(adminOnly);

// Dashboard stats
adminRouter.get('/stats', async (req, res) => {
  try {
    const [users, exams, sessions, alerts] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      Exam.countDocuments(),
      ProctoringSession.countDocuments(),
      AlertLog.countDocuments(),
    ]);
    const flagged = await ProctoringSession.countDocuments({ status: 'flagged' });
    res.json({ users, exams, sessions, alerts, flagged });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// All sessions with risk scores
adminRouter.get('/sessions', async (req, res) => {
  try {
    const sessions = await ProctoringSession
      .find()
      .populate('userId', 'name email')
      .populate('examId', 'title')
      .sort('-startedAt')
      .limit(50);
    res.json(sessions);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Alert summary for a session
adminRouter.get('/sessions/:sessionId/report', async (req, res) => {
  try {
    const session = await ProctoringSession
      .findById(req.params.sessionId)
      .populate('userId', 'name email')
      .populate('examId', 'title');
    const alerts = await AlertLog.find({ sessionId: req.params.sessionId }).sort('timestamp');

    const summary = alerts.reduce((acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    }, {});

    res.json({ session, alertSummary: summary, alertLog: alerts });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = { examRouter, sessionRouter, adminRouter };
