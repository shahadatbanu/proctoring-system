// src/pages/SessionReportPage.jsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import LoadingSpinner from '../components/LoadingSpinner';

const BACKEND = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

const ALERT_LABELS = {
  NO_FACE_DETECTED:       { label: 'No face',         color: '#c53030' },
  MULTIPLE_FACES_DETECTED:{ label: 'Multiple faces',  color: '#c53030' },
  IDENTITY_MISMATCH:      { label: 'Identity mismatch', color: '#c53030' },
  SPOOF_ATTEMPT_DETECTED: { label: 'Spoof attempt',   color: '#744210' },
  LOOKING_AWAY:           { label: 'Looking away',    color: '#2c5282' },
  HEAD_TURNED_LEFT:       { label: 'Head left',       color: '#2c5282' },
  HEAD_TURNED_RIGHT:      { label: 'Head right',      color: '#2c5282' },
  HEAD_DOWN:              { label: 'Head down',        color: '#2c5282' },
  HEAD_TILTED:            { label: 'Head tilted',     color: '#4a5568' },
  EYES_CLOSED:            { label: 'Eyes closed',     color: '#4a5568' },
};

export default function SessionReportPage() {
  const { sessionId } = useParams();
  const { token }     = useAuth();
  const navigate      = useNavigate();
  const [report,   setReport]   = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    fetch(`${BACKEND}/api/admin/sessions/${sessionId}/report`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setReport(data);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [sessionId, token]);

  if (loading) return <LoadingSpinner fullScreen message="Loading report…" />;
  if (error)   return <div className="loading" style={{ color: '#e53e3e' }}>Error: {error}</div>;

  const { session, alertSummary, alertLog } = report;
  const riskPct = Math.round((session.maxRiskScore || 0) * 100);

  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fa' }}>
      <Navbar />
      <div className="report-page">
        {/* Back */}
        <button className="link-btn" style={{ marginBottom: 16 }}
          onClick={() => navigate('/admin')}>
          ← Back to dashboard
        </button>

        {/* Header */}
        <div className="report-header">
          <div>
            <h2>{session.examId?.title || 'Unknown Exam'}</h2>
            <p className="report-sub">
              Student: <strong>{session.userId?.name}</strong> ({session.userId?.email})
            </p>
            <p className="report-sub">
              Started: {new Date(session.startedAt).toLocaleString()}
              {session.endedAt && ` · Ended: ${new Date(session.endedAt).toLocaleString()}`}
            </p>
          </div>
          <div className="report-badges">
            <span className={`status-pill ${session.status}`}>{session.status}</span>
            {session.score !== undefined && (
              <span className="score-badge">Score: {session.score}%</span>
            )}
          </div>
        </div>

        {/* Stats grid */}
        <div className="report-stats">
          {[
            ['Frames analysed',   session.totalFramesAnalyzed || 0],
            ['Total alerts',      session.alertCount || 0],
            ['Max risk',          `${riskPct}%`],
            ['Avg risk',          `${Math.round((session.avgRiskScore || 0) * 100)}%`],
          ].map(([label, val]) => (
            <div key={label} className="report-stat-card">
              <span className="rstat-val">{val}</span>
              <span className="rstat-label">{label}</span>
            </div>
          ))}
        </div>

        {/* Alert summary */}
        {Object.keys(alertSummary).length > 0 && (
          <section className="report-section">
            <h3>Alert Summary</h3>
            <div className="alert-summary-grid">
              {Object.entries(alertSummary)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => {
                  const meta = ALERT_LABELS[type] || { label: type, color: '#4a5568' };
                  return (
                    <div key={type} className="alert-summary-card">
                      <span className="asum-count" style={{ color: meta.color }}>{count}</span>
                      <span className="asum-label">{meta.label}</span>
                    </div>
                  );
                })}
            </div>
          </section>
        )}

        {/* Alert timeline */}
        <section className="report-section">
          <h3>Alert Timeline ({alertLog.length})</h3>
          {alertLog.length === 0
            ? <p className="empty-state">No alerts recorded for this session.</p>
            : (
              <div className="alert-timeline">
                {alertLog.map((a, i) => {
                  const meta = ALERT_LABELS[a.type] || { label: a.type, color: '#4a5568' };
                  return (
                    <div key={i} className="timeline-item">
                      <div className="timeline-dot" style={{ background: meta.color }} />
                      <div className="timeline-content">
                        <span className="timeline-type" style={{ color: meta.color }}>
                          {meta.label}
                        </span>
                        <span className="timeline-risk">
                          Risk: {Math.round((a.riskScore || 0) * 100)}%
                        </span>
                        <span className="timeline-time">
                          {new Date(a.timestamp).toLocaleTimeString()}
                        </span>
                        {a.frameNumber !== undefined && (
                          <span className="timeline-frame">frame #{a.frameNumber}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          }
        </section>
      </div>
    </div>
  );
}
