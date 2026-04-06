// src/pages/AdminExamsPage.jsx
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import LoadingSpinner from '../components/LoadingSpinner';

const BACKEND = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

export default function AdminExamsPage() {
  const { token } = useAuth();
  const [exams, setExams] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingExam, setEditingExam] = useState(null);
  const [assigningExam, setAssigningExam] = useState(null);
  const [assignStudentIds, setAssignStudentIds] = useState([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    duration: 60,
    scheduledAt: '',
    assignedStudents: [],
    questions: []
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [examsRes, studentsRes] = await Promise.all([
        fetch(`${BACKEND}/api/admin/exams`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${BACKEND}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      const examsData = await examsRes.json();
      const studentsData = await studentsRes.json();
      setExams(examsData);
      setStudents(studentsData);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const url = editingExam
      ? `${BACKEND}/api/admin/exams/${editingExam._id}`
      : `${BACKEND}/api/admin/exams`;
    const method = editingExam ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        fetchData();
        setShowForm(false);
        setEditingExam(null);
        setFormData({ title: '', description: '', duration: 60, questions: [] });
      }
    } catch (err) {
      console.error('Submit exam error:', err);
    }
  };

  const handleEdit = (exam) => {
    setEditingExam(exam);
    setFormData({
      title: exam.title,
      description: exam.description,
      duration: exam.duration,
      scheduledAt: exam.scheduledAt ? new Date(exam.scheduledAt).toISOString().slice(0, 16) : '',
      assignedStudents: exam.assignedStudents?.map(s => s._id || s) || [],
      questions: exam.questions || []
    });
    setShowForm(true);
  };

  const handleDelete = async (examId) => {
    if (!confirm('Delete this exam?')) return;
    try {
      const res = await fetch(`${BACKEND}/api/admin/exams/${examId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Delete exam error:', err);
    }
  };

  const openAssignModal = (exam) => {
    setAssigningExam(exam);
    setAssignStudentIds(exam.assignedStudents?.map(s => s._id || s) || []);
  };

  const closeAssignModal = () => {
    setAssigningExam(null);
    setAssignStudentIds([]);
  };

  const submitAssign = async () => {
    if (!assigningExam) return;
    try {
      const res = await fetch(`${BACKEND}/api/admin/exams/${assigningExam._id}/assign`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ studentIds: assignStudentIds })
      });
      if (res.ok) {
        await fetchData();
        closeAssignModal();
      } else {
        console.error('Assign students failed', await res.text());
      }
    } catch (err) {
      console.error('Assign students error:', err);
    }
  };

  const addQuestion = () => {
    setFormData({
      ...formData,
      questions: [...formData.questions, {
        type: 'multiple-choice',
        text: '',
        options: ['', '', '', ''],
        correct: 0
      }]
    });
  };

  const updateQuestion = (index, field, value) => {
    const newQuestions = [...formData.questions];
    newQuestions[index][field] = value;
    setFormData({ ...formData, questions: newQuestions });
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="admin-exams-page">
      <Navbar />
      <div className="container">
        <h1>Exam Management</h1>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          Create New Exam
        </button>

        <div className="exams-list">
          {exams.map(exam => (
            <div key={exam._id} className="exam-card">
              <h3>{exam.title}</h3>
              <p>{exam.description}</p>
              <p>Duration: {exam.duration} minutes</p>
              <p>Scheduled: {exam.scheduledAt ? new Date(exam.scheduledAt).toLocaleString() : 'Not set'}</p>
              <p>Assigned Students: {exam.assignedStudents?.length || 0}</p>
              <div className="actions">
                <button onClick={() => handleEdit(exam)}>Edit</button>
                <button onClick={() => handleDelete(exam._id)}>Delete</button>
                <button onClick={() => openAssignModal(exam)}>Assign Students</button>
              </div>
            </div>
          ))}
        </div>

        {showForm && (
          <div className="modal">
            <form onSubmit={handleSubmit}>
              <h2>{editingExam ? 'Edit Exam' : 'Create Exam'}</h2>
              <input
                type="text"
                placeholder="Title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
              <textarea
                placeholder="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
              <input
                type="number"
                placeholder="Duration (minutes)"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                required
              />
              <input
                type="datetime-local"
                placeholder="Scheduled Start Time"
                value={formData.scheduledAt}
                onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
              />
              <div>
                <label>Assigned Students:</label>
                <select
                  multiple
                  value={formData.assignedStudents}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                    setFormData({ ...formData, assignedStudents: selected });
                  }}
                >
                  {students.map(student => (
                    <option key={student._id} value={student._id}>
                      {student.name} ({student.email})
                    </option>
                  ))}
                </select>
              </div>

              <h3>Questions</h3>
              {formData.questions.map((q, i) => (
                <div key={i} className="question">
                  <select
                    value={q.type}
                    onChange={(e) => updateQuestion(i, 'type', e.target.value)}
                  >
                    <option value="multiple-choice">Multiple Choice</option>
                    <option value="true-false">True/False</option>
                    <option value="descriptive">Descriptive</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Question Text"
                    value={q.text}
                    onChange={(e) => updateQuestion(i, 'text', e.target.value)}
                  />
                  {(q.type === 'multiple-choice' || q.type === 'true-false') && (
                    <>
                      {q.options.map((opt, j) => (
                        <input
                          key={j}
                          type="text"
                          placeholder={`Option ${j + 1}`}
                          value={opt}
                          onChange={(e) => {
                            const newOpts = [...q.options];
                            newOpts[j] = e.target.value;
                            updateQuestion(i, 'options', newOpts);
                          }}
                        />
                      ))}
                      <select
                        value={q.correct}
                        onChange={(e) => updateQuestion(i, 'correct', parseInt(e.target.value))}
                      >
                        {q.options.map((_, j) => (
                          <option key={j} value={j}>Option {j + 1}</option>
                        ))}
                      </select>
                    </>
                  )}
                  {q.type === 'descriptive' && (
                    <textarea
                      placeholder="Correct Answer"
                      value={q.correct || ''}
                      onChange={(e) => updateQuestion(i, 'correct', e.target.value)}
                    />
                  )}
                </div>
              ))}
              <button type="button" onClick={addQuestion}>Add Question</button>

              <div className="form-actions">
                <button type="submit">Save</button>
                <button type="button" onClick={() => {
                  setShowForm(false);
                  setEditingExam(null);
                  setFormData({ title: '', description: '', duration: 60, questions: [] });
                }}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        {assigningExam && (
          <div className="modal">
            <div>
              <h2>Assign Students to "{assigningExam.title}"</h2>
              <select
                multiple
                value={assignStudentIds}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                  setAssignStudentIds(selected);
                }}
              >
                {students.map(student => (
                  <option key={student._id} value={student._id}>
                    {student.name} ({student.email})
                  </option>
                ))}
              </select>
              <div className="form-actions">
                <button type="button" onClick={submitAssign}>Save Assignments</button>
                <button type="button" onClick={closeAssignModal}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}