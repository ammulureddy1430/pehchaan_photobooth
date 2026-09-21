import React, { useState } from 'react'
import './InquiryPage.css'

interface InquiryResponse {
  success: boolean
  inquiry: {
    id: string
    organisation: string
    contactName: string
    whatsappNumber: string
    email: string | null
    city: string
    eventDateText: string | null
    audienceBand: string
    setting: string
    requirements: string | null
    customWishes: string | null
    status: string
    createdAt: number
  }
  message: string
}

export const InquiryPage: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState('September 2026')
  const [dateText, setDateText] = useState('')
  const [city, setCity] = useState('Hyderabad')
  const [audienceBand, setAudienceBand] = useState('')
  const [setting, setSetting] = useState('Indoor')
  const [requirements, setRequirements] = useState('')
  const [customWishes, setCustomWishes] = useState('')
  const [organisation, setOrganisation] = useState('')
  const [contactName, setContactName] = useState('')
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [email, setEmail] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submittedInquiry, setSubmittedInquiry] = useState<InquiryResponse['inquiry'] | null>(null)

  const quickCities = ['Hyderabad', 'Bangalore', 'Mumbai', 'Delhi NCR', 'Chennai', 'Pune']

  const months = [
    'September 2026',
    'October 2026',
    'November 2026',
    'December 2026',
    'January 2027',
    'February 2027',
  ]

  const handleMonthChange = (direction: 'prev' | 'next') => {
    const idx = months.indexOf(selectedMonth)
    if (direction === 'prev' && idx > 0) {
      setSelectedMonth(months[idx - 1])
    } else if (direction === 'next' && idx < months.length - 1) {
      setSelectedMonth(months[idx + 1])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!organisation.trim()) {
      setError('Please enter your organisation or event host name.')
      return
    }
    if (!contactName.trim()) {
      setError('Please enter your contact name.')
      return
    }
    if (!whatsappNumber.trim()) {
      setError('Please enter your WhatsApp number so we can send you your quotation.')
      return
    }
    if (!city.trim()) {
      setError('Please specify the city where the event will take place.')
      return
    }
    if (!audienceBand) {
      setError('Please select an expected audience size band.')
      return
    }

    setLoading(true)

    try {
      const payload = {
        organisation: organisation.trim(),
        contactName: contactName.trim(),
        whatsappNumber: whatsappNumber.trim(),
        email: email.trim() || undefined,
        city: city.trim(),
        eventDateText: dateText.trim() || selectedMonth,
        audienceBand,
        setting,
        requirements: requirements.trim() || undefined,
        customWishes: customWishes.trim() || undefined,
      }

      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error?.message || data?.message || 'Failed to submit inquiry')
      }

      setSubmittedInquiry(data.inquiry)
    } catch (err: any) {
      setError(err.message || 'Something went wrong while submitting your inquiry. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const getWhatsAppFollowupUrl = () => {
    if (!submittedInquiry) return '#'
    const text = encodeURIComponent(
      `Hello Pehchaan Team, I just submitted an inquiry (Ref: ${submittedInquiry.id}) for ${submittedInquiry.organisation} in ${submittedInquiry.city} on ${submittedInquiry.eventDateText || 'our requested date'}. Looking forward to discussing custom overlays and pricing.`
    )
    return `https://wa.me/919876543210?text=${text}`
  }

  return (
    <div className="inquiry-page-wrapper">
      {/* Top Navigation */}
      <header className="inquiry-header-nav">
        <a href="/" className="inquiry-brand-group">
          <div className="inquiry-brand-mark">P</div>
          <span className="inquiry-brand-title">Pehchaan Photobooth</span>
        </a>
        <div className="inquiry-nav-links">
          <a href="/" className="inquiry-nav-btn">
            Live Kiosk
          </a>
          <a href="/admin" className="inquiry-nav-btn">
            Admin Portal
          </a>
          <a href="#inquiry-form" className="inquiry-nav-btn primary">
            Book a Booth
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="inquiry-main">
        {submittedInquiry ? (
          <div className="inquiry-form-card inquiry-success-card">
            <div className="inquiry-success-icon">✓</div>
            <h2 className="inquiry-success-title">Inquiry Received</h2>
            <p className="inquiry-success-desc">
              Thank you, <strong>{submittedInquiry.contactName}</strong>! We have recorded your request for{' '}
              <strong>{submittedInquiry.organisation}</strong>. Our team will review date availability and share a tailored quotation on WhatsApp shortly.
            </p>

            <div className="inquiry-summary-box">
              <div className="inquiry-summary-row">
                <span className="inquiry-summary-label">Reference ID</span>
                <span className="inquiry-summary-val" style={{ fontFamily: 'monospace' }}>
                  {submittedInquiry.id}
                </span>
              </div>
              <div className="inquiry-summary-row">
                <span className="inquiry-summary-label">Organisation</span>
                <span className="inquiry-summary-val">{submittedInquiry.organisation}</span>
              </div>
              <div className="inquiry-summary-row">
                <span className="inquiry-summary-label">Date Requested</span>
                <span className="inquiry-summary-val">{submittedInquiry.eventDateText || 'Flexible'}</span>
              </div>
              <div className="inquiry-summary-row">
                <span className="inquiry-summary-label">Location & Setting</span>
                <span className="inquiry-summary-val">
                  {submittedInquiry.city} ({submittedInquiry.setting})
                </span>
              </div>
              <div className="inquiry-summary-row">
                <span className="inquiry-summary-label">Audience Size</span>
                <span className="inquiry-summary-val">{submittedInquiry.audienceBand}</span>
              </div>
              <div className="inquiry-summary-row">
                <span className="inquiry-summary-label">WhatsApp Contact</span>
                <span className="inquiry-summary-val">{submittedInquiry.whatsappNumber}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
              <a
                href={getWhatsAppFollowupUrl()}
                target="_blank"
                rel="noreferrer"
                className="inquiry-whatsapp-direct-btn"
              >
                <span>💬 Chat with us on WhatsApp</span>
              </a>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button
                  type="button"
                  className="inquiry-nav-btn"
                  onClick={() => {
                    setSubmittedInquiry(null)
                    setDateText('')
                    setOrganisation('')
                    setContactName('')
                    setWhatsappNumber('')
                    setEmail('')
                    setRequirements('')
                    setCustomWishes('')
                  }}
                >
                  Submit Another Inquiry
                </button>
                <a href="/" className="inquiry-nav-btn primary">
                  Go to Photobooth Kiosk
                </a>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="inquiry-hero">
              <div className="inquiry-hero-tag">Pehchaan Photobooths • Availability & Booking</div>
              <h1 className="inquiry-hero-title">Bring Pehchaan to your next celebration or school event</h1>
              <p className="inquiry-hero-subtitle">
                Custom souvenir frames, instant photo strips, and private guest galleries designed for weddings, institutional milestones, graduations, and cultural gatherings.
              </p>
            </div>

            <form id="inquiry-form" className="inquiry-form-card" onSubmit={handleSubmit}>
              {error && <div className="inquiry-error-banner">{error}</div>}

              {/* Month Availability Banner */}
              <div className="inquiry-availability-notice">
                <div>
                  No offered days in <strong>{selectedMonth}</strong> for one booth. Ask us: tell us your date below.
                </div>
                <div className="inquiry-month-picker">
                  <button
                    type="button"
                    className="inquiry-month-btn"
                    onClick={() => handleMonthChange('prev')}
                    disabled={months.indexOf(selectedMonth) === 0}
                    title="Previous month"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="inquiry-month-btn"
                    onClick={() => handleMonthChange('next')}
                    disabled={months.indexOf(selectedMonth) === months.length - 1}
                    title="Next month"
                  >
                    →
                  </button>
                </div>
              </div>

              {/* Date Input */}
              <div className="inquiry-form-group">
                <div className="inquiry-label-row">
                  <label htmlFor="inquiry-date" className="inquiry-label">
                    Or tell us the date you have in mind
                  </label>
                  <span className="inquiry-label-aside">Ask us</span>
                </div>
                <input
                  id="inquiry-date"
                  type="text"
                  className="inquiry-input"
                  placeholder="For example: a weekday in mid November"
                  value={dateText}
                  onChange={(e) => setDateText(e.target.value)}
                />
                <div className="inquiry-help-text">
                  Offered days are the ones we can staff with your booth count. Any other date: ask us here.
                </div>
              </div>

              {/* City and Audience */}
              <div className="inquiry-form-row">
                <div>
                  <div className="inquiry-label-row">
                    <label htmlFor="inquiry-city" className="inquiry-label">
                      City
                    </label>
                  </div>
                  <input
                    id="inquiry-city"
                    type="text"
                    className="inquiry-input"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Hyderabad"
                    required
                  />
                  <div className="inquiry-city-chips">
                    {quickCities.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`inquiry-chip ${city === c ? 'active' : ''}`}
                        onClick={() => setCity(c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="inquiry-label-row">
                    <label htmlFor="inquiry-audience" className="inquiry-label">
                      Expected audience
                    </label>
                  </div>
                  <select
                    id="inquiry-audience"
                    className="inquiry-select"
                    value={audienceBand}
                    onChange={(e) => setAudienceBand(e.target.value)}
                    required
                  >
                    <option value="">Choose a band</option>
                    <option value="Under 100 guests">Under 100 guests</option>
                    <option value="100 – 300 guests">100 – 300 guests</option>
                    <option value="300 – 500 guests">300 – 500 guests</option>
                    <option value="500 – 1,000 guests">500 – 1,000 guests</option>
                    <option value="1,000+ guests">1,000+ guests</option>
                  </select>
                </div>
              </div>

              {/* Setting */}
              <div className="inquiry-form-group">
                <div className="inquiry-label-row">
                  <label htmlFor="inquiry-setting" className="inquiry-label">
                    Setting
                  </label>
                </div>
                <select
                  id="inquiry-setting"
                  className="inquiry-select"
                  value={setting}
                  onChange={(e) => setSetting(e.target.value)}
                >
                  <option value="Indoor">Indoor</option>
                  <option value="Outdoor (Covered)">Outdoor (Covered)</option>
                  <option value="Outdoor (Open Air)">Outdoor (Open Air)</option>
                  <option value="Hybrid / Multiple Locations">Hybrid / Multiple Locations</option>
                </select>
              </div>

              {/* Venue or Operating Requirements */}
              <div className="inquiry-form-group">
                <div className="inquiry-label-row">
                  <label htmlFor="inquiry-requirements" className="inquiry-label">
                    Venue or operating requirements
                  </label>
                </div>
                <textarea
                  id="inquiry-requirements"
                  rows={3}
                  className="inquiry-textarea"
                  placeholder="Venue access, operating hours, intended use or anything we should plan around."
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                />
              </div>

              {/* What would make this work for you? */}
              <div className="inquiry-form-group">
                <div className="inquiry-label-row">
                  <label htmlFor="inquiry-wishes" className="inquiry-label">
                    What would make this work for you?
                  </label>
                  <span className="inquiry-label-aside">Optional</span>
                </div>
                <textarea
                  id="inquiry-wishes"
                  rows={3}
                  className="inquiry-textarea"
                  placeholder="For example: a booth in our foyer, our crest on the back, and a keepsake guests can take home."
                  value={customWishes}
                  onChange={(e) => setCustomWishes(e.target.value)}
                />
              </div>

              {/* Organisation and Contact Name */}
              <div className="inquiry-form-row">
                <div>
                  <div className="inquiry-label-row">
                    <label htmlFor="inquiry-org" className="inquiry-label">
                      Organisation
                    </label>
                  </div>
                  <input
                    id="inquiry-org"
                    type="text"
                    className="inquiry-input"
                    placeholder="School, Company, or Event Name"
                    value={organisation}
                    onChange={(e) => setOrganisation(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <div className="inquiry-label-row">
                    <label htmlFor="inquiry-name" className="inquiry-label">
                      Contact name
                    </label>
                  </div>
                  <input
                    id="inquiry-name"
                    type="text"
                    className="inquiry-input"
                    placeholder="Your Full Name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* WhatsApp and Email */}
              <div className="inquiry-form-row">
                <div>
                  <div className="inquiry-label-row">
                    <label htmlFor="inquiry-whatsapp" className="inquiry-label">
                      WhatsApp number
                    </label>
                  </div>
                  <input
                    id="inquiry-whatsapp"
                    type="tel"
                    className="inquiry-input"
                    placeholder="+91 98765 43210"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <div className="inquiry-label-row">
                    <label htmlFor="inquiry-email" className="inquiry-label">
                      Email
                    </label>
                    <span className="inquiry-label-aside">Optional</span>
                  </div>
                  <input
                    id="inquiry-email"
                    type="email"
                    className="inquiry-input"
                    placeholder="coordinator@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* Submit Row */}
              <div className="inquiry-submit-row">
                <button type="submit" className="inquiry-submit-btn" disabled={loading}>
                  {loading ? 'Submitting Inquiry...' : 'Submit Inquiry & Request Availability'}
                </button>
                <div className="inquiry-privacy-foot">
                  🔒 We respect your privacy. Inquiries are used exclusively for booth staffing and quote preparation.
                </div>
              </div>
            </form>
          </>
        )}
      </main>
    </div>
  )
}
export default InquiryPage
