import React, { useEffect, useState, useCallback, useMemo } from 'react'
import {
  adminGetEventConfig,
  adminSaveEventConfig,
  adminUploadImage,
  adminGetEventActivation,
  adminRegenerateActivationToken,
  adminUpdateEvent,
  adminGetInquiries,
} from '../services/adminApi'
import {
  IconCheckCircle,
  IconUpload,
  IconCamera,
  IconQrCode,
  IconCopy,
  IconPrinter,
  IconDownload,
  IconLock,
  IconKey,
  IconExternalLink,
  IconCalendar,
  IconRefresh,
  IconShield,
  IconSparkles,
} from '../components/AdminIcons'
import type {
  AdminEvent,
  SchoolProfile,
  EventConfiguration,
  EventBrandingConfig,
  EventPhotoConfig,
  EventTemplateConfig,
  EventDeliveryConfig,
  EventPaymentConfig,
  EventPrivacyConfig,
  SaveEventConfigInput,
  EventActivationDetails,
  InquiryItem,
} from '../types'

interface AdminEventConfigProps {
  eventId: string
  onBack: () => void
}

type ConfigTab =
  | 'overview'
  | 'branding'
  | 'photo'
  | 'templates'
  | 'delivery'
  | 'payment'
  | 'privacy'
  | 'activation'
  | 'preview'

const TABS: { id: ConfigTab; label: string; icon: string; description: string }[] = [
  { id: 'overview', label: 'Overview', icon: '📊', description: 'Readiness & quick actions' },
  { id: 'branding', label: 'Branding & Logo', icon: '🎨', description: 'Logo, titles, & accent color' },
  { id: 'templates', label: 'Frames & Layout', icon: '🖼️', description: 'Layouts, frames & backgrounds' },
  { id: 'photo', label: 'Camera & Timer', icon: '📷', description: 'Shots, timer & mirror mode' },
  { id: 'delivery', label: 'Delivery Channels', icon: '🚀', description: 'Print, QR, Email & WhatsApp' },
  { id: 'payment', label: 'Pricing & UPI', icon: '💳', description: 'UPI monetization & pricing' },
  { id: 'privacy', label: 'Privacy & Safety', icon: '🛡️', description: 'School mode & consent' },
  { id: 'activation', label: 'Kiosk QR & PIN', icon: '📲', description: 'Kiosk QR & Staff PIN' },
  { id: 'preview', label: 'Live Preview', icon: '👁️', description: 'Strip, Kiosk & JSON viewer' },
]

const TEMPLATE_PRESETS = [
  {
    id: 'school-classic',
    name: 'School classic',
    description: '3 vertical photo slots, fine border, crisp white paper, deep teal accent, and school crest.',
    shots: 3,
    background: '#ffffff',
    accentColor: '#1e6052',
    frameEdge: 'fine' as const,
    overlay: true,
  },
  {
    id: 'fest-edition',
    name: 'Fest edition',
    description: '3 photo celebration edition with bold borders, electric purple accent, and festive layout.',
    shots: 3,
    background: '#ffffff',
    accentColor: '#7c3aed',
    frameEdge: 'bold' as const,
    overlay: true,
  },
  {
    id: 'little-keepsake',
    name: 'Little keepsake',
    description: '2 balanced keepsake photos, delicate double-line frame, warm amber accent, and card back notes.',
    shots: 2,
    background: '#fffdf5',
    accentColor: '#d97706',
    frameEdge: 'double' as const,
    overlay: true,
  },
  {
    id: 'brand-canvas',
    name: 'Brand canvas',
    description: 'Full institutional brand canvas with custom watermark, hero portrait framing & gold trims.',
    shots: 1,
    background: '#0b0a09',
    accentColor: '#c6a15b',
    frameEdge: 'fine' as const,
    overlay: true,
  },
]

const COLOR_PRESETS = [
  { name: 'Deep Teal', hex: '#1e6052' },
  { name: 'Royal Gold', hex: '#c6a15b' },
  { name: 'Sapphire Blue', hex: '#38bdf8' },
  { name: 'Emerald Green', hex: '#10b981' },
  { name: 'Ruby Crimson', hex: '#f43f5e' },
  { name: 'Amethyst Purple', hex: '#a855f7' },
  { name: 'Warm Amber', hex: '#f59e0b' },
  { name: 'Midnight Navy', hex: '#3b82f6' },
]

