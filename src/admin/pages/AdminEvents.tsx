import React, { useEffect, useState, useCallback, useMemo } from 'react'
import {
  adminGetEvents,
  adminCreateEvent,
  adminUpdateEvent,
  adminGetProfile,
  adminGetInquiries,
  adminUpdateInquiry,
  adminCreateInquiry,
} from '../services/adminApi'
import { AdminEventConfig } from './AdminEventConfig'
import { AdminEventDashboard } from './AdminEventDashboard'
import {
  IconPlus,
  IconEdit,
  IconEye,
  IconCheckCircle,
  IconSettings,
  IconChartBar,
} from '../components/AdminIcons'
import type { AdminEvent, SchoolProfile, CreateEventInput, UpdateEventInput, InquiryItem } from '../types'

type ViewMode = 'list' | 'create' | 'edit' | 'manage' | 'dashboard'

interface AdminEventsProps {
  onNavigate?: (route: any) => void
}

export const AdminEvents: React.FC<AdminEventsProps> = ({ onNavigate }) => {
  const [events, setEvents] = useState<AdminEvent[]>([])
  const [inquiries, setInquiries] = useState<InquiryItem[]>([])
  const [profile, setProfile] = useState<SchoolProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Navigation & Modals
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [managingEventId, setManagingEventId] = useState<string | null>(null)
  const [dashboardEventId, setDashboardEventId] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<AdminEvent | null>(null)
  const [editingEvent, setEditingEvent] = useState<AdminEvent | null>(null)
  // Booking & Event Details State during Event Setup
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null)
  const [clientName, setClientName] = useState('')
  const [clientWhatsApp, setClientWhatsApp] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientCity, setClientCity] = useState('Hyderabad')
  const [clientAudience, setClientAudience] = useState('150-300 guests')
  const [clientSetting, setClientSetting] = useState('Indoor')
  const [clientWishes, setClientWishes] = useState('')
  const [selectedRequirements, setSelectedRequirements] = useState<string[]>([
    'Custom Branding Frames',
    'Instant Cloud QR',
  ])

  const quickCities = ['Hyderabad', 'Bangalore', 'Mumbai', 'Delhi NCR', 'Chennai', 'Pune', 'Kolkata', 'Goa', 'Jaipur']
  const audienceBands = ['50-150 guests', '150-300 guests', '300-600 guests', '600-1500+ guests']
  const settingOptions = ['Indoor', 'Outdoor', 'Banquet', 'Hybrid']
  const availableFeatures = [
    '🖨️ Physical Prints',
    '🖼️ Custom Branding Frames',
    '📲 Cloud QR Delivery',
    '💳 UPI Guest Payments',
    '🛡️ School Privacy Mode',
  ]

  const [lastCreatedEvent, setLastCreatedEvent] = useState<AdminEvent | null>(null)

  // Form State
  const [formData, setFormData] = useState<CreateEventInput>({
    name: '',
    eventDate: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '17:00',
    venue: '',
    description: '',
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch events, school profile & inquiries on mount
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [eventsRes, profileRes, inqRes] = await Promise.all([
        adminGetEvents(),
        adminGetProfile().catch(() => null),
        adminGetInquiries({ limit: 50 }).catch(() => ({ inquiries: [] } as any)),
      ])
      setEvents(eventsRes.events || [])
      if (inqRes?.inquiries) {
        setInquiries(inqRes.inquiries)
      }
      if (profileRes?.profile) {
        setProfile(profileRes.profile)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load events registry.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  // Clear notices after a few seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 6000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  // Date/Time helper
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
    const s = (status || '').toLowerCase()
    switch (s) {
      case 'live':
      case 'active':
        return (
          <span className="admin-badge admin-badge-live" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
            <span>Live</span>
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

  // Filter events based on active tab and search query
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      const s = (e.status || '').toLowerCase()
      const matchesFilter =
        filterStatus === 'all'
          ? true
          : filterStatus === 'active'
          ? s === 'live' || s === 'active'
          : filterStatus === 'completed'
          ? s === 'ended' || s === 'completed'
          : filterStatus === 'draft'
          ? s === 'draft' || s === 'paused'
          : filterStatus === 'cancelled'
          ? s === 'cancelled'
          : true

      if (!matchesFilter) return false

      if (!searchQuery.trim()) return true

      const q = searchQuery.toLowerCase()
      return (
        e.name.toLowerCase().includes(q) ||
        (e.eventId && e.eventId.toLowerCase().includes(q)) ||
        (e.venue && e.venue.toLowerCase().includes(q))
      )
    })
  }, [events, filterStatus, searchQuery])

  // Validate form fields (frontend)
  const validateForm = (data: CreateEventInput): boolean => {
    const errors: Record<string, string> = {}

    if (!data.name.trim()) {
      errors.name = 'Event Name is required.'
    }
    if (!data.eventDate.trim()) {
      errors.eventDate = 'Event Date is required.'
    }
    if (!data.startTime.trim()) {
      errors.startTime = 'Start Time is required.'
    }
    if (!data.endTime.trim()) {
      errors.endTime = 'End Time is required.'
    }
    if (!data.venue.trim()) {
      errors.venue = 'Venue location is required.'
    }

    if (data.startTime && data.endTime) {
      const startParts = data.startTime.split(':').map(Number)
      const endParts = data.endTime.split(':').map(Number)
      if (startParts.length >= 2 && endParts.length >= 2 && !isNaN(startParts[0]) && !isNaN(endParts[0])) {
        const startMin = startParts[0] * 60 + (startParts[1] || 0)
        const endMin = endParts[0] * 60 + (endParts[1] || 0)
        if (endMin <= startMin) {
          errors.endTime = 'End Time must be later than Start Time.'
        }
      } else if (data.endTime <= data.startTime) {
        errors.endTime = 'End Time must be later than Start Time.'
      }
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const toggleRequirement = (req: string) => {
    if (selectedRequirements.includes(req)) {
      setSelectedRequirements(selectedRequirements.filter((r) => r !== req))
    } else {
      setSelectedRequirements([...selectedRequirements, req])
    }
  }

  // Handle Inquiry Autofill during Event Setup
  const handleSelectInquiry = (inquiryId: string) => {
    setSelectedInquiryId(inquiryId || null)
    if (!inquiryId) {
      return
    }
    const inq = inquiries.find((i) => i.id === inquiryId)
    if (inq) {
      setFormData((prev) => ({
        ...prev,
        name: inq.organisation || prev.name,
        venue: inq.city ? `${inq.city} (${inq.setting || 'Indoor'})` : prev.venue,
      }))
      setClientName(inq.contactName || '')
      setClientWhatsApp(inq.whatsappNumber || '')
      setClientEmail(inq.email || '')
      setClientCity(inq.city || 'Hyderabad')
      setClientAudience(inq.audienceBand || '150-300 guests')
      setClientSetting(inq.setting || 'Indoor')
      setClientWishes(inq.customWishes || '')
      if (inq.requirements) {
        const parsed = inq.requirements.split(',').map((s) => s.trim())
        setSelectedRequirements(parsed)
      }
    }
  }

  // Open Create Form
  const handleOpenCreate = () => {
    setFormData({
      name: '',
      eventDate: new Date().toISOString().split('T')[0],
      startTime: '09:00',
      endTime: '17:00',
      venue: profile?.schoolName || 'Main Auditorium',
      description: '',
    })
    setSelectedInquiryId(null)
    setClientName('')
    setClientWhatsApp('')
    setClientEmail('')
    setClientCity('Hyderabad')
    setClientAudience('150-300 guests')
    setClientSetting('Indoor')
    setClientWishes('')
    setSelectedRequirements(['Custom Branding Frames', 'Instant Cloud QR'])
    setFormErrors({})
    setError(null)
    setViewMode('create')
  }

  // Open Edit Form
  const handleOpenEdit = (evt: AdminEvent) => {
    setEditingEvent(evt)
    setFormData({
      name: evt.name,
      eventDate: evt.eventDate || (evt.createdAt ? new Date(evt.createdAt).toISOString().split('T')[0] : ''),
      startTime: evt.startTime || '09:00',
      endTime: evt.endTime || '17:00',
      venue: evt.venue || '',
      description: evt.description || '',
    })
    setFormErrors({})
    setError(null)
    setSelectedEvent(null)
    setViewMode('edit')
  }

  // Submit Create Event Form
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return

    if (!validateForm(formData)) {
      return
    }

    setIsSubmitting(true)
    setError(null)

    const hostSummary = clientName.trim()
      ? `Host: ${clientName.trim()} (${clientWhatsApp.trim() || 'No WhatsApp'})${clientEmail.trim() ? ` • ${clientEmail.trim()}` : ''}`
      : ''
    const audienceSummary = `Setting: ${clientCity ? `${clientCity}, ` : ''}${clientSetting} • Audience: ${clientAudience}`
    const reqSummary = selectedRequirements.length > 0 ? `Features: ${selectedRequirements.join(', ')}` : ''
    const wishesSummary = clientWishes.trim() ? `Wishes/Requirements: ${clientWishes.trim()}` : ''
    const notesSummary = (formData.description || '').trim() ? `Notes: ${(formData.description || '').trim()}` : ''

    const completeDescription = [hostSummary, audienceSummary, reqSummary, wishesSummary, notesSummary]
      .filter(Boolean)
      .join('\n')

    try {
      const res = await adminCreateEvent({
        ...formData,
        description: completeDescription || formData.description,
      })
      if (res.event) {
        // Automatically save/confirm the booking record in database
        try {
          if (selectedInquiryId) {
            const inq = inquiries.find((i) => i.id === selectedInquiryId)
            const logNote = (inq?.notes ? `${inq.notes}\n` : '') + `✓ Converted to Event: ${res.event.eventId} (${res.event.name})`
            await adminUpdateInquiry(selectedInquiryId, {
              status: 'confirmed',
              notes: logNote,
            })
          } else {
            await adminCreateInquiry({
              organisation: formData.name,
              contactName: clientName.trim() || profile?.schoolName || 'Event Host',
              whatsappNumber: clientWhatsApp.trim() || 'Direct Setup',
              email: clientEmail.trim() || undefined,
              city: clientCity.trim() || formData.venue,
              audienceBand: clientAudience || '150-300 guests',
              setting: clientSetting || 'Indoor',
              requirements: selectedRequirements.join(', ') || undefined,
              customWishes: clientWishes.trim() || undefined,
              status: 'confirmed',
              notes: `✓ Booked & Created in Event Setup for Event ID: ${res.event.eventId}`,
            })
          }
        } catch {
          // non-blocking
        }

        setEvents((prev) => [res.event, ...prev])
        setLastCreatedEvent(res.event)
        setSuccessMessage(
          clientName.trim()
            ? `✨ Event "${res.event.name}" created with booking confirmed for ${clientName}!`
            : `✨ Event "${res.event.name}" created successfully! Next step: customize frames & branding.`
        )
        setViewMode('list')
        void fetchData()
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create event. Please verify all required details.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Submit Edit Event Form
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingEvent || isSubmitting) return

    if (!validateForm(formData)) {
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const updatePayload: UpdateEventInput = {
        name: formData.name,
        eventDate: formData.eventDate,
        startTime: formData.startTime,
        endTime: formData.endTime,
        venue: formData.venue,
        description: formData.description,
      }
      const res = await adminUpdateEvent(editingEvent.eventId, updatePayload)
      if (res.event) {
        setEvents((prev) => prev.map((item) => (item.eventId === res.event.eventId ? res.event : item)))
        setSuccessMessage(`Event "${res.event.name}" updated successfully.`)
        setEditingEvent(null)
        setViewMode('list')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update event.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Navigation helpers with event stop propagation
  const handleOpenConfig = (e: React.MouseEvent, eventId: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (onNavigate) {
      onNavigate(`/admin/events/${eventId}/config`)
    } else {
      setManagingEventId(eventId)
      setViewMode('manage')
    }
  }

  const handleOpenDashboard = (e: React.MouseEvent, eventId: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (onNavigate) {
      onNavigate(`/admin/events/${eventId}/dashboard`)
    } else {
      setDashboardEventId(eventId)
      setViewMode('dashboard')
    }
  }

  // ----------------------------------------------------
  // RENDER: EVENT DASHBOARD & TELEMETRY VIEW
  // ----------------------------------------------------
  if (viewMode === 'dashboard' && dashboardEventId) {
    return (
      <AdminEventDashboard
        eventId={dashboardEventId}
        onBack={() => {
          setViewMode('list')
          setDashboardEventId(null)
          void fetchData()
        }}
        onManageConfig={(evId) => {
          setManagingEventId(evId)
          setViewMode('manage')
        }}
        onViewActivation={(evId) => {
          setManagingEventId(evId)
          setViewMode('manage')
        }}
      />
    )
  }

  // ----------------------------------------------------
  // RENDER: EVENT CONFIGURATION & BRANDING BUILDER
  // ----------------------------------------------------
  if (viewMode === 'manage' && managingEventId) {
    return (
      <AdminEventConfig
        eventId={managingEventId}
        onBack={() => {
          setViewMode('list')
          setManagingEventId(null)
          void fetchData()
        }}
      />
    )
  }

  // ----------------------------------------------------
  // RENDER: CREATE / EDIT EVENT FORM VIEW
  // ----------------------------------------------------
  if (viewMode === 'create' || viewMode === 'edit') {
    const isEdit = viewMode === 'edit'
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '800px' }}>
        {/* Header */}
        <div className="admin-section-header">
          <div className="admin-section-title-group">
            <div style={{ fontSize: '0.8rem', color: 'var(--adm-gold)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {isEdit ? 'Modify Existing Event' : 'Event Registration'}
            </div>
            <h2>{isEdit ? `Edit: ${editingEvent?.name}` : 'Create New Event'}</h2>
            <p>
              {isEdit
                ? 'Update venue, schedule timing, or event details for this photobooth session.'
                : 'Register a new institutional event. All photobooth activations will attach to this event.'}
            </p>
          </div>

          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => {
              setViewMode('list')
              setEditingEvent(null)
              setError(null)
            }}
          >
            ← Back to Events
          </button>
        </div>

        {/* School Ownership Banner */}
        <div className="admin-hero-banner" style={{ padding: '0.9rem 1.2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.3rem' }}>🏫</span>
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--adm-gold-light)' }}>
                Institutional Ownership
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-secondary)' }}>
                Registered under: <strong>{profile?.schoolName || 'Pehchaan Model Academy'}</strong>
              </div>
            </div>
          </div>
          {isEdit ? (
            <span className={`admin-badge ${editingEvent?.status === 'live' || editingEvent?.status === 'active' ? 'admin-badge-live' : 'admin-badge-draft'}`}>
              Status: {editingEvent?.status ? editingEvent.status.toUpperCase() : 'DRAFT'}
            </span>
          ) : (
            <span
              className="admin-badge"
              style={{
                background: 'var(--adm-gold-dim)',
                border: '1px solid var(--adm-gold)',
                color: 'var(--adm-gold)',
                fontWeight: 600,
              }}
            >
              ✨ New Event Setup
            </span>
          )}
        </div>

        {error && (
          <div className="admin-alert admin-alert-error">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Event Form Card */}
        <div className="admin-section-card" style={{ padding: '1.75rem' }}>
          {/* Quick Setup from Existing Inquiries (if any) */}
          {!isEdit && inquiries.length > 0 && (
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(198, 161, 91, 0.09) 0%, rgba(26, 31, 46, 0.95) 100%)',
                border: '1px solid rgba(198, 161, 91, 0.35)',
                borderRadius: 'var(--adm-radius-md)',
                padding: '1.1rem 1.25rem',
                marginBottom: '1.5rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.86rem', fontWeight: 700, color: 'var(--adm-gold)' }}>
                  <span>⚡ Quick Autofill from Booking Request</span>
                  <span className="admin-badge admin-badge-gold" style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem' }}>
                    {inquiries.length} Inquiries
                  </span>
                </div>
                {selectedInquiryId && (
                  <button
                    type="button"
                    className="admin-btn admin-btn-outline"
                    style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem' }}
                    onClick={() => handleSelectInquiry('')}
                  >
                    ✕ Clear & Reset
                  </button>
                )}
              </div>

              <select
                className="admin-input"
                value={selectedInquiryId || ''}
                onChange={(e) => handleSelectInquiry(e.target.value)}
                style={{ background: 'var(--adm-surface-elevated)', fontSize: '0.84rem' }}
              >
                <option value="">-- Choose an incoming booking request to autofill fields --</option>
                {inquiries.map((inq) => (
                  <option key={inq.id} value={inq.id}>
                    {inq.organisation} • {inq.contactName} ({inq.city}) • {inq.audienceBand} guests [{inq.status.toUpperCase()}]
                  </option>
                ))}
              </select>
            </div>
          )}

          <form className="admin-form" onSubmit={isEdit ? handleEditSubmit : handleCreateSubmit}>
            {/* Section 1: Event & Client Details */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--adm-gold)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>🏫 1. Event & Host Information</span>
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="evt-name">
                  Event / Organisation Name <span style={{ color: 'var(--adm-gold)' }}>*</span>
                </label>
                <input
                  id="evt-name"
                  type="text"
                  className="admin-input"
                  placeholder="e.g., Annual Day 2026, St. Xavier's Graduation, Tech Expo"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value })
                    if (formErrors.name) setFormErrors({ ...formErrors, name: '' })
                  }}
                  disabled={isSubmitting}
                  autoFocus
                />
                {formErrors.name ? (
                  <div className="admin-form-error">{formErrors.name}</div>
                ) : (
                  <div className="admin-form-hint">Enter the official title of the event</div>
                )}
              </div>

              <div className="admin-form-grid-3">
                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="evt-client-name">
                    Client / Host Contact Name
                  </label>
                  <input
                    id="evt-client-name"
                    type="text"
                    className="admin-input"
                    placeholder="e.g., Priya Sharma"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="evt-client-phone">
                    WhatsApp Number
                  </label>
                  <input
                    id="evt-client-phone"
                    type="tel"
                    className="admin-input"
                    placeholder="e.g., +91 98765 43210"
                    value={clientWhatsApp}
                    onChange={(e) => setClientWhatsApp(e.target.value)}
                    disabled={isSubmitting}
                  />
                  <div className="admin-form-hint">For quotations & photo delivery</div>
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="evt-client-email">
                    Client Email (Optional)
                  </label>
                  <input
                    id="evt-client-email"
                    type="email"
                    className="admin-input"
                    placeholder="coordinator@example.com"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Date & Schedule */}
            <div style={{ marginBottom: '1.5rem', borderTop: '1px solid var(--adm-border)', paddingTop: '1.25rem' }}>
              <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--adm-gold)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>📅 2. Date & Schedule</span>
              </div>

              <div className="admin-form-grid-3">
                {/* Event Date */}
                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="evt-date">
                    Event Date <span style={{ color: 'var(--adm-gold)' }}>*</span>
                  </label>
                  <input
                    id="evt-date"
                    type="date"
                    className="admin-input"
                    value={formData.eventDate}
                    onChange={(e) => {
                      setFormData({ ...formData, eventDate: e.target.value })
                      if (formErrors.eventDate) setFormErrors({ ...formErrors, eventDate: '' })
                    }}
                    disabled={isSubmitting}
                  />
                  {formErrors.eventDate ? (
                    <div className="admin-form-error">{formErrors.eventDate}</div>
                  ) : (
                    <div className="admin-form-hint">Date when booth will run</div>
                  )}
                </div>

                {/* Start Time */}
                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="evt-start">
                    Start Time <span style={{ color: 'var(--adm-gold)' }}>*</span>
                  </label>
                  <input
                    id="evt-start"
                    type="time"
                    className="admin-input"
                    value={formData.startTime}
                    onChange={(e) => {
                      setFormData({ ...formData, startTime: e.target.value })
                      if (formErrors.startTime) setFormErrors({ ...formErrors, startTime: '' })
                      if (formErrors.endTime) setFormErrors({ ...formErrors, endTime: '' })
                    }}
                    disabled={isSubmitting}
                  />
                  {formErrors.startTime ? (
                    <div className="admin-form-error">{formErrors.startTime}</div>
                  ) : (
                    <div className="admin-form-hint">e.g. 09:00 AM</div>
                  )}
                </div>

                {/* End Time */}
                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="evt-end">
                    End Time <span style={{ color: 'var(--adm-gold)' }}>*</span>
                  </label>
                  <input
                    id="evt-end"
                    type="time"
                    className="admin-input"
                    value={formData.endTime}
                    onChange={(e) => {
                      setFormData({ ...formData, endTime: e.target.value })
                      if (formErrors.endTime) setFormErrors({ ...formErrors, endTime: '' })
                    }}
                    disabled={isSubmitting}
                  />
                  {formErrors.endTime ? (
                    <div className="admin-form-error">{formErrors.endTime}</div>
                  ) : (
                    <div className="admin-form-hint">e.g. 05:00 PM</div>
                  )}
                </div>
              </div>
            </div>

            {/* Section 3: Venue, City & Audience */}
            <div style={{ marginBottom: '1.5rem', borderTop: '1px solid var(--adm-border)', paddingTop: '1.25rem' }}>
              <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--adm-gold)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>📍 3. Location, City & Setting</span>
              </div>

              <div className="admin-form-grid-2">
                {/* Venue Location */}
                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="evt-venue">
                    Venue Hall / Campus Location <span style={{ color: 'var(--adm-gold)' }}>*</span>
                  </label>
                  <input
                    id="evt-venue"
                    type="text"
                    className="admin-input"
                    placeholder="e.g., Main Auditorium, North Wing Lawn, Sports Arena A"
                    value={formData.venue}
                    onChange={(e) => {
                      setFormData({ ...formData, venue: e.target.value })
                      if (formErrors.venue) setFormErrors({ ...formErrors, venue: '' })
                    }}
                    disabled={isSubmitting}
                  />
                  {formErrors.venue ? (
                    <div className="admin-form-error">{formErrors.venue}</div>
                  ) : (
                    <div className="admin-form-hint">Physical kiosk location or hall inside campus</div>
                  )}
                </div>

                {/* City */}
                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="evt-city">
                    City / Metro
                  </label>
                  <input
                    id="evt-city"
                    type="text"
                    className="admin-input"
                    placeholder="e.g., Hyderabad, Bangalore, Mumbai"
                    value={clientCity}
                    onChange={(e) => setClientCity(e.target.value)}
                    disabled={isSubmitting}
                  />
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.45rem' }}>
                    {quickCities.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setClientCity(c)}
                        className={`admin-badge ${clientCity === c ? 'admin-badge-gold' : 'admin-badge-draft'}`}
                        style={{ cursor: 'pointer', border: 'none', padding: '0.15rem 0.5rem', fontSize: '0.72rem' }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="admin-form-grid-2" style={{ marginTop: '0.85rem' }}>
                {/* Setting Chips */}
                <div className="admin-form-group">
                  <label className="admin-form-label">Event Setting</label>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                    {settingOptions.map((stg) => (
                      <button
                        key={stg}
                        type="button"
                        onClick={() => setClientSetting(stg)}
                        className={`admin-btn ${clientSetting === stg ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                      >
                        {stg === 'Indoor' ? '🏛️ Indoor' : stg === 'Outdoor' ? '🌳 Outdoor' : stg === 'Banquet' ? '🥂 Banquet' : '🎪 Hybrid'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Audience Band */}
                <div className="admin-form-group">
                  <label className="admin-form-label">Expected Audience</label>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                    {audienceBands.map((aud) => (
                      <button
                        key={aud}
                        type="button"
                        onClick={() => setClientAudience(aud)}
                        className={`admin-btn ${clientAudience === aud ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                      >
                        {aud}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 4: Features & Special Wishes */}
            <div style={{ marginBottom: '1.25rem', borderTop: '1px solid var(--adm-border)', paddingTop: '1.25rem' }}>
              <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--adm-gold)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>✨ 4. Features & Special Wishes</span>
              </div>

              {/* Feature Chips */}
              <div className="admin-form-group">
                <label className="admin-form-label">Requested Photobooth Features</label>
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                  {availableFeatures.map((feat) => {
                    const active = selectedRequirements.includes(feat.replace(/^[^\s]+\s/, ''))
                    return (
                      <button
                        key={feat}
                        type="button"
                        onClick={() => toggleRequirement(feat.replace(/^[^\s]+\s/, ''))}
                        className={`admin-btn ${active ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                      >
                        {feat} {active ? '✓' : '+'}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Special Wishes / Notes */}
              <div className="admin-form-group" style={{ marginTop: '0.85rem' }}>
                <label className="admin-form-label" htmlFor="evt-wishes">
                  Special Wishes & Setup Instructions
                </label>
                <textarea
                  id="evt-wishes"
                  className="admin-input admin-textarea"
                  rows={3}
                  placeholder="e.g., A booth in our main foyer, our crest printed on the back, and physical photo keepsakes for VIP guests."
                  value={clientWishes}
                  onChange={(e) => setClientWishes(e.target.value)}
                  disabled={isSubmitting}
                />
                <div className="admin-form-hint">Stored with event details and accessible anytime in Event Configuration</div>
              </div>
            </div>

            {/* Buttons */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                marginTop: '1.5rem',
                paddingTop: '1.25rem',
                borderTop: '1px solid var(--adm-border)',
              }}
            >
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={() => {
                  setViewMode('list')
                  setEditingEvent(null)
                }}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="admin-btn admin-btn-primary"
                disabled={isSubmitting}
                style={{ padding: '0.55rem 1.25rem', fontSize: '0.88rem' }}
              >
                {isSubmitting ? (
                  <>
                    <div
                      className="admin-spinner"
                      style={{ width: '16px', height: '16px', borderWidth: '2px' }}
                    />
                    <span>{isEdit ? 'Saving Changes...' : 'Creating & Linking Event...'}</span>
                  </>
                ) : (
                  <>
                    <IconCheckCircle size={16} />
                    <span>{isEdit ? 'Save Changes' : 'Create & Setup Event ⚡'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // ----------------------------------------------------
  // RENDER: MAIN EVENTS LIST VIEW
  // ----------------------------------------------------
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Header & Actions */}
      <div className="admin-section-header">
        <div className="admin-section-title-group">
          <h2>Events Directory</h2>
          <p>Manage, configure, and monitor photobooth events across your school campus.</p>
        </div>

        <button
          type="button"
          className="admin-btn admin-btn-primary"
          onClick={handleOpenCreate}
        >
          <IconPlus size={15} />
          <span>Create Event</span>
        </button>
      </div>

      {/* Success Notification Banner */}
      {successMessage && (
        <div className="admin-alert admin-alert-success" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>✅</span>
            <span>{successMessage}</span>
          </div>
          {lastCreatedEvent && (
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                style={{ padding: '0.2rem 0.65rem', fontSize: '0.74rem' }}
                onClick={() => {
                  setManagingEventId(lastCreatedEvent.eventId)
                  setViewMode('manage')
                  setLastCreatedEvent(null)
                }}
              >
                Configure Branding →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="admin-alert admin-alert-error">
          <span>⚠️</span>
          <span>{error}</span>
          <button
            type="button"
            className="admin-btn admin-btn-outline"
            style={{ marginLeft: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
            onClick={fetchData}
          >
            Retry
          </button>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
          background: 'rgba(0,0,0,0.2)',
          padding: '0.75rem 1rem',
          borderRadius: 'var(--adm-radius-md)',
          border: '1px solid var(--adm-border)',
        }}
      >
        {/* Status Filter Buttons */}
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All' },
            { id: 'active', label: 'Live' },
            { id: 'draft', label: 'Draft' },
            { id: 'completed', label: 'Completed' },
            { id: 'cancelled', label: 'Cancelled' },
          ].map((tab) => {
            const count =
              tab.id === 'all'
                ? events.length
                : events.filter((e) => {
                    const s = (e.status || '').toLowerCase()
                    if (tab.id === 'active') return s === 'live' || s === 'active'
                    if (tab.id === 'completed') return s === 'ended' || s === 'completed'
                    if (tab.id === 'draft') return s === 'draft' || s === 'paused'
                    if (tab.id === 'cancelled') return s === 'cancelled'
                    return false
                  }).length

            const isActive = filterStatus === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                className={`admin-tab-btn ${isActive ? 'active' : ''}`}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', borderRadius: '6px' }}
                onClick={() => setFilterStatus(tab.id)}
              >
                <span>{tab.label}</span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    opacity: isActive ? 1 : 0.65,
                    marginLeft: '2px',
                    background: isActive ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.08)',
                    padding: '1px 5px',
                    borderRadius: '10px',
                  }}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Live Search Input */}
        <div style={{ position: 'relative', minWidth: '240px' }}>
          <input
            type="text"
            placeholder="🔍 Search event, ID, or venue..."
            className="admin-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem', width: '100%' }}
          />
        </div>
      </div>

      {/* Events Table */}
      <div className="admin-section-card" style={{ padding: '0', overflow: 'hidden' }}>
        {loading && events.length === 0 ? (
          <div className="admin-loading-container">
            <div className="admin-spinner" />
            <p>Loading events registry...</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="admin-empty-state" style={{ padding: '3rem 1.5rem' }}>
            <div className="admin-empty-icon">🎟️</div>
            <h3 style={{ margin: 0, color: 'var(--adm-text-primary)' }}>
              {events.length === 0 ? 'No events registered yet.' : 'No Matching Events Found'}
            </h3>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--adm-text-secondary)' }}>
              {events.length === 0
                ? 'Get started by creating your first school photobooth event.'
                : `No events match "${searchQuery || filterStatus}".`}
            </p>
            {events.length === 0 && (
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                style={{ marginTop: '0.75rem' }}
                onClick={handleOpenCreate}
              >
                <IconPlus size={15} />
                <span>Create First Event</span>
              </button>
            )}
          </div>
        ) : (
          <div className="admin-table-wrapper" style={{ margin: 0 }}>
            <table className="admin-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ paddingLeft: '1.25rem' }}>Event &amp; Location</th>
                  <th>Schedule</th>
                  <th>Status</th>
                  <th>Photo Shoots</th>
                  <th style={{ textAlign: 'right', paddingRight: '1.25rem' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((evt) => {
                  const isLive = evt.status === 'live' || evt.status === 'active'
                  const hasSessions = (evt.sessionCount || 0) > 0

                  return (
                    <tr
                      key={evt.eventId}
                      style={{
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Event Title & Location */}
                      <td style={{ paddingLeft: '1.25rem' }}>
                        <div>
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: '0.96rem',
                              color: 'var(--adm-text-primary)',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.45rem',
                            }}
                            onClick={(e) => {
                              if (isLive || hasSessions) {
                                handleOpenDashboard(e, evt.eventId)
                              } else {
                                handleOpenConfig(e, evt.eventId)
                              }
                            }}
                            title="Open event setup or dashboard"
                          >
                            <span>{evt.name}</span>
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              marginTop: '0.2rem',
                              fontSize: '0.75rem',
                              color: 'var(--adm-text-secondary)',
                            }}
                          >
                            <code
                              style={{
                                color: 'var(--adm-gold)',
                                background: 'rgba(198, 161, 91, 0.1)',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                fontSize: '0.74rem',
                              }}
                            >
                              {evt.eventId}
                            </code>
                            <span>•</span>
                            <span>📍 {evt.venue || 'School Campus'}</span>
                          </div>
                        </div>
                      </td>

                      {/* Schedule */}
                      <td style={{ color: 'var(--adm-text-secondary)', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600, color: 'var(--adm-text-primary)', fontSize: '0.85rem' }}>
                          📅 {formatDate(evt.eventDate, evt.createdAt)}
                        </div>
                        {evt.startTime && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted)', marginTop: '1px' }}>
                            ⏰ {evt.startTime} {evt.endTime ? `– ${evt.endTime}` : ''}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td>{getStatusBadge(evt.status)}</td>

                      {/* Photo Shoots & Pricing */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--adm-text-primary)' }}>
                            {evt.sessionCount || 0} Photo Shoots
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--adm-text-muted)' }}>
                            {evt.paymentMode === 'individual' ? '💳 UPI Pay' : '🆓 Sponsored (Free)'}
                          </div>
                        </div>
                      </td>

                      {/* Primary & Secondary Actions */}
                      <td style={{ textAlign: 'right', paddingRight: '1.25rem', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                          {/* Primary CTA button */}
                          {isLive || hasSessions ? (
                            <button
                              type="button"
                              className="admin-btn admin-btn-primary"
                              style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
                              onClick={(e) => handleOpenDashboard(e, evt.eventId)}
                            >
                              <IconChartBar size={14} />
                              <span>Live Stats →</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="admin-btn admin-btn-primary"
                              style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
                              onClick={(e) => handleOpenConfig(e, evt.eventId)}
                            >
                              <IconSettings size={14} />
                              <span>Setup Event →</span>
                            </button>
                          )}

                          {/* Secondary Quick Setup / Dashboard button */}
                          {isLive || hasSessions ? (
                            <button
                              type="button"
                              className="admin-btn admin-btn-secondary"
                              style={{ padding: '0.4rem 0.65rem', fontSize: '0.8rem' }}
                              onClick={(e) => handleOpenConfig(e, evt.eventId)}
                              title="Branding, Template & Delivery Settings"
                            >
                              <IconSettings size={14} />
                              <span>Setup</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="admin-btn admin-btn-secondary"
                              style={{ padding: '0.4rem 0.65rem', fontSize: '0.8rem' }}
                              onClick={(e) => handleOpenDashboard(e, evt.eventId)}
                              title="View Event Dashboard"
                            >
                              <IconChartBar size={14} />
                              <span>Dashboard</span>
                            </button>
                          )}

                          {/* Details / Edit info */}
                          <button
                            type="button"
                            className="admin-btn admin-btn-secondary"
                            style={{ padding: '0.4rem 0.55rem', fontSize: '0.8rem' }}
                            onClick={() => setSelectedEvent(evt)}
                            title="View Full Event Details"
                          >
                            <IconEye size={14} />
                          </button>
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

      {/* ----------------------------------------------------
          EVENT DETAILS VIEW MODAL
          ---------------------------------------------------- */}
      {selectedEvent && (
        <div className="admin-modal-backdrop" onClick={() => setSelectedEvent(null)}>
          <div
            className="admin-modal-content"
            style={{ padding: '1.5rem', maxWidth: '520px' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--adm-gold)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                  Event Information
                </div>
                <h3 style={{ margin: '0.15rem 0 0', fontSize: '1.25rem', fontWeight: 800, color: 'var(--adm-text-primary)' }}>
                  {selectedEvent.name}
                </h3>
              </div>
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                style={{ padding: '0.25rem 0.55rem', fontSize: '0.85rem' }}
                onClick={() => setSelectedEvent(null)}
              >
                ✕
              </button>
            </div>

            {/* Event Summary Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '0.85rem',
                background: 'rgba(0, 0, 0, 0.25)',
                padding: '1rem',
                borderRadius: 'var(--adm-radius-md)',
                border: '1px solid var(--adm-border)',
                fontSize: '0.82rem',
              }}
            >
              <div>
                <span style={{ color: 'var(--adm-text-muted)', display: 'block', fontSize: '0.7rem', textTransform: 'uppercase' }}>
                  EVENT ID
                </span>
                <code style={{ fontWeight: 700, color: 'var(--adm-gold-light)', fontSize: '0.9rem' }}>
                  {selectedEvent.eventId}
                </code>
              </div>

              <div>
                <span style={{ color: 'var(--adm-text-muted)', display: 'block', fontSize: '0.7rem', textTransform: 'uppercase' }}>
                  STATUS
                </span>
                <div style={{ marginTop: '2px' }}>{getStatusBadge(selectedEvent.status)}</div>
              </div>

              <div>
                <span style={{ color: 'var(--adm-text-muted)', display: 'block', fontSize: '0.7rem', textTransform: 'uppercase' }}>
                  DATE
                </span>
                <span style={{ fontWeight: 600 }}>
                  {formatDate(selectedEvent.eventDate, selectedEvent.createdAt)}
                </span>
              </div>

              <div>
                <span style={{ color: 'var(--adm-text-muted)', display: 'block', fontSize: '0.7rem', textTransform: 'uppercase' }}>
                  SCHEDULED TIME
                </span>
                <span>
                  {selectedEvent.startTime && selectedEvent.endTime
                    ? `${selectedEvent.startTime} – ${selectedEvent.endTime}`
                    : 'All Day'}
                </span>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ color: 'var(--adm-text-muted)', display: 'block', fontSize: '0.7rem', textTransform: 'uppercase' }}>
                  VENUE LOCATION
                </span>
                <span style={{ fontWeight: 600 }}>{selectedEvent.venue || 'School Campus'}</span>
              </div>

              {selectedEvent.description && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={{ color: 'var(--adm-text-muted)', display: 'block', fontSize: '0.7rem', textTransform: 'uppercase' }}>
                    DESCRIPTION / NOTES
                  </span>
                  <p style={{ margin: '0.2rem 0 0', color: 'var(--adm-text-secondary)', lineHeight: 1.4, fontSize: '0.8rem' }}>
                    {selectedEvent.description}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.65rem',
                marginTop: '1.25rem',
                paddingTop: '1rem',
                borderTop: '1px solid var(--adm-border)',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => handleOpenEdit(selectedEvent)}
                >
                  <IconEdit size={14} />
                  <span>Edit Info</span>
                </button>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => {
                    const id = selectedEvent.eventId
                    setSelectedEvent(null)
                    if (onNavigate) {
                      onNavigate(`/admin/events/${id}/config`)
                    } else {
                      setManagingEventId(id)
                      setViewMode('manage')
                    }
                  }}
                >
                  <IconSettings size={14} />
                  <span>Setup</span>
                </button>

                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  onClick={() => {
                    const id = selectedEvent.eventId
                    setSelectedEvent(null)
                    if (onNavigate) {
                      onNavigate(`/admin/events/${id}/dashboard`)
                    } else {
                      setDashboardEventId(id)
                      setViewMode('dashboard')
                    }
                  }}
                >
                  <IconChartBar size={14} />
                  <span>Dashboard →</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminEvents
