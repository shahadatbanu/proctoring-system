// src/components/ExamResult.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function ExamResult({ result, riskScore, exam }) {
  const navigate = useNavigate();
  const { score, correct, total } = result;

  const grade =
    score >= 90 ? { label: 'Excellent', color: '#38a169' } :
    score >= 75 ? { label: 'Good',      color: '#3182ce' } :
    score >= 60 ? { label: 'Pass',      color: '#dd6b20' } :
                  { label: 'Fail',      color: '#e53e3e' };

  const flagged = riskScore >= 0.5;

  return (
    <div className="result-screen">
      <div className="result-card">
        <div className="result-icon">{score >= 60 ? '🎉' : '📋'}</div>
        <h2>Exam Submitted</h2>
        <p className="result-exam-name">{exam?.title}</p>

        {/* Score ring */}
        <div className="score-ring" style={{ borderColor: grade.color }}>
          <span className="score-value" style={{ color: grade.color }}>{score}%</span>
          <span className="score-label">{grade.label}</span>
        </div>

        <div className="result-stats">
          <div className="result-stat">
            <span className="stat-n">{correct}</span>
            <span className="stat-l">Correct</span>
          </div>
          <div className="result-stat">
            <span className="stat-n">{total - correct}</span>
            <span className="stat-l">Wrong</span>
          </div>
          <div className="result-stat">
            <span className="stat-n">{total}</span>
            <span className="stat-l">Total</span>
          </div>
        </div>

        {/* Proctoring summary */}
        <div className={`proctor-summary ${flagged ? 'flagged' : 'clean'}`}>
          {flagged
            ? '⚠️ This session was flagged for proctoring violations and will be reviewed by your instructor.'
            : '✅ Session completed with no significant proctoring issues.'
          }
        </div>

        <button className="btn-primary" style={{ width: '100%', marginTop: 8 }}
          onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
