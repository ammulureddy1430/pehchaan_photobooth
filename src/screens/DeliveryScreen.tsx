import { useEffect, useRef, useState } from 'react'
import type { EventPack } from '../eventPack/types'
import type { BoothSession } from '../types'
import { deliveryManager } from '../delivery'
import { generateQrSvg } from '../delivery/qrGenerator'
import { apiClient } from '../api/client'
import './DeliveryScreen.css'

interface DeliveryScreenProps {
  pack: EventPack
  session: BoothSession
  photoUrl: string
  composedUrl?: string | null
  photos: Array<{ id: string; url: string }>
  busy?: boolean
  onFinish: () => void
}

export function DeliveryScreen({
  pack,
  session,
  photoUrl,
  composedUrl,
  photos,
  busy = false,
  onFinish,
}: DeliveryScreenProps) {
  const initialUrl = (() => {
    if (typeof window !== 'undefined') {
      const host = (window as any).__PEHCHAAN_API_URL__ || `${window.location.protocol}//${window.location.hostname || 'localhost'}:3001`
      const base = host.startsWith('http') ? host : `http://${host}`
      return `${base.replace(/\/$/, '')}/gallery/${session.id}`
    }
    return `http://localhost:3001/gallery/${session.id}`
  })()

  const [qrSvg, setQrSvg] = useState<string>(() => generateQrSvg(initialUrl, { margin: 2 }))
  const [shareUrl, setShareUrl] = useState<string>(initialUrl)
  const [copied, setCopied] = useState(false)

  // WhatsApp state
  const [phoneInput, setPhoneInput] = useState('')
  const [whatsAppBusy, setWhatsAppBusy] = useState(false)
  const [whatsAppHandoffUrl, setWhatsAppHandoffUrl] = useState<string | null>(null)
  const [whatsAppMsg, setWhatsAppMsg] = useState<{ text: string; isSuccess: boolean } | null>(null)

  // Email state
  const [emailInput, setEmailInput] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailHandoffUrl, setEmailHandoffUrl] = useState<string | null>(null)
  const [emailMsg, setEmailMsg] = useState<{ text: string; isSuccess: boolean } | null>(null)

  // Print state
  const [printBusy, setPrintBusy] = useState(false)
  const [printMsg, setPrintMsg] = useState<{ text: string; isSuccess: boolean } | null>(null)

  // Countdown timer for automatic session close (60 seconds)
  const [timeLeft, setTimeLeft] = useState(60)
  const finishRef = useRef(false)

  const previewImage = composedUrl || photoUrl || (photos.length > 0 ? photos[0].url : '')

  // Load cloud QR code and best reachable network link dynamically
  useEffect(() => {
    let cancelled = false

    async function loadQr() {
      try {
        const info = await apiClient.getServerInfo().catch(() => null)
        const hostToUse =
          info?.publicUrl ||
          (info?.primaryLanIp && info.primaryLanIp !== '127.0.0.1' && info.primaryLanIp !== 'localhost'
            ? `${info.primaryLanIp}:${info.port || 3001}`
            : undefined)

        if (hostToUse && !cancelled) {
          const cleanHost = hostToUse.startsWith('http') ? hostToUse : `http://${hostToUse}`
          const fullUrl = `${cleanHost.replace(/\/$/, '')}/gallery/${session.id}`
          setQrSvg(generateQrSvg(fullUrl, { margin: 2 }))
          setShareUrl(fullUrl)
        } else {
          const res = await deliveryManager.getCloudQr(session.id, pack)
          if (!cancelled && res.success && res.qrSvg && res.shareUrl) {
            setQrSvg(res.qrSvg)
            setShareUrl(res.shareUrl)
          }
        }
      } catch {
        // Safe fallback
      }
    }

    void loadQr()

    return () => {
      cancelled = true
    }
  }, [session.id, pack.id])

  // Auto-finish countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          if (!finishRef.current) {
            finishRef.current = true
            onFinish()
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [onFinish])

  const handleCopyLink = async () => {
    if (!shareUrl) return
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      }
    } catch {
      // Ignore
    }
  }

  const handleSendWhatsApp = async () => {
    if (!phoneInput.trim()) return
    setWhatsAppBusy(true)
    setWhatsAppMsg(null)
    try {
      const customHost = shareUrl ? new URL(shareUrl).host : undefined
      const res = await deliveryManager.sendWhatsApp(session.id, phoneInput.trim(), pack, customHost)
      if (res.success) {
        if (res.handoffUrl) {
          setWhatsAppHandoffUrl(res.handoffUrl)
          try {
            window.open(res.handoffUrl, '_blank', 'noopener,noreferrer')
          } catch {
            // Popup blocked by browser policy
          }
        }
        setWhatsAppMsg({
          text: res.message || '✓ WhatsApp link generated! Tap below to open.',
          isSuccess: true,
        })
      } else {
        setWhatsAppMsg({
          text: res.error || 'Could not send WhatsApp. Please check the mobile number.',
          isSuccess: false,
        })
      }
    } catch {
      setWhatsAppMsg({ text: 'Could not send WhatsApp.', isSuccess: false })
    } finally {
      setWhatsAppBusy(false)
    }
  }

  const handleSendEmail = async () => {
    if (!emailInput.trim()) return
    setEmailBusy(true)
    setEmailMsg(null)
    try {
      const customHost = shareUrl ? new URL(shareUrl).host : undefined
      const res = await deliveryManager.sendEmail(session.id, emailInput.trim(), pack, customHost)
      if (res.success) {
        if (res.mailtoUrl) {
          setEmailHandoffUrl(res.mailtoUrl)
        }
        setEmailMsg({ text: '✓ Photo link prepared for your email!', isSuccess: true })
      } else {
        setEmailMsg({
          text: res.error || 'Could not send email. Please check address.',
          isSuccess: false,
        })
      }
    } catch {
      setEmailMsg({ text: 'Could not send email.', isSuccess: false })
    } finally {
      setEmailBusy(false)
    }
  }

  const handlePrint = async () => {
    setPrintBusy(true)
    setPrintMsg(null)
    try {
      const res = await deliveryManager.printSession(session.id, pack)
      if (res.success) {
        setPrintMsg({ text: '✓ Photo strip sent to printer!', isSuccess: true })
      } else {
        setPrintMsg({ text: res.error || 'Printing failed.', isSuccess: false })
      }
    } catch {
      setPrintMsg({ text: 'Printing failed.', isSuccess: false })
    } finally {
      setPrintBusy(false)
    }
  }

  const handleDoneClick = () => {
    if (finishRef.current) return
    finishRef.current = true
    onFinish()
  }

  const showCloudQr = pack.cloudQrEnabled !== false
  const showWhatsApp = Boolean(pack.whatsappEnabled)
  const showEmail = Boolean(pack.emailEnabled)
  const showPrint = Boolean(pack.printEnabled)

  return (
    <section className="delivery-screen">
      {/* HEADER */}
      <div className="delivery-header">
        <div className="delivery-badge">
          <span>✨ Pehchaan Photobooth</span>
        </div>
        <h1 className="delivery-title">Your Photo is Ready!</h1>
        <p className="delivery-subtitle">
          {pack.eventName} · Save, share, or print your memories below
        </p>
      </div>

      {/* MAIN CONTENT: PHOTO PREVIEW + SHARING HUB */}
      <div className="delivery-main-grid">
        {/* LEFT: PHOTO SHOWCASE */}
        <div className="delivery-photo-pane">
          {previewImage ? (
            <img
              className="delivery-photo-img"
              src={previewImage}
              alt="Your captured photobooth portrait"
            />
          ) : (
            <div style={{ color: '#888', padding: '4cqh' }}>Processing photo...</div>
          )}
          <span className="delivery-photo-label">High-Resolution Photo Portrait</span>
        </div>

        {/* RIGHT: SHARING HUB */}
        <div className="delivery-hub-pane">
          {/* 1. CLOUD / PICTURE QR CODE */}
          {showCloudQr && (
            <div className="delivery-card is-highlight">
              <div className="delivery-card-header">
                <span className="delivery-card-icon">📱</span>
                <h3 className="delivery-card-title">Scan QR for Photos</h3>
              </div>
              <p className="delivery-card-desc">
                Scan with your phone camera to view &amp; download high-res photos on 4G/5G or Wi-Fi:
              </p>

              <div className="delivery-qr-layout">
                <div className="delivery-qr-box">
                  {qrSvg ? (
                    <div
                      style={{ width: '100%', height: '100%' }}
                      dangerouslySetInnerHTML={{ __html: qrSvg }}
                      aria-label="Picture QR Code"
                    />
                  ) : (
                    <span style={{ color: '#666', fontSize: '12px' }}>Generating QR...</span>
                  )}
                </div>

                <div className="delivery-qr-info">
                  <p className="delivery-qr-instruction">Point camera at QR code</p>
                  <p className="delivery-qr-subtext">Instant download · No app required</p>
                  {shareUrl && (
                    <button
                      type="button"
                      className="delivery-link-btn"
                      onClick={handleCopyLink}
                    >
                      {copied ? '✓ Link Copied' : '📋 Copy Link'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2. SEND VIA WHATSAPP */}
          {showWhatsApp && (
            <div className="delivery-card">
              <div className="delivery-card-header">
                <span className="delivery-card-icon">💬</span>
                <h3 className="delivery-card-title">Send to WhatsApp</h3>
              </div>
              <div className="delivery-input-group">
                <input
                  type="tel"
                  className="delivery-input"
                  placeholder="Enter 10-digit mobile number"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSendWhatsApp()
                  }}
                />
                <button
                  type="button"
                  className="delivery-action-btn"
                  disabled={whatsAppBusy || !phoneInput.trim()}
                  onClick={() => void handleSendWhatsApp()}
                >
                  {whatsAppBusy ? 'Sending...' : 'Send'}
                </button>
              </div>
              {whatsAppMsg && (
                <div className="delivery-result-row">
                  <p
                    className={`delivery-status-msg ${
                      whatsAppMsg.isSuccess ? 'is-success' : 'is-error'
                    }`}
                  >
                    {whatsAppMsg.text}
                  </p>
                  {whatsAppHandoffUrl && (
                    <a
                      href={whatsAppHandoffUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="delivery-handoff-btn"
                    >
                      💬 Open in WhatsApp ({phoneInput.trim()}) ↗
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 3. SEND VIA EMAIL */}
          {showEmail && (
            <div className="delivery-card">
              <div className="delivery-card-header">
                <span className="delivery-card-icon">✉️</span>
                <h3 className="delivery-card-title">Send via Email</h3>
              </div>
              <div className="delivery-input-group">
                <input
                  type="email"
                  className="delivery-input"
                  placeholder="Enter your email address"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSendEmail()
                  }}
                />
                <button
                  type="button"
                  className="delivery-action-btn"
                  disabled={emailBusy || !emailInput.trim()}
                  onClick={() => void handleSendEmail()}
                >
                  {emailBusy ? 'Sending...' : 'Send'}
                </button>
              </div>
              {emailMsg && (
                <div className="delivery-result-row">
                  <p
                    className={`delivery-status-msg ${
                      emailMsg.isSuccess ? 'is-success' : 'is-error'
                    }`}
                  >
                    {emailMsg.text}
                  </p>
                  {emailHandoffUrl && (
                    <a
                      href={emailHandoffUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="delivery-handoff-btn"
                    >
                      ✉️ Open in Email App ↗
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 4. PRINT PHOTO STRIP */}
          {showPrint && (
            <div className="delivery-card">
              <div className="delivery-print-row">
                <div>
                  <h3 className="delivery-card-title" style={{ margin: 0 }}>
                    🖨 Physical Photo Print
                  </h3>
                  <p className="delivery-card-desc" style={{ margin: '0.4cqh 0 0' }}>
                    Print a glossy photo strip keepsake
                  </p>
                </div>
                <button
                  type="button"
                  className="delivery-print-btn"
                  disabled={printBusy}
                  onClick={() => void handlePrint()}
                >
                  {printBusy ? 'Printing...' : 'Print Photo'}
                </button>
              </div>
              {printMsg && (
                <p
                  className={`delivery-status-msg ${
                    printMsg.isSuccess ? 'is-success' : 'is-error'
                  }`}
                >
                  {printMsg.text}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* FOOTER: TIMER + FINISH BUTTON */}
      <div className="delivery-footer">
        <span className="delivery-timer-pill">
          ⏱ Booth will reset for next guest in {timeLeft}s
        </span>

        <button
          type="button"
          className="delivery-finish-btn"
          disabled={busy}
          onClick={handleDoneClick}
        >
          Finish / Thank You! →
        </button>
      </div>
    </section>
  )
}
