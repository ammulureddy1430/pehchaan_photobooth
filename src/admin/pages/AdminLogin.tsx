import React, { useState } from 'react'
import { adminLogin } from '../services/adminApi'
import type { AdminUser } from '../types'

interface AdminLoginProps {
  onLoginSuccess: (user: AdminUser, token: string) => void
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('admin@pehchaan.me')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setError('Please enter your administrator email.')
      return
    }
    if (!password) {
      setError('Please enter your password.')
      return
    }

    setLoading(true)
    try {
      const result = await adminLogin(trimmedEmail, password)
      onLoginSuccess(result.admin, result.token)
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  const fillDefaultCredentials = () => {
    setEmail('admin@pehchaan.me')
    setPassword('AdminPassword123!')
    setError(null)
  }

  return (
    <div className="admin-portal">
      <div className="admin-login-wrapper">
        <div className="admin-login-card">
          <div className="admin-brand-header">
            <div className="admin-brand-logo">P</div>
            <h1 className="admin-brand-title">Pehchaan Portal</h1>
            <p className="admin-brand-subtitle">School & Administrator Access</p>
          </div>

          {error && (
            <div className="admin-alert admin-alert-error" role="alert">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <form className="admin-form" onSubmit={handleSubmit}>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="admin-email">
                Email Address
              </label>
              <input
                id="admin-email"
                type="email"
                className="admin-input"
                placeholder="admin@school.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoComplete="email"
                required
              />
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="admin-password">
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                className="admin-input"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
                required
              />
            </div>

            <button
              type="submit"
              className="admin-btn admin-btn-primary"
              style={{ width: '100%', marginTop: '0.5rem', padding: '0.85rem' }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="admin-spinner" style={{ width: '18px', height: '18px', borderWidth: '2px' }} />
                  <span>Authenticating...</span>
                </>
              ) : (
                <span>Sign In to Dashboard →</span>
              )}
            </button>
          </form>

          <div
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px dashed var(--adm-border)',
              borderRadius: 'var(--adm-radius-md)',
              padding: '0.75rem 1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.82rem',
              color: 'var(--adm-text-secondary)',
            }}
          >
            <div>
              <span style={{ color: 'var(--adm-gold)', fontWeight: 600 }}>Default Admin: </span>
              <span>admin@pehchaan.me</span>
            </div>
            <button
              type="button"
              className="admin-btn admin-btn-outline"
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
              onClick={fillDefaultCredentials}
            >
              Fill Demo
            </button>
          </div>

          <div className="admin-login-footer">
            <a href="/">← Return to Photobooth Guest Kiosk</a>
          </div>
        </div>
      </div>
    </div>
  )
}
