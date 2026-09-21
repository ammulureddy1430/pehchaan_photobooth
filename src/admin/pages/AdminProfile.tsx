import React, { useEffect, useState, useCallback } from 'react'
import { adminGetProfile, adminUpdateProfile } from '../services/adminApi'
import type { SchoolProfile } from '../types'

interface AdminProfileProps {
  onProfileUpdated?: (profile: SchoolProfile) => void
}

export const AdminProfile: React.FC<AdminProfileProps> = ({ onProfileUpdated }) => {
  const [profile, setProfile] = useState<SchoolProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Form edit states
  const [schoolName, setSchoolName] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [logoUrl, setLogoUrl] = useState('')

  const fetchProfile = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminGetProfile()
      const p = data.profile
      setProfile(p)
      setSchoolName(p.schoolName || '')
      setContactPerson(p.contactPerson || '')
      setEmail(p.email || '')
      setPhone(p.phone || '')
      setAddress(p.address || '')
      setLogoUrl(p.logoUrl || '')
    } catch (err: any) {
      setError(err.message || 'Failed to load school profile.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchProfile()
  }, [fetchProfile])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)

    if (!schoolName.trim()) {
      setError('School Name is required.')
      return
    }
    if (!email.trim() || !email.includes('@')) {
      setError('A valid email address is required.')
      return
    }

    setSaving(true)
    try {
      const res = await adminUpdateProfile({
        schoolName: schoolName.trim(),
        contactPerson: contactPerson.trim(),
        email: email.trim(),
        phone: phone.trim(),
        address: address.trim(),
        logoUrl: logoUrl.trim() || null,
      })

      setProfile(res.profile)
      setSuccessMsg('School profile updated and saved successfully.')
      if (onProfileUpdated) {
        onProfileUpdated(res.profile)
      }
      setTimeout(() => setSuccessMsg(null), 5000)
    } catch (err: any) {
      setError(err.message || 'Failed to save profile changes.')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (!profile) return
    setSchoolName(profile.schoolName || '')
    setContactPerson(profile.contactPerson || '')
    setEmail(profile.email || '')
    setPhone(profile.phone || '')
    setAddress(profile.address || '')
    setLogoUrl(profile.logoUrl || '')
    setError(null)
    setSuccessMsg(null)
  }

  if (loading && !profile) {
    return (
      <div className="admin-loading-container">
        <div className="admin-spinner" />
        <p>Loading school institutional profile...</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '880px' }}>
      {/* Header */}
      <div className="admin-section-header">
        <div className="admin-section-title-group">
          <h2>School Profile</h2>
          <p>Institutional identity, contact records, and photobooth branding details</p>
        </div>
      </div>

      {successMsg && (
        <div className="admin-alert admin-alert-success" role="status">
          <span>✅</span>
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="admin-alert admin-alert-error" role="alert">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Institution Banner Card */}
      <div className="admin-profile-banner">
        <div className="admin-school-logo-preview">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="School Logo"
              onError={(e) => {
                // Fallback to initial if image URL fails to render
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : (
            <span>🏫</span>
          )}
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: 'var(--adm-text-primary)' }}>
            {schoolName || 'Pehchaan Partner Institution'}
          </h3>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--adm-gold-light)' }}>
            Institutional ID: {profile?.id || 'sch_default'}
          </p>
        </div>
      </div>

      {/* Profile Form */}
      <div className="admin-section-card">
        <form className="admin-form" onSubmit={handleSubmit}>
          <div className="admin-profile-grid">
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="school-name">
                School Name *
              </label>
              <input
                id="school-name"
                type="text"
                className="admin-input"
                placeholder="e.g. Hyderabad Public School"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                disabled={saving}
                required
              />
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="contact-person">
                Contact Person
              </label>
              <input
                id="contact-person"
                type="text"
                className="admin-input"
                placeholder="e.g. Principal / Event Coordinator"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="school-email">
                Official Email *
              </label>
              <input
                id="school-email"
                type="email"
                className="admin-input"
                placeholder="e.g. admin@school.edu.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={saving}
                required
              />
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="school-phone">
                Contact Phone
              </label>
              <input
                id="school-phone"
                type="tel"
                className="admin-input"
                placeholder="e.g. +91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="admin-form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="admin-form-label" htmlFor="school-logo">
                School Logo URL
              </label>
              <input
                id="school-logo"
                type="url"
                className="admin-input"
                placeholder="https://example.com/logo.png"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="admin-form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="admin-form-label" htmlFor="school-address">
                School Campus Address
              </label>
              <textarea
                id="school-address"
                className="admin-input admin-textarea"
                placeholder="Enter complete postal campus address..."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={saving}
                rows={3}
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '1rem',
              marginTop: '1.5rem',
              borderTop: '1px solid var(--adm-border)',
              paddingTop: '1.25rem',
            }}
          >
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={handleReset}
              disabled={saving}
            >
              Reset / Cancel
            </button>
            <button
              type="submit"
              className="admin-btn admin-btn-primary"
              disabled={saving}
            >
              {saving ? (
                <>
                  <span className="admin-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <span>Save School Profile</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
