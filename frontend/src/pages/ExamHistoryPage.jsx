import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import LoadingSpinner from '../components/LoadingSpinner';

const BACKEND = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

export default function ExamHistoryPage() {
  const { token } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const res = await fetch(`${BACKEND}/api/sessions`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setSessions(data);
      } catch (err) {
        console.error('Fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSessions();
  }, [token]);

  const getStatusBadge = (status) => {
    const statusColors = {
      completed: '#16a34a',
      terminated: '#e53e3e',
      flagged: '#dd6b20',
      appeal_pending: '#3b82f6',
      appeal_approved: '#16a34a',
      appeal_rejected: '#e53e3e'
    };
    return (
      <span style={{
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: 4,
        background: statusColors[status] || '#6b7280',
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold'
      }}>
        {status.replace(/_/g, ' ').toUpperCase()}
      </span>
    );
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="exam-history-page">
      <Navbar />
      <div className="container" style={{ maxWidth: 1000 }}>
        <h1>Exam History</h1>
        <p style={{ color: '#666' }}>View all your exam attempts and proctoring results</p>

        {sessions.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', background: '#f9f9f9', borderRadius: 8 }}>
            <p style={{ color: '#999', fontSize: 16 }}>No exam attempts yet</p>
          </div>
        ) : (
          <div>
            {sessions.map(session => (
              <div
                key={session._id}
                onClick={() => setSelectedSession(selectedSession?._id === session._id ? null : session)}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  padding: 16,
                  marginBottom: 12,
                  background: selectedSession?._id === session._id ? '#f0f9ff' : '#fff',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: '0 0 8px 0' }}>{session.examId?.title}</h3>
                    <p style={{ margin: '0 0 4px 0', fontSize: 12, color: '#666' }}>
                      Started: {new Date(session.startedAt).toLocaleString()}
                    </p>
                    {session.endedAt && (
                      <p style={{ margin: 0, fontSize: 12, color: '#666' }}>
                        Ended: {new Date(session.endedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {getStatusBadge(session.status)}
                    {session.score !== undefined && (
                      <p style={{ margin: '8px 0 0 0', fontSize: 14, fontWeight: 'bold' }}>
                        Score: {session.score}/{session.examId?.questions?.length || 0}
                      </p>
                    )}
                  </div>
                </div>

                {selectedSession?._id === session._id && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                      <div>
                        <p style={{ margin: '0 0 4px 0', fontSize: 12, color: '#666' }}>
                          Frames Analyzed
                        </p>
                        <p style={{ margin: 0, fontSize: 18, fontWeight: 'bold' }}>
                          {session.totalFramesAnalyzed || 0}
                        </p>
                      </div>
                      <div>
                        <p style={{ margin: '0 0 4px 0', fontSize: 12, color: '#666' }}>
                          Alerts Triggered
                        </p>
                        <p style={{ margin: 0, fontSize: 18, fontWeight: 'bold', color: '#e53e3e' }}>
                          {session.alertCount || 0}
                        </p>
                      </div>
                      <div>
                        <p style={{ margin: '0 0 4px 0', fontSize: 12, color: '#666' }}>
                          Max Risk Score
                        </p>
                        <p style={{ margin: 0, fontSize: 18, fontWeight: 'bold' }}>
                          {((session.maxRiskScore || 0) * 100).toFixed(0)}%
                        </p>
                      </div>
                      <div>
                        <p style={{ margin: '0 0 4px 0', fontSize: 12, color: '#666' }}>
                          Status
                        </p>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 'bold' }}>
                          {session.status}
                        </p>
                      </div>
                    </div>

                    {session.terminationReason && (
                      <div style={{ background: '#fef2f2', padding: 12, borderRadius: 4, marginBottom: 12 }}>
                        <p style={{ margin: '0 0 4px 0', fontSize: 12, fontWeight: 'bold', color: '#e53e3e' }}>
                          Termination Reason
                        </p>
                        <p style={{ margin: 0, fontSize: 12, color: '#b91c1c' }}>
                          {session.terminationReason}
                        </p>
                      </div>
                    )}

                    {session.violationLog?.length > 0 && (
                      <div>
                        <p style={{ margin: '0 0 8px 0', fontSize: 12, fontWeight: 'bold' }}>
                          Violations ({session.violationLog.length})
                        </p>
                        <div style={{ background: '#f9f9f9', padding: 8, borderRadius: 4, maxHeight: 120, overflowY: 'auto' }}>
                          {session.violationLog.map((v, i) => (
                            <div key={i} style={{ fontSize: 11, padding: 4, borderBottom: '1px solid #e5e7eb' }}>
                              <span style={{ fontWeight: 'bold' }}>{v.type}</span> at{' '}
                              {new Date(v.timestamp).toLocaleTimeString()}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {session.appealStatus && (
                      <div style={{ marginTop: 12, background: '#f0fdf4', padding: 12, borderRadius: 4 }}>
                        <p style={{ margin: '0 0 4px 0', fontSize: 12, fontWeight: 'bold', color: '#16a34a' }}>
                          Appeal Status: {session.appealStatus.toUpperCase()}
                        </p>
                        {session.appealNotes && (
                          <p style={{ margin: 0, fontSize: 12 }}>
                            {session.appealNotes}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
