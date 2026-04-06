// src/pages/FaceRegPage.jsx
import React from 'react';
import { useNavigate }  from 'react-router-dom';
import { useAuth }      from '../context/AuthContext';
import { FaceRegistration } from '../components/components';

export function FaceRegPage() {
  const { token, refreshUser } = useAuth();
  const navigate = useNavigate();

  const handleComplete = async () => {
    await refreshUser();
    navigate('/dashboard');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fa', display: 'flex', alignItems: 'center' }}>
      <div style={{ width: '100%' }}>
        <FaceRegistration token={token} onComplete={handleComplete} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// src/pages/AdminPage.jsx
// ─────────────────────────────────────────────────────────────────────────────
import { AdminDashboard } from '../components/components';

export function AdminPage() {
  const { token, user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fa' }}>
      <header className="dash-header">
        <div className="dash-brand">🎓 ProctorAI — Admin</div>
        <div className="dash-user">
          <span>{user?.name}</span>
          <button className="btn-secondary" onClick={() => { logout(); nav('/login'); }}>
            Logout
          </button>
        </div>
      </header>
      <AdminDashboard token={token} />
    </div>
  );
}
