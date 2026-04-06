import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';

const BACKEND = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

export default function BulkStudentImportPage() {
  const { token } = useAuth();
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleImport = async () => {
    setError('');
    setResult(null);

    if (!csvText.trim()) {
      setError('Please paste CSV data');
      return;
    }

    const lines = csvText.trim().split('\n');
    if (lines.length < 2) {
      setError('CSV must have at least header + 1 student');
      return;
    }

    const header = lines[0].toLowerCase();
    if (!header.includes('name') || !header.includes('email')) {
      setError('CSV must have "name" and "email" columns');
      return;
    }

    const nameIdx = header.split(',').findIndex(h => h.trim() === 'name');
    const emailIdx = header.split(',').findIndex(h => h.trim() === 'email');

    const students = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      if (cols.length > Math.max(nameIdx, emailIdx)) {
        students.push({
          name: cols[nameIdx],
          email: cols[emailIdx],
          password: generatePassword()
        });
      }
    }

    if (students.length === 0) {
      setError('No valid students found in CSV');
      return;
    }

    setImporting(true);
    try {
      const results = [];
      for (const student of students) {
        try {
          const res = await fetch(`${BACKEND}/api/admin/users`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(student)
          });

          if (res.ok) {
            results.push({ email: student.email, status: 'success', password: student.password });
          } else {
            const err = await res.json();
            results.push({ email: student.email, status: 'error', message: err.error });
          }
        } catch (err) {
          results.push({ email: student.email, status: 'error', message: err.message });
        }
      }

      const success = results.filter(r => r.status === 'success').length;
      const failed = results.filter(r => r.status === 'error').length;

      setResult({ success, failed, results });
    } finally {
      setImporting(false);
    }
  };

  const generatePassword = () => {
    return Math.random().toString(36).slice(-12);
  };

  const downloadResultsCSV = () => {
    const csv = [
      ['Email', 'Status', 'Password', 'Message'],
      ...result.results.map(r => [
        r.email,
        r.status,
        r.password || '',
        r.message || ''
      ])
    ]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-results-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const exampleCSV = `name,email
John Doe,john.doe@university.edu
Jane Smith,jane.smith@university.edu
Bob Johnson,bob.johnson@university.edu`;

  return (
    <div className="bulk-import-page">
      <Navbar />
      <div className="container" style={{ maxWidth: 900 }}>
        <h1>Bulk Student Import</h1>
        <p style={{ color: '#666' }}>Import multiple students at once via CSV upload</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginTop: 32 }}>
          {/* CSV Input */}
          <div>
            <h3>CSV Format</h3>
            <p style={{ fontSize: 12, color: '#666' }}>Your CSV must have these columns (case-insensitive):</p>
            <ul style={{ fontSize: 12, color: '#666' }}>
              <li><strong>name</strong> - Student full name</li>
              <li><strong>email</strong> - Student email address</li>
            </ul>

            <h4 style={{ marginTop: 16 }}>Example:</h4>
            <pre style={{
              background: '#f9f9f9',
              padding: 12,
              borderRadius: 4,
              border: '1px solid #e5e7eb',
              fontSize: 12,
              overflow: 'auto'
            }}>
              {exampleCSV}
            </pre>

            <button
              onClick={() => {
                setCsvText(exampleCSV);
                setError('');
                setResult(null);
              }}
              style={{
                background: '#f3f4f6',
                border: '1px solid #d1d5db',
                padding: '8px 16px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12
              }}
            >
              Use Example
            </button>
          </div>

          {/* Import Form */}
          <div>
            <h3>Paste CSV Data</h3>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="Paste your CSV data here..."
              style={{
                width: '100%',
                height: 200,
                padding: 12,
                border: '1px solid #d1d5db',
                borderRadius: 4,
                fontFamily: 'monospace',
                fontSize: 12,
                boxSizing: 'border-box',
                marginBottom: 12
              }}
            />

            {error && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#dc2626',
                padding: 12,
                borderRadius: 4,
                fontSize: 12,
                marginBottom: 12
              }}>
                {error}
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={importing}
              style={{
                width: '100%',
                padding: 12,
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                fontWeight: 'bold',
                cursor: importing ? 'not-allowed' : 'pointer',
                opacity: importing ? 0.6 : 1
              }}
            >
              {importing ? '⏳ Importing...' : '📤 Import Students'}
            </button>
          </div>
        </div>

        {/* Results */}
        {result && (
          <div style={{ marginTop: 32, background: '#f9f9f9', padding: 20, borderRadius: 8 }}>
            <h3>Import Results</h3>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <div style={{ background: '#d1fae5', padding: 16, borderRadius: 4, flex: 1 }}>
                <p style={{ margin: '0 0 4px 0', fontSize: 12, color: '#065f46' }}>Successful</p>
                <p style={{ margin: 0, fontSize: 24, fontWeight: 'bold', color: '#10b981' }}>
                  {result.success}
                </p>
              </div>
              <div style={{ background: '#fee2e2', padding: 16, borderRadius: 4, flex: 1 }}>
                <p style={{ margin: '0 0 4px 0', fontSize: 12, color: '#7f1d1d' }}>Failed</p>
                <p style={{ margin: 0, fontSize: 24, fontWeight: 'bold', color: '#ef4444' }}>
                  {result.failed}
                </p>
              </div>
            </div>

            <button
              onClick={downloadResultsCSV}
              style={{
                background: '#10b981',
                color: 'white',
                border: 'none',
                padding: '10px 16px',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 'bold',
                marginBottom: 16
              }}
            >
              📥 Download Results CSV
            </button>

            <div style={{ maxHeight: 300, overflowY: 'auto', background: 'white', borderRadius: 4 }}>
              <table style={{ width: '100%', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ padding: 8, textAlign: 'left' }}>Email</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>Status</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>Password</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: 8 }}>{r.email}</td>
                      <td style={{ padding: 8 }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 3,
                          background: r.status === 'success' ? '#d1fae5' : '#fee2e2',
                          color: r.status === 'success' ? '#10b981' : '#ef4444',
                          fontWeight: 'bold'
                        }}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{ padding: 8, fontFamily: 'monospace', fontSize: 11 }}>
                        {r.password || '—'}
                      </td>
                      <td style={{ padding: 8, color: '#666' }}>{r.message || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
