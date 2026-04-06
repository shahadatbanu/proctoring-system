// src/components/Navbar.jsx
import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to={user.role === 'admin' ? '/admin' : '/dashboard'}>
          🎓 <span>ProctorAI</span>
        </Link>
      </div>

      <div className="navbar-links">
        {user.role === 'student' && (
          <>
            <Link to="/dashboard" className="nav-link">Dashboard</Link>
            <Link to="/exam-history" className="nav-link">Exam History</Link>
            {!user.faceRegistered && (
              <Link to="/register-face" className="nav-link warn-link">
                ⚠ Register Face
              </Link>
            )}
          </>
        )}
        {user.role === 'admin' && (
          <>
            <Link to="/admin" className="nav-link">Monitor</Link>
            <Link to="/admin/exams" className="nav-link">Exams</Link>
            <Link to="/admin/students" className="nav-link">Students</Link>
            <Link to="/admin/bulk-import" className="nav-link">Bulk Import</Link>
            <Link to="/admin/appeals" className="nav-link">Appeals</Link>
            <Link to="/admin/settings" className="nav-link">Settings</Link>
          </>
        )}
      </div>

      <div className="navbar-user">
        <div className="user-avatar">
          {user.name?.charAt(0).toUpperCase()}
        </div>
        <div className="user-info">
          <span className="user-name">{user.name}</span>
          <span className="user-role">{user.role}</span>
        </div>
        <button className="btn-secondary logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </nav>
  );
}
