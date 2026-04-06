// src/pages/AdminStudentsPage.jsx
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import LoadingSpinner from '../components/LoadingSpinner';

const BACKEND = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

export default function AdminStudentsPage() {
  const { token } = useAuth();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setStudents(data);
    } catch (err) {
      console.error('Fetch students error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStudents(); }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const url = editingStudent
      ? `${BACKEND}/api/admin/users/${editingStudent._id}`
      : `${BACKEND}/api/admin/users`;
    const method = editingStudent ? 'PUT' : 'POST';

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
        fetchStudents();
        setShowForm(false);
        setEditingStudent(null);
        setFormData({ name: '', email: '', password: '' });
      }
    } catch (err) {
      console.error('Submit student error:', err);
    }
  };

  const handleEdit = (student) => {
    setEditingStudent(student);
    setFormData({
      name: student.name,
      email: student.email,
      password: '' // Don't prefill password
    });
    setShowForm(true);
  };

  const handleDelete = async (studentId) => {
    if (!confirm('Delete this student?')) return;
    try {
      const res = await fetch(`${BACKEND}/api/admin/users/${studentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) fetchStudents();
    } catch (err) {
      console.error('Delete student error:', err);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="admin-students-page">
      <Navbar />
      <div className="container">
        <h1>Student Management</h1>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          Add New Student
        </button>

        <div className="students-list">
          {students.map(student => (
            <div key={student._id} className="student-card">
              <h3>{student.name}</h3>
              <p>{student.email}</p>
              <p>Registered: {student.faceRegistered ? 'Yes' : 'No'}</p>
              <div className="actions">
                <button onClick={() => handleEdit(student)}>Edit</button>
                <button onClick={() => handleDelete(student._id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>

        {showForm && (
          <div className="modal">
            <form onSubmit={handleSubmit}>
              <h2>{editingStudent ? 'Edit Student' : 'Add Student'}</h2>
              <input
                type="text"
                placeholder="Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
              <input
                type="email"
                placeholder="Email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
              {!editingStudent && (
                <input
                  type="password"
                  placeholder="Password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
              )}
              <div className="form-actions">
                <button type="submit">Save</button>
                <button type="button" onClick={() => {
                  setShowForm(false);
                  setEditingStudent(null);
                  setFormData({ name: '', email: '', password: '' });
                }}>Cancel</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}