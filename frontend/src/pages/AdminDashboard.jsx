// src/pages/AdminDashboard.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import LoadingSpinner from '../components/LoadingSpinner';

const BACKEND = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

const STATUS_FILTERS = ['all', 'active', 'completed', 'flagged', 'terminated'];

export default function AdminDashboard() {
  const { token } = useAuth();
  const navigate  = useNavigate();

  const [stats,      setStats]      = useState(null);
  const [sessions,   setSessions]   = useState([]);
  const [liveAlerts, setLiveAlerts] = useState([]);
  const [filter,     setFilter]     = useState('all');
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // ── Fetch data ─────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    const h = { Authorization: `Bearer ${token}` };
    const statusQ = filter !== 'all' ? `&status=${filter}` : '';
    try {
      const [statsRes, sessionsRes] = await Promise.all([
        fetch(`${BACKEND}/api/admin/stats`,                              { headers: h }),
        fetch(`${BACKEND}/api/admin/sessions?page=${page}&limit=20${statusQ}`, { headers: h }),
      ]);
      const statsData    = await statsRes.json();
      const sessionsData = await sessionsRes.json();
      setStats(statsData);
      setSessions(sessionsData.sessions || []);
      setTotalPages(sessionsData.pages  || 1);
    } catch (err) {
      console.error('Admin fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [token, filter, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Live Socket.io monitoring ──────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    const socket = io(BACKEND, { auth: { token }, transports: ['websocket'] });

    socket.on('connect',            () => socket.emit('join-admin-monitor'));
    socket.on('high-risk-alert',    alert => {
      setLiveAlerts(prev => [{ ...alert, id: Date.now() }, ...prev.slice(0, 9)]);
    });
    socket.on('student-frame-analysis', data => {
      setSessions(prev => prev.map(s =>
        s._id === data.sessionId
          ? { ...s, maxRiskScore: Math.max(s.maxRiskScore || 0, data.risk_score) }
          : s
      ));
    });
    return () => socket.disconnect();
  }, [token]);

  // ── Terminate session ──────────────────────────────────────────────────────
  const terminateSession = async (sessionId) => {
    if (!window.confirm('Terminate this session?')) return;
    await fetch(`${BACKEND}/api/admin/sessions/${sessionId}/terminate`, {
      method:  'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchData();
  };

  const riskBg = (score) =>
    score >= 0.7 ? '#fff5f5' : score >= 0.4 ? '#fffaf0' : 'transparent';

  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fa' }}>
      <Navbar />

      <div className="admin-page">
        <div className="admin-header">
          <h2>Admin Monitor</h2>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="admin-nav-btn" onClick={() => navigate('/admin/students')}>
              👥 Manage Students
            </button>
            <button className="admin-nav-btn" onClick={() => navigate('/admin/exams')}>
              📝 Manage Exams
            </button>
            <button className="btn-secondary" onClick={fetchData}>↻ Refresh</button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="stats-grid">
            {[
              { label: 'Students',   val: stats.users,    color: '#3182ce' },
              { label: 'Exams',      val: stats.exams,    color: '#38a169' },
              { label: 'Sessions',   val: stats.sessions, color: '#805ad5' },
              { label: 'Live now',   val: stats.active,   color: '#dd6b20' },
              { label: 'Flagged',    val: stats.flagged,  color: '#e53e3e' },
              { label: 'Alerts',     val: stats.alerts,   color: '#d69e2e' },
            ].map(({ label, val, color }) => (
              <div key={label} className="stat-card">
                <span className="stat-val" style={{ color }}>{val}</span>
                <span className="stat-label">{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Live alert feed */}
        {liveAlerts.length > 0 && (
          <div className="live-alert-panel">
            <h3>🔴 Live Alerts</h3>
            {liveAlerts.map(a => (
              <div key={a.id} className="live-alert-row">
                <span className="live-alert-session">
                  Session …{String(a.sessionId).slice(-6)}
                </span>
                <span className="live-alert-risk" style={{ color: '#e53e3e' }}>
                  Risk {Math.round((a.riskScore || 0) * 100)}%
                </span>
                <span className="live-alert-types">
                  {a.alerts?.join(' · ')}
                </span>
                <span className="live-alert-time">
                  {new Date(a.timestamp).toLocaleTimeString()}
                </span>
                <button className="link-btn"
                  onClick={() => navigate(`/admin/session/${a.sessionId}`)}>
                  View →
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Filter tabs */}
        <div className="filter-tabs">
          {STATUS_FILTERS.map(f => (
            <button
              key={f}
              className={`filter-tab ${filter === f ? 'active' : ''}`}
              onClick={() => { setFilter(f); setPage(1); }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Sessions table */}
        {loading ? (
          <LoadingSpinner message="Loading sessions…" />
        ) : sessions.length === 0 ? (
          <p className="empty-state" style={{ padding: '32px 0' }}>
            No sessions found.
          </p>
        ) : (
          <>
            <div className="table-wrapper">
              <table className="sessions-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Exam</th>
                    <th>Status</th>
                    <th>Max Risk</th>
                    <th>Alerts</th>
                    <th>Score</th>
                    <th>Started</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(s => (
                    <tr key={s._id} style={{ background: riskBg(s.maxRiskScore) }}>
                      <td>
                        <div className="td-name">{s.userId?.name   || '—'}</div>
                        <div className="td-sub">{s.userId?.email  || ''}</div>
                      </td>
                      <td>{s.examId?.title || '—'}</td>
                      <td><span className={`status-pill ${s.status}`}>{s.status}</span></td>
                      <td>
                        <span style={{ color: s.maxRiskScore >= 0.7 ? '#e53e3e' : '#2d3748', fontWeight: 600 }}>
                          {Math.round((s.maxRiskScore || 0) * 100)}%
                        </span>
                      </td>
                      <td>{s.alertCount || 0}</td>
                      <td>{s.score !== undefined ? `${s.score}%` : '—'}</td>
                      <td className="td-sub">{new Date(s.startedAt).toLocaleString()}</td>
                      <td className="td-actions">
                        <button className="link-btn"
                          onClick={() => navigate(`/admin/session/${s._id}`)}>
                          Report
                        </button>
                        {s.status === 'active' && (
                          <button className="link-btn danger-link"
                            onClick={() => terminateSession(s._id)}>
                            Terminate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination">
                <button disabled={page === 1}
                  className="btn-secondary" onClick={() => setPage(p => p - 1)}>
                  ← Prev
                </button>
                <span>Page {page} of {totalPages}</span>
                <button disabled={page === totalPages}
                  className="btn-secondary" onClick={() => setPage(p => p + 1)}>
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}