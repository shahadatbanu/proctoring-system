// src/pages/DashboardPage.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate }  from 'react-router-dom';
import { useAuth }      from '../context/AuthContext';

const BACKEND = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

export function DashboardPage() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [exams,    setExams]    = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    const h = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${BACKEND}/api/exam`,    { headers: h }).then(r => r.json()),
      fetch(`${BACKEND}/api/session`, { headers: h }).then(r => r.json()),
    ]).then(([examData, sessionData]) => {
      setExams(Array.isArray(examData) ? examData : []);
      setSessions(Array.isArray(sessionData) ? sessionData : []);
    }).finally(() => setLoading(false));
  }, [token]);

  const startExam = async (examId) => {
    const res  = await fetch(`${BACKEND}/api/session/start`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ examId }),
    });
    const data = await res.json();
    if (data.sessionId) {
      navigate(`/exam/${examId}?sessionId=${data.sessionId}`);
    }
  };

  const sessionForExam = (examId) =>
    sessions.find(s => s.examId?._id === examId || s.examId === examId);

  if (loading) return <div className="loading">Loading dashboard…</div>;

  return (
    <div className="dashboard-page">
      {/* Header */}
      <header className="dash-header">
        <div className="dash-brand">🎓 ProctorAI</div>
        <div className="dash-user">
          <span>Hello, {user?.name}</span>
          {!user?.faceRegistered && (
            <button className="btn-warn" onClick={() => navigate('/register-face')}>
              ⚠ Register Face
            </button>
          )}
          <button className="btn-secondary" onClick={logout}>Logout</button>
        </div>
      </header>

      <main className="dash-main">
        {/* Available exams */}
        {exams.length > 0 && (
          <section className="dash-section">
            <h2>Available Exams</h2>
            <div className="exams-grid">
              {exams.map(exam => {
                const session = sessionForExam(exam._id);
                const now = new Date();
                const scheduled = exam.scheduledAt ? new Date(exam.scheduledAt) : null;
                const canTake = !scheduled || now >= scheduled;
                const timeLeft = scheduled && now < scheduled ? scheduled - now : 0;

                return (
                  <div key={exam._id} className="exam-card">
                    <h3>{exam.title}</h3>
                    <p>{exam.description}</p>
                    <p>Duration: {exam.duration} min</p>
                    {scheduled && (
                      <p>Scheduled: {scheduled.toLocaleString()}</p>
                    )}
                    {session ? (
                      <div className={`status-pill ${session.status}`}>
                        {session.status === 'completed' ? `Score: ${session.score}%` : session.status}
                      </div>
                    ) : canTake ? (
                      <button className="btn-primary" onClick={() => startExam(exam._id)}>
                        Take Exam
                      </button>
                    ) : (
                      <div className="countdown">
                        Starts in: {Math.floor(timeLeft / 60000)} min
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Past sessions */}
        {sessions.length > 0 && (
          <section className="dash-section">
            <h2>Your Sessions</h2>
            <div className="sessions-grid">
              {sessions.map(s => (
                <div key={s._id} className="session-card">
                  <div className="session-card-title">{s.examId?.title || 'Exam'}</div>
                  <div className="session-meta">
                    <span className={`status-pill ${s.status}`}>{s.status}</span>
                    {s.score !== undefined && (
                      <span className="session-score">{s.score}%</span>
                    )}
                  </div>
                  <div className="session-date">
                    {new Date(s.startedAt).toLocaleDateString()}
                  </div>
                  {s.maxRiskScore >= 0.5 && (
                    <div className="session-flagged">⚠ Flagged for review</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Available exams */}
        <section className="dash-section">
          <h2>Available Exams</h2>
          {exams.length === 0 ? (
            <p className="empty-state">No exams available at this time.</p>
          ) : (
            <div className="exams-grid">
              {exams.map(exam => {
                const session   = sessionForExam(exam._id);
                const completed = session?.status === 'completed';
                const active    = session?.status === 'active';
                return (
                  <div key={exam._id} className="exam-card">
                    <h3>{exam.title}</h3>
                    <p className="exam-desc">{exam.description}</p>
                    <div className="exam-meta">
                      <span>⏱ {exam.duration} min</span>
                      <span>📝 {exam.questions?.length || 0} questions</span>
                    </div>
                    {completed ? (
                      <div className="exam-done">
                        ✅ Completed — {session.score}%
                      </div>
                    ) : (
                      <button
                        className="btn-primary"
                        disabled={!user?.faceRegistered}
                        onClick={() => startExam(exam._id)}
                        title={!user?.faceRegistered ? 'Register your face first' : ''}
                      >
                        {active ? '▶ Resume Exam' : '▶ Start Exam'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
