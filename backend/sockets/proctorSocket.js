/**
 * proctorSocket.js
 * Socket.io relay between React frontend and Python AI microservice.
 *
 * Flow:
 *   React (sends frame every 3s via WebSocket)
 *     → Node.js Socket.io (validates JWT, throttles, forwards to Python)
 *       → Python FastAPI /analyze-frame
 *         → Node.js persists alerts → MongoDB
 *           → emits analysis back to React
 */

const jwt    = require('jsonwebtoken');
const axios  = require('axios');
const { ProctoringSession, AlertLog, ProctorSettings } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme_in_production';
const AI_SERVICE = process.env.AI_SERVICE_URL || 'http://localhost:8000';

// Per-session frame counters & violation tracking
const frameCounters = new Map();
const violationTrackers = new Map();  // session -> { lookingAwayCount, lastResetTime }

// Default thresholds (will be overridden by DB settings)
let LOOKING_AWAY_THRESHOLD = 5;
let LOOKING_AWAY_TIME_WINDOW = 30000;
let IDENTITY_MISMATCH_TERMINATE = true;

// Load settings from DB on startup
async function loadProctorSettings() {
  try {
    const settings = await ProctorSettings.find();
    const settingsMap = {};
    settings.forEach(s => settingsMap[s.key] = s.value);
    
    LOOKING_AWAY_THRESHOLD = settingsMap.looking_away_threshold || 5;
    LOOKING_AWAY_TIME_WINDOW = settingsMap.looking_away_time_window || 30000;
    IDENTITY_MISMATCH_TERMINATE = settingsMap.identity_mismatch_terminate !== false;
    
    console.log('✅ Proctor settings loaded:', {
      LOOKING_AWAY_THRESHOLD,
      LOOKING_AWAY_TIME_WINDOW,
      IDENTITY_MISMATCH_TERMINATE
    });
  } catch (err) {
    console.warn('Could not load proctor settings, using defaults:', err.message);
  }
}

// Load settings on module initialization
loadProctorSettings();

async function terminateSession(sessionId, userId, reason, violations, io) {
  try {
    const session = await ProctoringSession.findByIdAndUpdate(
      sessionId,
      {
        status: 'terminated',
        endedAt: new Date(),
        terminationReason: reason,
        violationLog: violations || [],
        terminatedAt: new Date(),
        terminatedBy: 'system'
      },
      { new: true }
    ).populate('userId', 'email name').populate('examId', 'title');
    
    // Send email notification (optional, requires mail config)
    if (session?.userId?.email) {
      sendTerminationEmail(session).catch(err => {
        console.error('Email sending failed:', err.message);
      });
    }
    
    // Notify the student in their session room
    io.to(`session:${sessionId}`).emit('session-terminated', {
      reason,
      message: `Your exam session has been terminated: ${reason}`,
      canAppeal: true
    });

    // Notify admins
    io.to('admin-monitor').emit('session-terminated-alert', {
      sessionId,
      userId,
      reason,
      violationCount: violations?.length || 0,
      terminatedAt: new Date().toISOString()
    });

    console.log(`⛔ Session ${sessionId} terminated: ${reason}`);
    return session;
  } catch (err) {
    console.error(`Error terminating session ${sessionId}:`, err.message);
  }
}

