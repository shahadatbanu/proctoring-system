// src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider, useAuth }       from './context/AuthContext';
import { ToastProvider }               from './components/Toast';
import { ProtectedRoute }              from './components/ProtectedRoute';

import { LoginPage, RegisterPage }     from './pages/AuthPages';
import { DashboardPage }               from './pages/DashboardPage';
import { ExamPage }                    from './pages/ExamPage';
import { FaceRegPage }                 from './pages/OtherPages';
import AdminDashboard                  from './pages/AdminDashboard';
import SessionReportPage               from './pages/SessionReportPage';
import AdminExamsPage                  from './pages/AdminExamsPage';
import AdminStudentsPage               from './pages/AdminStudentsPage';
import AdminAppealsPage                from './pages/AdminAppealsPage';
import AdminSettingsPage               from './pages/AdminSettingsPage';
import ExamHistoryPage                 from './pages/ExamHistoryPage';
import BulkStudentImportPage           from './pages/BulkStudentImportPage';

import './styles/main.css';
import './styles/auth.css';
import './styles/dashboard.css';
import './styles/admin.css';
import './styles/components.css';

function RootRedirect() {
  const { user, token, loading } = useAuth();
  if (loading) return <div className="loading">Loading…</div>;
  if (!token)  return <Navigate to="/login" replace />;
  return <Navigate to={user?.role === 'admin' ? '/admin' : '/dashboard'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login"    element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            <Route path="/dashboard" element={
              <ProtectedRoute role="student"><DashboardPage /></ProtectedRoute>
            } />
            <Route path="/exam-history" element={
              <ProtectedRoute role="student"><ExamHistoryPage /></ProtectedRoute>
            } />
            <Route path="/register-face" element={
              <ProtectedRoute role="student"><FaceRegPage /></ProtectedRoute>
            } />
            <Route path="/exam/:examId" element={
              <ProtectedRoute role="student"><ExamPage /></ProtectedRoute>
            } />

            <Route path="/admin" element={
              <ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>
            } />
            <Route path="/admin/exams" element={
              <ProtectedRoute role="admin"><AdminExamsPage /></ProtectedRoute>
            } />
            <Route path="/admin/students" element={
              <ProtectedRoute role="admin"><AdminStudentsPage /></ProtectedRoute>
            } />
            <Route path="/admin/bulk-import" element={
              <ProtectedRoute role="admin"><BulkStudentImportPage /></ProtectedRoute>
            } />
            <Route path="/admin/appeals" element={
              <ProtectedRoute role="admin"><AdminAppealsPage /></ProtectedRoute>
            } />
            <Route path="/admin/settings" element={
              <ProtectedRoute role="admin"><AdminSettingsPage /></ProtectedRoute>
            } />
            <Route path="/admin/session/:sessionId" element={
              <ProtectedRoute role="admin"><SessionReportPage /></ProtectedRoute>
            } />

            <Route path="/"  element={<RootRedirect />} />
            <Route path="*"  element={
              <div className="loading">
                <div style={{ textAlign:'center' }}>
                  <h2 style={{ fontSize:48, color:'#a0aec0' }}>404</h2>
                  <p style={{ color:'#718096' }}>Page not found</p>
                  <a href="/" style={{ color:'#3182ce', marginTop:12, display:'block' }}>← Go home</a>
                </div>
              </div>
            } />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
