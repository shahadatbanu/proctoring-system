const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const axios   = require('axios');
const { User } = require('../models');
const { authMiddleware } = require('../middleware/auth');

const AI_SERVICE = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const JWT_SECRET = process.env.JWT_SECRET || 'changeme_in_production';

// ─── Register ─────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'name, email and password required' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash, role: role || 'student' });

    const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: {
        id: user._id, name: user.name, email: user.email,
        role: user.role, faceRegistered: user.faceRegistered,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Register Face (send image → AI service → store embedding in Mongo) ───────
router.post('/register-face', authMiddleware, async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    const userId = req.user.userId.toString();

    // Forward to Python AI service
    const aiRes = await axios.post(`${AI_SERVICE}/register-face`, {
      user_id: userId,
      image_base64: imageBase64,
    });

    if (!aiRes.data.success) {
      return res.status(422).json({ error: 'Face registration failed in AI service' });
    }

    // Fetch the embedding back and persist it in MongoDB
    const embRes = await axios.get(`${AI_SERVICE}/embedding/${userId}`).catch(() => null);
    if (embRes?.data?.embedding) {
      await User.findByIdAndUpdate(userId, {
        faceEmbedding: embRes.data.embedding,
        faceRegistered: true,
      });
    } else {
      // Mark registered even if we can't retrieve embedding (AI service holds it in memory)
      await User.findByIdAndUpdate(userId, { faceRegistered: true });
    }

    res.json({ success: true, message: 'Face registered successfully' });
  } catch (err) {
    const detail = err.response?.data?.detail || err.message;
    res.status(500).json({ error: detail });
  }
});

// ─── Verify Face (pre-exam identity check) ────────────────────────────────────
router.post('/verify-face', authMiddleware, async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    const userId = req.user.userId.toString();

    const aiRes = await axios.post(`${AI_SERVICE}/verify-face`, {
      user_id: userId,
      image_base64: imageBase64,
    });
    res.json(aiRes.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get current user ─────────────────────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-passwordHash -faceEmbedding');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
