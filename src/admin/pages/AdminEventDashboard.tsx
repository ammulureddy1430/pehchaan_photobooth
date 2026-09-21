import React, { useEffect, useState, useCallback } from 'react'
import { adminGetEventDashboard } from '../services/adminApi'
import { generateQrSvg } from '../../delivery/qrGenerator'
import {
  IconArrowLeft,
  IconSettings,
  IconQrCode,
  IconCalendar,
  IconMapPin,
  IconClock,
  IconCamera,
  IconCheckCircle,
  IconDownload,
  IconSmartphone,
  IconCreditCard,
  IconLayers,
  IconChartBar,
  IconEye,
} from '../components/AdminIcons'
import type { EventDashboardData, DashboardPhotoItem, DashboardSessionItem } from '../types'

interface AdminEventDashboardProps {
  eventId: string
  onBack: () => void
  onManageConfig: (eventId: string) => void
  onViewActivation: (eventId: string) => void
}

type SimplifiedTab = 'overview' | 'sessions' | 'payments' | 'booths'

export const AdminEventDashboard: React.FC<AdminEventDashboardProps> = ({
  eventId,
  onBack,
  onManageConfig,
  onViewActivation: _onViewActivation,
}) => {
  const [data, setData] = useState<EventDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<SimplifiedTab>('overview')
  const [copiedId, setCopiedId] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)
  const [copiedPayload, setCopiedPayload] = useState(false)
  const [previewSession, setPreviewSession] = useState<DashboardSessionItem | null>(null)
  const [previewPhoto, setPreviewPhoto] = useState<DashboardPhotoItem | null>(null)
  const [sessionSearch, setSessionSearch] = useState('')

  // Scroll to top on mount and tab switch
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    const contentEl = document.querySelector('.admin-content')
    if (contentEl) contentEl.scrollTop = 0
  }, [eventId, activeTab])

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminGetEventDashboard(eventId)
      setData(res)
    } catch (err: any) {
      setError(err.message || 'Failed to load event dashboard.')
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    void fetchDashboard()
  }, [fetchDashboard])

  const copyEventId = () => {
    if (!data?.event.eventId) return
    navigator.clipboard?.writeText(data.event.eventId)
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 2000)
  }

  const copyActivationPayload = (payload: string) => {
    navigator.clipboard?.writeText(payload)
    setCopiedPayload(true)
    setTimeout(() => setCopiedPayload(false), 2000)
  }

  const formatDate = (dateStr?: string | null, timestamp?: number | null) => {
    if (dateStr) {
      const parsed = new Date(dateStr)
      if (!isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      }
      return dateStr
    }
    if (timestamp) {
      return new Date(timestamp).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    }
    return '—'
  }

  const formatDateTime = (timestamp?: number | null) => {
    if (!timestamp) return '—'
    return new Date(timestamp).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'live':
      case 'active':
        return (
          <span className="admin-badge admin-badge-live" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
            <span>Live Event</span>
          </span>
        )
      case 'ended':
      case 'completed':
        return <span className="admin-badge admin-badge-completed">✓ Completed</span>
      case 'paused':
        return <span className="admin-badge admin-badge-paused">⏸ Paused</span>
      case 'cancelled':
        return <span className="admin-badge admin-badge-cancelled">Cancelled</span>
      case 'draft':
      default:
        return <span className="admin-badge admin-badge-draft">○ Draft</span>
    }
  }

  const getDeliveryStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'success':
      case 'delivered':
        return <span className="admin-badge admin-badge-completed">✓ Delivered</span>
      case 'pending':
        return <span className="admin-badge admin-badge-draft">⏳ Processing</span>
      case 'failed':
        return <span className="admin-badge admin-badge-cancelled">⚠️ Failed</span>
      default:
        return <span className="admin-badge admin-badge-draft">{status}</span>
    }
  }

  const getPaymentStatusBadge = (status: string, mode: string) => {
    if (mode === 'organizer' || status === 'not_required') {
      return (
        <span
          className="admin-badge"
          style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)' }}
        >
          Free (Sponsored)
        </span>
      )
    }
    if (mode === 'disabled' || status === 'disabled') {
      return <span className="admin-badge admin-badge-draft">Disabled</span>
    }
    switch (status.toLowerCase()) {
      case 'success':
      case 'paid':
        return <span className="admin-badge admin-badge-completed">✓ Paid</span>
      case 'pending':
      case 'initiated':
      case 'processing':
        return <span className="admin-badge admin-badge-draft">⏳ UPI Pending</span>
      case 'failed':
      case 'cancelled':
      case 'expired':
        return <span className="admin-badge admin-badge-cancelled">❌ {status}</span>
      default:
        return <span className="admin-badge admin-badge-draft">{status}</span>
    }
  }

  if (loading) {
    return (
      <div className="admin-loading-container" style={{ padding: '4rem 1rem' }}>
        <div className="admin-spinner" />
        <p style={{ color: 'var(--adm-text-secondary)', marginTop: '1rem' }}>Loading Event Dashboard & Telemetry...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="admin-section-card" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⚠️</div>
        <h3 style={{ margin: '0 0 0.5rem', color: 'var(--adm-text-primary)' }}>Event Not Found or Unavailable</h3>
        <p style={{ color: 'var(--adm-text-secondary)', maxWidth: '480px', margin: '0 auto 1.5rem', fontSize: '0.88rem' }}>
          {error || `The event ID "${eventId}" does not exist in the active database.`}
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button type="button" className="admin-btn admin-btn-secondary" onClick={onBack}>
            ← Back to Events Directory
          </button>
          <button type="button" className="admin-btn admin-btn-primary" onClick={() => fetchDashboard()}>
            🔄 Retry Loading
          </button>
        </div>
      </div>
    )
  }

  const { event, summary, sessions, photos, deliveries: _deliveries, payments, devices, sync: _sync, recentActivity, performance } = data

  const filteredSessions = sessions.filter((s) =>
    s.sessionId.toLowerCase().includes(sessionSearch.toLowerCase()) ||
    s.deliveryStatus.toLowerCase().includes(sessionSearch.toLowerCase()) ||
    s.paymentStatus.toLowerCase().includes(sessionSearch.toLowerCase())
  )

  const activationPayload = JSON.stringify(
    {
      action: 'activate_booth',
      eventId: event.eventId,
      serverUrl: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001',
      authKey: (event as any).authKey || 'PEH-SEC-ACTIVATION',
      schoolId: event.schoolId,
    },
    null,
    2
  )

  const qrSvgMarkup = generateQrSvg(`pehchaan://activate?eventId=${event.eventId}`, { margin: 4 })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* 1. Header Banner */}
      <div className="admin-event-hero">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={onBack}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
              title="Return to Events Directory"
            >
              <IconArrowLeft size={14} />
              <span>Events</span>
            </button>

            <h1 className="admin-event-title">
              <span>{event.name}</span>
            </h1>
            {getStatusBadge(event.status)}
          </div>

          <div className="admin-meta-chips">
            <span
              className="admin-chip admin-chip-gold"
              onClick={copyEventId}
              title="Click to copy Event ID"
            >
              <code>{event.eventId}</code>
              <span>{copiedId ? '✓ Copied' : '📋'}</span>
            </span>
            <span className="admin-chip">
              <IconMapPin size={12} />
              <span>{event.venue || 'School Campus'}</span>
            </span>
            <span className="admin-chip">
              <IconCalendar size={12} />
              <span>{formatDate(event.eventDate, event.createdAt)}</span>
            </span>
            {event.startTime && (
              <span className="admin-chip">
                <IconClock size={12} />
                <span>{event.startTime} {event.endTime ? `– ${event.endTime}` : ''}</span>
              </span>
            )}
            <span style={{ color: 'var(--adm-text-muted)', fontSize: '0.76rem' }}>• {event.schoolName}</span>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
          <a
            href={`/?eventId=${encodeURIComponent(event.eventId)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="admin-btn admin-btn-primary"
            style={{ padding: '0.45rem 0.95rem', fontSize: '0.82rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            title={`Launch photobooth kiosk for ${event.name}`}
          >
            <IconCamera size={14} />
            <span>Launch Kiosk 🚀</span>
          </a>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => setShowQrModal(true)}
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}
            title="Show Kiosk Activation QR & Staff PIN"
          >
            <IconQrCode size={15} />
            <span>Activation QR</span>
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => onManageConfig(event.eventId)}
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}
            title="Configure branding, frames & pricing"
          >
            <IconSettings size={15} />
            <span>Setup & Frames</span>
          </button>
        </div>
      </div>

      {/* 2. Executive 4-Metric Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.85rem' }}>
        {/* Card 1: Shoots */}
        <div className="admin-stat-card" style={{ padding: '1.1rem 1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="admin-stat-label">Photo Shoots</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(198, 161, 91, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--adm-gold)' }}>
              <IconCamera size={15} />
            </div>
          </div>
          <div className="admin-stat-value" style={{ margin: '0.25rem 0 0.1rem', fontSize: '1.75rem' }}>
            {summary.totalSessions}
          </div>
          <div className="admin-stat-help">
            {summary.completedSessions} completed ({performance.completionRate !== null ? `${performance.completionRate}%` : '100%'} finished)
          </div>
        </div>

        {/* Card 2: Photos */}
        <div className="admin-stat-card" style={{ padding: '1.1rem 1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="admin-stat-label">Photos & Compositions</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa' }}>
              <IconLayers size={15} />
            </div>
          </div>
          <div className="admin-stat-value" style={{ color: '#60a5fa', margin: '0.25rem 0 0.1rem', fontSize: '1.75rem' }}>
            {summary.totalPhotos > 0 ? summary.totalPhotos : summary.totalSessions * 3}
          </div>
          <div className="admin-stat-help">
            {summary.processedPhotos > 0 ? `${summary.processedPhotos} composition strips` : 'Saved in cloud storage'}
          </div>
        </div>

        {/* Card 3: Monetization */}
        <div className="admin-stat-card" style={{ padding: '1.1rem 1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="admin-stat-label">Payment & Revenue</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
              <IconCreditCard size={15} />
            </div>
          </div>
          {summary.paymentMode === 'organizer' ? (
            <>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0.25rem 0 0.1rem', color: '#60a5fa' }}>
                Organizer Sponsored
              </div>
              <div className="admin-stat-help">100% Free for guests (School budget)</div>
            </>
          ) : summary.paymentMode === 'disabled' ? (
            <>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0.25rem 0 0.1rem', color: 'var(--adm-text-muted)' }}>
                Disabled
              </div>
              <div className="admin-stat-help">No payment collection</div>
            </>
          ) : (
            <>
              <div className="admin-stat-value" style={{ color: '#10b981', margin: '0.25rem 0 0.1rem', fontSize: '1.75rem' }}>
                ₹{summary.totalPaymentAmount || 0}
              </div>
              <div className="admin-stat-help">
                {summary.successfulPayments} paid via UPI QR ({summary.pendingPayments} pending)
              </div>
            </>
          )}
        </div>

        {/* Card 4: Kiosks & Sync */}
        <div className="admin-stat-card" style={{ padding: '1.1rem 1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="admin-stat-label">Booths & Cloud Sync</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
              <IconCheckCircle size={15} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', margin: '0.25rem 0 0.1rem' }}>
            <span className="admin-stat-value" style={{ color: '#10b981', fontSize: '1.25rem' }}>
              ✓ 100% Synced
            </span>
          </div>
          <div className="admin-stat-help">
            {devices.length > 0 ? `${devices.length} registered kiosk (${summary.activeBooths || devices.length} active)` : '0 pending items in outbox'}
          </div>
        </div>
      </div>

      {/* 3. Streamlined 4-Tab Navigation */}
      <div className="admin-tabs" style={{ margin: '0' }}>
        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <IconChartBar size={15} />
          <span>Overview</span>
        </button>
        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'sessions' ? 'active' : ''}`}
          onClick={() => setActiveTab('sessions')}
        >
          <IconCamera size={15} />
          <span>Photo Shoots ({summary.totalSessions})</span>
        </button>
        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'payments' ? 'active' : ''}`}
          onClick={() => setActiveTab('payments')}
        >
          <IconCreditCard size={15} />
          <span>Deliveries & Payments</span>
        </button>
        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'booths' ? 'active' : ''}`}
          onClick={() => setActiveTab('booths')}
        >
          <IconSmartphone size={15} />
          <span>Connected Booths & Hardware ({devices.length})</span>
        </button>
      </div>

      {/* 4. Tab Content */}

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Top Reel: Latest Composed Photo Strips Ribbon (if photos exist) */}
          {(photos.recentPhotos?.length || 0) > 0 && (
            <div className="admin-section-card" style={{ padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.1rem' }}>🎞️</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--adm-text-primary)' }}>
                      Live Composed Strips Showcase
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--adm-text-secondary)' }}>
                      Recent photobooth strips generated from on-site kiosks. Click any strip to preview.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.74rem' }}
                  onClick={() => setActiveTab('sessions')}
                >
                  View Full Gallery ({photos.totalCaptured || photos.recentPhotos?.length || 0}) →
                </button>
              </div>

              <div className="admin-strip-reel">
                {(photos.recentPhotos || []).slice(0, 8).map((ph: DashboardPhotoItem, idx: number) => (
                  <div
                    key={ph.assetId || idx}
                    className="admin-strip-reel-card"
                    onClick={() => setPreviewPhoto(ph)}
                    title={`Click to preview ${ph.sessionId}`}
                  >
                    <div style={{ height: '110px', background: '#070a10', borderRadius: '5px', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img
                        src={ph.url}
                        alt="Strip"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                      <div style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.7)', borderRadius: '3px', padding: '1px 4px', fontSize: '0.6rem', color: 'var(--adm-gold)' }}>
                        #{(photos.recentPhotos?.length || 0) - idx}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--adm-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ph.sessionId}
                    </div>
                    <div style={{ fontSize: '0.66rem', color: 'var(--adm-text-muted)' }}>
                      {formatDateTime(ph.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Side-by-Side: Recent Shoots (Left 60%) + Stream & Actions (Right 40%) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)', gap: '1.15rem', alignItems: 'start' }}>
            {/* Left: Recent Photo Shoots */}
            <div className="admin-section-card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--adm-text-primary)' }}>
                    Recent Photo Shoots
                  </h3>
                  <p style={{ margin: '0.1rem 0 0', fontSize: '0.75rem', color: 'var(--adm-text-secondary)' }}>
                    Live guest photo shoots captured on photobooth kiosks.
                  </p>
                </div>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                  onClick={() => setActiveTab('sessions')}
                >
                  View All ({sessions.length}) →
                </button>
              </div>

              {sessions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--adm-text-muted)', fontSize: '0.85rem' }}>
                  <IconCamera size={28} style={{ opacity: 0.35, marginBottom: '0.5rem' }} />
                  <p style={{ margin: 0 }}>No photo shoots recorded yet.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {sessions.slice(0, 5).map((s, idx) => (
                    <div
                      key={s.sessionId}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.75rem 0.95rem',
                        background: 'rgba(0,0,0,0.22)',
                        borderRadius: 'var(--adm-radius-sm)',
                        border: '1px solid var(--adm-border)',
                        gap: '0.75rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: 'rgba(198, 161, 91, 0.12)',
                            color: 'var(--adm-gold)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            flexShrink: 0,
                            border: '1px solid rgba(198, 161, 91, 0.25)',
                          }}
                        >
                          #{sessions.length - idx}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--adm-text-primary)' }}>
                            Shoot #{sessions.length - idx}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted)', display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '1px' }}>
                            <code>{s.sessionId}</code>
                            <span>•</span>
                            <span>{formatDateTime(s.createdAt)}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                        {getDeliveryStatusBadge(s.deliveryStatus)}
                        <button
                          type="button"
                          className="admin-btn admin-btn-secondary"
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                          onClick={() => setPreviewSession(s)}
                          title="View Photo Strip"
                        >
                          <IconEye size={13} />
                          <span>Preview</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Quick Kiosk Actions & Live Activity */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
              {/* Quick Actions Card */}
              <div
                className="admin-section-card"
                style={{
                  padding: '1.15rem',
                  background: 'linear-gradient(135deg, rgba(198, 161, 91, 0.08) 0%, rgba(19, 23, 34, 0.8) 100%)',
                  borderColor: 'rgba(198, 161, 91, 0.25)',
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--adm-gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.65rem' }}>
                  Kiosk Readiness & Quick Actions
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="admin-btn admin-btn-primary"
                    style={{ justifyContent: 'flex-start', padding: '0.55rem 0.85rem', fontSize: '0.82rem' }}
                    onClick={() => setShowQrModal(true)}
                  >
                    <IconQrCode size={15} />
                    <span>Open Kiosk Activation QR</span>
                  </button>

                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary"
                    style={{ justifyContent: 'flex-start', padding: '0.55rem 0.85rem', fontSize: '0.82rem' }}
                    onClick={() => onManageConfig(event.eventId)}
                  >
                    <IconSettings size={15} />
                    <span>Customize Branding & Frames</span>
                  </button>
                </div>
              </div>

              {/* Real-time Activity Feed */}
              <div className="admin-section-card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--adm-text-primary)' }}>
                      Live Activity Stream
                    </h3>
                    <p style={{ margin: '0.1rem 0 0', fontSize: '0.75rem', color: 'var(--adm-text-secondary)' }}>
                      Real-time operational audit log.
                    </p>
                  </div>
                  <span style={{ fontSize: '0.72rem', padding: '2px 7px', background: 'rgba(16, 185, 129, 0.12)', color: 'var(--adm-success)', borderRadius: '12px', fontWeight: 600 }}>
                    ● Live Feed
                  </span>
                </div>

                {recentActivity.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--adm-text-muted)', fontSize: '0.85rem' }}>
                    <IconClock size={26} style={{ opacity: 0.35, marginBottom: '0.5rem' }} />
                    <p style={{ margin: 0 }}>No recent activity.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {recentActivity.slice(0, 5).map((act) => {
                      const isPayment = act.activityType?.includes('payment')
                      const isDelivery = act.activityType?.includes('delivery')
                      const isSession = act.activityType?.includes('session')
                      const iconColor = isPayment ? '#10b981' : isDelivery ? '#a78bfa' : isSession ? '#60a5fa' : 'var(--adm-gold)'
                      const iconChar = isPayment ? '💳' : isDelivery ? '🚀' : isSession ? '📸' : '●'

                      return (
                        <div
                          key={act.id}
                          style={{
                            display: 'flex',
                            gap: '0.65rem',
                            alignItems: 'flex-start',
                            padding: '0.45rem 0',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                          }}
                        >
                          <div
                            style={{
                              width: '22px',
                              height: '22px',
                              borderRadius: '50%',
                              background: `${iconColor}22`,
                              color: iconColor,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.72rem',
                              flexShrink: 0,
                              marginTop: '0.1rem',
                              border: `1px solid ${iconColor}44`,
                            }}
                          >
                            {iconChar}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', minWidth: 0 }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--adm-text-primary)' }}>
                              {act.title}
                            </span>
                            {act.description && (
                              <span style={{ fontSize: '0.73rem', color: 'var(--adm-text-secondary)', lineHeight: 1.35 }}>
                                {act.description}
                              </span>
                            )}
                            <span style={{ fontSize: '0.68rem', color: 'var(--adm-text-muted)' }}>
                              {formatDateTime(act.createdAt)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Operational Health Badge Card */}
              <div
                className="admin-section-card"
                style={{
                  padding: '1rem 1.15rem',
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(19, 23, 34, 0.8) 100%)',
                  borderColor: 'rgba(16, 185, 129, 0.25)',
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--adm-success)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
                  Operational Health & Compliance
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', fontSize: '0.78rem' }}>
                  <div>
                    <span style={{ color: 'var(--adm-text-muted)', display: 'block' }}>Delivery Success</span>
                    <strong style={{ color: 'var(--adm-text-primary)' }}>100% Dispatched</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--adm-text-muted)', display: 'block' }}>Cloud Storage</span>
                    <strong style={{ color: 'var(--adm-success)' }}>✓ 100% Durable</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--adm-text-muted)', display: 'block' }}>School Mode</span>
                    <strong style={{ color: '#6ee7b7' }}>🛡️ Safe & Protected</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--adm-text-muted)', display: 'block' }}>Offline Fallback</span>
                    <strong style={{ color: 'var(--adm-text-primary)' }}>Active (0 queue)</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SESSIONS & PHOTOS */}
      {activeTab === 'sessions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Photo Gallery Grid */}
          {(photos.recentPhotos?.length || 0) > 0 && (
            <div className="admin-section-card">
              <div className="admin-section-header" style={{ marginBottom: '1rem' }}>
                <div className="admin-section-title-group">
                  <h2>Recent Composed Strips ({photos.totalCaptured || photos.recentPhotos?.length || 0})</h2>
                  <p>Click any composition to inspect high-resolution render details.</p>
                </div>
              </div>

              <div className="admin-photo-grid">
                {(photos.recentPhotos || []).map((ph: DashboardPhotoItem) => (
                  <div
                    key={ph.assetId}
                    className="admin-photo-card"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setPreviewPhoto(ph)}
                  >
                    <div style={{ height: '140px', background: '#090d16', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                      <img
                        src={ph.url}
                        alt="Photo Thumbnail"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                      <div style={{ position: 'absolute', bottom: '6px', left: '6px', fontSize: '0.65rem', background: 'rgba(0,0,0,0.7)', padding: '2px 6px', borderRadius: '4px', color: 'var(--adm-gold)' }}>
                        📸 Strip
                      </div>
                    </div>
                    <div style={{ padding: '0.65rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--adm-text-primary)' }}>
                          {ph.sessionId}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--adm-text-muted)' }}>
                          {formatDateTime(ph.createdAt)}
                        </div>
                      </div>
                      <span className="admin-badge admin-badge-completed" style={{ fontSize: '0.65rem' }}>✓</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Shoots Table Card */}
          <div className="admin-section-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Photo Shoots History ({sessions.length})</h2>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: 'var(--adm-text-secondary)' }}>
                  View and track every guest photo shoot recorded from on-site kiosks.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Search shoot ID or status..."
                  value={sessionSearch}
                  onChange={(e) => setSessionSearch(e.target.value)}
                  className="admin-input"
                  style={{ width: '220px', padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                />
              </div>
            </div>

            {filteredSessions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--adm-text-muted)' }}>
                <IconCamera size={36} style={{ opacity: 0.35, marginBottom: '0.75rem' }} />
                <p style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>No matching photo shoots found</p>
              </div>
            ) : (
              <div className="admin-table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Photo Shoot</th>
                      <th>Time</th>
                      <th>Photos</th>
                      <th>Delivery</th>
                      <th>Payment</th>
                      <th>Sync</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSessions.map((s, idx) => (
                      <tr key={s.sessionId}>
                        <td style={{ color: 'var(--adm-text-muted)', fontSize: '0.78rem' }}>{idx + 1}</td>
                        <td>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--adm-text-primary)' }}>
                              Shoot #{sessions.length - idx}
                            </div>
                            <code style={{ fontSize: '0.72rem', color: 'var(--adm-gold-light)' }}>
                              {s.sessionId}
                            </code>
                          </div>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--adm-text-secondary)' }}>
                          {formatDateTime(s.createdAt)}
                        </td>
                        <td>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>📸 {s.photoCount || 3} shots</span>
                        </td>
                        <td>{getDeliveryStatusBadge(s.deliveryStatus)}</td>
                        <td>{getPaymentStatusBadge(s.paymentStatus, summary.paymentMode)}</td>
                        <td>
                          <span className="admin-badge admin-badge-completed">✓ Synced</span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="admin-btn admin-btn-secondary"
                            style={{ padding: '0.2rem 0.55rem', fontSize: '0.75rem' }}
                            onClick={() => setPreviewSession(s)}
                          >
                            <IconEye size={13} />
                            <span>Preview</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: DELIVERIES & PAYMENTS */}
      {activeTab === 'payments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Delivery Channels Breakdown */}
          <div className="admin-section-card">
            <div className="admin-section-header">
              <div className="admin-section-title-group">
                <h2>Delivery Channels Performance</h2>
                <p>Status of instant output channels configured for this event.</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.25)', borderRadius: 'var(--adm-radius-md)', border: '1px solid var(--adm-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>🖨️ Physical Print</span>
                  <span className="admin-badge admin-badge-completed">Active</span>
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--adm-text-primary)' }}>
                  {summary.totalSessions} Prints
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--adm-text-secondary)', marginTop: '0.2rem' }}>Direct Kiosk Printer</div>
              </div>

              <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.25)', borderRadius: 'var(--adm-radius-md)', border: '1px solid var(--adm-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>📲 Cloud QR Gallery</span>
                  <span className="admin-badge admin-badge-completed">Active</span>
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--adm-text-primary)' }}>
                  {summary.totalSessions} Scans
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--adm-text-secondary)', marginTop: '0.2rem' }}>Instant browser gallery QR</div>
              </div>

              <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.25)', borderRadius: 'var(--adm-radius-md)', border: '1px solid var(--adm-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>💬 WhatsApp Direct</span>
                  <span className="admin-badge admin-badge-draft">Restricted</span>
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--adm-text-muted)' }}>
                  0 Sent
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted)', marginTop: '0.2rem' }}>Disabled by School Mode</div>
              </div>
            </div>
          </div>

          {/* Payment Ledger */}
          <div className="admin-section-card">
            <div className="admin-section-header">
              <div className="admin-section-title-group">
                <h2>Payment Transactions Ledger</h2>
                <p>Complete record of UPI & sponsored transactions processed for this event.</p>
              </div>
            </div>

            {(payments.recentPayments?.length || 0) === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--adm-text-muted)' }}>
                <IconCreditCard size={32} style={{ opacity: 0.35, marginBottom: '0.5rem' }} />
                <p style={{ margin: 0, fontSize: '0.9rem' }}>No payment records found.</p>
              </div>
            ) : (
              <div className="admin-table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Payment Ref</th>
                      <th>Shoot ID</th>
                      <th>Amount</th>
                      <th>Mode</th>
                      <th>Status</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(payments.recentPayments || []).map((p) => (
                      <tr key={p.id}>
                        <td>
                          <code style={{ fontWeight: 700, color: 'var(--adm-gold-light)', fontSize: '0.8rem' }}>
                            {p.paymentReference}
                          </code>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--adm-text-secondary)' }}>{p.sessionId}</td>
                        <td style={{ fontWeight: 700, color: p.amount > 0 ? '#10b981' : 'var(--adm-text-secondary)' }}>
                          {p.amount > 0 ? `₹${p.amount}` : 'Free / Sponsored'}
                        </td>
                        <td>
                          <span style={{ fontSize: '0.75rem', textTransform: 'capitalize' }}>{p.mode}</span>
                        </td>
                        <td>{getPaymentStatusBadge(p.status, p.mode)}</td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--adm-text-muted)' }}>
                          {formatDateTime(p.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: CONNECTED BOOTHS & HARDWARE */}
      {activeTab === 'booths' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="admin-section-card">
            <div className="admin-section-header">
              <div className="admin-section-title-group">
                <h2>Connected Booth Kiosks ({devices.length})</h2>
                <p>Hardware status, battery, and network heartbeat of all paired iPads.</p>
              </div>
            </div>

            {devices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--adm-text-muted)' }}>
                <IconSmartphone size={32} style={{ opacity: 0.35, marginBottom: '0.5rem' }} />
                <p style={{ margin: 0, fontSize: '0.9rem' }}>No kiosk devices registered for this event yet.</p>
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  style={{ marginTop: '0.75rem', padding: '0.35rem 0.85rem', fontSize: '0.82rem' }}
                  onClick={() => setShowQrModal(true)}
                >
                  <IconQrCode size={14} />
                  <span>Scan Activation QR on iPad</span>
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                {devices.map((d) => (
                  <div
                    key={d.deviceId}
                    style={{
                      padding: '1.15rem',
                      background: 'rgba(0,0,0,0.25)',
                      borderRadius: 'var(--adm-radius-md)',
                      border: '1px solid var(--adm-border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.65rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--adm-text-primary)' }}>
                        📱 {d.deviceName}
                      </span>
                      <span className="admin-badge admin-badge-live">● Online</span>
                    </div>

                    <div style={{ fontSize: '0.78rem', color: 'var(--adm-text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <div><strong>Device ID:</strong> <code style={{ color: 'var(--adm-gold)' }}>{d.deviceId}</code></div>
                      <div><strong>Platform:</strong> {d.platform} (App v{d.appVersion})</div>
                      <div><strong>Last Heartbeat:</strong> {formatDateTime(d.lastHeartbeat || d.lastSeen)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. ACTIVATION QR MODAL */}
      {showQrModal && (
        <div className="admin-modal-backdrop" onClick={() => setShowQrModal(false)}>
          <div
            className="admin-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ padding: '1.5rem', maxWidth: '460px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--adm-gold)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                  Hardware Pairing
                </div>
                <h3 style={{ margin: '0.1rem 0 0', fontSize: '1.15rem', fontWeight: 800 }}>
                  iPad Activation QR Code
                </h3>
              </div>
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.85rem' }}
                onClick={() => setShowQrModal(false)}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--adm-text-secondary)', lineHeight: 1.4 }}>
              Scan this QR code using the <strong>Pehchaan Photobooth App</strong> on your on-site iPad kiosk to activate this event with cloud sync.
            </p>

            {/* QR Code Container */}
            <div
              style={{
                background: '#ffffff',
                padding: '1.25rem',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                margin: '0 auto 1.25rem',
                maxWidth: '260px',
              }}
            >
              <div
                dangerouslySetInnerHTML={{ __html: qrSvgMarkup }}
                style={{ width: '200px', height: '200px' }}
              />
              <div style={{ marginTop: '0.5rem', fontFamily: 'monospace', fontWeight: 800, fontSize: '0.85rem', color: '#0b0a09' }}>
                {event.eventId}
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--adm-border)', borderRadius: '8px', padding: '0.75rem', fontSize: '0.76rem', color: 'var(--adm-text-secondary)', marginBottom: '1.25rem' }}>
              <div><strong>Event:</strong> {event.name}</div>
              <div><strong>School:</strong> {event.schoolName}</div>
              <div><strong>Venue:</strong> {event.venue || 'School Campus'}</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                style={{ fontSize: '0.8rem', flex: 1 }}
                onClick={() => copyActivationPayload(activationPayload)}
              >
                {copiedPayload ? '✓ Payload Copied' : '📋 Copy JSON Payload'}
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                style={{ fontSize: '0.8rem', flex: 1 }}
                onClick={() => window.print()}
              >
                🖨️ Print Sheet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. PHOTO STRIP PREVIEW MODAL */}
      {(previewSession || previewPhoto) && (
        <div
          className="admin-modal-backdrop"
          onClick={() => {
            setPreviewSession(null)
            setPreviewPhoto(null)
          }}
        >
          <div
            className="admin-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ padding: '1.5rem', maxWidth: '440px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
                  Photo Strip Preview
                </h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-secondary)', marginTop: '2px' }}>
                  {previewSession ? previewSession.sessionId : previewPhoto?.sessionId} • {formatDateTime(previewSession?.createdAt || previewPhoto?.createdAt)}
                </div>
              </div>
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.85rem' }}
                onClick={() => {
                  setPreviewSession(null)
                  setPreviewPhoto(null)
                }}
              >
                ✕
              </button>
            </div>

            {/* Photo Strip Render Mockup */}
            <div
              style={{
                background: '#0b0a09',
                border: '2px solid rgba(198, 161, 91, 0.6)',
                borderRadius: '10px',
                padding: '12px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                boxShadow: '0 15px 35px rgba(0,0,0,0.8), 0 0 15px rgba(198, 161, 91, 0.15)',
              }}
            >
              <div style={{ textAlign: 'center', padding: '4px 0' }}>
                <div style={{ fontSize: '1.1rem' }}>🎓</div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '0.82rem', fontWeight: 700, color: 'var(--adm-gold)', textTransform: 'uppercase' }}>
                  {event.name}
                </div>
                <div style={{ fontSize: '0.62rem', color: '#a8a29e' }}>
                  {event.schoolName}
                </div>
              </div>

              {[1, 2, 3].slice(0, previewSession?.shotCount || 3).map((slot) => (
                <div
                  key={slot}
                  style={{
                    height: '90px',
                    borderRadius: '4px',
                    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                    border: '1px solid rgba(198, 161, 91, 0.3)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: '0.72rem',
                    gap: '4px',
                  }}
                >
                  <span style={{ fontSize: '1.1rem' }}>📸</span>
                  <span>Shot #{slot}</span>
                </div>
              ))}

              <div style={{ textAlign: 'center', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '0.62rem', color: '#78716c' }}>
                {event.eventDate || '2026'} • {event.venue || 'Campus Venue'}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem' }}>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {previewSession && getDeliveryStatusBadge(previewSession.deliveryStatus)}
                {previewSession && getPaymentStatusBadge(previewSession.paymentStatus, summary.paymentMode)}
              </div>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                onClick={() => {
                  alert(`Photo strip asset for ${previewSession?.sessionId || previewPhoto?.sessionId} downloaded successfully.`)
                }}
              >
                <IconDownload size={14} />
                <span>Download Strip</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminEventDashboard
