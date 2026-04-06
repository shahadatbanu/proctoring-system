// routes/session.js
const router  = require('express').Router();
const axios   = require('axios');
const { ProctoringSession, AlertLog } = require('../models');
const { authMiddleware } = require('../middleware/auth');

const AI_SERVICE = process.env.AI_SERVICE_URL || 'http://localhost:8000';

// Start a new proctoring session
router.post('/start', authMiddleware, async (req, res) => {
  try {
    const { examId } = req.body;
    if (!examId) return res.status(400).json({ error: 'examId required' });

    // Return existing active session if any
    const existing = await ProctoringSession.findOne({
      userId: req.user.userId, examId, status: 'active',
    });
    if (existing) return res.json({ sessionId: existing._id, resumed: true });

    const session = await ProctoringSession.create({
      examId, userId: req.user.userId,
    });
    res.status(201).json({ sessionId: session._id, resumed: false });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Analyze a single frame via REST (fallback when not using WebSocket)
router.post('/:sessionId/frame', authMiddleware, async (req, res) => {
  try {
    const { imageBase64, frameNumber = 0 } = req.body;
    const session = await ProctoringSession.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.userId.toString() !== req.user.userId)
      return res.status(403).json({ error: 'Not your session' });

    const aiRes = await axios.post(`${AI_SERVICE}/analyze-frame`, {
      session_id:   req.params.sessionId,
      user_id:      req.user.userId.toString(),
      image_base64: imageBase64,
      frame_number: frameNumber,
    }, { timeout: 8000 });

    const analysis = aiRes.data;

    // Persist alerts
    if (analysis.alerts?.length) {
      await AlertLog.insertMany(analysis.alerts.map(type => ({
        sessionId: session._id,
        userId:    session.userId,
        examId:    session.examId,
        type,
        riskScore:   analysis.risk_score,
        frameNumber,
      }))).catch(console.error);
    }

    // Update session stats
    await ProctoringSession.findByIdAndUpdate(session._id, {
      $inc:  { totalFramesAnalyzed: 1, alertCount: analysis.alerts?.length || 0 },
      $push: { riskScoreHistory: { $each: [analysis.risk_score], $slice: -300 } },
      $max:  { maxRiskScore: analysis.risk_score },
      ...(analysis.risk_score >= 0.8 ? { status: 'flagged' } : {}),
    }).catch(console.error);

    res.json(analysis);
  } catch (err) {
    const detail = err.response?.data?.detail || err.message;
    res.status(500).json({ error: detail });
  }
});

// Get all alerts for a session
router.get('/:sessionId/alerts', authMiddleware, async (req, res) => {
  try {
    const session = await ProctoringSession.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.userId.toString() !== req.user.userId && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Forbidden' });

    const alerts = await AlertLog.find({ sessionId: req.params.sessionId })
      .sort('-timestamp').limit(200);
    res.json(alerts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get session summary for a student
router.get('/:sessionId', authMiddleware, async (req, res) => {
  try {
    const session = await ProctoringSession.findById(req.params.sessionId)
      .populate('examId', 'title duration')
      .populate('userId', 'name email');
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.userId._id.toString() !== req.user.userId && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Forbidden' });
    res.json(session);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// End / terminate a session
router.patch('/:sessionId/end', authMiddleware, async (req, res) => {
  try {
    const session = await ProctoringSession.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    session.status  = req.body.status || 'completed';
    session.endedAt = new Date();
    await session.save();
    res.json({ success: true, status: session.status });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Student: list their own sessions
router.get('/', authMiddleware, async (req, res) => {
  try {
    const sessions = await ProctoringSession.find({ userId: req.user.userId })
      .populate('examId', 'title duration')
      .sort('-startedAt').limit(20);
    res.json(sessions);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Student: submit an appeal for a terminated session
router.post('/:sessionId/appeal', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { appealReason } = req.body;

    if (!appealReason || appealReason.length < 10) {
      return res.status(400).json({ error: 'Appeal reason must be at least 10 characters' });
    }

    const session = await ProctoringSession.findById(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (session.userId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Can only appeal your own session' });
    }

    if (session.status !== 'terminated') {
      return res.status(400).json({ error: 'Can only appeal terminated sessions' });
    }

    if (session.appealSubmittedAt) {
      return res.status(400).json({ error: 'Appeal already submitted for this session' });
    }

    const updated = await ProctoringSession.findByIdAndUpdate(
      sessionId,
      {
        status: 'appeal_pending',
        appealSubmittedAt: new Date(),
        appealReason
      },
      { new: true }
    );

    res.json({ success: true, session: updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
