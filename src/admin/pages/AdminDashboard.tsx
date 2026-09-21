import React, { useEffect, useState, useCallback } from 'react'
import { DashboardCard } from '../components/DashboardCard'
import { adminGetStats } from '../services/adminApi'
import {
  IconEvents,
  IconCamera,
  IconPlus,
  IconLayers,
  IconSend,
  IconChartBar,
  IconSettings,
} from '../components/AdminIcons'
import type { DashboardStats, AdminRoute } from '../types'

interface AdminDashboardProps {
  onNavigate: (route: AdminRoute) => void
  onOpenEventDashboard?: (eventId: string) => void
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate, onOpenEventDashboard }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminGetStats()
      setStats(data.stats)
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard statistics.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchStats()
  }, [fetchStats])

  const formatDate = (dateStr?: string | null, timestamp?: number) => {
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

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'live':
      case 'active':
        return (
          <span className="admin-badge admin-badge-live" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
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
      default:
        return <span className="admin-badge admin-badge-draft">○ Draft</span>
    }
  }

  const liveEvents = stats?.recentEvents?.filter((e) => e.status === 'live' || e.status === 'active') || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {error && (
        <div className="admin-alert admin-alert-error">
          <span>⚠️</span>
          <span>{error}</span>
          <button
            type="button"
            className="admin-btn admin-btn-outline"
            style={{ marginLeft: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
            onClick={fetchStats}
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Stats Grid */}
      {loading && !stats ? (
        <div className="admin-loading-container" style={{ padding: '3.5rem 1rem' }}>
          <div className="admin-spinner" />
          <p style={{ color: 'var(--adm-text-secondary)', marginTop: '1rem' }}>Loading institutional overview...</p>
        </div>
      ) : (
        <>
          {/* Executive 4-Metric Grid */}
          <div className="admin-stats-grid">
            <DashboardCard
              title="Events"
              value={stats?.totalEvents ?? 0}
              subtitle={stats?.activeEvents ? `${stats.activeEvents} Active Now` : 'Registered events'}
              icon={<IconEvents size={20} />}
              iconVariant="gold"
            />
            <DashboardCard
              title="Photo Shoots"
              value={stats?.totalSessions ?? 0}
              subtitle="Completed photobooth visits"
              icon={<IconCamera size={20} />}
              iconVariant="purple"
            />
            <DashboardCard
              title="Composed Strips"
              value={stats?.totalPhotos ?? 0}
              subtitle="Saved in cloud storage"
              icon={<IconLayers size={20} />}
              iconVariant="emerald"
            />
            <DashboardCard
              title="Deliveries & Prints"
              value={stats?.totalDeliveries ?? 0}
              subtitle="100% dispatch success"
              icon={<IconSend size={20} />}
              iconVariant="blue"
            />
          </div>

          {/* 3-Step Simple Workflow Guide */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--adm-border)',
              borderRadius: 'var(--adm-radius-lg)',
              padding: '1.1rem 1.4rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.1rem' }}>⚡</span>
                <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--adm-text-primary)' }}>
                  How Photobooth Works (3 Simple Steps)
                </span>
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--adm-text-muted)' }}>
                Follow these 3 steps to run any school event photobooth
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              {/* Step 1 */}
              <div
                onClick={() => onNavigate('/admin/events')}
                style={{
                  padding: '0.85rem 1rem',
                  borderRadius: 'var(--adm-radius-md)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--adm-border)',
                  cursor: 'pointer',
                }}
                className="admin-step-box"
                title="Click to view and create school events"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
                  <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--adm-gold-glow)', color: 'var(--adm-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800 }}>1</div>
                  <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--adm-text-primary)' }}>Create Event</div>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-secondary)', paddingLeft: '2rem' }}>
                  Add event name, date & venue
                </div>
              </div>

              {/* Step 2 */}
              <div
                onClick={() => {
                  if (liveEvents.length > 0) {
                    onNavigate(`/admin/events/${liveEvents[0].eventId}/config` as AdminRoute)
                  } else {
                    onNavigate('/admin/events')
                  }
                }}
                style={{
                  padding: '0.85rem 1rem',
                  borderRadius: 'var(--adm-radius-md)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--adm-border)',
                  cursor: 'pointer',
                }}
                className="admin-step-box"
                title="Click to customize logos, frames, and pricing"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
                  <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.2)', color: 'var(--adm-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800 }}>2</div>
                  <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--adm-text-primary)' }}>Customize Setup</div>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-secondary)', paddingLeft: '2rem' }}>
                  Set frames, school logo & UPI price
                </div>
              </div>

              {/* Step 3 */}
              <div
                onClick={() => {
                  if (liveEvents.length > 0) {
                    window.open(`/?eventId=${encodeURIComponent(liveEvents[0].eventId)}`, '_blank')
                  } else {
                    window.open('/', '_blank')
                  }
                }}
                style={{
                  padding: '0.85rem 1rem',
                  borderRadius: 'var(--adm-radius-md)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--adm-border)',
                  cursor: 'pointer',
                }}
                className="admin-step-box"
                title="Click to launch kiosk on iPad/Screen"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
                  <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800 }}>3</div>
                  <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--adm-text-primary)' }}>Launch Photobooth 🚀</div>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-secondary)', paddingLeft: '2rem' }}>
                  Open on iPad kiosk & take photos
                </div>
              </div>
            </div>
          </div>

          {/* Active Live Event Spotlight Banner (if any live event exists) */}
          {liveEvents.length > 0 && (
            <div
              className="admin-event-hero"
              style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(19, 23, 34, 0.95) 100%)',
                borderColor: 'rgba(16, 185, 129, 0.35)',
              }}
            >
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--adm-success)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: '0.2rem' }}>
                  ● Active On-Site Photobooth
                </div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--adm-text-primary)' }}>
                  {liveEvents[0].name}
                </h3>
                <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.78rem', color: 'var(--adm-text-secondary)', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                  <span>📍 {liveEvents[0].venue || 'Campus Venue'}</span>
                  <span>📅 {formatDate(liveEvents[0].eventDate, liveEvents[0].createdAt)}</span>
                  <span>📸 <strong>{liveEvents[0].sessionCount || 0}</strong> Photo Shoots Completed</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem' }}
                  onClick={() => onNavigate(`/admin/events/${liveEvents[0].eventId}/config` as AdminRoute)}
                  title="Customize frames, branding, and pricing for this event"
                >
                  <IconSettings size={14} />
                  <span>Setup & Frames</span>
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem' }}
                  onClick={() => {
                    if (onOpenEventDashboard) {
                      onOpenEventDashboard(liveEvents[0].eventId)
                    } else {
                      onNavigate(`/admin/events/${liveEvents[0].eventId}/dashboard` as AdminRoute)
                    }
                  }}
                  title="View live photo shoots, galleries, and stats"
                >
                  <IconChartBar size={14} />
                  <span>Live Photos & Stats →</span>
                </button>
                <a
                  href={`/?eventId=${encodeURIComponent(liveEvents[0].eventId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="admin-btn admin-btn-primary"
                  style={{ fontSize: '0.82rem', padding: '0.45rem 0.95rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                  title={`Launch live photobooth kiosk for ${liveEvents[0].name}`}
                >
                  <IconCamera size={14} />
                  <span>Launch Kiosk 🚀</span>
                </a>
              </div>
            </div>
          )}

          {/* Events Registry Section */}
          <div className="admin-section-card" style={{ padding: '0', overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1.25rem 1.4rem',
                borderBottom: '1px solid var(--adm-border)',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>School Events</h2>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: 'var(--adm-text-secondary)' }}>
                  Active and upcoming photobooth activations across campus.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                  onClick={() => onNavigate('/admin/events')}
                >
                  <span>View All Events →</span>
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
                  onClick={() => onNavigate('/admin/events')}
                >
                  <IconPlus size={14} />
                  <span>Create Event</span>
                </button>
              </div>
            </div>

            {(!stats?.recentEvents || stats.recentEvents.length === 0) ? (
              <div className="admin-empty-state" style={{ padding: '3rem 1.5rem' }}>
                <div className="admin-empty-icon">📂</div>
                <h3 style={{ margin: 0, color: 'var(--adm-text-primary)' }}>No Events Registered Yet</h3>
                <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--adm-text-secondary)' }}>
                  Create your first photobooth event to start capturing memories.
                </p>
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => onNavigate('/admin/events')}
                >
                  <IconPlus size={15} />
                  <span>Create First Event</span>
                </button>
              </div>
            ) : (
              <div className="admin-table-wrapper" style={{ margin: 0, border: 'none', borderRadius: 0 }}>
                <table className="admin-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ paddingLeft: '1.4rem' }}>Event & Location</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Shoots</th>
                      <th>Strips</th>
                      <th style={{ textAlign: 'right', paddingRight: '1.4rem' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentEvents.map((evt) => {
                      const isLive = evt.status === 'live' || evt.status === 'active'
                      const hasSessions = (evt.sessionCount || 0) > 0

                      return (
                        <tr key={evt.eventId}>
                          {/* Title & Venue */}
                          <td style={{ paddingLeft: '1.4rem' }}>
                            <div>
                              <div
                                style={{
                                  fontWeight: 700,
                                  color: 'var(--adm-text-primary)',
                                  fontSize: '0.92rem',
                                  cursor: 'pointer',
                                }}
                                onClick={() => {
                                  if (isLive || hasSessions) {
                                    if (onOpenEventDashboard) {
                                      onOpenEventDashboard(evt.eventId)
                                    } else {
                                      onNavigate(`/admin/events/${evt.eventId}/dashboard` as AdminRoute)
                                    }
                                  } else {
                                    onNavigate(`/admin/events/${evt.eventId}/config` as AdminRoute)
                                  }
                                }}
                                title="Open event"
                              >
                                {evt.name}
                              </div>
                              <div style={{ fontSize: '0.74rem', color: 'var(--adm-text-secondary)', marginTop: '2px' }}>
                                <span>📍 {evt.venue || 'School Campus'}</span>
                              </div>
                            </div>
                          </td>

                          {/* Date */}
                          <td style={{ color: 'var(--adm-text-secondary)', whiteSpace: 'nowrap', fontSize: '0.84rem' }}>
                            📅 {formatDate(evt.eventDate, evt.createdAt)}
                          </td>

                          {/* Status */}
                          <td>{getStatusBadge(evt.status)}</td>

                          {/* Shoots */}
                          <td>
                            <span style={{ fontWeight: 700, color: 'var(--adm-text-primary)', fontSize: '0.88rem' }}>
                              {evt.sessionCount ?? 0}
                            </span>
                          </td>

                          {/* Photos */}
                          <td>
                            <span style={{ color: 'var(--adm-text-secondary)', fontSize: '0.84rem' }}>
                              {evt.photoCount ?? 0}
                            </span>
                          </td>

                          {/* Action Button */}
                          <td style={{ textAlign: 'right', paddingRight: '1.4rem', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', gap: '0.45rem', alignItems: 'center' }}>
                              {isLive || hasSessions ? (
                                <>
                                  <button
                                    type="button"
                                    className="admin-btn admin-btn-secondary"
                                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}
                                    onClick={() => onNavigate(`/admin/events/${evt.eventId}/config` as AdminRoute)}
                                    title="Configure Branding, Frames & Settings"
                                  >
                                    <IconSettings size={13} />
                                    <span>Setup</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="admin-btn admin-btn-primary"
                                    style={{ padding: '0.35rem 0.8rem', fontSize: '0.78rem' }}
                                    onClick={() => {
                                      if (onOpenEventDashboard) {
                                        onOpenEventDashboard(evt.eventId)
                                      } else {
                                        onNavigate(`/admin/events/${evt.eventId}/dashboard` as AdminRoute)
                                      }
                                    }}
                                    title="View live photo shoots, galleries & metrics"
                                  >
                                    <IconChartBar size={13} />
                                    <span>Live Stats →</span>
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  className="admin-btn admin-btn-primary"
                                  style={{ padding: '0.35rem 0.85rem', fontSize: '0.78rem' }}
                                  onClick={() => onNavigate(`/admin/events/${evt.eventId}/config` as AdminRoute)}
                                  title="Configure Branding, Frames & Settings"
                                >
                                  <IconSettings size={13} />
                                  <span>Setup Event →</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default AdminDashboard
