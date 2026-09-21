import React, { useEffect, useState, useCallback } from 'react'
import {
  adminGetInquiries,
  adminUpdateInquiry,
  adminDeleteInquiry,
  adminCreateEvent,
} from '../services/adminApi'
import type { InquiryItem, InquiryStats, InquiryStatus } from '../types'
import {
  IconSearch,
  IconRefresh,
  IconCheck,
  IconExternalLink,
  IconPlus,
  IconCopy,
} from '../components/AdminIcons'
import './AdminInquiries.css'

interface AdminInquiriesProps {
  onNavigate?: (route: any) => void
}

export const AdminInquiries: React.FC<AdminInquiriesProps> = ({ onNavigate }) => {
  const [inquiries, setInquiries] = useState<InquiryItem[]>([])
  const [stats, setStats] = useState<InquiryStats>({
    total: 0,
    new: 0,
    contacted: 0,
    quoted: 0,
    confirmed: 0,
    archived: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedInquiry, setSelectedInquiry] = useState<InquiryItem | null>(null)
  const [editingNotes, setEditingNotes] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [convertingEvent, setConvertingEvent] = useState(false)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  // Manual Add Lead Modal State
  const [showAddModal, setShowAddModal] = useState(false)
  const [submittingNew, setSubmittingNew] = useState(false)
  const [newLeadForm, setNewLeadForm] = useState({
    organisation: '',
    contactName: '',
    whatsappNumber: '',
    email: '',
    city: 'Hyderabad',
    eventDateText: '',
    audienceBand: '100 – 300 guests',
    setting: 'Indoor',
    requirements: '',
    customWishes: '',
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminGetInquiries({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: searchQuery.trim() || undefined,
      })
      setInquiries(res.inquiries)
      setStats(res.stats)
      if (selectedInquiry) {
        const refreshedSelected = res.inquiries.find((i) => i.id === selectedInquiry.id)
        if (refreshedSelected) {
          setSelectedInquiry(refreshedSelected)
          setEditingNotes(refreshedSelected.notes || '')
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load inquiries')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, searchQuery, selectedInquiry])

  useEffect(() => {
    void loadData()
  }, [statusFilter, searchQuery])

  const handleSelectInquiry = (inquiry: InquiryItem) => {
    setSelectedInquiry(inquiry)
    setEditingNotes(inquiry.notes || '')
    setActionSuccess(null)
  }

  const handleStatusChange = async (id: string, newStatus: InquiryStatus) => {
    try {
      const res = await adminUpdateInquiry(id, { status: newStatus })
      setInquiries((prev) => prev.map((item) => (item.id === id ? res.inquiry : item)))
      if (selectedInquiry?.id === id) {
        setSelectedInquiry(res.inquiry)
      }
      setActionSuccess(`Status updated to "${newStatus}"`)
      setTimeout(() => setActionSuccess(null), 3000)
    } catch (err: any) {
      alert(`Error updating status: ${err.message}`)
    }
  }

  const handleSaveNotes = async () => {
    if (!selectedInquiry) return
    setSavingNote(true)
    try {
      const res = await adminUpdateInquiry(selectedInquiry.id, { notes: editingNotes })
      setSelectedInquiry(res.inquiry)
      setInquiries((prev) =>
        prev.map((item) => (item.id === selectedInquiry.id ? res.inquiry : item))
      )
      setActionSuccess('Notes saved successfully')
      setTimeout(() => setActionSuccess(null), 3000)
    } catch (err: any) {
      alert(`Error saving notes: ${err.message}`)
    } finally {
      setSavingNote(false)
    }
  }

  const handleAddPresetNote = (preset: string) => {
    const updated = editingNotes ? `${editingNotes}\n• ${preset}` : `• ${preset}`
    setEditingNotes(updated)
  }

  // 1-Click Convert to Event Action
  const handleConvertToEvent = async (inquiry: InquiryItem) => {
    if (!window.confirm(`Create a new Photobooth Event for "${inquiry.organisation}"?`)) {
      return
    }
    setConvertingEvent(true)
    try {
      // Determine date
      const today = new Date().toISOString().split('T')[0]
      const eventRes = await adminCreateEvent({
        name: inquiry.organisation,
        eventDate: today,
        startTime: '09:00',
        endTime: '18:00',
        venue: `${inquiry.city} (${inquiry.setting})`,
        description: `Client: ${inquiry.contactName} (${inquiry.whatsappNumber}). Audience: ${inquiry.audienceBand}. Requirements: ${inquiry.requirements || 'N/A'}. Wishes: ${inquiry.customWishes || 'N/A'}`,
      })

      // Update inquiry status to confirmed with log note
      const logNote = (inquiry.notes ? `${inquiry.notes}\n` : '') + `✓ Converted to Event: ${eventRes.event.eventId} (${eventRes.event.name})`
      await adminUpdateInquiry(inquiry.id, {
        status: 'confirmed',
        notes: logNote,
      })

      setActionSuccess(`✨ Event "${eventRes.event.name}" (${eventRes.event.eventId}) created successfully!`)
      void loadData()

      if (onNavigate) {
        onNavigate(`/admin/events/${eventRes.event.eventId}/config`)
      }
    } catch (err: any) {
      alert(`Error converting to event: ${err.message}`)
    } finally {
      setConvertingEvent(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this inquiry record?')) {
      return
    }
    try {
      await adminDeleteInquiry(id)
      setInquiries((prev) => prev.filter((i) => i.id !== id))
      if (selectedInquiry?.id === id) {
        setSelectedInquiry(null)
      }
      setActionSuccess('Inquiry deleted successfully.')
      setTimeout(() => setActionSuccess(null), 3000)
    } catch (err: any) {
      alert(`Error deleting inquiry: ${err.message}`)
    }
  }

  const handleCreateNewLead = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLeadForm.organisation.trim() || !newLeadForm.contactName.trim() || !newLeadForm.whatsappNumber.trim()) {
      alert('Please fill in Organisation, Contact Name, and WhatsApp number.')
      return
    }

    setSubmittingNew(true)
    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLeadForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || 'Failed to create lead')

      setShowAddModal(false)
      setNewLeadForm({
        organisation: '',
        contactName: '',
        whatsappNumber: '',
        email: '',
        city: 'Hyderabad',
        eventDateText: '',
        audienceBand: '100 – 300 guests',
        setting: 'Indoor',
        requirements: '',
        customWishes: '',
      })
      setActionSuccess('New lead logged successfully.')
      void loadData()
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setSubmittingNew(false)
    }
  }

  const handleCopyPublicLink = () => {
    const fullUrl = `${window.location.origin}/inquire`
    void navigator.clipboard.writeText(fullUrl)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2500)
  }

  const getWhatsAppUrl = (inquiry: InquiryItem) => {
    const rawNumber = inquiry.whatsappNumber.replace(/[^0-9]/g, '')
    const formattedPhone = rawNumber.length === 10 ? `91${rawNumber}` : rawNumber
    const message = encodeURIComponent(
      `Hello ${inquiry.contactName}, thank you for reaching out to Pehchaan Photobooth regarding ${inquiry.organisation}! We received your request for ${inquiry.eventDateText || 'your upcoming event'} in ${inquiry.city}. We would love to share customized frame options and pricing with you.`
    )
    return `https://wa.me/${formattedPhone}?text=${message}`
  }

  return (
    <div className="inquiries-container">
      {/* Clickable Metric Cards */}
      <div className="inquiries-stats-grid">
        <div
          className={`inquiry-stat-card total ${statusFilter === 'all' ? 'active-filter' : ''}`}
          onClick={() => setStatusFilter('all')}
          title="Click to view all leads"
        >
          <span className="inquiry-stat-label">Total Inquiries</span>
          <span className="inquiry-stat-value">{stats.total}</span>
          <span className="inquiry-stat-sub">Click to view all</span>
        </div>
        <div
          className={`inquiry-stat-card new ${statusFilter === 'new' ? 'active-filter' : ''}`}
          onClick={() => setStatusFilter('new')}
          title="Click to view uncontacted leads"
        >
          <span className="inquiry-stat-label">New / Uncontacted</span>
          <span className="inquiry-stat-value">{stats.new}</span>
          <span className="inquiry-stat-sub">Needs response</span>
        </div>
        <div
          className={`inquiry-stat-card contacted ${statusFilter === 'contacted' ? 'active-filter' : ''}`}
          onClick={() => setStatusFilter('contacted')}
          title="Click to view in-discussion leads"
        >
          <span className="inquiry-stat-label">In Discussion</span>
          <span className="inquiry-stat-value">{stats.contacted}</span>
          <span className="inquiry-stat-sub">Active follow-ups</span>
        </div>
        <div
          className={`inquiry-stat-card confirmed ${statusFilter === 'confirmed' ? 'active-filter' : ''}`}
          onClick={() => setStatusFilter('confirmed')}
          title="Click to view confirmed events"
        >
          <span className="inquiry-stat-label">Confirmed Events</span>
          <span className="inquiry-stat-value">{stats.confirmed}</span>
          <span className="inquiry-stat-sub">Ready to deploy</span>
        </div>
      </div>

      {/* Filter & Toolbar */}
      <div className="inquiries-toolbar">
        <div className="inquiries-filter-pills">
          <button
            type="button"
            className={`inquiry-filter-pill ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            <span>All</span>
            <span className="inquiry-filter-count">{stats.total}</span>
          </button>
          <button
            type="button"
            className={`inquiry-filter-pill ${statusFilter === 'new' ? 'active' : ''}`}
            onClick={() => setStatusFilter('new')}
          >
            <span>New</span>
            {stats.new > 0 && <span className="inquiry-filter-count">{stats.new}</span>}
          </button>
          <button
            type="button"
            className={`inquiry-filter-pill ${statusFilter === 'contacted' ? 'active' : ''}`}
            onClick={() => setStatusFilter('contacted')}
          >
            <span>Contacted</span>
            {stats.contacted > 0 && <span className="inquiry-filter-count">{stats.contacted}</span>}
          </button>
          <button
            type="button"
            className={`inquiry-filter-pill ${statusFilter === 'quoted' ? 'active' : ''}`}
            onClick={() => setStatusFilter('quoted')}
          >
            <span>Quoted</span>
            {stats.quoted > 0 && <span className="inquiry-filter-count">{stats.quoted}</span>}
          </button>
          <button
            type="button"
            className={`inquiry-filter-pill ${statusFilter === 'confirmed' ? 'active' : ''}`}
            onClick={() => setStatusFilter('confirmed')}
          >
            <span>Confirmed</span>
            {stats.confirmed > 0 && <span className="inquiry-filter-count">{stats.confirmed}</span>}
          </button>
          <button
            type="button"
            className={`inquiry-filter-pill ${statusFilter === 'archived' ? 'active' : ''}`}
            onClick={() => setStatusFilter('archived')}
          >
            <span>Archived</span>
          </button>
        </div>

        <div className="inquiries-toolbar-actions">
          {/* Search Box */}
          <div className="inquiry-search-box">
            <span className="inquiry-search-icon">
              <IconSearch size={14} />
            </span>
            <input
              type="text"
              placeholder="Search organisation, contact, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="inquiry-search-input"
            />
          </div>

          <button
            type="button"
            className="inquiry-btn-sm"
            onClick={() => void loadData()}
            title="Refresh list"
          >
            <IconRefresh size={14} />
          </button>

          {/* Add Manual Lead */}
          <button
            type="button"
            className="inquiry-btn-sm inquiry-btn-primary"
            onClick={() => setShowAddModal(true)}
          >
            <IconPlus size={14} />
            <span>Add Lead</span>
          </button>

          {/* Copy Public Form Link */}
          <button
            type="button"
            className="inquiry-btn-sm"
            onClick={handleCopyPublicLink}
            title="Copy Public Booking Form link to clipboard"
          >
            <IconCopy size={14} />
            <span>{linkCopied ? 'Link Copied!' : 'Copy Form Link'}</span>
          </button>

          {/* Open Form in New Tab */}
          <a
            href="/inquire"
            target="_blank"
            rel="noreferrer"
            className="inquiry-btn-sm"
            title="Open booking form in a new tab"
          >
            <span>Open Form</span>
            <IconExternalLink size={13} />
          </a>
        </div>
      </div>

      {actionSuccess && (
        <div className="admin-alert admin-alert-success" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <IconCheck size={16} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {error && (
        <div className="admin-alert admin-alert-error">
          <span>{error}</span>
        </div>
      )}

      {/* Main Grid: Table & Selected Drawer */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedInquiry ? '1fr 420px' : '1fr', gap: '20px', alignItems: 'start' }}>
        {/* Table Card */}
        <div className="inquiries-table-card">
          {loading && inquiries.length === 0 ? (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--adm-text-secondary)' }}>
              <div className="admin-spinner" style={{ margin: '0 auto 12px' }} />
              <p>Loading inquiries & leads...</p>
            </div>
          ) : inquiries.length === 0 ? (
            <div style={{ padding: '56px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>📋</div>
              <h3 style={{ margin: '0 0 6px', color: 'var(--adm-text-primary)' }}>No inquiries found</h3>
              <p style={{ margin: '0 0 16px', color: 'var(--adm-text-secondary)', fontSize: '13px' }}>
                {searchQuery || statusFilter !== 'all'
                  ? 'No results match your active search and status filter.'
                  : 'Submitted booking forms will appear here in real-time.'}
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="inquiry-btn-sm inquiry-btn-primary"
                  onClick={() => setShowAddModal(true)}
                >
                  <IconPlus size={14} />
                  <span>Log a Lead Manually</span>
                </button>
                <a
                  href="/inquire"
                  target="_blank"
                  rel="noreferrer"
                  className="inquiry-btn-sm"
                >
                  Open Booking Form to Test
                </a>
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="inquiries-table">
                <thead>
                  <tr>
                    <th>Lead Details</th>
                    <th>Location & Setting</th>
                    <th>Audience & Date</th>
                    <th>Pipeline Status</th>
                    <th>Received</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {inquiries.map((inq) => {
                    const isSelected = selectedInquiry?.id === inq.id
                    return (
                      <tr
                        key={inq.id}
                        className={isSelected ? 'selected' : ''}
                        onClick={() => handleSelectInquiry(inq)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <div className="inquiry-org-title">{inq.organisation}</div>
                          <div className="inquiry-contact-line">
                            <span>👤 {inq.contactName}</span>
                            <span>•</span>
                            <span style={{ color: 'var(--adm-gold, #c6a15b)' }}>📱 {inq.whatsappNumber}</span>
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, marginBottom: '4px' }}>{inq.city}</div>
                          <span className="inquiry-tag-badge">{inq.setting}</span>
                        </td>
                        <td>
                          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>{inq.audienceBand}</div>
                          <div style={{ fontSize: '12px', color: 'var(--adm-text-secondary)' }}>
                            📅 {inq.eventDateText || 'Flexible'}
                          </div>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {/* 1-Click Interactive Status Selector */}
                          <select
                            className={`inquiry-status-select ${inq.status}`}
                            value={inq.status}
                            onChange={(e) => void handleStatusChange(inq.id, e.target.value as InquiryStatus)}
                            title="Click to update status"
                          >
                            <option value="new">● New</option>
                            <option value="contacted">● Contacted</option>
                            <option value="quoted">● Quoted</option>
                            <option value="confirmed">● Confirmed</option>
                            <option value="archived">● Archived</option>
                          </select>
                        </td>
                        <td>
                          <div style={{ fontSize: '13px' }}>
                            {new Date(inq.createdAt).toLocaleDateString()}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--adm-text-muted)' }}>
                            {new Date(inq.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="inquiry-action-group">
                            {/* 1-Click WhatsApp Button */}
                            <a
                              href={getWhatsAppUrl(inq)}
                              target="_blank"
                              rel="noreferrer"
                              className="inquiry-wa-btn"
                              title="Chat on WhatsApp"
                            >
                              <span>💬 WhatsApp</span>
                            </a>

                            {/* 1-Click Convert to Event */}
                            {inq.status !== 'confirmed' && (
                              <button
                                type="button"
                                className="inquiry-convert-btn"
                                onClick={() => void handleConvertToEvent(inq)}
                                title="Convert this lead to an active photobooth event"
                                disabled={convertingEvent}
                              >
                                <span>⚡ Event</span>
                              </button>
                            )}

                            {/* View details */}
                            <button
                              type="button"
                              className="inquiry-view-btn"
                              onClick={() => handleSelectInquiry(inq)}
                            >
                              View
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

        {/* Selected Inquiry Detail Drawer */}
        {selectedInquiry && (
          <div className="inquiry-drawer">
            <div className="inquiry-drawer-header">
              <div>
                <div className="inquiry-drawer-ref">{selectedInquiry.id}</div>
                <h3 className="inquiry-drawer-title">{selectedInquiry.organisation}</h3>
              </div>
              <button
                type="button"
                className="inquiry-drawer-close"
                onClick={() => setSelectedInquiry(null)}
                title="Close drawer"
              >
                ✕
              </button>
            </div>

            {/* Quick Actions Row */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <a
                href={getWhatsAppUrl(selectedInquiry)}
                target="_blank"
                rel="noreferrer"
                className="inquiry-wa-btn"
                style={{ flex: 1, justifyContent: 'center', padding: '9px' }}
              >
                <span>💬 Chat on WhatsApp</span>
              </a>
              {selectedInquiry.email && (
                <a
                  href={`mailto:${selectedInquiry.email}?subject=Pehchaan Photobooth for ${encodeURIComponent(selectedInquiry.organisation)}`}
                  className="inquiry-btn-sm"
                  style={{ padding: '9px 12px' }}
                >
                  ✉️ Email
                </a>
              )}
              <button
                type="button"
                className="inquiry-btn-sm inquiry-btn-primary"
                onClick={() => void handleConvertToEvent(selectedInquiry)}
                disabled={convertingEvent}
                title="Convert this lead into an active Photobooth Event"
              >
                <span>⚡ Convert to Event</span>
              </button>
            </div>

            {/* Pipeline Status */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--adm-text-secondary)', marginBottom: '5px' }}>
                Pipeline Status
              </label>
              <select
                value={selectedInquiry.status}
                onChange={(e) => void handleStatusChange(selectedInquiry.id, e.target.value as InquiryStatus)}
                className="inquiry-status-select"
                style={{ width: '100%', height: '36px', fontSize: '13px', borderRadius: '8px' }}
              >
                <option value="new">● New / Uncontacted</option>
                <option value="contacted">● Contacted / In Discussion</option>
                <option value="quoted">● Quoted / Proposal Sent</option>
                <option value="confirmed">● Confirmed / Booked</option>
                <option value="archived">● Archived / Cancelled</option>
              </select>
            </div>

            {/* Details Table */}
            <div className="inquiry-info-grid">
              <div className="inquiry-info-row">
                <span className="inquiry-info-label">Contact Person:</span>
                <span className="inquiry-info-val">{selectedInquiry.contactName}</span>
              </div>
              <div className="inquiry-info-row">
                <span className="inquiry-info-label">WhatsApp:</span>
                <span className="inquiry-info-val" style={{ color: 'var(--adm-gold, #c6a15b)' }}>{selectedInquiry.whatsappNumber}</span>
              </div>
              {selectedInquiry.email && (
                <div className="inquiry-info-row">
                  <span className="inquiry-info-label">Email:</span>
                  <span className="inquiry-info-val">{selectedInquiry.email}</span>
                </div>
              )}
              <div className="inquiry-info-row">
                <span className="inquiry-info-label">Location:</span>
                <span className="inquiry-info-val">{selectedInquiry.city} ({selectedInquiry.setting})</span>
              </div>
              <div className="inquiry-info-row">
                <span className="inquiry-info-label">Expected Audience:</span>
                <span className="inquiry-info-val">{selectedInquiry.audienceBand}</span>
              </div>
              <div className="inquiry-info-row">
                <span className="inquiry-info-label">Target Date:</span>
                <span className="inquiry-info-val">{selectedInquiry.eventDateText || 'Flexible'}</span>
              </div>
            </div>

            {/* Requirements */}
            {selectedInquiry.requirements && (
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--adm-text-secondary)', marginBottom: '4px' }}>
                  Venue & Operating Requirements:
                </label>
                <div className="inquiry-text-block">
                  {selectedInquiry.requirements}
                </div>
              </div>
            )}

            {/* Custom Wishes */}
            {selectedInquiry.customWishes && (
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--adm-text-secondary)', marginBottom: '4px' }}>
                  Client Wishes & Keepsake Preferences:
                </label>
                <div className="inquiry-text-block">
                  {selectedInquiry.customWishes}
                </div>
              </div>
            )}

            {/* Internal Notes with Quick Tag Presets */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--adm-text-secondary)' }}>
                  Internal Notes:
                </label>
                <span style={{ fontSize: '11px', color: 'var(--adm-text-muted)' }}>Quick Presets:</span>
              </div>

              <div className="inquiry-note-presets">
                <button type="button" className="inquiry-note-chip" onClick={() => handleAddPresetNote('Shared pricing quotation via WhatsApp')}>
                  + Sent Quote
                </button>
                <button type="button" className="inquiry-note-chip" onClick={() => handleAddPresetNote('Called client - discussed venue timing')}>
                  + Called Client
                </button>
                <button type="button" className="inquiry-note-chip" onClick={() => handleAddPresetNote('Advance deposit received - confirmed')}>
                  + Deposit Paid
                </button>
                <button type="button" className="inquiry-note-chip" onClick={() => handleAddPresetNote('Custom frame overlay mockup approved')}>
                  + Frame Approved
                </button>
              </div>

              <textarea
                rows={3}
                className="inquiry-notes-textarea"
                placeholder="Log agreed rates, time slots, booth staff count..."
                value={editingNotes}
                onChange={(e) => setEditingNotes(e.target.value)}
              />
              <button
                type="button"
                className="inquiry-btn-sm inquiry-btn-primary"
                disabled={savingNote}
                onClick={() => void handleSaveNotes()}
                style={{ marginTop: '6px', width: '100%', justifyContent: 'center' }}
              >
                {savingNote ? 'Saving Notes...' : 'Save Notes'}
              </button>
            </div>

            {/* Delete button */}
            <div style={{ borderTop: '1px solid var(--adm-border, rgba(255, 255, 255, 0.07))', paddingTop: '10px' }}>
              <button
                type="button"
                className="inquiry-btn-sm"
                style={{ width: '100%', color: 'var(--adm-danger, #ef4444)', borderColor: 'rgba(239, 68, 68, 0.3)', justifyContent: 'center' }}
                onClick={() => void handleDelete(selectedInquiry.id)}
              >
                Delete Inquiry Record
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manual Add Lead Modal */}
      {showAddModal && (
        <div className="inquiry-modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="inquiry-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--adm-border)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, color: 'var(--adm-text-primary)', fontSize: '18px' }}>Log New Lead / Inquiry</h3>
              <button type="button" className="inquiry-drawer-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            <form onSubmit={handleCreateNewLead} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--adm-text-secondary)', marginBottom: '4px' }}>
                    Organisation / Event Name *
                  </label>
                  <input
                    type="text"
                    required
                    className="inquiry-notes-textarea"
                    style={{ height: '38px', resize: 'none' }}
                    placeholder="e.g. Hyderabad Gala"
                    value={newLeadForm.organisation}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, organisation: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--adm-text-secondary)', marginBottom: '4px' }}>
                    Contact Person Name *
                  </label>
                  <input
                    type="text"
                    required
                    className="inquiry-notes-textarea"
                    style={{ height: '38px', resize: 'none' }}
                    placeholder="e.g. Ramesh V"
                    value={newLeadForm.contactName}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, contactName: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--adm-text-secondary)', marginBottom: '4px' }}>
                    WhatsApp Number *
                  </label>
                  <input
                    type="tel"
                    required
                    className="inquiry-notes-textarea"
                    style={{ height: '38px', resize: 'none' }}
                    placeholder="+91 98765 43210"
                    value={newLeadForm.whatsappNumber}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, whatsappNumber: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--adm-text-secondary)', marginBottom: '4px' }}>
                    Email (Optional)
                  </label>
                  <input
                    type="email"
                    className="inquiry-notes-textarea"
                    style={{ height: '38px', resize: 'none' }}
                    placeholder="name@company.com"
                    value={newLeadForm.email}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, email: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--adm-text-secondary)', marginBottom: '4px' }}>
                    City
                  </label>
                  <input
                    type="text"
                    className="inquiry-notes-textarea"
                    style={{ height: '38px', resize: 'none' }}
                    value={newLeadForm.city}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, city: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--adm-text-secondary)', marginBottom: '4px' }}>
                    Target Date
                  </label>
                  <input
                    type="text"
                    className="inquiry-notes-textarea"
                    style={{ height: '38px', resize: 'none' }}
                    placeholder="e.g. Mid November 2026"
                    value={newLeadForm.eventDateText}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, eventDateText: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--adm-text-secondary)', marginBottom: '4px' }}>
                    Expected Audience
                  </label>
                  <select
                    className="inquiry-notes-textarea"
                    style={{ height: '38px' }}
                    value={newLeadForm.audienceBand}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, audienceBand: e.target.value })}
                  >
                    <option value="Under 100 guests">Under 100 guests</option>
                    <option value="100 – 300 guests">100 – 300 guests</option>
                    <option value="300 – 500 guests">300 – 500 guests</option>
                    <option value="500 – 1,000 guests">500 – 1,000 guests</option>
                    <option value="1,000+ guests">1,000+ guests</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--adm-text-secondary)', marginBottom: '4px' }}>
                    Setting
                  </label>
                  <select
                    className="inquiry-notes-textarea"
                    style={{ height: '38px' }}
                    value={newLeadForm.setting}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, setting: e.target.value })}
                  >
                    <option value="Indoor">Indoor</option>
                    <option value="Outdoor (Covered)">Outdoor (Covered)</option>
                    <option value="Outdoor (Open Air)">Outdoor (Open Air)</option>
                    <option value="Hybrid / Multiple Locations">Hybrid / Multiple Locations</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--adm-text-secondary)', marginBottom: '4px' }}>
                  Requirements & Notes
                </label>
                <textarea
                  rows={2}
                  className="inquiry-notes-textarea"
                  placeholder="Venue access, operating hours, custom requests..."
                  value={newLeadForm.requirements}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, requirements: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="button" className="inquiry-btn-sm" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="inquiry-btn-sm inquiry-btn-primary" disabled={submittingNew}>
                  {submittingNew ? 'Saving...' : 'Save Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
export default AdminInquiries
