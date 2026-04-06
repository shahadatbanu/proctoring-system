import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import LoadingSpinner from '../components/LoadingSpinner';

const BACKEND = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

export default function AdminAppealsPage() {
  const { token } = useAuth();
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAppeal, setSelectedAppeal] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [decision, setDecision] = useState('');

  const fetchAppeals = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/admin/appeals`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setAppeals(data.appeals || []);
    } catch (err) {
      console.error('Fetch appeals error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAppeals(); }, [token]);

  const handleReviewSubmit = async () => {
    if (!decision) {
      alert('Please select a decision (Approved/Rejected)');
      return;
    }

    try {
      const res = await fetch(`${BACKEND}/api/admin/appeals/${selectedAppeal._id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ decision, notes: reviewNotes })
      });

      if (res.ok) {
        fetchAppeals();
        setSelectedAppeal(null);
        setReviewNotes('');
        setDecision('');
        alert('Appeal review submitted successfully');
      } else {
        const err = await res.json();
        alert('Error: ' + err.error);
      }
    } catch (err) {
      console.error('Review error:', err);
      alert('Failed to submit review');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="admin-appeals-page">
      <Navbar />
      <div className="container">
        <h1>Appeals Management</h1>
        <p style={{ color: '#666' }}>
          {appeals.length} pending appeal{appeals.length !== 1 ? 's' : ''}
        </p>

        {appeals.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#999' }}>
            <p>No pending appeals</p>
          </div>
        ) : (
          <div className="appeals-grid">
            {appeals.map(appeal => (
              <div key={appeal._id} className="appeal-card" style={{
                border: '1px solid #ddd',
                borderRadius: 8,
                padding: 16,
                marginBottom: 16,
                background: '#fafafa'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <h3 style={{ margin: '0 0 8px 0' }}>{appeal.userId?.name}</h3>
                    <p style={{ margin: '0 0 4px 0', fontSize: 12, color: '#666' }}>
                      Email: {appeal.userId?.email}
                    </p>
                    <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#666' }}>
                      Exam: {appeal.examId?.title}
                    </p>
                    <p style={{ margin: '0 0 8px 0', fontSize: 12 }}>
                      <strong>Termination Reason:</strong> {appeal.terminationReason}
                    </p>
                    <p style={{ margin: '0', fontSize: 12 }}>
                      <strong>Appeal Reason:</strong> {appeal.appealReason}
                    </p>
                  </div>
                  <button
                    className="btn-primary"
                    onClick={() => setSelectedAppeal(appeal)}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    Review
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedAppeal && (
          <div className="modal" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: 'white', borderRadius: 8, padding: 32, maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}>
              <h2>Review Appeal</h2>
              <div style={{ marginBottom: 16, padding: 12, background: '#f9f9f9', borderRadius: 4 }}>
                <p><strong>Student:</strong> {selectedAppeal.userId?.name} ({selectedAppeal.userId?.email})</p>
                <p><strong>Exam:</strong> {selectedAppeal.examId?.title}</p>
                <p><strong>Termination Reason:</strong> {selectedAppeal.terminationReason}</p>
                <p><strong>Appeal Reason:</strong></p>
                <p style={{ background: 'white', padding: 12, borderRadius: 4, fontStyle: 'italic' }}>
                  {selectedAppeal.appealReason}
                </p>
                <p><strong>Submitted:</strong> {new Date(selectedAppeal.appealSubmittedAt).toLocaleString()}</p>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>Decision *</label>
                <div>
                  <label style={{ marginRight: 20 }}>
                    <input
                      type="radio"
                      value="approved"
                      checked={decision === 'approved'}
                      onChange={(e) => setDecision(e.target.value)}
                      style={{ marginRight: 4 }}
                    />
                    Approve Appeal
                  </label>
                  <label>
                    <input
                      type="radio"
                      value="rejected"
                      checked={decision === 'rejected'}
                      onChange={(e) => setDecision(e.target.value)}
                      style={{ marginRight: 4 }}
                    />
                    Reject Appeal
                  </label>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>Review Notes</label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Explain your decision (will be sent to student)"
                  style={{
                    width: '100%',
                    height: 100,
                    padding: 12,
                    border: '1px solid #ddd',
                    borderRadius: 4,
                    fontFamily: 'inherit',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  className="btn-secondary"
                  onClick={() => setSelectedAppeal(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={handleReviewSubmit}
                  style={{ background: decision === 'approved' ? '#16a34a' : '#e53e3e' }}
                >
                  {decision === 'approved' ? '✓ Approve' : '✕ Reject'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
