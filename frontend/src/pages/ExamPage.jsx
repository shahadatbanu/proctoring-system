// src/pages/ExamPage.jsx
import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ExamRoom    from '../components/ExamRoom';

const BACKEND = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

export function ExamPage() {
  const { examId }         = useParams();
  const [searchParams]     = useSearchParams();
  const sessionId          = searchParams.get('sessionId');
  const { user, token }    = useAuth();
  const navigate           = useNavigate();
  const [verified, setVerified]  = useState(false);
  const [verifying,setVerifying] = useState(true);
  const [verifyError,setVerifyError] = useState('');
  const videoRef           = React.useRef(null);
  const streamRef          = React.useRef(null);

  // ── Pre-exam identity verification ────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) { navigate('/dashboard'); return; }
    startVerificationCamera();
  }, []);

  const startVerificationCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      setVerifyError(`Camera error: ${err.message}`);
      setVerifying(false);
    }
  };

  const captureAndVerify = async () => {
    setVerifyError('');
    const canvas = document.createElement('canvas');
    canvas.width  = 640; canvas.height = 480;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg', 0.9);

    try {
      const res  = await fetch(`${BACKEND}/api/auth/verify-face`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ imageBase64: base64 }),
      });
      const data = await res.json();
      if (data.match) {
        streamRef.current?.getTracks().forEach(t => t.stop());
        setVerified(true);
        setVerifying(false);
      } else {
        setVerifyError(
          `Identity not verified (confidence: ${(data.confidence * 100).toFixed(0)}%). Please try again.`
        );
      }
    } catch (err) {
      setVerifyError(`Verification failed: ${err.message}`);
    }
  };

  const skipVerify = () => {
    // Allow skip in dev mode
    if (process.env.NODE_ENV !== 'production') {
      streamRef.current?.getTracks().forEach(t => t.stop());
      setVerified(true);
      setVerifying(false);
    }
  };

  // Pre-exam identity check screen
  if (!verified) {
    return (
      <div className="verify-screen">
        <div className="verify-card">
          <h2>Identity Verification</h2>
          <p>Please look at the camera to verify your identity before starting the exam.</p>

          <video
            ref={videoRef}
            autoPlay playsInline muted
            style={{ width: '100%', maxWidth: 400, borderRadius: 8, transform: 'scaleX(-1)' }}
          />

          {verifyError && <div className="auth-error">{verifyError}</div>}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16 }}>
            <button className="btn-primary" onClick={captureAndVerify}>
              Verify & Start Exam
            </button>
            {process.env.NODE_ENV !== 'production' && (
              <button className="btn-secondary" onClick={skipVerify}>
                Skip (dev only)
              </button>
            )}
          </div>

          <button
            className="link-btn"
            style={{ marginTop: 12 }}
            onClick={() => navigate('/dashboard')}
          >
            ← Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <ExamRoom
      examId={examId}
      sessionId={sessionId}
      token={token}
      user={user}
    />
  );
}
