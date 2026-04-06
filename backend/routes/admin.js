// routes/admin.js
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { User, Exam, ProctoringSession, AlertLog, ProctorSettings, AppealLog } = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// All admin routes require auth + admin role
router.use(authMiddleware, adminOnly);

// ── Dashboard stats ──────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [users, exams, sessions, alerts, flagged, active] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      Exam.countDocuments(),
      ProctoringSession.countDocuments(),
      AlertLog.countDocuments(),
      ProctoringSession.countDocuments({ status: 'flagged' }),
      ProctoringSession.countDocuments({ status: 'active' }),
    ]);
    res.json({ users, exams, sessions, alerts, flagged, active });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── All sessions (paginated) ──────────────────────────────────────────────────
router.get('/sessions', async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 50;
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const [sessions, total] = await Promise.all([
      ProctoringSession.find(filter)
        .populate('userId',  'name email')
        .populate('examId',  'title')
        .sort('-startedAt')
        .skip((page - 1) * limit)
        .limit(limit),
      ProctoringSession.countDocuments(filter),
    ]);
    res.json({ sessions, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Full session report ───────────────────────────────────────────────────────
router.get('/sessions/:sessionId/report', async (req, res) => {
  try {
    const [session, alerts] = await Promise.all([
      ProctoringSession.findById(req.params.sessionId)
        .populate('userId', 'name email')
        .populate('examId', 'title duration questions'),
      AlertLog.find({ sessionId: req.params.sessionId }).sort('timestamp'),
    ]);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const alertSummary = alerts.reduce((acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    }, {});

    // Risk timeline (group by minute)
    const riskTimeline = alerts.reduce((acc, a) => {
      const min = new Date(a.timestamp).toISOString().slice(0, 16);
      if (!acc[min]) acc[min] = [];
      acc[min].push(a.riskScore);
      return acc;
    }, {});

    res.json({ session, alertSummary, alertLog: alerts, riskTimeline });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── All students ──────────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({ role: 'student' })
      .select('-passwordHash -faceEmbedding')
      .sort('-createdAt');
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/users', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash, role: 'student' });
    res.status(201).json({ _id: user._id, name: user.name, email: user.email });
  } catch (err) {
    console.error('Admin users POST error', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:userId', async (req, res) => {
  try {
    const { name, email } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { name, email },
      { new: true }
    ).select('-passwordHash -faceEmbedding');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/users/:userId', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Alert feed (recent, all sessions) ────────────────────────────────────────
router.get('/alerts', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const alerts = await AlertLog.find()
      .populate('userId',    'name email')
      .populate('sessionId', 'status')
      .sort('-timestamp').limit(limit);
    res.json(alerts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Terminate a session forcefully ────────────────────────────────────────────
router.patch('/sessions/:sessionId/terminate', async (req, res) => {
  try {
    const session = await ProctoringSession.findByIdAndUpdate(
      req.params.sessionId,
      { status: 'terminated', endedAt: new Date() },
      { new: true }
    );
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ success: true, session });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Exams management ─────────────────────────────────────────────────────────
router.get('/exams', async (req, res) => {
  try {
    const exams = await Exam.find().sort('-createdAt');
    res.json(exams);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/exams', async (req, res) => {
  try {
    const { title, description, duration, questions, scheduledAt, assignedStudents } = req.body;
    const exam = await Exam.create({
      title, description, duration, questions, scheduledAt, assignedStudents,
      createdBy: req.user.userId
    });
    res.status(201).json(exam);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/exams/:examId', async (req, res) => {
  try {
    const { title, description, duration, questions, scheduledAt, assignedStudents } = req.body;
    const exam = await Exam.findByIdAndUpdate(
      req.params.examId,
      { title, description, duration, questions, scheduledAt, assignedStudents },
      { new: true }
    );
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    res.json(exam);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/exams/:examId/assign', async (req, res) => {
  try {
    const { studentIds } = req.body;
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'studentIds must be a non-empty array' });
    }

    const exam = await Exam.findById(req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const existingIds = exam.assignedStudents.map(id => id.toString());
    const newAssignments = studentIds.filter(id => !existingIds.includes(id));
    if (newAssignments.length > 0) {
      exam.assignedStudents.push(...newAssignments);
      await exam.save();
    }

    const students = await User.find({ _id: { $in: newAssignments } });
    for (const student of students) {
      console.log(`Email to ${student.email}: You are assigned to exam "${exam.title}" starting at ${exam.scheduledAt}`);
    }

    res.json({ success: true, added: newAssignments.length, assignedStudents: exam.assignedStudents });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/exams/:examId', async (req, res) => {
  try {
    const exam = await Exam.findByIdAndDelete(req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Proctoring Settings ──────────────────────────────────────────────────────
router.get('/settings', async (req, res) => {
  try {
    const settings = await ProctorSettings.find();
    const settingsMap = {};
    settings.forEach(s => settingsMap[s.key] = { value: s.value, description: s.description });
    res.json(settingsMap);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/settings/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value, description } = req.body;

    const setting = await ProctorSettings.findOneAndUpdate(
      { key },
      { key, value, description, updatedAt: new Date(), updatedBy: req.user.userId },
      { upsert: true, new: true }
    );
    res.json({ success: true, setting });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Appeals Management ───────────────────────────────────────────────────────
router.get('/appeals', async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const [appeals, total] = await Promise.all([
      ProctoringSession.find({ status: 'appeal_pending' })
        .populate('userId', 'name email')
        .populate('examId', 'title')
        .sort('-appealSubmittedAt')
        .skip((page - 1) * limit)
        .limit(limit),
      ProctoringSession.countDocuments({ status: 'appeal_pending' })
    ]);

    res.json({ appeals, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/appeals/:sessionId/review', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { decision, notes } = req.body;  // decision: 'approved' or 'rejected'

    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be approved or rejected' });
    }

    const session = await ProctoringSession.findByIdAndUpdate(
      sessionId,
      {
        status: decision === 'approved' ? 'appeal_approved' : 'appeal_rejected',
        appealStatus: decision,
        appealReviewedAt: new Date(),
        appealReviewedBy: req.user.userId,
        appealNotes: notes
      },
      { new: true }
    ).populate('userId', 'email name').populate('examId', 'title');

    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Log the appeal review
    await AppealLog.create({
      sessionId,
      userId: session.userId._id,
      examId: session.examId._id,
      terminationReason: session.terminationReason,
      violationsCount: session.violationLog?.length || 0,
      appealReason: session.appealReason,
      status: decision,
      reviewDate: new Date(),
      reviewedBy: req.user.userId,
      reviewNotes: notes,
      decision
    });

    // Send email to student
    const nodemailer = require('nodemailer');
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;
    if (emailUser && emailPass) {
      const transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: { user: emailUser, pass: emailPass }
      });

      const decisionText = decision === 'approved' 
        ? 'has been APPROVED. Your exam score will be reinstated.' 
        : 'has been REJECTED. Your exam termination status remains.';

      await transporter.sendMail({
        from: emailUser,
        to: session.userId.email,
        subject: `Appeal Decision: ${session.examId.title}`,
        html: `
          <h2>Appeal Decision</h2>
          <p>Dear ${session.userId.name},</p>
          <p>Your appeal for termination of <strong>${session.examId.title}</strong> ${decisionText}</p>
          ${notes ? `<p><strong>Reviewer Notes:</strong> ${notes}</p>` : ''}
          <p>Thank you,<br>Proctoring System</p>
        `
      }).catch(err => console.error('Email error:', err.message));
    }

    res.json({ success: true, session });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/sessions/:sessionId/appeal', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { appealReason } = req.body;

    if (!appealReason) {
      return res.status(400).json({ error: 'Appeal reason is required' });
    }

    const session = await ProctoringSession.findByIdAndUpdate(
      sessionId,
      {
        status: 'appeal_pending',
        appealSubmittedAt: new Date(),
        appealReason
      },
      { new: true }
    );

    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ success: true, session });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
