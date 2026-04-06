// ─── RiskMeter.jsx ────────────────────────────────────────────────────────────
import React from 'react';

export function RiskMeter({ score = 0 }) {
  const pct    = Math.round(score * 100);
  const colour = score >= 0.7 ? '#e53e3e' : score >= 0.4 ? '#dd6b20' : '#38a169';
  const label  = score >= 0.7 ? 'HIGH RISK' : score >= 0.4 ? 'MEDIUM' : 'LOW RISK';

  return (
    <div className="risk-meter">
      <div className="risk-bar-track">
        <div
          className="risk-bar-fill"
          style={{ width: `${pct}%`, background: colour }}
        />
      </div>
      <div className="risk-labels">
        <span style={{ color: colour }}>{label}</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}

// ─── AlertBadge.jsx ───────────────────────────────────────────────────────────
export function AlertBadge({ alerts = [], time }) {
  if (!alerts.length) return null;
  return (
    <div className="alert-badge">
      <span className="alert-time">{time}</span>
      <div className="alert-tags">
        {alerts.map((a, i) => (
          <span key={i} className="alert-tag">{a.replace(/_/g, ' ')}</span>
        ))}
      </div>
    </div>
  );
}

// ─── FaceRegistration.jsx ─────────────────────────────────────────────────────
import { useRef, useState, useCallback, useEffect } from 'react';

const BACKEND = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

export function FaceRegistration({ token, onComplete }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const [step,     setStep]    = useState('intro');   // intro | camera | capturing | done | error
  const [message,  setMessage] = useState('');
  const streamRef = useRef(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      setStep('camera');
      setMessage('');
    } catch (err) {
      setStep('error');
      setMessage(`Camera error: ${err.message}`);
    }
  }, []);

  // Assign stream to video once the camera step is active and video element is mounted
  useEffect(() => {
    if (step !== 'camera') return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) {
      return;
    }

    video.srcObject = stream;
    const attemptPlay = async () => {
      try {
        await video.play();
      } catch (err) {
        console.warn('Video play warning:', err);
      }
    };
    attemptPlay();

    return () => {
      if (!stream) return;
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [step]);

  const captureAndRegister = useCallback(async () => {
    if (!videoRef.current) {
      setStep('error');
      setMessage('Camera error: video element not available for capture');
      return;
    }
    setStep('capturing');
    const canvas = canvasRef.current;
    const video  = videoRef.current;

    if (video.readyState < 2) {
      setStep('error');
      setMessage('Camera error: video stream not ready yet');
      return;
    }

    canvas.width  = 640;
    canvas.height = 480;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg', 0.9);

    try {
      const res  = await fetch(`${BACKEND}/api/auth/register-face`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const data = await res.json();
      if (data.success) {
        setStep('done');
        streamRef.current?.getTracks().forEach(t => t.stop());
        onComplete?.();
      } else {
        setStep('error');
        setMessage(data.error || 'Registration failed');
      }
    } catch (err) {
      setStep('error');
      setMessage(err.message);
    }
  }, [token, onComplete]);

  return (
    <div className="face-reg">
      <h2>Face Registration</h2>
      {step === 'intro' && (
        <>
          <p>We need to register your face before the exam starts. Please make sure:</p>
          <ul>
            <li>You are in a well-lit room</li>
            <li>Your face is clearly visible</li>
            <li>No other people are in the frame</li>
          </ul>
          <button className="btn-primary" onClick={startCamera}>Start Camera</button>
        </>
      )}
      {(step === 'camera' || step === 'capturing') && (
        <>
          <video ref={videoRef} autoPlay playsInline muted
            style={{ width: '100%', maxWidth: 480, borderRadius: 8, transform: 'scaleX(-1)' }}
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <button className="btn-primary" onClick={captureAndRegister}
            disabled={step === 'capturing'}>
            {step === 'capturing' ? 'Registering...' : 'Capture & Register'}
          </button>
        </>
      )}
      {step === 'done' && <p className="success-msg">✅ Face registered successfully!</p>}
      {step === 'error' && (
        <>
          <p className="error-msg">❌ {message}</p>
          <button className="btn-secondary" onClick={() => setStep('intro')}>Try again</button>
        </>
      )}
    </div>
  );
}

// ─── AdminDashboard.jsx ───────────────────────────────────────────────────────
import { io } from 'socket.io-client';

export function AdminDashboard({ token }) {
  const [stats,    setStats]    = useState(null);
  const [sessions, setSessions] = useState([]);
  const [liveAlerts, setLiveAlerts] = useState([]);

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    fetch(`${BACKEND}/api/admin/stats`, { headers })
      .then(r => r.json()).then(setStats);
    fetch(`${BACKEND}/api/admin/sessions`, { headers })
      .then(r => r.json()).then(setSessions);
  }, [token]);

  // Live monitoring via Socket.io
  useEffect(() => {
    const socket = io(BACKEND, { auth: { token } });
    socket.on('connect', () => socket.emit('join-admin-monitor'));
    socket.on('high-risk-alert', (alert) => {
      setLiveAlerts(prev => [{ ...alert, id: Date.now() }, ...prev.slice(0, 19)]);
    });
    socket.on('student-frame-analysis', (data) => {
      setSessions(prev => prev.map(s =>
        s._id === data.sessionId
          ? { ...s, maxRiskScore: Math.max(s.maxRiskScore || 0, data.risk_score), lastSeen: new Date() }
          : s
      ));
    });
    return () => socket.disconnect();
  }, [token]);

  const riskBg = (score) =>
    score >= 0.7 ? '#fff5f5' : score >= 0.4 ? '#fffaf0' : '#f0fff4';

  return (
    <div className="admin-dashboard">
      <h2>Admin Monitor</h2>

      {stats && (
        <div className="stats-grid">
          {[
            ['Students', stats.users],
            ['Exams', stats.exams],
            ['Sessions', stats.sessions],
            ['Alerts', stats.alerts],
            ['Flagged', stats.flagged],
          ].map(([label, val]) => (
            <div key={label} className="stat-card">
              <span className="stat-val">{val}</span>
              <span className="stat-label">{label}</span>
            </div>
          ))}
        </div>
      )}

      {liveAlerts.length > 0 && (
        <div className="live-alerts">
          <h3>🔴 Live Alerts</h3>
          {liveAlerts.map(a => (
            <div key={a.id} className="live-alert-item">
              <strong>Session:</strong> {a.sessionId.slice(-6)} &nbsp;
              <strong>Risk:</strong> {(a.riskScore * 100).toFixed(0)}% &nbsp;
              {a.alerts?.join(', ')}
            </div>
          ))}
        </div>
      )}

      <h3>All Sessions</h3>
      <table className="sessions-table">
        <thead>
          <tr><th>Student</th><th>Exam</th><th>Status</th><th>Risk</th><th>Alerts</th><th>Started</th></tr>
        </thead>
        <tbody>
          {sessions.map(s => (
            <tr key={s._id} style={{ background: riskBg(s.maxRiskScore) }}>
              <td>{s.userId?.name || '—'}</td>
              <td>{s.examId?.title || '—'}</td>
              <td><span className={`status-pill ${s.status}`}>{s.status}</span></td>
              <td>{((s.maxRiskScore || 0) * 100).toFixed(0)}%</td>
              <td>{s.alertCount || 0}</td>
              <td>{new Date(s.startedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── TerminationModal.jsx ─────────────────────────────────────────────────────
export function TerminationModal({ session, reason, token }) {
  const [appealReason, setAppealReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const BACKEND = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

  const handleAppealSubmit = async (e) => {
    e.preventDefault();
    if (appealReason.length < 10) {
      setError('Appeal reason must be at least 10 characters');
      return;
    }

    try {
      const res = await fetch(`${BACKEND}/api/sessions/${session.sessionId}/appeal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ appealReason })
      });

      if (res.ok) {
        setSubmitted(true);
        setError('');
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to submit appeal');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  if (submitted) {
    return (
      <div style={{
        background: '#f0fdf4',
        border: '2px solid #16a34a',
        borderRadius: 8,
        padding: 32,
        textAlign: 'center',
        maxWidth: 500,
      }}>
        <h2 style={{ color: '#16a34a', marginBottom: 16 }}>✅ Appeal Submitted</h2>
        <p>Your appeal has been submitted for review.</p>
        <p style={{ fontSize: 14, color: '#666', marginTop: 12 }}>
          The admin team will review your appeal and notify you of the decision via email within 24-48 hours.
        </p>
      </div>
    );
  }

  return (
    <div style={{
      background: '#fff',
      border: '2px solid #e53e3e',
      borderRadius: 8,
      padding: 32,
      maxWidth: 550,
    }}>
      <h2 style={{ color: '#e53e3e', marginBottom: 8 }}>🛑 Session Terminated</h2>
      <p style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
        <strong>Reason:</strong> {reason}
      </p>

      <div style={{ background: '#f9f9f9', padding: 12, borderRadius: 4, marginBottom: 20 }}>
        <p style={{ fontSize: 12, color: '#666', margin: 0 }}>
          Your exam session was terminated by the proctoring system. If you believe this decision was in error, you may submit an appeal below.
          The admin team will review your case and respond within 24-48 hours.
        </p>
      </div>

      <form onSubmit={handleAppealSubmit}>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
          Appeal Reason *
        </label>
        <textarea
          value={appealReason}
          onChange={(e) => setAppealReason(e.target.value)}
          placeholder="Explain why you believe this termination was in error. Be specific and detailed."
          minLength="10"
          required
          style={{
            width: '100%',
            height: 120,
            padding: 12,
            border: '1px solid #ddd',
            borderRadius: 4,
            fontFamily: 'inherit',
            fontSize: 14,
            marginBottom: 12,
            boxSizing: 'border-box'
          }}
        />
        {error && <p style={{ color: '#e53e3e', fontSize: 12, marginBottom: 12 }}>❌ {error}</p>}

        <button
          type="submit"
          style={{
            width: '100%',
            padding: 12,
            background: '#3182ce',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: 14
          }}
        >
          Submit Appeal
        </button>
      </form>
    </div>
  );
}
