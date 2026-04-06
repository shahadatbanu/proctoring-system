// routes/exam.js
const router = require('express').Router();
const { Exam, ProctoringSession } = require('../models');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// Create exam (admin only)
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const exam = await Exam.create({ ...req.body, createdBy: req.user.userId });
    res.status(201).json(exam);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List exams
router.get('/', authMiddleware, async (req, res) => {
  try {
    const filter = { active: true };
    if (req.user.role === 'student') {
      filter.assignedStudents = req.user.userId;
    }
    const exams = await Exam.find(filter).select('-questions.correct').sort('-createdAt');
    res.json(exams);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get single exam (strip answers for students)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (req.user.role !== 'admin') {
      const safe = exam.toObject();
      safe.questions = safe.questions.map(({ correct, ...rest }) => rest);
      return res.json(safe);
    }
    res.json(exam);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update exam (admin)
router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const exam = await Exam.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    res.json(exam);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete exam (admin)
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    await Exam.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Submit answers + auto-grade
router.post('/:id/submit', authMiddleware, async (req, res) => {
  try {
    const { sessionId, answers } = req.body;
    const exam    = await Exam.findById(req.params.id);
    const session = await ProctoringSession.findById(sessionId);
    if (!exam || !session) return res.status(404).json({ error: 'Exam or session not found' });
    if (session.userId.toString() !== req.user.userId)
      return res.status(403).json({ error: 'Not your session' });

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

module.exports = router;
