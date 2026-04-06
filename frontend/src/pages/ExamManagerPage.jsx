// src/pages/ExamManagerPage.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth }     from '../context/AuthContext';
import { useToast }    from '../components/Toast';
import ConfirmModal    from '../components/ConfirmModal';
import Navbar          from '../components/Navbar';
import LoadingSpinner  from '../components/LoadingSpinner';

const BACKEND = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

const BLANK_QUESTION = { text: '', options: ['', '', '', ''], correct: 0 };
const BLANK_EXAM = {
  title: '', description: '', duration: 30,
  questions: [structuredClone(BLANK_QUESTION)],
};

export default function ExamManagerPage() {
  const { token } = useAuth();
  const toast     = useToast();
  const navigate  = useNavigate();

  const [exams,       setExams]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [editTarget,  setEditTarget]  = useState(null);   // exam being edited
  const [form,        setForm]        = useState(structuredClone(BLANK_EXAM));
  const [saving,      setSaving]      = useState(false);
  const [deleteTarget,setDeleteTarget]= useState(null);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // ── Fetch exams ────────────────────────────────────────────────────────────
  const fetchExams = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${BACKEND}/api/exam`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setExams(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error('Failed to load exams');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchExams(); }, [fetchExams]);

  // ── Open create / edit form ────────────────────────────────────────────────
  const openCreate = () => {
    setEditTarget(null);
    setForm(structuredClone(BLANK_EXAM));
    setShowForm(true);
  };

  const openEdit = (exam) => {
    setEditTarget(exam._id);
    setForm({
      title:       exam.title,
      description: exam.description || '',
      duration:    exam.duration,
      questions:   exam.questions.map(q => ({
        text:    q.text,
        options: [...q.options],
        correct: q.correct ?? 0,
      })),
    });
    setShowForm(true);
  };

  // ── Form field helpers ─────────────────────────────────────────────────────
  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const setQuestion = (qi, key, val) =>
    setForm(f => ({
      ...f,
      questions: f.questions.map((q, i) => i === qi ? { ...q, [key]: val } : q),
    }));

  const setOption = (qi, oi, val) =>
    setForm(f => ({
      ...f,
      questions: f.questions.map((q, i) =>
        i === qi
          ? { ...q, options: q.options.map((o, j) => j === oi ? val : o) }
          : q
      ),
    }));

  const addQuestion = () =>
    setForm(f => ({ ...f, questions: [...f.questions, structuredClone(BLANK_QUESTION)] }));

  const removeQuestion = (qi) =>
    setForm(f => ({ ...f, questions: f.questions.filter((_, i) => i !== qi) }));

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    // Validate
    if (!form.title.trim()) { toast.warn('Title is required'); return; }
    if (form.duration < 1)  { toast.warn('Duration must be at least 1 minute'); return; }
    for (let i = 0; i < form.questions.length; i++) {
      const q = form.questions[i];
      if (!q.text.trim()) { toast.warn(`Question ${i + 1} text is empty`); return; }
      if (q.options.some(o => !o.trim())) { toast.warn(`Question ${i + 1} has empty options`); return; }
    }

    setSaving(true);
    try {
      const url    = editTarget ? `${BACKEND}/api/exam/${editTarget}` : `${BACKEND}/api/exam`;
      const method = editTarget ? 'PUT' : 'POST';
      const res    = await fetch(url, { method, headers, body: JSON.stringify(form) });
      const data   = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(editTarget ? 'Exam updated!' : 'Exam created!');
      setShowForm(false);
      fetchExams();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/exam/${deleteTarget}`, {
        method: 'DELETE', headers,
      });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Exam deleted');
      setDeleteTarget(null);
      fetchExams();
    } catch (err) {
      toast.error(err.message);
    }
  };

  // ── Toggle active ──────────────────────────────────────────────────────────
  const toggleActive = async (exam) => {
    try {
      await fetch(`${BACKEND}/api/exam/${exam._id}`, {
        method: 'PUT', headers,
        body: JSON.stringify({ active: !exam.active }),
      });
      fetchExams();
    } catch { toast.error('Failed to update'); }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fa' }}>
      <Navbar />

      <div className="admin-page">
        <div className="admin-header">
          <div>
            <button className="link-btn" onClick={() => navigate('/admin')}>← Dashboard</button>
            <h2 style={{ marginTop: 8 }}>Exam Manager</h2>
          </div>
          <button className="btn-primary" onClick={openCreate}>+ New Exam</button>
        </div>

        {loading ? <LoadingSpinner message="Loading exams…" /> : (
          exams.length === 0
            ? <p className="empty-state" style={{ padding: '40px 0' }}>No exams yet. Create one!</p>
            : (
              <div className="exam-manager-grid">
                {exams.map(exam => (
                  <div key={exam._id} className={`em-card ${!exam.active ? 'em-card-inactive' : ''}`}>
                    <div className="em-card-header">
                      <h3>{exam.title}</h3>
                      <span className={`em-badge ${exam.active ? 'active' : 'inactive'}`}>
                        {exam.active ? 'Active' : 'Hidden'}
                      </span>
                    </div>
                    {exam.description && (
                      <p className="em-desc">{exam.description}</p>
                    )}
                    <div className="em-meta">
                      <span>⏱ {exam.duration} min</span>
                      <span>📝 {exam.questions?.length || 0} questions</span>
                      <span>📅 {new Date(exam.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="em-actions">
                      <button className="btn-secondary em-btn" onClick={() => openEdit(exam)}>Edit</button>
                      <button className="btn-secondary em-btn" onClick={() => toggleActive(exam)}>
                        {exam.active ? 'Hide' : 'Publish'}
                      </button>
                      <button className="em-btn-danger" onClick={() => setDeleteTarget(exam._id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )
        )}
      </div>

      {/* ── Create / Edit Form ───────────────────────────────────────────────── */}
      {showForm && (
        <div className="modal-backdrop">
          <div className="exam-form-modal">
            <div className="efm-header">
              <h3>{editTarget ? 'Edit Exam' : 'Create Exam'}</h3>
              <button className="toast-close" onClick={() => setShowForm(false)}>×</button>
            </div>

            <form onSubmit={handleSave} className="exam-form">
              {/* Basic info */}
              <div className="efm-section">
                <div className="form-group">
                  <label>Title *</label>
                  <input type="text" value={form.title} required
                    onChange={e => setField('title', e.target.value)}
                    placeholder="e.g. Midterm Exam — Chapter 1-5" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Duration (minutes) *</label>
                    <input type="number" min="1" max="300" value={form.duration}
                      onChange={e => setField('duration', parseInt(e.target.value) || 1)} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea rows={2} value={form.description}
                    onChange={e => setField('description', e.target.value)}
                    placeholder="Optional description shown to students" />
                </div>
              </div>

              {/* Questions */}
              <div className="efm-section">
                <div className="efm-section-header">
                  <h4>Questions ({form.questions.length})</h4>
                  <button type="button" className="btn-secondary em-btn" onClick={addQuestion}>
                    + Add Question
                  </button>
                </div>

                {form.questions.map((q, qi) => (
                  <div key={qi} className="question-editor">
                    <div className="qe-header">
                      <span className="qe-num">Q{qi + 1}</span>
                      {form.questions.length > 1 && (
                        <button type="button" className="em-btn-danger"
                          onClick={() => removeQuestion(qi)}>Remove</button>
                      )}
                    </div>

                    <div className="form-group">
                      <label>Question text *</label>
                      <input type="text" value={q.text}
                        onChange={e => setQuestion(qi, 'text', e.target.value)}
                        placeholder="Enter question…" />
                    </div>

                    <div className="options-editor">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="option-editor-row">
                          <input
                            type="radio"
                            name={`correct-${qi}`}
                            checked={q.correct === oi}
                            onChange={() => setQuestion(qi, 'correct', oi)}
                            title="Mark as correct answer"
                          />
                          <input
                            type="text"
                            value={opt}
                            onChange={e => setOption(qi, oi, e.target.value)}
                            placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                            className="option-text-input"
                          />
                          {q.correct === oi && (
                            <span className="correct-label">✓ Correct</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="efm-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : editTarget ? 'Update Exam' : 'Create Exam'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Exam"
        message="This will permanently delete the exam and cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}