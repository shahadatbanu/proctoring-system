// src/components/ExamRoom.jsx
import React, { useEffect } from 'react';
import useProctor  from '../hooks/useProctor';
import useExam     from '../hooks/useExam';
import { RiskMeter, AlertBadge, TerminationModal } from './components';
import ExamResult  from './ExamResult';
import Timer       from './Timer';

export default function ExamRoom({ examId, sessionId, token, user }) {
  const {
    videoRef, cameraReady, connected,
    analysis, alerts, riskScore, error: camError, sessionTerminated,
    startCamera, stopCamera,
  } = useProctor({ sessionId, token, enabled: true });

  const {
    exam, answers, timeLeft, submitted, result,
    loading, error: examError, answeredCount, totalCount, progressPct,
    selectAnswer, submitExam,
  } = useExam({ examId, sessionId, token });

  useEffect(() => { startCamera(); return () => stopCamera(); }, []);
  useEffect(() => { if (submitted) stopCamera(); }, [submitted]);

  const riskColor = riskScore >= 0.7 ? '#e53e3e' : riskScore >= 0.4 ? '#dd6b20' : '#38a169';

  if (loading)   return <div className="loading">Loading exam…</div>;
  if (examError) return <div className="loading" style={{ color:'#e53e3e' }}>Error: {examError}</div>;
  if (sessionTerminated) {
    return (
      <div className="exam-room" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <TerminationModal session={{ sessionId, examId }} reason={sessionTerminated.reason} token={token} />
      </div>
    );
  }
  if (result)    return <ExamResult result={result} riskScore={riskScore} exam={exam} />;

  return (
    <div className="exam-room">
      {/* ── Camera panel ── */}
      <aside className="camera-panel">
        <div className="camera-wrapper">
          <video ref={videoRef} autoPlay playsInline muted className="webcam"
            style={{ transform:'scaleX(-1)' }} />
          <div className="camera-overlay">
            <span className={`status-dot ${connected ? 'green' : 'red'}`} />
            <span>{connected ? 'Proctoring active' : 'Connecting…'}</span>
          </div>
          {analysis?.face_detected && (
            <div className="face-box-indicator" style={{ border:`2px solid ${riskColor}` }} />
          )}
          {!cameraReady && (
            <div className="camera-placeholder"><span>📷 Starting camera…</span></div>
          )}
        </div>

        {camError && <p className="camera-error">{camError}</p>}

        <div className="panel-section">
          <p className="panel-label">Risk level</p>
          <RiskMeter score={riskScore} />
        </div>

        {analysis && (
          <div className="panel-section">
            <p className="panel-label">Live status</p>
            <div className="analysis-status">
              <div className={`status-item ${analysis.face_detected ? 'ok' : 'warn'}`}>
                {analysis.face_detected ? `✓ Face detected (${analysis.face_count})` : '✗ No face detected'}
              </div>
              <div className={`status-item ${analysis.identity_match ? 'ok' : 'warn'}`}>
                {analysis.identity_match
                  ? `✓ Identity ${(analysis.identity_confidence*100).toFixed(0)}%`
                  : '✗ Identity mismatch'}
              </div>
              <div className={`status-item ${!analysis.spoof_detected ? 'ok' : 'warn'}`}>
                {analysis.spoof_detected ? '✗ Spoof detected' : '✓ Live person'}
              </div>
              {analysis.behaviour_flags?.map(f => (
                <div key={f} className="status-item warn">⚠ {f.replace(/_/g,' ')}</div>
              ))}
            </div>
          </div>
        )}

        <div className="panel-section">
          <p className="panel-label">Progress  {answeredCount}/{totalCount}</p>
          <div className="progress-track">
            <div className="progress-fill" style={{ width:`${progressPct}%` }} />
          </div>
        </div>

        <div className="panel-section" style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
          <p className="panel-label">Recent alerts</p>
          <div className="alert-log">
            {alerts.length === 0
              ? <p className="no-alerts">No alerts — all clear</p>
              : alerts.slice(0,6).map((a,i) => <AlertBadge key={i} alerts={a.alerts} time={a.time} />)
            }
          </div>
        </div>
      </aside>

      {/* ── Exam panel ── */}
      <main className="exam-panel">
        <div className="exam-header">
          <div>
            <h2 className="exam-title">{exam?.title}</h2>
            <p className="exam-meta-text">{exam?.questions?.length} questions · {exam?.duration} min</p>
          </div>
          <Timer timeLeft={timeLeft} />
        </div>

        <div className="questions">
          {exam?.questions?.map((q, qi) => (
            <div key={qi} className={`question ${answers[qi] !== undefined ? 'answered' : ''}`}>
              <p className="q-text">
                <span className="q-number">Q{qi+1}</span>{q.text}
              </p>
              <div className="options">
                {q.options.map((opt, oi) => (
                  <label key={oi}
                    className={`option ${answers[qi]===oi ? 'selected' : ''}`}
                    onClick={() => selectAnswer(qi, oi)}>
                    <span className="option-bullet">{String.fromCharCode(65+oi)}</span>
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="exam-footer">
          <span className="answered-count">{answeredCount} of {totalCount} answered</span>
          <button className="submit-btn" onClick={submitExam} disabled={submitted}>
            {submitted ? 'Submitting…' : 'Submit Exam'}
          </button>
        </div>
      </main>
    </div>
  );
}