async function sendTerminationEmail(session) {
  try {
    const nodemailer = require('nodemailer');
    const emailService = process.env.EMAIL_SERVICE || 'gmail';
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;

    if (!emailUser || !emailPass) {
      console.warn('Email credentials not configured, skipping notification');
      return;
    }

    const transporter = nodemailer.createTransport({
      service: emailService,
      auth: { user: emailUser, pass: emailPass }
    });

    const mailOptions = {
      from: emailUser,
      to: session.userId.email,
      subject: `Exam Session Terminated: ${session.examId.title}`,
      html: `
        <h2>Exam Session Terminated</h2>
        <p>Dear ${session.userId.name},</p>
        <p>Your exam session for <strong>${session.examId.title}</strong> has been terminated due to:</p>
        <p style="background: #fff5f5; padding: 12px; border-left: 4px solid #e53e3e;">
          <strong>${session.terminationReason}</strong>
        </p>
        <p>Your attempt has been marked as <strong>terminated</strong>. If you believe this was an error, you can submit an appeal.</p>
        <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/appeals" style="background: #3182ce; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Submit Appeal</a></p>
        <p>Thank you,<br>Proctoring System</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`✉️  Termination email sent to ${session.userId.email}`);
  } catch (err) {
    console.error('Email sending error:', err.message);
  }
}

function setupProctorSocket(io) {
  // Auth middleware for Socket.io
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    try {
      socket.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.userId;
    console.log(`🔌 Socket connected: userId=${userId}`);

    // ── Join a proctoring session room ──────────────────────────────────────
    socket.on('join-session', async ({ sessionId }) => {
      try {
        const session = await ProctoringSession.findById(sessionId);
        if (!session) {
          socket.emit('error', { message: 'Session not found' });
          return;
        }
        if (session.userId.toString() !== userId && socket.user.role !== 'admin') {
          socket.emit('error', { message: 'Access denied' });
          return;
        }
        socket.join(`session:${sessionId}`);
        frameCounters.set(sessionId, 0);
        socket.emit('session-joined', { sessionId, status: session.status });
        console.log(`✅ User ${userId} joined session ${sessionId}`);
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // ── Receive a frame from frontend → forward to AI ───────────────────────
    socket.on('proctor-frame', async ({ sessionId, imageBase64 }) => {
      try {
        // Throttle: process max 1 frame per 3 seconds per session
        const key    = `${sessionId}:last`;
        const lastTs = frameCounters.get(key) || 0;
        const now    = Date.now();
        if (now - lastTs < 2500) return;          // skip if too soon
        frameCounters.set(key, now);

        const frameNo = (frameCounters.get(sessionId) || 0) + 1;
        frameCounters.set(sessionId, frameNo);

        // Forward to Python AI
        const aiRes = await axios.post(`${AI_SERVICE}/analyze-frame`, {
          session_id:   sessionId,
          user_id:      userId,
          image_base64: imageBase64,
          frame_number: frameNo,
        }, { timeout: 8000 });

        const analysis = aiRes.data;

        // ── Check for auto-termination conditions ────────────────────────────
        const session = await ProctoringSession.findById(sessionId);
        
        // 1. Identity mismatch → terminate immediately
        if (IDENTITY_MISMATCH_TERMINATE && analysis.alerts?.includes('IDENTITY_MISMATCH')) {
          const violation = [{
            timestamp: new Date(),
            type: 'IDENTITY_MISMATCH',
            details: { riskScore: analysis.risk_score, frame: frameNo }
          }];
          await terminateSession(sessionId, userId, 'Identity mismatch detected - different person', violation, io);
          return;
        }

        // 2. Track looking-away violations → terminate on excessive
        let tracker = violationTrackers.get(sessionId);
        if (!tracker) {
          tracker = { violations: [], lastResetTime: Date.now() };
          violationTrackers.set(sessionId, tracker);
        }

        const lookingAwayAlerts = ['HEAD_TURNED_LEFT', 'HEAD_TURNED_RIGHT', 'LOOKING_AWAY', 'HEAD_DOWN'];
        const hasViolation = analysis.alerts?.some(a => lookingAwayAlerts.includes(a));

        if (hasViolation) {
          const violationTypes = analysis.alerts.filter(a => lookingAwayAlerts.includes(a));
          tracker.violations.push({
            timestamp: new Date(),
            type: violationTypes.join(','),
            details: { riskScore: analysis.risk_score, frame: frameNo }
          });
          
          // Reset counter if time window expired
          if (Date.now() - tracker.lastResetTime > LOOKING_AWAY_TIME_WINDOW) {
            tracker.violations = [{
              timestamp: new Date(),
              type: violationTypes.join(','),
              details: { riskScore: analysis.risk_score, frame: frameNo }
            }];
            tracker.lastResetTime = Date.now();
          }

          // Check if exceeded threshold
          if (tracker.violations.length >= LOOKING_AWAY_THRESHOLD) {
            await terminateSession(
              sessionId,
              userId,
              `Student not looking at camera (${tracker.violations.length} violations in ${LOOKING_AWAY_TIME_WINDOW / 1000}s)`,
              tracker.violations,
              io
            );
            violationTrackers.delete(sessionId);
            return;
          }
        } else {
          // Reset violations if no looking-away detected
          if (Date.now() - tracker.lastResetTime > LOOKING_AWAY_TIME_WINDOW) {
            tracker.violations = [];
            tracker.lastResetTime = Date.now();
          }
        }

        // Persist alerts to MongoDB
        if (analysis.alerts?.length) {
          const logs = analysis.alerts.map(type => ({
            sessionId,
            userId,
            examId: null,   // optionally pass examId from client
            type,
            riskScore:   analysis.risk_score,
            frameNumber: frameNo,
          }));
          await AlertLog.insertMany(logs).catch(console.error);
        }

        // Update session stats
        await ProctoringSession.findByIdAndUpdate(sessionId, {
          $inc: { totalFramesAnalyzed: 1, alertCount: analysis.alerts?.length || 0 },
          $push: { riskScoreHistory: { $each: [analysis.risk_score], $slice: -300 } },
          $max: { maxRiskScore: analysis.risk_score },
          ...(analysis.risk_score >= 0.8 ? { status: 'flagged' } : {}),
        }).catch(console.error);

        // ── Emit result ──────────────────────────────────────────────────────
        // To the student (confirmation)
        socket.emit('proctor-result', analysis);

        // To admin room (live monitoring)
        io.to(`admin-monitor`).emit('student-frame-analysis', {
          sessionId,
          userId,
          ...analysis,
        });

        // High-risk alert → notify admins immediately
        if (analysis.risk_score >= 0.7) {
          io.to('admin-monitor').emit('high-risk-alert', {
            sessionId,
            userId,
            riskScore: analysis.risk_score,
            alerts: analysis.alerts,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error(`Frame processing error (session=${sessionId}):`, err.message);
        socket.emit('proctor-error', { message: 'Frame analysis failed', sessionId });
      }
    });

    // ── Admin joins monitoring room ──────────────────────────────────────────
    socket.on('join-admin-monitor', () => {
      if (socket.user.role !== 'admin') return;
      socket.join('admin-monitor');
      console.log(`👁 Admin ${userId} joined monitor room`);
    });

    // ── Tab visibility change (student switched tab) ─────────────────────────
    socket.on('tab-hidden', async ({ sessionId }) => {
      await AlertLog.create({
        sessionId,
        userId,
        examId: null,
        type: 'LOOKING_AWAY',
        riskScore: 0.5,
        frameNumber: frameCounters.get(sessionId) || 0,
        details: { source: 'tab_visibility_change' },
      }).catch(console.error);

      io.to('admin-monitor').emit('tab-switch-alert', { sessionId, userId });
    });

    // ── Disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: userId=${userId}`);
      // Cleanup violation trackers if applicable
      for (const [sessionId, tracker] of violationTrackers.entries()) {
        if (tracker) {
          // Optional: cleanup old trackers after 5 minutes of inactivity
          if (Date.now() - tracker.lastResetTime > 300000) {
            violationTrackers.delete(sessionId);
          }
        }
      }
    });
  });
}

module.exports = { setupProctorSocket };