export const SchoolShieldCrest: React.FC<{ size?: number; color?: string }> = ({
  size = 28,
  color = '#1e6052',
}) => (
  <svg
    width={size}
    height={size * 1.15}
    viewBox="0 0 32 37"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ display: 'inline-block', verticalAlign: 'middle' }}
  >
    <path
      d="M16 1.5L3.5 6.5V17.5C3.5 26.5 9 32.5 16 35.5C23 32.5 28.5 26.5 28.5 17.5V6.5L16 1.5Z"
      fill={color}
      stroke="#c6a15b"
      strokeWidth="1.2"
    />
    <path
      d="M16 14C14 12.5 10.5 12.5 8 13.5V23.5C10.5 22.5 14 22.5 16 24M16 14C18 12.5 21.5 12.5 24 13.5V23.5C21.5 22.5 18 22.5 16 24M16 14V24"
      stroke="#ffffff"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const AdminEventConfig: React.FC<AdminEventConfigProps> = ({ eventId, onBack }) => {
  const [activeTab, setActiveTab] = useState<ConfigTab>('overview')
  const [event, setEvent] = useState<AdminEvent | null>(null)
  const [school, setSchool] = useState<SchoolProfile | null>(null)
  const [initialConfig, setInitialConfig] = useState<EventConfiguration | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Working state for all configuration sections
  const [branding, setBranding] = useState<EventBrandingConfig>({
    schoolLogoUrl: null,
    schoolName: '',
    eventTitle: '',
    eventSubtitle: '',
    useDefaultSchoolLogo: true,
    accentColor: '#c6a15b',
  })

  const [photoSettings, setPhotoSettings] = useState<EventPhotoConfig>({
    shotCount: 3,
    orientation: 'portrait_strip',
    mirrorOutput: true,
    blackAndWhiteEnabled: true,
    sepiaEnabled: true,
    betweenShotPauseMs: 0,
    retentionHours: 72,
  })

  const [template, setTemplate] = useState<EventTemplateConfig>({
    templateId: 'school-classic',
    background: '#ffffff',
    overlayEnabled: true,
    frameEdge: 'fine',
    printedDate: '',
    customTitle: '',
    customSubtitle: '',
    cardBackEnabled: true,
    cardBackHeadline: 'Thank you for coming',
    cardBackMessage: 'A special keepsake from your unforgettable day.',
    cardBackShowQr: true,
    cardBackBgColor: '#ffffff',
    cardBackTextColor: '#0f172a',
    cardBackStyle: 'note_lines',
    cardBackShowLines: true,
  })

  const [delivery, setDelivery] = useState<EventDeliveryConfig>({
    printEnabled: true,
    cloudQrEnabled: true,
    whatsappEnabled: false,
    emailEnabled: false,
  })

  const [payment, setPayment] = useState<EventPaymentConfig>({
    mode: 'organizer',
    amount: 0,
    currency: 'INR',
    upiId: '',
    merchantName: '',
    timeoutSeconds: 300,
  })

  const [privacy, setPrivacy] = useState<EventPrivacyConfig>({
    schoolMode: true,
    consentMode: 'notice',
    privacyNoticeText:
      'Privacy Notice: Photos taken during this session are saved privately and never published without consent.',
    retentionHours: 72,
    publicGalleryEnabled: false,
  })

  // Staff PIN state
  const [staffPin, setStaffPin] = useState<string>('482917')
  const [copiedStaffPin, setCopiedStaffPin] = useState(false)

  // Activation & QR state
  const [activationDetails, setActivationDetails] = useState<EventActivationDetails | null>(null)
  const [loadingActivation, setLoadingActivation] = useState(false)
  const [regeneratingToken, setRegeneratingToken] = useState(false)
  const [copiedEventId, setCopiedEventId] = useState(false)

  // Live Preview State
  const [previewViewMode, setPreviewViewMode] = useState<'strip' | 'kiosk' | 'json'>('strip')
  const [previewSide, setPreviewSide] = useState<'front' | 'back'>('front')
  const [previewFilter, setPreviewFilter] = useState<'normal' | 'bw' | 'sepia'>('normal')
  const [copiedJson, setCopiedJson] = useState(false)
  const [downloadingPreview, setDownloadingPreview] = useState(false)

  // Inquiries and Client Booking State
  const [inquiries, setInquiries] = useState<InquiryItem[]>([])

  // Load configuration and inquiries from server
  const loadConfig = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [res, inqRes] = await Promise.all([
        adminGetEventConfig(eventId),
        adminGetInquiries({ limit: 50 }).catch(() => ({ inquiries: [] } as any)),
      ])
      setEvent(res.event)
      setSchool(res.school)
      setInitialConfig(res.config)
      if (inqRes?.inquiries) {
        setInquiries(inqRes.inquiries)
      }

      // Initialize form fields
      setBranding(res.config.branding)
      setPhotoSettings(res.config.photoSettings)
      const loadedTpl = (res.config.template || {}) as Partial<EventTemplateConfig>
      setTemplate({
        templateId: loadedTpl.templateId || 'school-classic',
        background: loadedTpl.background || '#ffffff',
        overlayEnabled: loadedTpl.overlayEnabled !== false,
        frameEdge: loadedTpl.frameEdge || 'fine',
        printedDate: loadedTpl.printedDate || '',
        customTitle: loadedTpl.customTitle || '',
        customSubtitle: loadedTpl.customSubtitle || '',
        cardBackEnabled: loadedTpl.cardBackEnabled !== false,
        cardBackHeadline: loadedTpl.cardBackHeadline || 'Thank you for coming',
        cardBackMessage: loadedTpl.cardBackMessage || 'A special keepsake from your unforgettable day.',
        cardBackShowQr: loadedTpl.cardBackShowQr !== false,
        cardBackBgColor: loadedTpl.cardBackBgColor || '#ffffff',
        cardBackTextColor: loadedTpl.cardBackTextColor || '#0f172a',
        cardBackStyle: loadedTpl.cardBackStyle || 'note_lines',
        cardBackShowLines: loadedTpl.cardBackShowLines !== false,
      })
      setDelivery(res.config.delivery)
      setPayment(res.config.payment)
      setPrivacy(res.config.privacy)
      setStaffPin(res.config.staffPin || '482917')
    } catch (err: any) {
      setError(err.message || 'Failed to load event configuration.')
    } finally {
      setLoading(false)
    }
  }, [eventId])

  // Derive linked booking inquiry for this event
  const linkedInquiry = useMemo(() => {
    return (
      inquiries.find(
        (i) =>
          i.metadata?.eventId === eventId ||
          (i.notes && i.notes.includes(eventId)) ||
          (event && i.organisation.trim().toLowerCase() === event.name.trim().toLowerCase())
      ) || null
    )
  }, [inquiries, eventId, event])

  // Load Activation state from server
  const loadActivation = useCallback(async () => {
    setLoadingActivation(true)
    try {
      const data = await adminGetEventActivation(eventId)
      setActivationDetails(data)
      if (data.staffPin) {
        setStaffPin(data.staffPin)
      }
    } catch (err: any) {
      console.warn('Failed to load activation details:', err)
    } finally {
      setLoadingActivation(false)
    }
  }, [eventId])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  useEffect(() => {
    if (activeTab === 'activation' || activeTab === 'overview') {
      void loadActivation()
    }
  }, [activeTab, loadActivation])

  const handleGenerateRandomPin = () => {
    const digits = '0123456789'
    let newPin = ''
    for (let i = 0; i < 6; i++) {
      newPin += digits[Math.floor(Math.random() * 10)]
    }
    setStaffPin(newPin)
  }

  const handleCopyStaffPin = async () => {
    try {
      await navigator.clipboard.writeText(staffPin)
      setCopiedStaffPin(true)
      setTimeout(() => setCopiedStaffPin(false), 2500)
    } catch {
      // Fallback
    }
  }

  const handleRegenerateToken = async () => {
    if (regeneratingToken) return
    const confirmed = window.confirm(
      'Regenerate activation credentials? Any existing printed or distributed activation QR codes for this event will be invalidated and will need to be re-scanned on the booth.'
    )
    if (!confirmed) return

    setRegeneratingToken(true)
    setError(null)
    try {
      await adminRegenerateActivationToken(eventId)
      await loadActivation()
      setSuccessMsg('Activation credentials regenerated successfully!')
      setTimeout(() => setSuccessMsg(null), 4000)
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate activation credentials.')
    } finally {
      setRegeneratingToken(false)
    }
  }

  const [updatingStatus, setUpdatingStatus] = useState(false)

  const handleToggleLiveStatus = async () => {
    if (!event || updatingStatus) return
    const nextStatus = event.status === 'live' ? 'paused' : 'live'
    setUpdatingStatus(true)
    setError(null)
    try {
      const res = await adminUpdateEvent(event.eventId, { status: nextStatus })
      if (res.event) {
        setEvent(res.event)
        setSuccessMsg(nextStatus === 'live' ? '🎉 Event is now LIVE! Ready for Photobooth sessions.' : 'Event paused.')
        setTimeout(() => setSuccessMsg(null), 5000)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update event status.')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleCopyEventId = async () => {
    const idToCopy = event?.eventId || eventId
    try {
      await navigator.clipboard.writeText(idToCopy)
      setCopiedEventId(true)
      setTimeout(() => setCopiedEventId(false), 2500)
    } catch {
      // Fallback
    }
  }

  const handleDownloadQr = () => {
    if (!activationDetails) return
    if (activationDetails.qrDataUrl) {
      const a = document.createElement('a')
      a.href = activationDetails.qrDataUrl
      a.download = `${event?.eventId || eventId}_activation_qr.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } else if (activationDetails.qrSvg) {
      const blob = new Blob([activationDetails.qrSvg], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${event?.eventId || eventId}_activation_qr.svg`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  const handlePrintActivationSheet = () => {
    if (!activationDetails || !event) return
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const qrSrc =
      activationDetails.qrDataUrl ||
      (activationDetails.qrSvg
        ? `data:image/svg+xml;utf8,${encodeURIComponent(activationDetails.qrSvg)}`
        : '')

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Booth Activation Sheet - ${event.name} (${event.eventId})</title>
        <style>
          @page { size: A4 portrait; margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 0; padding: 24px; background: #fff; }
          .sheet { max-width: 640px; margin: 0 auto; border: 2px solid #c6a15b; border-radius: 14px; padding: 32px 28px; text-align: center; box-sizing: border-box; }
          .brand-badge { display: inline-block; font-size: 11px; font-weight: 800; letter-spacing: 0.15em; color: #8c6d23; text-transform: uppercase; background: #fbf7ee; border: 1px solid #c6a15b; border-radius: 20px; padding: 4px 14px; margin-bottom: 12px; }
          .school-name { font-size: 16px; font-weight: 600; color: #444; margin-bottom: 4px; }
          .event-title { font-size: 26px; font-weight: 800; color: #0b0a09; margin: 4px 0 16px; }
          .meta-grid { display: flex; justify-content: center; gap: 24px; font-size: 13px; color: #666; margin-bottom: 24px; border-top: 1px solid #eee; border-bottom: 1px solid #eee; padding: 10px 0; }
          .meta-item strong { color: #111; font-size: 13px; margin-left: 4px; }
          .qr-box { background: #fafafa; border: 2px dashed #c6a15b; border-radius: 16px; padding: 20px; display: inline-block; margin: 8px 0; }
          .qr-img { width: 220px; height: 220px; display: block; margin: 0 auto; }
          .event-id-box { margin-top: 16px; background: #fdfbf7; border: 1.5px solid #c6a15b; border-radius: 10px; padding: 12px 24px; display: inline-block; }
          .event-id-label { font-size: 11px; font-weight: 700; color: #8c6d23; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 4px; }
          .event-id-code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 28px; font-weight: 800; color: #0b0a09; letter-spacing: 0.12em; }
          .instructions-card { text-align: left; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 22px; margin-top: 24px; }
          .instructions-card h4 { margin: 0 0 10px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #0f172a; font-weight: 700; }
          .instructions-card ol { margin: 0; padding-left: 20px; font-size: 12.5px; line-height: 1.6; color: #334155; }
          .instructions-card li { margin-bottom: 4px; }
          .footer-note { font-size: 10.5px; color: #94a3b8; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="brand-badge">✦ Pehchaan Photobooth Deployment ✦</div>
          <div class="school-name">${school?.schoolName || 'School Campus'}</div>
          <div class="event-title">${event.name}</div>
          <div class="meta-grid">
            <div class="meta-item"><span>Date:</span><strong>${event.eventDate || 'Scheduled'}</strong></div>
            <div class="meta-item"><span>Venue:</span><strong>${event.venue || 'Campus'}</strong></div>
            <div class="meta-item"><span>Status:</span><strong>${event.status.toUpperCase()}</strong></div>
          </div>
          <div class="qr-box">
            <img class="qr-img" src="${qrSrc}" alt="Activation QR Code" />
          </div>
          <div style="display: flex; justify-content: center; gap: 16px; margin-top: 16px; flex-wrap: wrap;">
            <div class="event-id-box">
              <div class="event-id-label">Manual Activation Event ID</div>
              <div class="event-id-code">${event.eventId}</div>
            </div>
            <div class="event-id-box" style="border-color: #94a3b8;">
              <div class="event-id-label" style="color: #475569;">Booth Staff PIN</div>
              <div class="event-id-code" style="color: #0f172a; letter-spacing: 0.18em;">${staffPin || '482917'}</div>
            </div>
          </div>
          <div class="instructions-card">
            <h4>Instructions for Photobooth Staff:</h4>
            <ol>
              <li>Power on the iPad / Kiosk and launch <strong>Pehchaan Photobooth</strong>.</li>
              <li>Tap top-right to open <strong>Staff Mode</strong> and enter Staff PIN: <strong>${staffPin || '482917'}</strong>.</li>
              <li>Tap <strong>"Activate Event"</strong> (or "Switch Event").</li>
              <li>Point the iPad camera at the <strong>Activation QR Code</strong> above, or manually type Event ID: <strong>${event.eventId}</strong>.</li>
              <li>Review the event summary and tap <strong>"Confirm & Load Event"</strong>.</li>
              <li>The booth compiles the Event Pack, stores it offline in local storage, and enters Live mode.</li>
            </ol>
          </div>
          <div class="footer-note">
            Confidential. For authorized staff deployment only. Do not distribute to guests.
          </div>
        </div>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `)
    printWindow.document.close()
  }

  const handleDownloadStripPreview = () => {
    try {
      setDownloadingPreview(true)
      const canvas = document.createElement('canvas')
      canvas.width = 600
      canvas.height = 1800
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const isBack = previewSide === 'back'
      const bg = isBack ? (template.cardBackBgColor || '#ffffff') : (template.background || '#ffffff')
      const accent = branding.accentColor || '#1e6052'
      const edge = template.frameEdge || 'fine'
      const shotCount = photoSettings.shotCount || 3

      // 1. Draw Physical Strip Background
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, 600, 1800)

      // 2. Inset Frame Border
      const borderWidth = edge === 'bold' ? 8 : edge === 'double' ? 5 : edge === 'none' ? 0 : 4
      if (borderWidth > 0) {
        ctx.strokeStyle = accent
        ctx.lineWidth = borderWidth
        if (edge === 'double') {
          ctx.strokeRect(12, 12, 576, 1776)
          ctx.lineWidth = 2
          ctx.strokeRect(20, 20, 560, 1760)
        } else {
          ctx.strokeRect(14, 14, 572, 1772)
        }
      }

      if (isBack) {
        // --- CARD BACK RENDER ---
        ctx.textAlign = 'center'

        // Top Shield Crest
        ctx.fillStyle = accent
        // Draw simple shield
        ctx.beginPath()
        ctx.moveTo(300, 180)
        ctx.lineTo(240, 210)
        ctx.lineTo(240, 310)
        ctx.bezierCurveTo(240, 390, 280, 430, 300, 450)
        ctx.bezierCurveTo(320, 430, 360, 390, 360, 310)
        ctx.lineTo(360, 210)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = '#c6a15b'
        ctx.lineWidth = 4
        ctx.stroke()

        // White Book inside shield
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 5
        ctx.beginPath()
        ctx.moveTo(300, 270)
        ctx.lineTo(270, 255)
        ctx.lineTo(270, 330)
        ctx.lineTo(300, 345)
        ctx.lineTo(330, 330)
        ctx.lineTo(330, 255)
        ctx.lineTo(300, 270)
        ctx.moveTo(300, 270)
        ctx.lineTo(300, 345)
        ctx.stroke()

        // Headline
        ctx.fillStyle = template.cardBackTextColor || '#0f172a'
        ctx.font = 'bold 52px Georgia, serif'
        ctx.fillText(template.cardBackHeadline || 'Thank you for coming', 300, 540)

        // Subtitle (School Name)
        ctx.font = 'bold 28px -apple-system, sans-serif'
        ctx.fillStyle = '#475569'
        ctx.fillText(branding.schoolName || school?.schoolName || 'Sunrise Public School', 300, 600)

        // Custom Message if present
        if (template.cardBackMessage) {
          ctx.font = 'italic 26px Georgia, serif'
          ctx.fillStyle = '#334155'
          const lines = template.cardBackMessage.split('\n')
          lines.forEach((line, i) => {
            ctx.fillText(`"${line}"`, 300, 680 + i * 40)
          })
        }

        // Ruled Handwriting Guidelines
        if (template.cardBackShowLines !== false) {
          ctx.strokeStyle = '#cbd5e1'
          ctx.lineWidth = 2
          ctx.setLineDash([8, 8])
          ctx.beginPath()
          ctx.moveTo(80, 820)
          ctx.lineTo(520, 820)
          ctx.moveTo(80, 910)
          ctx.lineTo(520, 910)
          ctx.moveTo(80, 1000)
          ctx.lineTo(520, 1000)
          ctx.stroke()
          ctx.setLineDash([])

          ctx.font = 'italic 20px -apple-system, sans-serif'
          ctx.fillStyle = '#94a3b8'
          ctx.textAlign = 'right'
          ctx.fillText('write a memory • sign here', 520, 1035)
          ctx.textAlign = 'center'
        }

        // Compact Album QR Box if enabled
        if (template.cardBackShowQr !== false) {
          ctx.fillStyle = '#f8fafc'
          ctx.beginPath()
          ctx.roundRect(140, 1280, 320, 140, 12)
          ctx.fill()
          ctx.strokeStyle = '#cbd5e1'
          ctx.lineWidth = 2
          ctx.stroke()

          // Draw QR Placeholder Icon
          ctx.fillStyle = '#0f172a'
          ctx.fillRect(165, 1310, 30, 30)
          ctx.fillRect(205, 1310, 30, 30)
          ctx.fillRect(165, 1350, 30, 30)
          ctx.fillRect(205, 1350, 14, 14)
          ctx.fillRect(221, 1366, 14, 14)

          ctx.textAlign = 'left'
          ctx.font = 'bold 22px -apple-system, sans-serif'
          ctx.fillStyle = '#0f172a'
          ctx.fillText('ONLINE GALLERY', 260, 1345)
          ctx.font = '18px -apple-system, sans-serif'
          ctx.fillStyle = '#64748b'
          ctx.fillText('Scan for digital copy', 260, 1380)
          ctx.textAlign = 'center'
        }

        // Footer Date & Tagline
        ctx.font = 'italic 22px Georgia, serif'
        ctx.fillStyle = accent
        const dateTagline = `${template.printedDate || event?.eventDate || '14 Nov 2026'} • Your day, in print.`
        ctx.fillText(dateTagline, 300, 1680)
      } else {
        // --- PHOTO SIDE RENDER ---
        const marginX = 36
        const slotWidth = 600 - marginX * 2
        const startY = 36
        const availableHeight = 1440
        const gap = 16
        const totalGaps = (shotCount - 1) * gap
        const slotHeight = Math.floor((availableHeight - totalGaps) / shotCount)

        const pastelFills = ['#b8ccba', '#cbaf7a', '#96b8a8', '#dcfce7']

        for (let i = 0; i < shotCount; i++) {
          const sy = startY + i * (slotHeight + gap)

          // Slot Fill
          ctx.fillStyle = pastelFills[i % pastelFills.length]
          ctx.fillRect(marginX, sy, slotWidth, slotHeight)

          // Centered White Guest Pill
          ctx.fillStyle = '#ffffff'
          const pillW = 200
          const pillH = 46
          const pillX = 300 - pillW / 2
          const pillY = sy + slotHeight / 2 - pillH / 2
          ctx.beginPath()
          ctx.roundRect(pillX, pillY, pillW, pillH, 8)
          ctx.fill()

          ctx.fillStyle = '#1e293b'
          ctx.font = 'bold 22px -apple-system, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText('your guests', 300, pillY + 30)
        }

        // Bottom Typography & Imprints
        const footerY = 1530
        ctx.fillStyle = bg === '#ffffff' || bg.toLowerCase() === '#fff' ? '#0f172a' : '#ffffff'
        ctx.font = 'bold 40px Georgia, serif'
        ctx.textAlign = 'center'
        ctx.fillText(branding.eventTitle || event?.name || 'Annual Day 2026', 300, footerY)

        const dateStr = template.printedDate || event?.eventDate || '14 Nov 2026'
        ctx.font = '24px -apple-system, sans-serif'
        ctx.fillStyle = '#64748b'
        ctx.fillText(dateStr, 300, footerY + 50)

        // Shield Crest at bottom
        ctx.fillStyle = accent
        ctx.beginPath()
        ctx.moveTo(300, footerY + 80)
        ctx.lineTo(270, footerY + 95)
        ctx.lineTo(270, footerY + 145)
        ctx.bezierCurveTo(270, footerY + 185, 290, footerY + 205, 300, footerY + 215)
        ctx.bezierCurveTo(310, footerY + 205, 330, footerY + 185, 330, footerY + 145)
        ctx.lineTo(330, footerY + 95)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = '#c6a15b'
        ctx.lineWidth = 2
        ctx.stroke()

        // White Book inside bottom crest
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(300, footerY + 125)
        ctx.lineTo(285, footerY + 118)
        ctx.lineTo(285, footerY + 155)
        ctx.lineTo(300, footerY + 162)
        ctx.lineTo(315, footerY + 155)
        ctx.lineTo(315, footerY + 118)
        ctx.lineTo(300, footerY + 125)
        ctx.moveTo(300, footerY + 125)
        ctx.lineTo(300, footerY + 162)
        ctx.stroke()
      }

      // Trigger Download
      const link = document.createElement('a')
      link.download = `${event?.eventId || 'photostrip'}_${isBack ? 'card_back' : 'photo_side'}_preview.png`
      link.href = canvas.toDataURL('image/png')
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch {
      // Fallback
    } finally {
      setDownloadingPreview(false)
    }
  }

  // Detect Unsaved Changes
  const isDirty = useMemo(() => {
    if (!initialConfig) return false
    return (
      JSON.stringify(branding) !== JSON.stringify(initialConfig.branding) ||
      JSON.stringify(photoSettings) !== JSON.stringify(initialConfig.photoSettings) ||
      JSON.stringify(template) !== JSON.stringify(initialConfig.template) ||
      JSON.stringify(delivery) !== JSON.stringify(initialConfig.delivery) ||
      JSON.stringify(payment) !== JSON.stringify(initialConfig.payment) ||
      JSON.stringify(privacy) !== JSON.stringify(initialConfig.privacy) ||
      staffPin !== (initialConfig.staffPin || '482917')
    )
  }, [initialConfig, branding, photoSettings, template, delivery, payment, privacy, staffPin])

  // Checklist computation
  const checklist = useMemo(() => {
    const hasEventTitle = Boolean(branding.eventTitle && branding.eventTitle.trim().length > 0)
    const hasTemplate = Boolean(template.templateId)
    const hasPhotoSettings = photoSettings.shotCount >= 1 && photoSettings.shotCount <= 3
    const hasDelivery = delivery.printEnabled || delivery.cloudQrEnabled || delivery.emailEnabled || delivery.whatsappEnabled
    const isPaymentValid =
      payment.mode === 'organizer' ||
      payment.mode === 'disabled' ||
      (payment.mode === 'individual' && payment.amount > 0 && Boolean(payment.upiId && payment.upiId.includes('@')))
    const isPrivacyValid = !privacy.schoolMode || (!delivery.whatsappEnabled && privacy.consentMode !== 'none')

    const items = [
      { id: 'details', label: 'Event Details & Timing', complete: Boolean(event?.name), tab: 'overview' as ConfigTab },
      { id: 'branding', label: 'School & Event Branding', complete: hasEventTitle, tab: 'branding' as ConfigTab },
      { id: 'photo', label: 'Photo Capture & Shot Count', complete: hasPhotoSettings, tab: 'photo' as ConfigTab },
      { id: 'template', label: 'Layout & Frame Template', complete: hasTemplate, tab: 'templates' as ConfigTab },
      { id: 'delivery', label: 'Delivery Channels', complete: hasDelivery, tab: 'delivery' as ConfigTab },
      { id: 'payment', label: 'Monetization / Payment Mode', complete: isPaymentValid, tab: 'payment' as ConfigTab },
      { id: 'privacy', label: 'Privacy & Safety Configuration', complete: isPrivacyValid, tab: 'privacy' as ConfigTab },
    ]

    const completedCount = items.filter((i) => i.complete).length
    const totalCount = items.length
    const progressPercent = Math.round((completedCount / totalCount) * 100)
    const allComplete = items.every((i) => i.complete)

    return { items, completedCount, totalCount, progressPercent, allComplete }
  }, [event, branding, photoSettings, template, delivery, payment, privacy])

  // Save Configuration Handler
  const handleSave = async () => {
    if (saving) return
    setError(null)
    setSuccessMsg(null)

    // Validate branding
    if (!branding.eventTitle.trim()) {
      setError('Event Title is required in Branding configuration.')
      setActiveTab('branding')
      return
    }

    // Validate payment
    if (payment.mode === 'individual') {
      if (!payment.amount || payment.amount <= 0) {
        setError('Individual Payment mode requires a valid positive price.')
        setActiveTab('payment')
        return
      }
      if (!payment.upiId || !payment.upiId.includes('@')) {
        setError('Individual Payment requires a valid UPI ID (e.g. school@bank).')
        setActiveTab('payment')
        return
      }
    }

    setSaving(true)
    try {
      const pinToSave = staffPin && /^\d{6}$/.test(staffPin.trim()) ? staffPin.trim() : '482917'
      const payload: SaveEventConfigInput = {
        branding,
        photoSettings,
        template,
        delivery: {
          ...delivery,
          whatsappEnabled: Boolean(delivery.whatsappEnabled),
        },
        payment,
        privacy,
        staffPin: pinToSave,
      }

      const res = await adminSaveEventConfig(eventId, payload)
      if (res.config) {
        setInitialConfig(res.config)
        setSuccessMsg('Event configuration and Event Pack generated successfully!')
        setTimeout(() => setSuccessMsg(null), 5000)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration.')
    } finally {
      setSaving(false)
    }
  }

  // Handle Logo Upload
  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (PNG, JPEG, or WebP).')
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('Image file must be under 2 MB.')
      return
    }

    setUploadingLogo(true)
    setError(null)
    try {
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const base64 = reader.result as string
          const uploadRes = await adminUploadImage(base64, file.name)
          setBranding((prev) => ({
            ...prev,
            schoolLogoUrl: uploadRes.url,
            useDefaultSchoolLogo: false,
          }))
        } catch (err: any) {
          setError(err.message || 'Failed to upload logo.')
        } finally {
          setUploadingLogo(false)
        }
      }
      reader.readAsDataURL(file)
    } catch (err: any) {
      setError(err.message || 'Failed to read image file.')
      setUploadingLogo(false)
    }
  }

  // Helper for Step Navigation Footer
  const renderStepFooter = (prevTab: ConfigTab | null, nextTab: ConfigTab | null, nextLabel?: string) => {
    const prevItem = TABS.find((t) => t.id === prevTab)
    const nextItem = TABS.find((t) => t.id === nextTab)

    return (
      <div className="admin-step-footer">
        <div>
          {prevTab ? (
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={() => {
                setActiveTab(prevTab)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            >
              ← Previous: {prevItem?.label || 'Step'}
            </button>
          ) : (
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={onBack}
            >
              ← Back to Events List
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : '💾 Save Changes'}
          </button>

          {nextTab && (
            <button
              type="button"
              className="admin-btn admin-btn-primary"
              onClick={() => {
                setActiveTab(nextTab)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            >
              <span>{nextLabel || `Next: ${nextItem?.label || 'Step'}`} →</span>
            </button>
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="admin-loading-container">
        <div className="admin-spinner" />
        <p>Loading event configuration and Event Pack builder...</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
      {/* Top Header */}
      <div className="admin-section-header">
        <div className="admin-section-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>{event?.name}</h2>
            <span
              className={`admin-badge ${
                event?.status === 'live'
                  ? 'admin-badge-live'
                  : event?.status === 'completed'
                  ? 'admin-badge-completed'
                  : 'admin-badge-draft'
              }`}
            >
              {event?.status ? event.status.toUpperCase() : 'DRAFT'}
            </span>
            {isDirty && (
              <span
                className="admin-badge admin-badge-draft"
                style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  borderColor: 'rgba(245, 158, 11, 0.4)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <span className="admin-pulse-dot" />
                <span>Unsaved Changes</span>
              </span>
            )}
          </div>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--adm-text-secondary)' }}>
            {school?.schoolName} • ID: <code style={{ color: 'var(--adm-gold)' }}>{event?.eventId}</code>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="admin-btn admin-btn-secondary" onClick={onBack}>
            ← Back to Events
          </button>
          {event && (
            <button
              type="button"
              className={`admin-btn ${event.status === 'live' ? 'admin-btn-secondary' : 'admin-btn-primary'}`}
              style={{
                fontSize: '0.84rem',
                padding: '0.45rem 0.85rem',
                borderColor: event.status === 'live' ? 'rgba(16, 185, 129, 0.4)' : undefined,
                color: event.status === 'live' ? 'var(--adm-success)' : undefined,
              }}
              onClick={handleToggleLiveStatus}
              disabled={updatingStatus}
              title={event.status === 'live' ? 'Click to Pause event' : 'Click to Make Event Live on Photobooths'}
            >
              {updatingStatus ? (
                <span>Updating...</span>
              ) : event.status === 'live' ? (
                <span>● Live (Click to Pause)</span>
              ) : (
                <span>🟢 Make Event Live</span>
              )}
            </button>
          )}
          {event && (
            <a
              href={`/?eventId=${encodeURIComponent(event.eventId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="admin-btn admin-btn-secondary"
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              title={`Test ${event.name} on photobooth kiosk`}
            >
              <IconCamera size={14} />
              <span>Test This Event 🚀</span>
            </a>
          )}
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <div className="admin-spinner" style={{ width: '15px', height: '15px', borderWidth: '2px' }} />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <IconCheckCircle size={16} />
                <span>Save Configuration</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {successMsg && (
        <div className="admin-alert admin-alert-success">
          <span>✅</span>
          <span>{successMsg}</span>
        </div>
      )}
      {error && (
        <div className="admin-alert admin-alert-error">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="admin-config-nav">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`admin-config-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span style={{ fontSize: '0.9rem' }}>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* =========================================================
          TAB 1: OVERVIEW & QUICK ACTIONS
          ========================================================= */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Summary Hero Banner */}
          <div className="admin-hero-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.15rem' }}>
              <div
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '12px',
                  background: 'var(--adm-surface)',
                  border: '2px solid var(--adm-gold)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                {branding.schoolLogoUrl ? (
                  <img src={branding.schoolLogoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  '🏫'
                )}
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--adm-text-primary)' }}>
                  {branding.eventTitle || event?.name}
                </h3>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.82rem', color: 'var(--adm-text-secondary)' }}>
                  {school?.schoolName} • {event?.venue && event.venue !== school?.schoolName ? `${event.venue} • ` : ''}{event?.eventDate || 'Scheduled'}
                </p>
              </div>
            </div>

            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted)' }}>EVENT STATUS</div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: event?.status === 'live' ? 'var(--adm-success)' : event?.status === 'paused' ? 'var(--adm-warning)' : 'var(--adm-gold)' }}>
                  {event?.status === 'live' ? '🟢 Live on Photobooths' : event?.status === 'paused' ? '⏸️ Event Paused' : '🟡 Draft Setup (Defaults Applied)'}
                </div>
              </div>
            </div>
          </div>

          {/* Status & Launchpad Hero Card */}
          {event?.status === 'live' ? (
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(19, 23, 34, 0.95) 100%)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                borderRadius: 'var(--adm-radius-lg)',
                padding: '1.35rem 1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--adm-success)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  <span>● Event is Live</span>
                </div>
                <h3 style={{ margin: '0.2rem 0 0', fontSize: '1.2rem', color: 'var(--adm-text-primary)' }}>
                  Photobooth is Active & Accepting Guest Sessions!
                </h3>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.84rem', color: 'var(--adm-text-secondary)' }}>
                  Launch on this screen or connect your on-site iPad kiosks using the Activation QR.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={handleToggleLiveStatus}
                  disabled={updatingStatus}
                  style={{ padding: '0.5rem 0.95rem', fontSize: '0.84rem' }}
                  title="Pause this live event"
                >
                  {updatingStatus ? 'Updating...' : '⏸️ Pause Event'}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => setActiveTab('activation')}
                  style={{ padding: '0.5rem 0.95rem', fontSize: '0.84rem' }}
                  title="View Kiosk Activation QR and Staff PIN"
                >
                  <IconQrCode size={15} />
                  <span>Activation QR & PIN 📲</span>
                </button>
                <a
                  href={`/?eventId=${encodeURIComponent(event.eventId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="admin-btn admin-btn-primary"
                  style={{ padding: '0.5rem 1.05rem', fontSize: '0.85rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
                  title={`Launch photobooth kiosk for ${event.name}`}
                >
                  <IconCamera size={15} />
                  <span>Open Photobooth 📸</span>
                </a>
              </div>
            </div>
          ) : (
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(198, 161, 91, 0.12) 0%, rgba(19, 23, 34, 0.95) 100%)',
                border: '1px solid rgba(198, 161, 91, 0.35)',
                borderRadius: 'var(--adm-radius-lg)',
                padding: '1.35rem 1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--adm-gold)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  <span>✨ Starter Template Loaded (Draft)</span>
                </div>
                <h3 style={{ margin: '0.2rem 0 0', fontSize: '1.2rem', color: 'var(--adm-text-primary)' }}>
                  Ready to Review, Customize & Launch
                </h3>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.84rem', color: 'var(--adm-text-secondary)' }}>
                  Recommended starter settings (Classic 3-Photo Strip, Organizer-Sponsored) are pre-filled so you can test right away or customize below.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  onClick={handleToggleLiveStatus}
                  disabled={updatingStatus}
                  style={{ padding: '0.5rem 1.05rem', fontSize: '0.85rem' }}
                  title="Make event live for photobooth kiosks"
                >
                  {updatingStatus ? 'Updating...' : '🟢 Make Event Live'}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  onClick={() => setActiveTab('activation')}
                  style={{ padding: '0.5rem 0.95rem', fontSize: '0.84rem' }}
                  title="View Kiosk Activation QR and Staff PIN"
                >
                  <IconQrCode size={15} />
                  <span>Kiosk QR & PIN 📲</span>
                </button>
                {event && (
                  <a
                    href={`/?eventId=${encodeURIComponent(event.eventId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-btn admin-btn-secondary"
                    style={{ padding: '0.5rem 0.95rem', fontSize: '0.84rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
                    title={`Test photobooth kiosk in preview mode`}
                  >
                    <IconCamera size={15} />
                    <span>Test Event 🧪</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* 3-Step Simple Setup Guide */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.85rem' }}>
            <div
              className="admin-step-box"
              style={{ padding: '1rem', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--adm-border)', borderRadius: 'var(--adm-radius-md)', cursor: 'pointer' }}
              onClick={() => setActiveTab('branding')}
              title="Click to customize branding and frames"
            >
              <div style={{ fontSize: '0.74rem', color: 'var(--adm-gold)', fontWeight: 700, marginBottom: '0.25rem' }}>STEP 1: BRANDING & FRAMES</div>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--adm-text-primary)' }}>1. Customize Design 🎨</div>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.76rem', color: 'var(--adm-text-secondary)' }}>
                Set school logo, accent colors, and choose a photo strip layout.
              </p>
            </div>

            <div
              className="admin-step-box"
              style={{ padding: '1rem', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--adm-border)', borderRadius: 'var(--adm-radius-md)', cursor: 'pointer' }}
              onClick={() => setActiveTab('preview')}
              title="Click to inspect live preview"
            >
              <div style={{ fontSize: '0.74rem', color: '#38bdf8', fontWeight: 700, marginBottom: '0.25rem' }}>STEP 2: TEST PREVIEW</div>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--adm-text-primary)' }}>2. Verify Preview 👁️</div>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.76rem', color: 'var(--adm-text-secondary)' }}>
                Inspect live print preview and test photobooth camera layout.
              </p>
            </div>

            <div
              className="admin-step-box"
              style={{ padding: '1rem', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--adm-border)', borderRadius: 'var(--adm-radius-md)', cursor: 'pointer' }}
              onClick={event?.status === 'live' ? () => setActiveTab('activation') : handleToggleLiveStatus}
              title="Click to activate and start photobooth"
            >
              <div style={{ fontSize: '0.74rem', color: 'var(--adm-success)', fontWeight: 700, marginBottom: '0.25rem' }}>STEP 3: LAUNCH</div>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--adm-text-primary)' }}>
                {event?.status === 'live' ? '3. Live on Kiosks 🟢' : '3. Make Event Live 🚀'}
              </div>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.76rem', color: 'var(--adm-text-secondary)' }}>
                {event?.status === 'live' ? 'Event is active and ready on all photobooth kiosks.' : 'Click to publish this event to photobooth kiosks.'}
              </p>
            </div>
          </div>

          {/* Client & Booking Information Card */}
          <div className="admin-section-card" style={{ padding: '1.35rem 1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--adm-text-primary)' }}>
                    📋 Client & Booking Details
                  </h3>
                  {linkedInquiry ? (
                    <span className="admin-badge admin-badge-live" style={{ fontSize: '0.7rem' }}>
                      ✓ Confirmed Booking
                    </span>
                  ) : (
                    <span className="admin-badge admin-badge-draft" style={{ fontSize: '0.7rem' }}>
                      Institutional / Direct Event
                    </span>
                  )}
                </div>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: 'var(--adm-text-secondary)' }}>
                  Host contact details, WhatsApp updates, and event requirements.
                </p>
              </div>

              {linkedInquiry?.whatsappNumber && (
                <a
                  href={`https://wa.me/${linkedInquiry.whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                    `Hi ${linkedInquiry.contactName}, your Pehchaan Photobooth for "${event?.name || 'your event'}" is configured and ready!`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="admin-btn admin-btn-secondary"
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.78rem',
                    color: '#22c55e',
                    borderColor: 'rgba(34, 197, 94, 0.4)',
                    background: 'rgba(34, 197, 94, 0.08)',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                  title="Send event configuration update to client via WhatsApp"
                >
                  <span>💬 WhatsApp Client</span>
                </a>
              )}
            </div>

            {linkedInquiry ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                  gap: '0.85rem',
                  background: 'rgba(0,0,0,0.22)',
                  padding: '1rem',
                  borderRadius: 'var(--adm-radius-md)',
                  border: '1px solid var(--adm-border)',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--adm-gold)', fontWeight: 600 }}>CLIENT / HOST NAME</div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--adm-text-primary)' }}>{linkedInquiry.contactName}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-secondary)' }}>{linkedInquiry.organisation}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--adm-gold)', fontWeight: 600 }}>WHATSAPP & CONTACT</div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#22c55e' }}>{linkedInquiry.whatsappNumber}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-secondary)' }}>{linkedInquiry.email || 'No email provided'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--adm-gold)', fontWeight: 600 }}>LOCATION & AUDIENCE</div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--adm-text-primary)' }}>{linkedInquiry.city} ({linkedInquiry.setting})</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-secondary)' }}>{linkedInquiry.audienceBand} guests</div>
                </div>

                {linkedInquiry.customWishes && (
                  <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--adm-border)', paddingTop: '0.6rem' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--adm-gold)', fontWeight: 600 }}>SPECIAL WISHES / CLIENT NOTES</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--adm-text-secondary)', marginTop: '0.15rem' }}>{linkedInquiry.customWishes}</div>
                  </div>
                )}
              </div>
            ) : (
              <div
                style={{
                  background: 'rgba(0,0,0,0.18)',
                  padding: '0.85rem 1rem',
                  borderRadius: 'var(--adm-radius-md)',
                  border: '1px dashed var(--adm-border)',
                  fontSize: '0.82rem',
                  color: 'var(--adm-text-secondary)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div>
                  Event registered for <strong>{school?.schoolName || 'School Campus'}</strong>.
                </div>
                <a
                  href="/admin/inquiries"
                  className="admin-btn admin-btn-outline"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.74rem' }}
                >
                  View All Bookings & Leads →
                </a>
              </div>
            )}
          </div>

          {/* 4-Card Quick Configuration Summary */}
          <div className="admin-section-card" style={{ padding: '1.3rem 1.4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--adm-text-primary)' }}>Configuration Summary</h3>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: 'var(--adm-text-secondary)' }}>
                  Current photobooth settings. Click any card below to adjust.
                </p>
              </div>
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem' }}
                onClick={() => setActiveTab('preview')}
              >
                <span>Live Strip Preview 👁️</span>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.85rem' }}>
              {/* Card 1: Branding & Frame */}
              <div
                style={{ padding: '0.95rem', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--adm-border)', borderRadius: 'var(--adm-radius-md)', cursor: 'pointer' }}
                onClick={() => setActiveTab('branding')}
                className="admin-step-box"
                title="Customize branding, logo, and photo frames"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.76rem', color: 'var(--adm-gold)', fontWeight: 700 }}>🎨 BRANDING & FRAME</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted)' }}>Edit ✏️</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--adm-text-primary)' }}>
                  {template.templateId === 'classic-strip' ? 'Classic 3-Photo Strip' : template.templateId || 'Classic Gold Strip'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-secondary)', marginTop: '0.2rem' }}>
                  {branding.schoolLogoUrl ? '✓ Custom Logo' : '○ Default Crest'} • <span style={{ color: branding.accentColor }}>● {branding.accentColor}</span>
                </div>
              </div>

              {/* Card 2: Camera */}
              <div
                style={{ padding: '0.95rem', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--adm-border)', borderRadius: 'var(--adm-radius-md)', cursor: 'pointer' }}
                onClick={() => setActiveTab('photo')}
                className="admin-step-box"
                title="Customize camera timer, shot count, and mirror mode"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.76rem', color: '#60a5fa', fontWeight: 700 }}>📷 CAMERA & TIMER</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted)' }}>Edit ✏️</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--adm-text-primary)' }}>
                  {photoSettings.shotCount === 1 ? '1 Hero Portrait' : `${photoSettings.shotCount || 3} Photo Strip`}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-secondary)', marginTop: '0.2rem' }}>
                  {photoSettings.orientation === 'portrait_strip' ? 'Vertical Strip' : photoSettings.orientation} • {photoSettings.mirrorOutput ? 'Mirror ON' : 'Mirror OFF'}
                </div>
              </div>

              {/* Card 3: Payment */}
              <div
                style={{ padding: '0.95rem', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--adm-border)', borderRadius: 'var(--adm-radius-md)', cursor: 'pointer' }}
                onClick={() => setActiveTab('payment')}
                className="admin-step-box"
                title="Customize UPI pricing and monetization"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.76rem', color: 'var(--adm-success)', fontWeight: 700 }}>💳 PRICING & UPI</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted)' }}>Edit ✏️</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--adm-text-primary)' }}>
                  {payment.mode === 'individual' ? `₹${payment.amount || 50} per Session (UPI)` : 'Free Event (Organizer Sponsored)'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-secondary)', marginTop: '0.2rem' }}>
                  {payment.mode === 'individual' ? (payment.upiId || 'UPI QR Enabled') : 'No guest payment required'}
                </div>
              </div>

              {/* Card 4: Delivery */}
              <div
                style={{ padding: '0.95rem', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--adm-border)', borderRadius: 'var(--adm-radius-md)', cursor: 'pointer' }}
                onClick={() => setActiveTab('delivery')}
                className="admin-step-box"
                title="Customize photo delivery channels"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.76rem', color: '#c084fc', fontWeight: 700 }}>🚀 DELIVERY CHANNELS</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted)' }}>Edit ✏️</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--adm-text-primary)' }}>
                  {delivery.cloudQrEnabled ? 'Instant Cloud QR' : 'Local Download'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-secondary)', marginTop: '0.2rem' }}>
                  {delivery.printEnabled ? '🖨️ Physical Print' : 'Digital Only'} • {privacy.schoolMode ? '🛡️ School Privacy' : 'Standard'}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--adm-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <button type="button" className="admin-btn admin-btn-secondary" onClick={onBack}>
                ← Back to Events List
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                onClick={() => setActiveTab('branding')}
              >
                <span>Customize Branding & Frames 🎨 →</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          TAB 2: BRANDING CONFIGURATION
          ========================================================= */}
      {activeTab === 'branding' && (
        <div className="admin-section-card" style={{ maxWidth: '820px' }}>
          <div className="admin-section-header">
            <div className="admin-section-title-group">
              <h2>Branding & Identity</h2>
              <p>Customize the logo, typography, and accent colors displayed on the photobooth screen and photo prints.</p>
            </div>
          </div>

          <div className="admin-form">
            {/* Live Branding Preview Pill */}
            <div
              style={{
                background: 'rgba(0, 0, 0, 0.3)',
                border: `1.5px solid ${branding.accentColor || '#c6a15b'}`,
                borderRadius: 'var(--adm-radius-md)',
                padding: '1rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '8px',
                    background: 'var(--adm-surface)',
                    border: '1px solid var(--adm-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {branding.schoolLogoUrl ? (
                    <img src={branding.schoolLogoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    '🏫'
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: branding.accentColor || '#c6a15b', fontWeight: 700 }}>
                    {branding.schoolName || school?.schoolName || 'School Name'}
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--adm-text-primary)' }}>
                    {branding.eventTitle || 'Event Title'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-secondary)' }}>
                    {branding.eventSubtitle || 'Subtitle / Tagline'}
                  </div>
                </div>
              </div>

              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  background: `${branding.accentColor || '#c6a15b'}22`,
                  color: branding.accentColor || '#c6a15b',
                  border: `1px solid ${branding.accentColor || '#c6a15b'}55`,
                }}
              >
                Live Badge Preview
              </span>
            </div>

            {/* School Logo Section */}
            <div className="admin-form-group">
              <label className="admin-form-label">School / Event Logo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginTop: '0.35rem' }}>
                <div
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: 'var(--adm-radius-md)',
                    background: 'var(--adm-surface-elevated)',
                    border: '2px dashed var(--adm-border-hover)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '2rem',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  {branding.schoolLogoUrl ? (
                    <img src={branding.schoolLogoUrl} alt="Logo Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    '🏫'
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <label className="admin-btn admin-btn-secondary" style={{ cursor: 'pointer', padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}>
                      <IconUpload size={14} />
                      <span>{uploadingLogo ? 'Uploading...' : 'Upload Event Logo'}</span>
                      <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={handleLogoFileChange} disabled={uploadingLogo} />
                    </label>

                    {school?.logoUrl && branding.schoolLogoUrl !== school.logoUrl && (
                      <button
                        type="button"
                        className="admin-btn admin-btn-outline"
                        style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}
                        onClick={() =>
                          setBranding({ ...branding, schoolLogoUrl: school.logoUrl, useDefaultSchoolLogo: true })
                        }
                      >
                        Use School Default Logo
                      </button>
                    )}

                    {branding.schoolLogoUrl && (
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary"
                        style={{ padding: '0.45rem 0.75rem', fontSize: '0.82rem', color: '#f87171' }}
                        onClick={() => setBranding({ ...branding, schoolLogoUrl: null, useDefaultSchoolLogo: false })}
                      >
                        Remove Logo
                      </button>
                    )}
                  </div>
                  <div className="admin-form-hint">Supports PNG with transparency, JPEG, or WebP. Max size: 2MB.</div>
                </div>
              </div>
            </div>

            {/* School Name */}
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="cfg-school-name">
                School / Institution Name
              </label>
              <input
                id="cfg-school-name"
                type="text"
                className="admin-input"
                value={branding.schoolName || school?.schoolName || ''}
                onChange={(e) => setBranding({ ...branding, schoolName: e.target.value })}
                placeholder="e.g., Pehchaan Model Academy"
              />
            </div>

            {/* Event Title */}
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="cfg-event-title">
                Event Title <span style={{ color: 'var(--adm-gold)' }}>*</span>
              </label>
              <input
                id="cfg-event-title"
                type="text"
                className="admin-input"
                value={branding.eventTitle}
                onChange={(e) => setBranding({ ...branding, eventTitle: e.target.value })}
                placeholder="e.g., Annual Sports Meet 2026"
              />
              <div className="admin-form-hint">Printed prominently on the photo strip and header</div>
            </div>

            {/* Event Subtitle */}
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="cfg-event-sub">
                Event Subtitle / Tagline
              </label>
              <input
                id="cfg-event-sub"
                type="text"
                className="admin-input"
                value={branding.eventSubtitle}
                onChange={(e) => setBranding({ ...branding, eventSubtitle: e.target.value })}
                placeholder="e.g., Celebrating Excellence • Batch of 2026"
              />
            </div>

            {/* Accent Color */}
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="cfg-accent-color">
                Branding Accent Color
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                <input
                  id="cfg-accent-color"
                  type="color"
                  value={branding.accentColor}
                  onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })}
                  style={{ width: '45px', height: '36px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
                />
                <input
                  type="text"
                  className="admin-input"
                  style={{ width: '120px' }}
                  value={branding.accentColor}
                  onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })}
                />
                <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      title={c.name}
                      className={`admin-color-swatch ${branding.accentColor.toLowerCase() === c.hex.toLowerCase() ? 'active' : ''}`}
                      style={{ background: c.hex }}
                      onClick={() => setBranding({ ...branding, accentColor: c.hex })}
                    />
                  ))}
                </div>
              </div>
            </div>

            {renderStepFooter('overview', 'photo')}
          </div>
        </div>
      )}

      {/* =========================================================
          TAB 3: PHOTO SETTINGS
          ========================================================= */}
      {activeTab === 'photo' && (
        <div className="admin-section-card" style={{ maxWidth: '820px' }}>
          <div className="admin-section-header">
            <div className="admin-section-title-group">
              <h2>Photo Capture & Shot Settings</h2>
              <p>Configure number of photo captures, camera orientation, and live booth image processing.</p>
            </div>
          </div>

          <div className="admin-form">
            {/* Number of Shots */}
            <div className="admin-form-group">
              <label className="admin-form-label">Number of Photos per Shoot</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                {[
                  { count: 1, label: '1 Shot', sub: 'Single Full Portrait Hero' },
                  { count: 2, label: '2 Shots', sub: 'Duo Photo Stack' },
                  { count: 3, label: '3 Shots', sub: 'Classic 3-Photo Strip' },
                ].map((s) => (
                  <button
                    key={s.count}
                    type="button"
                    className={`admin-stat-card ${photoSettings.shotCount === s.count ? 'admin-template-card active' : ''}`}
                    style={{ padding: '1rem', cursor: 'pointer', textAlign: 'left', margin: 0 }}
                    onClick={() => setPhotoSettings({ ...photoSettings, shotCount: s.count as 1 | 2 | 3 })}
                  >
                    <div style={{ fontWeight: 700, fontSize: '1.1rem', color: photoSettings.shotCount === s.count ? 'var(--adm-gold-light)' : 'var(--adm-text-primary)' }}>
                      {s.label}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted)', marginTop: '0.2rem' }}>
                      {s.sub}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Camera & Processing Switches */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '0.5rem' }}>
              <div className="admin-switch-row">
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>Mirror Camera Output</div>
                  <div className="admin-form-hint">Flips live viewfinder horizontally for intuitive guest posing</div>
                </div>
                <label className="admin-switch-toggle">
                  <input
                    type="checkbox"
                    checked={photoSettings.mirrorOutput}
                    onChange={(e) => setPhotoSettings({ ...photoSettings, mirrorOutput: e.target.checked })}
                  />
                  <span className="admin-switch-slider" />
                </label>
              </div>

              <div className="admin-switch-row">
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>Black & White Filter Effect</div>
                  <div className="admin-form-hint">Allows guests to apply artistic B&W effect on composition slots</div>
                </div>
                <label className="admin-switch-toggle">
                  <input
                    type="checkbox"
                    checked={photoSettings.blackAndWhiteEnabled}
                    onChange={(e) => setPhotoSettings({ ...photoSettings, blackAndWhiteEnabled: e.target.checked })}
                  />
                  <span className="admin-switch-slider" />
                </label>
              </div>

              <div className="admin-switch-row">
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>Sepia Vintage Filter Effect</div>
                  <div className="admin-form-hint">Enables warm nostalgic sepia tone filter</div>
                </div>
                <label className="admin-switch-toggle">
                  <input
                    type="checkbox"
                    checked={photoSettings.sepiaEnabled}
                    onChange={(e) => setPhotoSettings({ ...photoSettings, sepiaEnabled: e.target.checked })}
                  />
                  <span className="admin-switch-slider" />
                </label>
              </div>
            </div>

            {/* Pause, Countdown & Retention */}
            <div className="admin-form-grid-2" style={{ marginTop: '0.5rem' }}>
              <div className="admin-form-group">
                <label className="admin-form-label">Capture Countdown Timer</label>
                <select
                  className="admin-input"
                  value={photoSettings.countdownSeconds || 3}
                  onChange={(e) => setPhotoSettings({ ...photoSettings, countdownSeconds: Number(e.target.value) })}
                >
                  <option value={3}>3 Seconds (Fast & Snappy)</option>
                  <option value={5}>5 Seconds (Recommended for Groups)</option>
                  <option value={10}>10 Seconds (Relaxed Posing)</option>
                </select>
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">Pause Between Shots</label>
                <select
                  className="admin-input"
                  value={photoSettings.betweenShotPauseMs}
                  onChange={(e) => setPhotoSettings({ ...photoSettings, betweenShotPauseMs: Number(e.target.value) })}
                >
                  <option value={0}>0 seconds (Instant next countdown)</option>
                  <option value={2000}>2 seconds (Quick re-pose)</option>
                  <option value={3000}>3 seconds (Standard pause)</option>
                  <option value={5000}>5 seconds (Relaxed posing)</option>
                </select>
              </div>
            </div>

            <div className="admin-form-group" style={{ marginTop: '0.5rem' }}>
              <label className="admin-form-label">Photo Retention Window</label>
              <select
                className="admin-input"
                value={photoSettings.retentionHours}
                onChange={(e) => setPhotoSettings({ ...photoSettings, retentionHours: Number(e.target.value) })}
              >
                <option value={24}>24 Hours (Privacy Safe)</option>
                <option value={48}>48 Hours (Standard Event)</option>
                <option value={72}>72 Hours (Default School Window)</option>
                <option value={168}>7 Days (Extended Archival)</option>
              </select>
            </div>

            {renderStepFooter('branding', 'templates')}
          </div>
        </div>
      )}

      {/* =========================================================
          TAB 4: TEMPLATES CONFIGURATION
          ========================================================= */}
      {activeTab === 'templates' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Section 1: Choose a starting point */}
          <div className="admin-section-card">
            <div className="admin-section-header" style={{ marginBottom: '1.25rem' }}>
              <div className="admin-section-title-group">
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--adm-gold)', marginBottom: '0.3rem' }}>
                  <IconSparkles size={13} />
                  <span>Choose a starting point</span>
                </div>
                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Photostrip Style Presets</h2>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.84rem', color: 'var(--adm-text-secondary)' }}>
                  Pick a curated photostrip foundation or customize every fine detail below.
                </p>
              </div>
            </div>

            <div className="admin-template-grid">
              {TEMPLATE_PRESETS.map((t) => {
                const isSelected = template.templateId === t.id
                return (
                  <div
                    key={t.id}
                    className={`admin-template-card ${isSelected ? 'active' : ''}`}
                    style={{
                      border: isSelected ? `2px solid ${t.accentColor || 'var(--adm-gold)'}` : undefined,
                      boxShadow: isSelected ? `0 4px 16px ${t.accentColor ? `${t.accentColor}33` : 'var(--adm-gold-glow)'}` : undefined,
                    }}
                    onClick={() => {
                      setTemplate({
                        ...template,
                        templateId: t.id,
                        background: t.background,
                        overlayEnabled: t.overlay,
                        frameEdge: t.frameEdge || 'fine',
                      })
                      setBranding((prev) => ({
                        ...prev,
                        accentColor: t.accentColor || prev.accentColor,
                      }))
                      setPhotoSettings((prev) => ({
                        ...prev,
                        shotCount: t.shots as 1 | 2 | 3,
                        orientation: t.shots === 1 ? 'single_hero' : t.shots === 2 ? 'duo_grid' : 'portrait_strip',
                      }))
                    }}
                  >
                    {isSelected && (
                      <span className="admin-template-badge" style={{ background: t.accentColor || 'var(--adm-gold)', color: '#0b0a09' }}>
                        Selected
                      </span>
                    )}

                    {/* Mini Strip Visualization */}
                    <div
                      style={{
                        height: '140px',
                        background: t.background,
                        borderRadius: '8px',
                        border: `1.5px solid ${t.accentColor ? `${t.accentColor}55` : 'rgba(255, 255, 255, 0.15)'}`,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '10px 8px',
                        position: 'relative',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                      }}
                    >
                      {t.shots === 1 ? (
                        <div
                          style={{
                            width: '75%',
                            height: '75%',
                            background: 'rgba(200,200,200,0.2)',
                            borderRadius: '4px',
                            border: `1.5px ${t.frameEdge === 'bold' ? 'solid' : t.frameEdge === 'double' ? 'double' : 'dashed'} ${t.accentColor}`,
                          }}
                        />
                      ) : (
                        [1, 2, 3].slice(0, t.shots).map((n) => (
                          <div
                            key={n}
                            style={{
                              width: '80%',
                              height: `${Math.floor(82 / t.shots)}%`,
                              background: 'rgba(200,200,200,0.2)',
                              borderRadius: '3px',
                              border: `1.5px ${t.frameEdge === 'bold' ? 'solid' : t.frameEdge === 'double' ? 'double' : 'dashed'} ${t.accentColor}`,
                            }}
                          />
                        ))
                      )}
                      <div style={{ fontSize: '0.62rem', color: t.accentColor, fontWeight: 700, letterSpacing: '0.04em' }}>
                        {branding.eventTitle || 'Annual Day'}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.96rem', color: 'var(--adm-text-primary)' }}>{t.name}</div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-secondary)', marginTop: '0.2rem', lineHeight: 1.4 }}>
                        {t.description}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Section 2: Make the front yours */}
          <div className="admin-section-card">
            <div className="admin-section-header" style={{ marginBottom: '1.25rem' }}>
              <div className="admin-section-title-group">
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--adm-gold)', marginBottom: '0.3rem' }}>
                  <IconSparkles size={13} />
                  <span>Make the front yours</span>
                </div>
                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Front Photo Strip Customizer</h2>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.84rem', color: 'var(--adm-text-secondary)' }}>
                  Configure photo layout, frame borders, paper colors, captions, and printed event date.
                </p>
              </div>

              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                onClick={() => setActiveTab('preview')}
              >
                <span>Live Preview 👁️</span>
              </button>
            </div>

            <div className="admin-form-grid-2">
              {/* Photo layout */}
              <div className="admin-form-group">
                <label className="admin-form-label">Photo Layout</label>
                <select
                  className="admin-input"
                  value={photoSettings.shotCount}
                  onChange={(e) => {
                    const count = Number(e.target.value) as 1 | 2 | 3
                    setPhotoSettings((prev) => ({
                      ...prev,
                      shotCount: count,
                      orientation: count === 1 ? 'single_hero' : count === 2 ? 'duo_grid' : 'portrait_strip',
                    }))
                  }}
                >
                  <option value={3}>3 Photos (Classic 2×6 in Vertical Strip)</option>
                  <option value={2}>2 Photos (Duo Keepsake Grid)</option>
                  <option value={1}>1 Photo (Single Hero Portrait)</option>
                </select>
                <div className="admin-form-hint">Controls how many photos are captured and printed on each strip.</div>
              </div>

              {/* Frame edge */}
              <div className="admin-form-group">
                <label className="admin-form-label">Frame Edge</label>
                <select
                  className="admin-input"
                  value={template.frameEdge || 'fine'}
                  onChange={(e) => setTemplate({ ...template, frameEdge: e.target.value as any })}
                >
                  <option value="fine">Fine border (Clean 1.5px subtle frame)</option>
                  <option value="bold">Bold frame (Thick 3.5px prominent border)</option>
                  <option value="double">Double line (Delicate inner &amp; outer border)</option>
                  <option value="rounded">Rounded frame (Smooth rounded corners)</option>
                  <option value="none">None (Borderless edge-to-edge slots)</option>
                </select>
                <div className="admin-form-hint">Determines border styling drawn around each photo slot.</div>
              </div>

              {/* Paper colour */}
              <div className="admin-form-group">
                <label className="admin-form-label">Paper Colour (Background)</label>
                <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={template.background || '#ffffff'}
                    onChange={(e) => setTemplate({ ...template, background: e.target.value })}
                    style={{ width: '42px', height: '38px', borderRadius: '6px', border: '1px solid var(--adm-border)', background: 'transparent', cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    className="admin-input"
                    value={template.background || '#ffffff'}
                    onChange={(e) => setTemplate({ ...template, background: e.target.value })}
                    placeholder="#FFFFFF"
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                  {[
                    { label: 'White', hex: '#ffffff' },
                    { label: 'Cream', hex: '#fffdf5' },
                    { label: 'Soft Gray', hex: '#f1f5f9' },
                    { label: 'Dark Canvas', hex: '#0b0a09' },
                  ].map((p) => (
                    <button
                      key={p.hex}
                      type="button"
                      className="admin-btn admin-btn-secondary"
                      style={{ padding: '0.15rem 0.5rem', fontSize: '0.72rem' }}
                      onClick={() => setTemplate({ ...template, background: p.hex })}
                    >
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.hex, border: '1px solid #999', display: 'inline-block', marginRight: 4 }} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Accent colour */}
              <div className="admin-form-group">
                <label className="admin-form-label">Accent Colour</label>
                <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={branding.accentColor || '#0f766e'}
                    onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })}
                    style={{ width: '42px', height: '38px', borderRadius: '6px', border: '1px solid var(--adm-border)', background: 'transparent', cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    className="admin-input"
                    value={branding.accentColor || '#0f766e'}
                    onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })}
                    placeholder="#0F766E"
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                  {[
                    { label: 'Deep Teal', hex: '#0f766e' },
                    { label: 'Royal Gold', hex: '#c6a15b' },
                    { label: 'Purple', hex: '#7c3aed' },
                    { label: 'Warm Amber', hex: '#d97706' },
                    { label: 'Midnight', hex: '#0284c7' },
                  ].map((p) => (
                    <button
                      key={p.hex}
                      type="button"
                      className="admin-btn admin-btn-secondary"
                      style={{ padding: '0.15rem 0.5rem', fontSize: '0.72rem' }}
                      onClick={() => setBranding({ ...branding, accentColor: p.hex })}
                    >
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.hex, display: 'inline-block', marginRight: 4 }} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Caption */}
              <div className="admin-form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="admin-form-label">Caption (Event Title)</label>
                  <span style={{ fontSize: '0.72rem', color: (branding.eventTitle || '').length > 40 ? '#f87171' : 'var(--adm-text-muted)' }}>
                    {(branding.eventTitle || '').length}/40 characters
                  </span>
                </div>
                <input
                  type="text"
                  className="admin-input"
                  maxLength={40}
                  value={branding.eventTitle || ''}
                  onChange={(e) => setBranding({ ...branding, eventTitle: e.target.value })}
                  placeholder="e.g., Annual Day 2026"
                />
                <div className="admin-form-hint">Primary headline printed at the bottom of the photo strip.</div>
              </div>

              {/* Printed Date */}
              <div className="admin-form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="admin-form-label">Printed Date</label>
                  {event?.eventDate && (
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', color: 'var(--adm-gold)', fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => setTemplate({ ...template, printedDate: event.eventDate || '' })}
                    >
                      Use Event Date ({event.eventDate})
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  className="admin-input"
                  value={template.printedDate || event?.eventDate || ''}
                  onChange={(e) => setTemplate({ ...template, printedDate: e.target.value })}
                  placeholder="e.g., 14 Nov 2026 or 14/11/2026"
                />
                <div className="admin-form-hint">Date stamp imprinted underneath the caption on the strip.</div>
              </div>
            </div>
          </div>

          {/* Section 3: Card Back Design (Double-Sided Keepsake) */}
          <div className="admin-section-card">
            <div className="admin-section-header" style={{ marginBottom: '1.25rem' }}>
              <div className="admin-section-title-group">
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--adm-gold)', marginBottom: '0.3rem' }}>
                  <IconSparkles size={13} />
                  <span>Card Back Design</span>
                </div>
                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Double-Sided Strip &amp; Keepsake Back</h2>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.84rem', color: 'var(--adm-text-secondary)' }}>
                  Design the reverse side of the photostrip with notes, handwriting lines, institutional gratitude, or a digital album QR code.
                </p>
              </div>

              <label className="admin-switch-toggle">
                <input
                  type="checkbox"
                  checked={template.cardBackEnabled !== false}
                  onChange={(e) => setTemplate({ ...template, cardBackEnabled: e.target.checked })}
                />
                <span className="admin-switch-slider" />
              </label>
            </div>

            {template.cardBackEnabled !== false && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: '1.5rem', alignItems: 'start' }}>
                <div className="admin-form-grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  {/* Headline */}
                  <div className="admin-form-group">
                    <label className="admin-form-label">Card Back Headline</label>
                    <input
                      type="text"
                      className="admin-input"
                      value={template.cardBackHeadline ?? 'Thank you for coming'}
                      onChange={(e) => setTemplate({ ...template, cardBackHeadline: e.target.value })}
                      placeholder="e.g., Thank you for coming"
                    />
                    <div className="admin-form-hint">Prominent heading printed on the reverse side of the card.</div>
                  </div>

                  {/* Digital Album QR Toggle */}
                  <div className="admin-form-group">
                    <label className="admin-form-label">Digital Album QR Imprint</label>
                    <div className="admin-switch-row" style={{ padding: '0.65rem 0.85rem' }}>
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Online Gallery QR</div>
                        <div className="admin-form-hint">Prints a compact scan badge for digital photos</div>
                      </div>
                      <label className="admin-switch-toggle">
                        <input
                          type="checkbox"
                          checked={template.cardBackShowQr !== false}
                          onChange={(e) => setTemplate({ ...template, cardBackShowQr: e.target.checked })}
                        />
                        <span className="admin-switch-slider" />
                      </label>
                    </div>
                  </div>

                  {/* Handwriting Ruled Lines Toggle */}
                  <div className="admin-form-group">
                    <label className="admin-form-label">Keepsake Writing Lines</label>
                    <div className="admin-switch-row" style={{ padding: '0.65rem 0.85rem' }}>
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Ruled Note &amp; Signature Lines</div>
                        <div className="admin-form-hint">Prints elegant dashed writing lines for guests</div>
                      </div>
                      <label className="admin-switch-toggle">
                        <input
                          type="checkbox"
                          checked={template.cardBackShowLines !== false}
                          onChange={(e) => setTemplate({ ...template, cardBackShowLines: e.target.checked })}
                        />
                        <span className="admin-switch-slider" />
                      </label>
                    </div>
                  </div>

                  {/* Paper Background Color */}
                  <div className="admin-form-group">
                    <label className="admin-form-label">Card Back Paper Tint</label>
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                      {[
                        { label: 'Pure White', hex: '#ffffff' },
                        { label: 'Warm Cream', hex: '#fffdf5' },
                        { label: 'Sage Tint', hex: '#f0fdf4' },
                        { label: 'Soft Slate', hex: '#f8fafc' },
                      ].map((p) => (
                        <button
                          key={p.hex}
                          type="button"
                          className="admin-btn admin-btn-secondary"
                          style={{
                            padding: '0.2rem 0.5rem',
                            fontSize: '0.72rem',
                            border: (template.cardBackBgColor || '#ffffff') === p.hex ? '1.5px solid var(--adm-gold)' : undefined,
                          }}
                          onClick={() => setTemplate({ ...template, cardBackBgColor: p.hex })}
                        >
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.hex, border: '1px solid #999', display: 'inline-block', marginRight: 4 }} />
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Message */}
                  <div className="admin-form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="admin-form-label">Card Back Message / Notes</label>
                    <textarea
                      className="admin-input"
                      rows={2}
                      value={template.cardBackMessage ?? 'A special keepsake from your unforgettable day.'}
                      onChange={(e) => setTemplate({ ...template, cardBackMessage: e.target.value })}
                      placeholder="e.g., A special keepsake from your unforgettable day."
                      style={{ resize: 'vertical' }}
                    />
                    <div className="admin-form-hint">Personalized gratitude message printed on the keepsake back.</div>
                  </div>
                </div>

                {/* Inline Card Back Live Miniature Preview */}
                <div
                  style={{
                    background: template.cardBackBgColor || '#ffffff',
                    borderRadius: '4px',
                    border: '1px solid rgba(0, 0, 0, 0.15)',
                    padding: '3px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    minHeight: '260px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                    color: template.cardBackTextColor || '#0f172a',
                    boxSizing: 'border-box',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      minHeight: '252px',
                      border: template.frameEdge === 'bold'
                        ? `2.5px solid ${branding.accentColor || '#1e6052'}`
                        : template.frameEdge === 'double'
                        ? `2.5px double ${branding.accentColor || '#1e6052'}`
                        : template.frameEdge === 'none'
                        ? 'none'
                        : `1px solid ${branding.accentColor || '#1e6052'}`,
                      borderRadius: '2px',
                      padding: '10px 8px 6px 8px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      textAlign: 'center',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div>
                      {branding.schoolLogoUrl ? (
                        <img src={branding.schoolLogoUrl} alt="Logo" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
                      ) : (
                        <SchoolShieldCrest size={20} color={branding.accentColor || '#1e6052'} />
                      )}
                      <div style={{ fontFamily: 'Georgia, serif', fontSize: '0.8rem', fontWeight: 700, color: template.cardBackTextColor || '#0f172a', lineHeight: 1.2, marginTop: '3px' }}>
                        {template.cardBackHeadline || 'Thank you for coming'}
                      </div>
                      <div style={{ fontSize: '0.58rem', color: '#64748b', marginTop: '1px', fontWeight: 600 }}>
                        {branding.schoolName || school?.schoolName || 'Sunrise Public School'}
                      </div>
                    </div>

                    <div style={{ width: '100%', padding: '0 2px' }}>
                      {template.cardBackMessage && (
                        <p style={{ margin: '2px 0 6px', fontSize: '0.58rem', color: '#475569', lineHeight: 1.25, fontStyle: 'italic' }}>
                          "{template.cardBackMessage}"
                        </p>
                      )}

                      {template.cardBackShowLines !== false && (
                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', margin: '4px 0' }}>
                          <div style={{ width: '100%', borderBottom: '1px dashed #cbd5e1', height: '1px' }} />
                          <div style={{ width: '100%', borderBottom: '1px dashed #cbd5e1', height: '1px' }} />
                        </div>
                      )}
                    </div>

                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                      {template.cardBackShowQr !== false && (
                        <div style={{ background: '#f8fafc', padding: '2px 6px', borderRadius: '3px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <IconQrCode size={12} style={{ color: '#0f172a' }} />
                          <span style={{ fontSize: '0.45rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Online Album</span>
                        </div>
                      )}
                      <div style={{ fontSize: '0.5rem', color: branding.accentColor || '#1e6052', fontStyle: 'italic' }}>
                        Your day, in print.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {renderStepFooter('photo', 'delivery')}
        </div>
      )}

      {/* =========================================================
          TAB 5: DELIVERY CONFIGURATION
          ========================================================= */}
      {activeTab === 'delivery' && (
        <div className="admin-section-card" style={{ maxWidth: '820px' }}>
          <div className="admin-section-header">
            <div className="admin-section-title-group">
              <h2>Delivery Channels</h2>
              <p>Configure which instant output channels are enabled for attendees at the end of their booth session.</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Print */}
            <div className="admin-switch-row">
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>🖨️ Physical Instant Printing</div>
                <div className="admin-form-hint">Direct print on connected kiosk photo printer</div>
              </div>
              <label className="admin-switch-toggle">
                <input
                  type="checkbox"
                  checked={delivery.printEnabled}
                  onChange={(e) => setDelivery({ ...delivery, printEnabled: e.target.checked })}
                />
                <span className="admin-switch-slider" />
              </label>
            </div>

            {/* Cloud QR */}
            <div className="admin-switch-row">
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>📲 Cloud Gallery QR Code</div>
                <div className="admin-form-hint">Displays on-screen QR for attendees to scan and view in browser</div>
              </div>
              <label className="admin-switch-toggle">
                <input
                  type="checkbox"
                  checked={delivery.cloudQrEnabled}
                  onChange={(e) => setDelivery({ ...delivery, cloudQrEnabled: e.target.checked })}
                />
                <span className="admin-switch-slider" />
              </label>
            </div>

            {/* Email */}
            <div className="admin-switch-row">
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>✉️ Instant Email Delivery</div>
                <div className="admin-form-hint">Sends photo link directly to attendee's provided email</div>
              </div>
              <label className="admin-switch-toggle">
                <input
                  type="checkbox"
                  checked={delivery.emailEnabled}
                  onChange={(e) => setDelivery({ ...delivery, emailEnabled: e.target.checked })}
                />
                <span className="admin-switch-slider" />
              </label>
            </div>

            {/* WhatsApp */}
            <div className="admin-switch-row">
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>💬 WhatsApp Direct Message</div>
                <div className="admin-form-hint">
                  Sends high-resolution photo link and strip directly to attendee's WhatsApp number
                </div>
              </div>
              <label className="admin-switch-toggle">
                <input
                  type="checkbox"
                  checked={delivery.whatsappEnabled}
                  onChange={(e) => setDelivery({ ...delivery, whatsappEnabled: e.target.checked })}
                />
                <span className="admin-switch-slider" />
              </label>
            </div>
          </div>

          {renderStepFooter('templates', 'payment')}
        </div>
      )}

      {/* =========================================================
          TAB 6: PAYMENT CONFIGURATION
          ========================================================= */}
      {activeTab === 'payment' && (
        <div className="admin-section-card" style={{ maxWidth: '820px' }}>
          <div className="admin-section-header">
            <div className="admin-section-title-group">
              <h2>Monetization & Payment Mode</h2>
              <p>Choose whether sessions are complimentary (Organizer Sponsored) or require guest UPI payment.</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
            {[
              {
                mode: 'organizer',
                icon: '🆓',
                label: 'Free Event (Organizer Sponsored)',
                desc: '100% Free for all guests. Photos are complimentary and flow directly to instant output without asking for payment.',
              },
              {
                mode: 'individual',
                icon: '💳',
                label: 'Paid Event (Guest UPI QR)',
                desc: 'Guests pay per photobooth session using dynamic UPI QR code on the kiosk screen before printing/downloading.',
              },
            ].map((pm) => (
              <button
                key={pm.mode}
                type="button"
                className={`admin-stat-card ${payment.mode === pm.mode ? 'admin-template-card active' : ''}`}
                style={{
                  padding: '1.15rem 1.25rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  margin: 0,
                  border: payment.mode === pm.mode ? '1.5px solid var(--adm-gold)' : '1px solid var(--adm-border)',
                  background: payment.mode === pm.mode ? 'rgba(198, 161, 91, 0.1)' : 'rgba(0, 0, 0, 0.25)',
                  borderRadius: 'var(--adm-radius-md)',
                  transition: 'all 0.15s ease',
                }}
                onClick={() => setPayment({ ...payment, mode: pm.mode as 'organizer' | 'individual' })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '1.2rem' }}>{pm.icon}</span>
                  <span style={{ fontWeight: 700, fontSize: '1rem', color: payment.mode === pm.mode ? 'var(--adm-gold-light)' : 'var(--adm-text-primary)' }}>
                    {pm.label}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--adm-text-secondary)', lineHeight: 1.4 }}>
                  {pm.desc}
                </div>
              </button>
            ))}
          </div>

          {payment.mode === 'individual' && (
            <div className="admin-form" style={{ padding: '1rem', background: 'rgba(0,0,0,0.25)', borderRadius: 'var(--adm-radius-md)', border: '1px solid var(--adm-border)' }}>
              <div className="admin-form-grid-2">
                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="cfg-pay-amount">
                    Price per Session (₹) <span style={{ color: 'var(--adm-gold)' }}>*</span>
                  </label>
                  <input
                    id="cfg-pay-amount"
                    type="number"
                    min={1}
                    className="admin-input"
                    value={payment.amount || 50}
                    onChange={(e) => setPayment({ ...payment, amount: Number(e.target.value) })}
                  />
                  <div className="admin-form-hint">Amount charged to student/guest in INR</div>
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="cfg-pay-upi">
                    School Merchant UPI ID <span style={{ color: 'var(--adm-gold)' }}>*</span>
                  </label>
                  <input
                    id="cfg-pay-upi"
                    type="text"
                    className="admin-input"
                    placeholder="e.g., pehchaan@icici"
                    value={payment.upiId || ''}
                    onChange={(e) => setPayment({ ...payment, upiId: e.target.value })}
                  />
                  <div className="admin-form-hint">Official institutional UPI VPA for settlement</div>
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="cfg-pay-merchant">
                    Display Merchant Name
                  </label>
                  <input
                    id="cfg-pay-merchant"
                    type="text"
                    className="admin-input"
                    placeholder={school?.schoolName || 'Pehchaan Model Academy'}
                    value={payment.merchantName || ''}
                    onChange={(e) => setPayment({ ...payment, merchantName: e.target.value })}
                  />
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="cfg-pay-timeout">
                    QR Expiry Timeout
                  </label>
                  <select
                    id="cfg-pay-timeout"
                    className="admin-input"
                    value={payment.timeoutSeconds || 300}
                    onChange={(e) => setPayment({ ...payment, timeoutSeconds: Number(e.target.value) })}
                  >
                    <option value={180}>3 Minutes</option>
                    <option value={300}>5 Minutes (Recommended)</option>
                    <option value={600}>10 Minutes</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {payment.mode === 'organizer' && (
            <div className="admin-alert admin-alert-info">
              <span>ℹ️</span>
              <span>All photobooth sessions are complimentary for students and attendees. The guest flow will bypass payment directly to photo review & delivery.</span>
            </div>
          )}

          {renderStepFooter('delivery', 'privacy')}
        </div>
      )}

      {/* =========================================================
          TAB 7: PRIVACY & SAFETY CONFIGURATION
          ========================================================= */}
      {activeTab === 'privacy' && (
        <div className="admin-section-card" style={{ maxWidth: '820px' }}>
          <div className="admin-section-header">
            <div className="admin-section-title-group">
              <h2>Privacy, Consent & School Mode</h2>
              <p>Configure student data privacy protections, legal notices, and cloud publication policies.</p>
            </div>
          </div>

          <div className="admin-form">
            {/* School Mode */}
            <div className="admin-switch-row" style={{ background: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.94rem', color: '#6ee7b7' }}>🛡️ School Safe Mode (Recommended)</div>
                <div className="admin-form-hint">
                  Enforces COPPA/DPDP compliance: blocks WhatsApp marketing, disables public discovery, and mandates privacy disclosures.
                </div>
              </div>
              <label className="admin-switch-toggle">
                <input
                  type="checkbox"
                  checked={privacy.schoolMode}
                  onChange={(e) => {
                    const nextMode = e.target.checked
                    setPrivacy({
                      ...privacy,
                      schoolMode: nextMode,
                      publicGalleryEnabled: nextMode ? false : privacy.publicGalleryEnabled,
                      consentMode: nextMode && privacy.consentMode === 'none' ? 'notice' : privacy.consentMode,
                    })
                  }}
                />
                <span className="admin-switch-slider" />
              </label>
            </div>

            {/* Consent Mode */}
            <div className="admin-form-group" style={{ marginTop: '0.5rem' }}>
              <label className="admin-form-label">Attendee Consent Flow</label>
              <select
                className="admin-input"
                value={privacy.consentMode}
                onChange={(e) => setPrivacy({ ...privacy, consentMode: e.target.value as any })}
              >
                {!privacy.schoolMode && <option value="none">None (Direct to capture)</option>}
                <option value="notice">Notice Screen (Displays privacy policy banner before start)</option>
                <option value="explicit">Explicit Consent (Mandatory checkbox agreement)</option>
                <option value="explicitShare">Explicit + Share Opt-in (Mandatory capture consent, optional cloud share)</option>
              </select>
            </div>

            {/* Privacy Notice Text */}
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="cfg-privacy-text">
                Custom Privacy Notice Text
              </label>
              <textarea
                id="cfg-privacy-text"
                className="admin-input admin-textarea"
                rows={3}
                value={privacy.privacyNoticeText}
                onChange={(e) => setPrivacy({ ...privacy, privacyNoticeText: e.target.value })}
              />
            </div>

            {renderStepFooter('payment', 'activation')}
          </div>
        </div>
      )}

      {/* =========================================================
          TAB 8: ACTIVATION QR & DEVICE ONBOARDING
          ========================================================= */}
      {activeTab === 'activation' && (
        loadingActivation && !activationDetails ? (
          <div className="admin-loading-container">
            <div className="admin-spinner" />
            <p>Loading activation credentials and QR generation...</p>
          </div>
        ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Top Status & Summary Command Card */}
          <div className="activation-hero-card">
            <div className="activation-hero-header">
              <div className="admin-section-title-group" style={{ maxWidth: '680px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--adm-gold)', marginBottom: '0.35rem' }}>
                  <IconSparkles size={13} />
                  <span>On-Site Deployment Center</span>
                </div>
                <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.4rem' }}>Event Activation &amp; iPad Onboarding</h2>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--adm-text-secondary)', lineHeight: 1.45 }}>
                  Deploy this event to on-site photobooth kiosks using a cryptographically signed QR code or unique Event ID.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span
                  className={`admin-badge ${
                    activationDetails?.activationStatus === 'active_on_booth'
                      ? 'admin-badge-live'
                      : activationDetails?.readiness?.isReady
                      ? 'admin-badge-live'
                      : 'admin-badge-draft'
                  }`}
                  style={{ padding: '0.35rem 0.85rem', fontSize: '0.8rem' }}
                >
                  {activationDetails?.activationStatus === 'active_on_booth'
                    ? `● Active on Booth (${activationDetails.activeDeviceCount} device${activationDetails.activeDeviceCount === 1 ? '' : 's'})`
                    : activationDetails?.readiness?.isReady
                    ? '✓ Ready for Activation'
                    : '○ Configuration Incomplete'}
                </span>

                {event && (
                  <a
                    href={`/?eventId=${encodeURIComponent(event.eventId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-btn admin-btn-secondary"
                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                    title="Launch kiosk web app for this event in a new tab"
                  >
                    <IconCamera size={14} />
                    <span>Test Kiosk ↗</span>
                  </a>
                )}
              </div>
            </div>

            {/* 4-Metric Deployment Grid */}
            <div className="activation-metrics-grid">
              {/* Metric 1: Event & Venue */}
              <div className="activation-metric-box">
                <div className="activation-metric-label">
                  <IconCalendar size={13} />
                  <span>Event &amp; Venue</span>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.96rem', color: 'var(--adm-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {event?.name || 'Annual Event'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--adm-text-secondary)', marginTop: '2px' }}>
                    {event?.eventDate || 'Scheduled'} • {event?.venue || 'Campus'}
                  </div>
                </div>
              </div>

              {/* Metric 2: Unique Event ID */}
              <div className="activation-metric-box">
                <div className="activation-metric-label">
                  <IconQrCode size={13} />
                  <span>Unique Event ID</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <code
                    style={{
                      fontFamily: 'monospace',
                      fontWeight: 800,
                      fontSize: '1.05rem',
                      color: 'var(--adm-gold)',
                      background: 'rgba(198, 161, 91, 0.12)',
                      padding: '3px 9px',
                      borderRadius: '6px',
                      letterSpacing: '0.08em',
                      border: '1px solid rgba(198, 161, 91, 0.28)',
                    }}
                  >
                    {event?.eventId}
                  </code>
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary"
                    style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                    onClick={handleCopyEventId}
                    title="Copy Event ID"
                  >
                    <IconCopy size={13} />
                    <span>{copiedEventId ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Metric 3: Booth Staff PIN */}
              <div className="activation-metric-box">
                <div className="activation-metric-label">
                  <IconKey size={13} />
                  <span>Booth Staff PIN</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                  <code
                    style={{
                      fontFamily: 'monospace',
                      fontWeight: 800,
                      fontSize: '1.05rem',
                      color: 'var(--adm-gold)',
                      background: 'rgba(255, 255, 255, 0.08)',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      letterSpacing: '0.12em',
                      border: '1px solid rgba(198, 161, 91, 0.3)',
                    }}
                  >
                    {staffPin}
                  </code>
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    <button
                      type="button"
                      className="admin-btn admin-btn-secondary"
                      style={{ padding: '0.25rem 0.45rem', fontSize: '0.75rem' }}
                      onClick={handleCopyStaffPin}
                      title="Copy Staff PIN"
                    >
                      {copiedStaffPin ? '✓' : <IconCopy size={13} />}
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn-secondary"
                      style={{ padding: '0.25rem 0.45rem', fontSize: '0.75rem' }}
                      onClick={handleGenerateRandomPin}
                      title="Generate random 6-digit PIN"
                    >
                      🎲
                    </button>
                  </div>
                </div>
              </div>

              {/* Metric 4: Offline Status */}
              <div className="activation-metric-box">
                <div className="activation-metric-label">
                  <IconShield size={13} />
                  <span>Kiosk Engine</span>
                </div>
                <div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--adm-success)', fontWeight: 700, fontSize: '0.9rem' }}>
                    <span className="admin-pulse-dot" style={{ background: 'var(--adm-success)' }} />
                    <span>100% Offline Ready</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-secondary)', marginTop: '2px' }}>
                    Persistent Local Storage
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* If Incomplete -> Show Readiness Checklist & Blocker */}
          {activationDetails && !activationDetails.readiness?.isReady && (
            <div className="admin-section-card" style={{ border: '1px solid rgba(245, 158, 11, 0.4)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <span style={{ fontSize: '1.75rem' }}>⚠️</span>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: '0 0 0.35rem', color: 'var(--adm-gold)' }}>
                    Complete Event Configuration before activating this event
                  </h3>
                  <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--adm-text-secondary)' }}>
                    All institutional parameters, branding, photo limits, and delivery channels must be saved and valid before this event can be deployed to kiosks.
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.65rem', marginBottom: '1.25rem' }}>
                    {activationDetails.readiness?.checks?.map((item) => (
                      <div
                        key={item.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.6rem',
                          padding: '0.5rem 0.75rem',
                          background: item.passed ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                          borderRadius: '6px',
                          border: `1px solid ${item.passed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.25)'}`,
                          fontSize: '0.82rem',
                        }}
                      >
                        <span>{item.passed ? '✓' : '✗'}</span>
                        <span style={{ color: item.passed ? 'var(--adm-text-primary)' : '#fca5a5', fontWeight: item.passed ? 400 : 600 }}>
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="admin-btn admin-btn-primary"
                    onClick={() => {
                      const firstIncomplete = checklist.items.find((i) => !i.complete)
                      setActiveTab(firstIncomplete ? firstIncomplete.tab : 'branding')
                    }}
                  >
                    <span>Go to Configuration →</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* If Ready -> Show QR Code, Print & Download actions, Staff PIN Manager, and Staff Instructions */}
          {activationDetails && activationDetails.readiness?.isReady && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(310px, 370px) 1fr', gap: '1.5rem', alignItems: 'start' }}>
              {/* Left Column: QR Code Beacon Card & Staff PIN Card */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* QR Code Beacon Card */}
                <div className="activation-qr-card">
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', fontWeight: 800, color: 'var(--adm-gold)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.35rem' }}>
                    <IconCamera size={13} />
                    <span>Instant Scan Beacon</span>
                  </div>

                  <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', color: 'var(--adm-text-primary)' }}>
                    Kiosk Activation QR Code
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--adm-text-secondary)' }}>
                    Scan with photobooth camera in Staff Mode
                  </p>

                  <div className="activation-qr-frame">
                    {activationDetails.qrDataUrl ? (
                      <img
                        src={activationDetails.qrDataUrl}
                        alt="Activation QR Code"
                        style={{ width: '220px', height: '220px', display: 'block', borderRadius: '6px' }}
                      />
                    ) : activationDetails.qrSvg ? (
                      <div
                        style={{ width: '220px', height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        dangerouslySetInnerHTML={{ __html: activationDetails.qrSvg }}
                      />
                    ) : (
                      <div style={{ width: '220px', height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
                        QR Generating...
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: '1.35rem', width: '100%' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.35rem' }}>
                      Event Code (Click to copy)
                    </div>
                    <div
                      className="activation-code-pill"
                      onClick={handleCopyEventId}
                      title="Click to copy Event ID"
                    >
                      <span>{event?.eventId}</span>
                      <IconCopy size={16} style={{ opacity: 0.8 }} />
                    </div>
                    {copiedEventId && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--adm-success)', fontWeight: 600, marginTop: '0.3rem' }}>
                        ✓ Event ID copied to clipboard!
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', width: '100%' }}>
                    <button
                      type="button"
                      className="admin-btn admin-btn-primary"
                      style={{ justifyContent: 'center', padding: '0.65rem', fontSize: '0.88rem' }}
                      onClick={handlePrintActivationSheet}
                    >
                      <IconPrinter size={16} />
                      <span>Print Activation Sheet</span>
                    </button>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary"
                        style={{ justifyContent: 'center', fontSize: '0.8rem' }}
                        onClick={handleDownloadQr}
                      >
                        <IconDownload size={14} />
                        <span>Download QR</span>
                      </button>

                      {event && (
                        <a
                          href={`/?eventId=${encodeURIComponent(event.eventId)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="admin-btn admin-btn-secondary"
                          style={{ justifyContent: 'center', fontSize: '0.8rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                          <IconExternalLink size={14} />
                          <span>Open Kiosk</span>
                        </a>
                      )}
                    </div>

                    <button
                      type="button"
                      className="admin-btn admin-btn-secondary"
                      style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted)', justifyContent: 'center', marginTop: '0.2rem', border: '1px dashed var(--adm-border)' }}
                      onClick={handleRegenerateToken}
                      disabled={regeneratingToken}
                    >
                      <IconRefresh size={13} />
                      <span>{regeneratingToken ? 'Regenerating...' : 'Regenerate Activation Token'}</span>
                    </button>
                  </div>
                </div>

                {/* Dedicated Staff PIN Manager Card */}
                <div className="admin-section-card" style={{ padding: '1.4rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', fontWeight: 700, color: 'var(--adm-text-primary)' }}>
                      <IconLock size={15} style={{ color: 'var(--adm-gold)' }} />
                      <span>Kiosk Staff PIN</span>
                    </div>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: 'rgba(16, 185, 129, 0.12)',
                        color: 'var(--adm-success)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        fontWeight: 600,
                      }}
                    >
                      Syncs to Booth
                    </span>
                  </div>

                  <p style={{ fontSize: '0.8rem', color: 'var(--adm-text-secondary)', margin: '0 0 0.85rem', lineHeight: 1.45 }}>
                    Enter or generate the 6-digit PIN used by operators to open Staff Mode on the kiosk.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="text"
                        className="admin-input"
                        value={staffPin}
                        maxLength={6}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                          setStaffPin(val)
                        }}
                        placeholder="6-digit PIN"
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '1.25rem',
                          fontWeight: 800,
                          letterSpacing: '0.22em',
                          textAlign: 'center',
                          color: 'var(--adm-gold)',
                          background: 'rgba(0,0,0,0.35)',
                          border: '1.5px solid rgba(198, 161, 91, 0.4)',
                          borderRadius: '8px',
                          padding: '0.5rem 0.75rem',
                          flex: 1,
                        }}
                      />
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary"
                        style={{ padding: '0.55rem 0.85rem', fontSize: '0.8rem', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        onClick={handleCopyStaffPin}
                        title="Copy PIN to clipboard"
                      >
                        <IconCopy size={14} />
                        <span>{copiedStaffPin ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary"
                        style={{ justifyContent: 'center', fontSize: '0.8rem' }}
                        onClick={handleGenerateRandomPin}
                      >
                        <span>🎲 Generate PIN</span>
                      </button>

                      <button
                        type="button"
                        className="admin-btn admin-btn-primary"
                        style={{ justifyContent: 'center', fontSize: '0.8rem' }}
                        onClick={handleSave}
                        disabled={saving || staffPin.length !== 6}
                      >
                        <span>{saving ? 'Saving...' : '💾 Save PIN'}</span>
                      </button>
                    </div>

                    <div
                      style={{
                        marginTop: '0.25rem',
                        fontSize: '0.74rem',
                        color: 'var(--adm-text-muted)',
                        background: 'rgba(255,255,255,0.03)',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '6px',
                        border: '1px solid var(--adm-border)',
                        lineHeight: 1.4,
                      }}
                    >
                      💡 <strong>Tip:</strong> The default master PIN <code>482917</code> also remains supported as a safe fallback in case operators forget the customized PIN.
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Deployment Steps & Instructions */}
              <div className="admin-section-card" style={{ padding: '1.75rem' }}>
                <div className="admin-section-header" style={{ marginBottom: '1.25rem' }}>
                  <div className="admin-section-title-group">
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--adm-gold)', marginBottom: '0.3rem' }}>
                      <IconSparkles size={13} />
                      <span>Step-by-Step Operator Guide</span>
                    </div>
                    <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Photobooth Kiosk Deployment Steps</h2>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.84rem', color: 'var(--adm-text-secondary)' }}>
                      Follow these 3 quick steps on the iPad or booth machine to load the event and start taking photos.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Step 1 */}
                  <div className="activation-step-card">
                    <div className="activation-step-badge">1</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.35rem' }}>
                        <h4 style={{ margin: 0, fontSize: '0.98rem', color: 'var(--adm-text-primary)' }}>
                          Launch Photobooth &amp; Open Staff Mode
                        </h4>
                        <div
                          className="activation-code-chip"
                          onClick={handleCopyStaffPin}
                          title="Click to copy Staff PIN"
                        >
                          <span>PIN: <strong>{staffPin || '482917'}</strong></span>
                          <IconCopy size={12} />
                        </div>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--adm-text-secondary)', lineHeight: 1.55 }}>
                        Power on the kiosk iPad, open the <strong>Pehchaan Photobooth</strong> application. Tap the top-right corner to open <strong>Staff Mode</strong> and enter your 6-digit operator Staff PIN.
                      </p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="activation-step-card">
                    <div className="activation-step-badge">2</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.35rem' }}>
                        <h4 style={{ margin: 0, fontSize: '0.98rem', color: 'var(--adm-text-primary)' }}>
                          Tap Activate Event &amp; Scan QR / Enter Event ID
                        </h4>
                        <div
                          className="activation-code-chip"
                          onClick={handleCopyEventId}
                          title="Click to copy Event ID"
                        >
                          <span>ID: <strong>{event?.eventId}</strong></span>
                          <IconCopy size={12} />
                        </div>
                      </div>
                      <p style={{ margin: '0 0 0.5rem', fontSize: '0.84rem', color: 'var(--adm-text-secondary)', lineHeight: 1.55 }}>
                        In Staff Mode, tap <strong>"Activate Event"</strong> (or "Switch Event"). Scan the QR beacon on the left using the camera, or manually type Event ID.
                      </p>
                      {event && (
                        <a
                          href={`/?eventId=${encodeURIComponent(event.eventId)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="admin-btn admin-btn-secondary"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.65rem', fontSize: '0.76rem', textDecoration: 'none' }}
                        >
                          <IconExternalLink size={12} />
                          <span>Test Event in Browser Kiosk ↗</span>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="activation-step-card">
                    <div className="activation-step-badge">3</div>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: '0 0 0.35rem', fontSize: '0.98rem', color: 'var(--adm-text-primary)' }}>
                        Confirm &amp; Run 100% Offline
                      </h4>
                      <p style={{ margin: '0 0 0.65rem', fontSize: '0.84rem', color: 'var(--adm-text-secondary)', lineHeight: 1.55 }}>
                        Review the verified school details and tap <strong>"Confirm &amp; Load Event"</strong>. The booth persists the compiled Event Pack offline. The event continues smoothly without interruption even if the venue loses internet connectivity.
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.74rem', background: 'rgba(16, 185, 129, 0.12)', color: 'var(--adm-success)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                          ✓ Zero-Lag Offline
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.74rem', background: 'rgba(198, 161, 91, 0.12)', color: 'var(--adm-gold-light)', border: '1px solid rgba(198, 161, 91, 0.3)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                          ✓ Instant Setup
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.74rem', background: 'rgba(59, 130, 246, 0.12)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                          ✓ Auto-Sync Queue
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Security & Cryptography Box */}
                  <div
                    style={{
                      marginTop: '0.35rem',
                      padding: '0.95rem 1.15rem',
                      background: 'rgba(198, 161, 91, 0.07)',
                      borderRadius: 'var(--adm-radius-md)',
                      border: '1px solid rgba(198, 161, 91, 0.22)',
                      fontSize: '0.79rem',
                      color: 'var(--adm-text-secondary)',
                      lineHeight: 1.5,
                      display: 'flex',
                      gap: '0.75rem',
                      alignItems: 'flex-start',
                    }}
                  >
                    <IconShield size={18} style={{ color: 'var(--adm-gold)', flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <strong style={{ color: 'var(--adm-gold-light)' }}>Enterprise Security &amp; Privacy Guarantee:</strong>
                      <div style={{ marginTop: '2px' }}>
                        Activation credentials are cryptographically signed tokens. QR codes never contain raw passwords, staff PINs, or UPI merchant secrets. Only authorized institutional events can be booted onto the photobooth.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {renderStepFooter('privacy', 'preview')}
        </div>
        )
      )}

      {/* =========================================================
          TAB 9: LIVE PREVIEW & EVENT PACK VIEWER
          ========================================================= */}
      {activeTab === 'preview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Preview Mode Switcher */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '0.65rem 1rem', borderRadius: 'var(--adm-radius-md)', border: '1px solid var(--adm-border)', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--adm-text-secondary)', marginRight: '0.25rem' }}>
                Preview Mode:
              </span>
              <button
                type="button"
                className={`admin-tab-btn ${previewViewMode === 'strip' ? 'active' : ''}`}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', borderRadius: '6px' }}
                onClick={() => setPreviewViewMode('strip')}
              >
                🖼️ Finished Photo Strip
              </button>
              <button
                type="button"
                className={`admin-tab-btn ${previewViewMode === 'kiosk' ? 'active' : ''}`}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', borderRadius: '6px' }}
                onClick={() => setPreviewViewMode('kiosk')}
              >
                📱 iPad Kiosk Screen
              </button>
              <button
                type="button"
                className={`admin-tab-btn ${previewViewMode === 'json' ? 'active' : ''}`}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', borderRadius: '6px' }}
                onClick={() => setPreviewViewMode('json')}
              >
                📦 Compiled Event Pack (JSON)
              </button>
            </div>

            {previewViewMode === 'strip' && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--adm-text-muted)' }}>Filter:</span>
                  <button
                    type="button"
                    className={`admin-btn ${previewFilter === 'normal' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                    style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem' }}
                    onClick={() => setPreviewFilter('normal')}
                  >
                    Color
                  </button>
                  <button
                    type="button"
                    className={`admin-btn ${previewFilter === 'bw' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                    style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem' }}
                    onClick={() => setPreviewFilter('bw')}
                  >
                    B&amp;W
                  </button>
                  <button
                    type="button"
                    className={`admin-btn ${previewFilter === 'sepia' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                    style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem' }}
                    onClick={() => setPreviewFilter('sepia')}
                  >
                    Sepia
                  </button>
                </div>

                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  onClick={handleDownloadStripPreview}
                  disabled={downloadingPreview}
                >
                  <IconDownload size={14} />
                  <span>{downloadingPreview ? 'Downloading...' : 'Download preview'}</span>
                </button>
              </div>
            )}
          </div>

          {/* VIEW MODE 1: FINISHED PHOTO STRIP */}
          {previewViewMode === 'strip' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 440px) 1fr', gap: '1.5rem', alignItems: 'start' }}>
              {/* Photo Strip Output Preview */}
              <div className="admin-section-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--adm-text-primary)' }}>
                    {template.templateId === 'school-classic' ? 'School classic' : template.templateId === 'fest-edition' ? 'Fest edition' : template.templateId === 'little-keepsake' ? 'Little keepsake' : template.templateId === 'brand-canvas' ? 'Brand canvas' : template.templateId}
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--adm-text-muted)', fontFamily: 'monospace', fontWeight: 600 }}>2 × 6 in</span>
                </div>

                {/* The Soft Sage Green Stage Wrapper */}
                <div
                  id="admin-strip-preview-stage"
                  style={{
                    width: '100%',
                    background: '#d8e2d6',
                    borderRadius: '6px',
                    padding: '28px 16px 44px 16px',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                  }}
                >
                  {/* Suspended Hanger Clamp at Top */}
                  <div
                    style={{
                      width: '130px',
                      height: '8px',
                      background: '#1d3e34',
                      borderRadius: '9999px',
                      marginBottom: '-4px',
                      zIndex: 3,
                      boxShadow: '0 2px 4px rgba(0,0,0,0.18)',
                    }}
                  />

                  {/* Suspended Physical Photostrip Card */}
                  <div
                    id="admin-strip-preview-box"
                    style={{
                      width: photoSettings.shotCount === 1 ? '230px' : '190px',
                      background: previewSide === 'back' ? (template.cardBackBgColor || '#ffffff') : (template.background || '#ffffff'),
                      color: previewSide === 'back' ? (template.cardBackTextColor || '#0f172a') : ((template.background === '#0b0a09' || (template.background && template.background.toLowerCase().includes('#0b'))) ? '#f8fafc' : '#0f172a'),
                      borderRadius: '2px',
                      boxShadow: '0 16px 36px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.06)',
                      padding: '4px',
                      position: 'relative',
                      transition: 'all 0.3s ease',
                      minHeight: photoSettings.shotCount === 1 ? '380px' : '480px',
                      boxSizing: 'border-box',
                      zIndex: 2,
                    }}
                  >
                    {/* Inset Frame Border Outline */}
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        minHeight: photoSettings.shotCount === 1 ? '372px' : '472px',
                        border: template.frameEdge === 'bold'
                          ? `3px solid ${branding.accentColor || '#1e6052'}`
                          : template.frameEdge === 'double'
                          ? `3px double ${branding.accentColor || '#1e6052'}`
                          : template.frameEdge === 'none'
                          ? 'none'
                          : `1.5px solid ${branding.accentColor || '#1e6052'}`,
                        borderRadius: template.frameEdge === 'rounded' ? '6px' : '0px',
                        padding: previewSide === 'front' ? '6px 5px 12px 5px' : '28px 12px 16px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxSizing: 'border-box',
                      }}
                    >
                      {/* FRONT PHOTO SIDE */}
                      {previewSide === 'front' ? (
                        <>
                          {/* Photo Slots */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            {Array.from({ length: photoSettings.shotCount || 3 }).map((_, i) => {
                              const isBw = previewFilter === 'bw' || (i === 2 && photoSettings.blackAndWhiteEnabled && previewFilter === 'normal')
                              const isSep = previewFilter === 'sepia' || (i === 1 && photoSettings.sepiaEnabled && previewFilter === 'normal')
                              const filterStyle = isBw ? 'grayscale(100%) contrast(110%)' : isSep ? 'sepia(85%) contrast(105%)' : 'none'

                              const pastelColors = ['#b8ccba', '#cbaf7a', '#96b8a8', '#dcfce7']

                              return (
                                <div
                                  key={i}
                                  style={{
                                    height: photoSettings.shotCount === 1 ? '220px' : photoSettings.shotCount === 2 ? '145px' : '98px',
                                    borderRadius: '1px',
                                    overflow: 'hidden',
                                    position: 'relative',
                                    background: pastelColors[i % pastelColors.length],
                                    filter: filterStyle,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <span
                                    style={{
                                      background: '#ffffff',
                                      color: '#1e293b',
                                      fontSize: '0.62rem',
                                      fontWeight: 600,
                                      padding: '2.5px 9px',
                                      borderRadius: '2px',
                                      boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                                      letterSpacing: '0.02em',
                                    }}
                                  >
                                    your guests
                                  </span>
                                </div>
                              )
                            })}
                          </div>

                          {/* Footer Section: Caption, Date & School Crest */}
                          <div style={{ textAlign: 'center', paddingTop: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                            <div style={{ fontFamily: 'Georgia, serif', fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.01em', color: (template.background === '#0b0a09' || template.background === '#000000') ? '#ffffff' : '#0f172a', lineHeight: 1.2 }}>
                              {branding.eventTitle || event?.name || 'Annual Day 2026'}
                            </div>
                            <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 500 }}>
                              {template.printedDate || event?.eventDate || '14 Nov 2026'}
                            </div>

                            {/* School Crest Logo */}
                            <div style={{ marginTop: '5px' }}>
                              {branding.schoolLogoUrl ? (
                                <img src={branding.schoolLogoUrl} alt="Logo" style={{ width: '26px', height: '26px', objectFit: 'contain' }} />
                              ) : (
                                <SchoolShieldCrest size={26} color={branding.accentColor || '#1e6052'} />
                              )}
                            </div>
                          </div>
                        </>
                      ) : (
                        /* CARD BACK */
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            textAlign: 'center',
                            height: '100%',
                            minHeight: photoSettings.shotCount === 1 ? '348px' : '448px',
                            padding: '12px 6px 4px 6px',
                            boxSizing: 'border-box',
                          }}
                        >
                          {/* TOP HEADER: Shield Crest, Headline & Subtitle */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                            {template.cardBackEnabled === false && (
                              <div style={{ background: '#fef3c7', color: '#92400e', fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fde68a', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span>Disabled</span>
                                <button
                                  type="button"
                                  onClick={() => setTemplate({ ...template, cardBackEnabled: true })}
                                  style={{ background: '#d97706', color: '#fff', border: 'none', borderRadius: '3px', padding: '1px 5px', fontSize: '0.62rem', cursor: 'pointer', fontWeight: 600 }}
                                >
                                  Enable
                                </button>
                              </div>
                            )}

                            {/* Top Shield Crest */}
                            <div style={{ marginTop: '4px' }}>
                              {branding.schoolLogoUrl ? (
                                <img src={branding.schoolLogoUrl} alt="Logo" style={{ width: '30px', height: '30px', objectFit: 'contain' }} />
                              ) : (
                                <SchoolShieldCrest size={30} color={branding.accentColor || '#1e6052'} />
                              )}
                            </div>

                            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.02rem', fontWeight: 700, color: template.cardBackTextColor || '#0f172a', marginTop: '6px', lineHeight: 1.2 }}>
                              {template.cardBackHeadline || 'Thank you for coming'}
                            </div>

                            <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600, marginTop: '2px' }}>
                              {branding.schoolName || school?.schoolName || 'Sunrise Public School'}
                            </div>
                          </div>

                          {/* MIDDLE SECTION: Keepsake Message & Ruled Writing Lines */}
                          <div style={{ width: '100%', padding: '0 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', margin: 'auto 0' }}>
                            {template.cardBackMessage && (
                              <p style={{ margin: '0 0 10px 0', fontSize: '0.68rem', color: '#475569', lineHeight: 1.35, fontStyle: 'italic', maxWidth: '160px' }}>
                                "{template.cardBackMessage}"
                              </p>
                            )}

                            {template.cardBackShowLines !== false && (
                              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '14px', margin: '4px 0 8px 0' }}>
                                <div style={{ width: '100%', borderBottom: '1px dashed #cbd5e1', height: '1px' }} />
                                <div style={{ width: '100%', borderBottom: '1px dashed #cbd5e1', height: '1px' }} />
                                <div style={{ width: '100%', borderBottom: '1px dashed #cbd5e1', height: '1px' }} />
                                <div style={{ fontSize: '0.55rem', color: '#94a3b8', fontStyle: 'italic', textAlign: 'right', marginTop: '-8px' }}>
                                  write a memory • sign here
                                </div>
                              </div>
                            )}
                          </div>

                          {/* BOTTOM FOOTER: Compact Album QR Badge & Date Tagline */}
                          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                            {template.cardBackShowQr !== false && (
                              <div
                                style={{
                                  background: '#f8fafc',
                                  padding: '5px 8px',
                                  borderRadius: '5px',
                                  border: '1px solid #e2e8f0',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px',
                                  maxWidth: '150px',
                                  width: '100%',
                                  boxSizing: 'border-box',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                                }}
                              >
                                <IconQrCode size={22} style={{ color: '#0f172a', flexShrink: 0 }} />
                                <div style={{ textAlign: 'left', lineHeight: 1.15 }}>
                                  <div style={{ fontSize: '0.56rem', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                    Online Album
                                  </div>
                                  <div style={{ fontSize: '0.48rem', color: '#64748b' }}>
                                    Scan for digital copy
                                  </div>
                                </div>
                              </div>
                            )}

                            <div style={{ fontSize: '0.58rem', color: branding.accentColor || '#1e6052', fontStyle: 'italic', marginTop: '2px' }}>
                              {template.printedDate || event?.eventDate || '14 Nov 2026'} • Your day, in print.
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tilted Stage Corner Tagline */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '12px',
                      right: '18px',
                      fontFamily: 'Georgia, serif',
                      fontSize: '1.25rem',
                      fontWeight: 700,
                      color: '#284a3e',
                      lineHeight: 1.05,
                      transform: 'rotate(-4deg)',
                      userSelect: 'none',
                      textAlign: 'left',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    Your day,
                    <br />
                    in print.
                  </div>
                </div>

                {/* Segmented Switcher Tabs */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.4rem',
                    width: '100%',
                    maxWidth: '380px',
                    marginTop: '1.25rem',
                    background: '#dce5dc',
                    padding: '4px',
                    borderRadius: '6px',
                  }}
                >
                  <button
                    type="button"
                    style={{
                      background: previewSide === 'front' ? '#ffffff' : 'transparent',
                      border: previewSide === 'front' ? '1px solid #1e6052' : '1px solid transparent',
                      color: previewSide === 'front' ? '#1e6052' : '#2d4c42',
                      fontWeight: previewSide === 'front' ? 700 : 500,
                      padding: '0.6rem 0.5rem',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      transition: 'all 0.15s ease',
                    }}
                    onClick={() => setPreviewSide('front')}
                  >
                    Photo side
                  </button>
                  <button
                    type="button"
                    style={{
                      background: previewSide === 'back' ? '#ffffff' : 'transparent',
                      border: previewSide === 'back' ? '1px solid #1e6052' : '1px solid transparent',
                      color: previewSide === 'back' ? '#1e6052' : '#2d4c42',
                      fontWeight: previewSide === 'back' ? 700 : 500,
                      padding: '0.6rem 0.5rem',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      transition: 'all 0.15s ease',
                    }}
                    onClick={() => setPreviewSide('back')}
                  >
                    Card back {template.cardBackEnabled === false ? '(Off)' : ''}
                  </button>
                </div>

                <div style={{ fontSize: '0.82rem', color: 'var(--adm-text-secondary)', marginTop: '0.75rem', textAlign: 'center', fontWeight: 500 }}>
                  {previewSide === 'front' ? (branding.eventTitle || 'Annual Day 2026.') : (template.cardBackHeadline || 'Thank you for coming.')}
                </div>

                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  style={{
                    width: '100%',
                    maxWidth: '380px',
                    marginTop: '0.65rem',
                    justifyContent: 'center',
                    fontSize: '0.85rem',
                    padding: '0.6rem',
                    border: '1px solid #1e6052',
                    color: '#1e6052',
                  }}
                  onClick={handleDownloadStripPreview}
                  disabled={downloadingPreview}
                >
                  <IconDownload size={16} />
                  <span>Download preview</span>
                </button>
              </div>

              {/* Template Specs & Verification Summary */}
              <div className="admin-section-card">
                <div className="admin-section-header">
                  <div className="admin-section-title-group">
                    <h2>Live Template Specifications</h2>
                    <p>Current configuration parameters compiled for the physical photobooth output.</p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                    <div style={{ padding: '0.85rem', background: 'rgba(0,0,0,0.25)', borderRadius: 'var(--adm-radius-sm)', border: '1px solid var(--adm-border)' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted)', display: 'block' }}>Layout Preset</span>
                      <strong style={{ fontSize: '0.92rem', color: 'var(--adm-gold)' }}>{template.templateId}</strong>
                    </div>

                    <div style={{ padding: '0.85rem', background: 'rgba(0,0,0,0.25)', borderRadius: 'var(--adm-radius-sm)', border: '1px solid var(--adm-border)' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted)', display: 'block' }}>Photo Layout</span>
                      <strong style={{ fontSize: '0.92rem', color: 'var(--adm-text-primary)' }}>{photoSettings.shotCount} Photos per Strip</strong>
                    </div>

                    <div style={{ padding: '0.85rem', background: 'rgba(0,0,0,0.25)', borderRadius: 'var(--adm-radius-sm)', border: '1px solid var(--adm-border)' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted)', display: 'block' }}>Frame Edge</span>
                      <strong style={{ fontSize: '0.92rem', color: 'var(--adm-text-primary)', textTransform: 'capitalize' }}>
                        {template.frameEdge || 'Fine'} Border
                      </strong>
                    </div>

                    <div style={{ padding: '0.85rem', background: 'rgba(0,0,0,0.25)', borderRadius: 'var(--adm-radius-sm)', border: '1px solid var(--adm-border)' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted)', display: 'block' }}>Paper Colour</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                        <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: template.background || '#ffffff', border: '1px solid #777' }} />
                        <strong style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>{template.background || '#ffffff'}</strong>
                      </div>
                    </div>

                    <div style={{ padding: '0.85rem', background: 'rgba(0,0,0,0.25)', borderRadius: 'var(--adm-radius-sm)', border: '1px solid var(--adm-border)' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted)', display: 'block' }}>Accent Colour</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                        <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: branding.accentColor || '#0f766e' }} />
                        <strong style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>{branding.accentColor || '#0f766e'}</strong>
                      </div>
                    </div>

                    <div style={{ padding: '0.85rem', background: 'rgba(0,0,0,0.25)', borderRadius: 'var(--adm-radius-sm)', border: '1px solid var(--adm-border)' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted)', display: 'block' }}>Double-Sided Back</span>
                      <strong style={{ fontSize: '0.92rem', color: template.cardBackEnabled !== false ? 'var(--adm-success)' : 'var(--adm-text-muted)' }}>
                        {template.cardBackEnabled !== false ? '✓ Enabled' : 'Disabled'}
                      </strong>
                    </div>
                  </div>

                  <div className="admin-alert admin-alert-info" style={{ marginTop: '0.5rem' }}>
                    <span>💡</span>
                    <div>
                      <strong>Real-Time Sync:</strong> Any updates made to <em>Photo layout</em>, <em>Frame edge</em>, <em>Colors</em>, <em>Caption</em>, or <em>Card back</em> update both the on-screen mockup and physical print generator instantly.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE 2: IPAD KIOSK SIMULATOR */}
          {previewViewMode === 'kiosk' && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div
                style={{
                  width: '420px',
                  background: '#09090b',
                  borderRadius: '24px',
                  border: '8px solid #27272a',
                  boxShadow: '0 25px 50px rgba(0,0,0,0.8), 0 0 30px rgba(0,0,0,0.6)',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                {/* iPad Camera Notch */}
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#52525b', margin: '0 auto' }} />

                {/* Kiosk Screen */}
                <div
                  style={{
                    background: template.background || '#0b0a09',
                    borderRadius: '12px',
                    padding: '16px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: branding.accentColor || '#c6a15b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {branding.eventTitle || event?.name || 'PHOTOBOOTH'}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#a1a1aa' }}>
                      {branding.eventSubtitle || school?.schoolName}
                    </div>
                  </div>

                  {/* Viewfinder simulation */}
                  <div
                    style={{
                      width: '100%',
                      height: '200px',
                      borderRadius: '8px',
                      background: 'radial-gradient(circle at center, #1e293b 0%, #090d16 100%)',
                      border: '2px dashed var(--adm-gold)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      color: 'var(--adm-text-secondary)',
                    }}
                  >
                    <IconCamera size={36} style={{ color: 'var(--adm-gold)' }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>Touch Screen to Start</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--adm-text-muted)' }}>{photoSettings.shotCount} Photo Session</span>
                  </div>

                  {/* Active delivery & pricing pills */}
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <span className="admin-badge admin-badge-completed" style={{ fontSize: '0.68rem' }}>
                      {payment.mode === 'individual' ? `UPI ₹${payment.amount}` : 'Free / Sponsored'}
                    </span>
                    {delivery.printEnabled && <span className="admin-badge admin-badge-draft" style={{ fontSize: '0.68rem' }}>🖨️ Print</span>}
                    {delivery.cloudQrEnabled && <span className="admin-badge admin-badge-draft" style={{ fontSize: '0.68rem' }}>📲 QR</span>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE 3: COMPILED EVENT PACK JSON */}
          {previewViewMode === 'json' && (
            <div className="admin-section-card">
              <div className="admin-section-header">
                <div className="admin-section-title-group">
                  <h2>Compiled Event Pack Payload</h2>
                  <p>Verified JSON bundle sent to iPad kiosks upon QR scan or token activation.</p>
                </div>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                  onClick={() => {
                    const payload = JSON.stringify(
                      {
                        id: `pack_${event?.eventId}`,
                        version: '1.0.0',
                        eventName: branding.eventTitle || event?.name,
                        shotCount: photoSettings.shotCount,
                        mirrorOutput: photoSettings.mirrorOutput,
                        effects: { blackAndWhite: photoSettings.blackAndWhiteEnabled, sepia: photoSettings.sepiaEnabled },
                        delivery,
                        payment: {
                          enabled: payment.mode !== 'disabled',
                          mode: payment.mode,
                          amount: payment.mode === 'individual' ? payment.amount : 0,
                          currency: payment.currency,
                        },
                        privacy: {
                          schoolMode: privacy.schoolMode,
                          consentMode: privacy.consentMode,
                          retentionHours: privacy.retentionHours,
                        },
                        template: template.templateId,
                      },
                      null,
                      2
                    )
                    navigator.clipboard?.writeText(payload)
                    setCopiedJson(true)
                    setTimeout(() => setCopiedJson(false), 2000)
                  }}
                >
                  {copiedJson ? '✓ Copied JSON' : '📋 Copy JSON'}
                </button>
              </div>

              <div
                style={{
                  background: 'rgba(0,0,0,0.5)',
                  padding: '1.25rem',
                  borderRadius: 'var(--adm-radius-md)',
                  fontFamily: 'monospace',
                  fontSize: '0.82rem',
                  color: '#a78bfa',
                  maxHeight: '450px',
                  overflowY: 'auto',
                  border: '1px solid var(--adm-border)',
                  lineHeight: 1.5,
                }}
              >
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(
                    {
                      id: `pack_${event?.eventId}`,
                      version: '1.0.0',
                      eventName: branding.eventTitle || event?.name,
                      shotCount: photoSettings.shotCount,
                      mirrorOutput: photoSettings.mirrorOutput,
                      effects: { blackAndWhite: photoSettings.blackAndWhiteEnabled, sepia: photoSettings.sepiaEnabled },
                      delivery,
                      payment: {
                        enabled: payment.mode !== 'disabled',
                        mode: payment.mode,
                        amount: payment.mode === 'individual' ? payment.amount : 0,
                        currency: payment.currency,
                      },
                      privacy: {
                        schoolMode: privacy.schoolMode,
                        consentMode: privacy.consentMode,
                        retentionHours: privacy.retentionHours,
                      },
                      template: template.templateId,
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>
          )}

          {renderStepFooter('activation', null)}
        </div>
      )}
    </div>
  )
}

export default AdminEventConfig
