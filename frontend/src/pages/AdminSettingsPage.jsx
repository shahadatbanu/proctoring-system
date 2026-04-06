import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import LoadingSpinner from '../components/LoadingSpinner';

const BACKEND = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

export default function AdminSettingsPage() {
  const { token } = useAuth();
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [edited, setEdited] = useState({});
  const [message, setMessage] = useState('');

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/admin/settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setSettings(data);
      setEdited(data);
    } catch (err) {
      console.error('Fetch settings error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, [token]);

  const handleSave = async (key) => {
    try {
      const res = await fetch(`${BACKEND}/api/admin/settings/${key}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          value: edited[key]?.value,
          description: edited[key]?.description
        })
      });

      if (res.ok) {
        setMessage(`✓ "${key}" updated successfully`);
        setTimeout(() => setMessage(''), 3000);
        fetchSettings();
      } else {
        setMessage('✗ Failed to save setting');
      }
    } catch (err) {
      console.error('Save error:', err);
      setMessage('✗ Error saving setting');
    }
  };

  const handleChange = (key, field, value) => {
    setEdited(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value }
    }));
  };

  const settingsList = [
    {
      key: 'looking_away_threshold',
      label: 'Looking Away Violation Threshold',
      description: 'Number of consecutive violations before terminating session',
      type: 'number',
      min: 1,
      max: 20
    },
    {
      key: 'looking_away_time_window',
      label: 'Looking Away Time Window (ms)',
      description: 'Time window in milliseconds for tracking violations',
      type: 'number',
      min: 5000,
      step: 1000
    },
    {
      key: 'identity_mismatch_terminate',
      label: 'Terminate on Identity Mismatch',
      description: 'Automatically terminate if a different person is detected',
      type: 'boolean'
    }
  ];

  if (loading) return <LoadingSpinner />;

  return (
    <div className="admin-settings-page">
      <Navbar />
      <div className="container">
        <h1>Proctoring Settings</h1>
        <p style={{ color: '#666' }}>Configure automatic proctoring enforcement thresholds</p>

        {message && (
          <div style={{
            background: message.includes('✓') ? '#f0fdf4' : '#fef2f2',
            border: `2px solid ${message.includes('✓') ? '#16a34a' : '#e53e3e'}`,
            borderRadius: 4,
            padding: 12,
            marginBottom: 16,
            color: message.includes('✓') ? '#16a34a' : '#e53e3e'
          }}>
            {message}
          </div>
        )}

        <div className="settings-grid" style={{ maxWidth: 800 }}>
          {settingsList.map(setting => {
            const value = edited[setting.key]?.value ?? settings[setting.key]?.value;
            return (
              <div key={setting.key} style={{
                border: '1px solid #ddd',
                borderRadius: 8,
                padding: 20,
                marginBottom: 16,
                background: '#fafafa'
              }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: 16 }}>{setting.label}</h3>
                <p style={{ margin: '0 0 12px 0', fontSize: 12, color: '#666' }}>
                  {setting.description}
                </p>

                {setting.type === 'boolean' ? (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ marginRight: 20 }}>
                      <input
                        type="radio"
                        checked={value === true || value === 'true'}
                        onChange={() => handleChange(setting.key, 'value', true)}
                        style={{ marginRight: 4 }}
                      />
                      Enabled
                    </label>
                    <label>
                      <input
                        type="radio"
                        checked={value === false || value === 'false'}
                        onChange={() => handleChange(setting.key, 'value', false)}
                        style={{ marginRight: 4 }}
                      />
                      Disabled
                    </label>
                  </div>
                ) : (
                  <input
                    type={setting.type}
                    value={value || ''}
                    onChange={(e) => handleChange(setting.key, 'value', 
                      setting.type === 'number' ? parseInt(e.target.value) : e.target.value
                    )}
                    min={setting.min}
                    max={setting.max}
                    step={setting.step}
                    style={{
                      width: '100%',
                      padding: 10,
                      border: '1px solid #ddd',
                      borderRadius: 4,
                      fontSize: 14,
                      marginBottom: 12,
                      boxSizing: 'border-box'
                    }}
                  />
                )}

                <button
                  className="btn-primary"
                  onClick={() => handleSave(setting.key)}
                  style={{ width: '100%' }}
                >
                  Save Setting
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 32, padding: 16, background: '#f0f9ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
          <h3 style={{ marginTop: 0 }}>ℹ️ Information</h3>
          <ul style={{ margin: 0, paddingLeft: 24, color: '#1e40af', fontSize: 14 }}>
            <li>Changes are applied immediately to new proctoring sessions</li>
            <li>Active sessions will continue with the previous settings</li>
            <li>Recommended values are pre-set based on best practices</li>
            <li>Modify these values with caution to maintain exam integrity</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
