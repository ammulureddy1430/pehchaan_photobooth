import { useEffect, useRef, useState } from 'react'
import type { EventPack } from '../eventPack/types'
import type { BoothSession, PaymentStatus } from '../types'
import {
  paymentManager,
  mockPaymentProvider,
  generateUpiQrSvg,
  buildUpiIntentUrl,
  type PaymentRecord,
} from '../payment'
import './PaymentScreen.css'

interface PaymentScreenProps {
  pack: EventPack
  session: BoothSession
  busy?: boolean
  onPaymentSuccess: (record: PaymentRecord) => void
  onCancel: () => void
}

export function PaymentScreen({
  pack,
  session,
  busy = false,
  onPaymentSuccess,
  onCancel,
}: PaymentScreenProps) {
  const [paymentRecord, setPaymentRecord] = useState<PaymentRecord | null>(null)
  const [status, setStatus] = useState<PaymentStatus>('pending')
  const [qrSvg, setQrSvg] = useState<string>('')
  const [timeLeft, setTimeLeft] = useState<number>(() => pack.payment?.timeoutSeconds || 300)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  const activeRef = useRef<string | null>(null)
  const recordRef = useRef<PaymentRecord | null>(null)
  const isHandlingSuccess = useRef(false)
  const proceedingRef = useRef(false)
  const timerRef = useRef<any>(null)
  const pollRef = useRef<any>(null)
  const autoAdvanceRef = useRef<any>(null)

  const upiId = pack.payment?.upiId || 'pehchaan@upi'
  const merchantName = pack.payment?.merchantName || pack.eventName || 'Pehchaan Photobooth'
  const amount = pack.payment?.amount || 99
  const currency = pack.payment?.currency || 'INR'
  const currencySymbol = currency === 'INR' ? '₹' : currency + ' '

  const clearAllTimers = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current)
      autoAdvanceRef.current = null
    }
  }

  const initPayment = async () => {
    try {
      setErrorMessage(null)
      setStatus('pending')
      isHandlingSuccess.current = false
      proceedingRef.current = false
      setTimeLeft(pack.payment?.timeoutSeconds || 300)

      const record = await paymentManager.createPayment({
        eventId: pack.id,
        sessionId: session.id,
        amount,
        currency,
        mode: 'individual',
        upiId,
        merchantName,
        timeoutSeconds: pack.payment?.timeoutSeconds || 300,
      })

      activeRef.current = record.paymentReference
      recordRef.current = record
      setPaymentRecord(record)
      setStatus(record.status)

      const intentUrl =
        record.qrUri ||
        buildUpiIntentUrl({
          upiId,
          merchantName,
          amount,
          currency,
          paymentReference: record.paymentReference,
        })

      const svg = generateUpiQrSvg(intentUrl)
      setQrSvg(svg)
    } catch (err) {
      setErrorMessage('Could not initialize payment. Please check network connection.')
    }
  }

  useEffect(() => {
    void initPayment()

    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearAllTimers()
    }
  }, [pack.id, session.id])

  // Countdown timer
  useEffect(() => {
    if (status !== 'pending') {
      return
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          void simulateExpire()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [status])

  const handleProceed = async (record?: PaymentRecord | null) => {
    if (proceedingRef.current) return
    proceedingRef.current = true

    clearAllTimers()

    const target: PaymentRecord = record || recordRef.current || paymentRecord || {
      id: `pay_${Date.now()}`,
      eventId: pack.id,
      sessionId: session.id,
      deviceId: 'booth_device',
      paymentReference: activeRef.current || `PB-demo-${Date.now()}`,
      amount,
      currency,
      mode: 'individual',
      status: 'success',
      provider: 'mock_upi',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      verifiedAt: Date.now(),
    }

    const verifiedRecord: PaymentRecord = {
      ...target,
      status: 'success',
      verifiedAt: target.verifiedAt || Date.now(),
    }

    try {
      await onPaymentSuccess(verifiedRecord)
    } catch (err) {
      console.error('[PaymentScreen] Error advancing payment success:', err)
      proceedingRef.current = false
    }
  }

  // Status Polling & Verification
  useEffect(() => {
    if (!activeRef.current || status !== 'pending') {
      return
    }

    pollRef.current = setInterval(async () => {
      if (!activeRef.current || isHandlingSuccess.current || proceedingRef.current) return
      try {
        const result = await paymentManager.getPaymentStatus(activeRef.current)
        if (result.status === 'success') {
          clearAllTimers()
          isHandlingSuccess.current = true
          setIsVerifying(true)
          const verifiedRes = await paymentManager.verifyPayment(activeRef.current)
          setIsVerifying(false)
          if (verifiedRes.verified) {
            setStatus('success')
            const target = result.record || recordRef.current || paymentRecord
            if (target) {
              const verifiedRec: PaymentRecord = {
                ...target,
                status: 'success',
                verifiedAt: verifiedRes.verifiedAt || Date.now(),
              }
              recordRef.current = verifiedRec
              setPaymentRecord(verifiedRec)
              void handleProceed(verifiedRec)
            }
          }
        } else if (result.status === 'failed' || result.status === 'expired' || result.status === 'cancelled') {
          clearAllTimers()
          setStatus(result.status)
          setErrorMessage(result.error || result.record?.errorMessage || 'Payment was not completed.')
        }
      } catch {
        // Network poll glitch; keep session safe
      }
    }, 2000)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [status, onPaymentSuccess, paymentRecord])

  // Auto-advance after verified success
  useEffect(() => {
    if (status === 'success' && !proceedingRef.current) {
      autoAdvanceRef.current = setTimeout(() => {
        if (!proceedingRef.current) {
          void handleProceed()
        }
      }, 2500)
      return () => {
        if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current)
      }
    }
  }, [status])

  const handleManualVerify = async () => {
    if (status === 'success' || isHandlingSuccess.current || proceedingRef.current) return
    let ref = activeRef.current
    if (!ref) {
      try {
        const record = await paymentManager.createPayment({
          eventId: pack.id,
          sessionId: session.id,
          amount,
          currency,
          mode: 'individual',
          upiId,
          merchantName,
          timeoutSeconds: pack.payment?.timeoutSeconds || 300,
        })
        ref = record.paymentReference
        activeRef.current = ref
        recordRef.current = record
        setPaymentRecord(record)
      } catch {
        setErrorMessage('Could not initialize payment.')
        return
      }
    }

    if (!ref) return
    setIsVerifying(true)
    setErrorMessage(null)
    try {
      const verified = await paymentManager.verifyPayment(ref)
      if (verified.verified) {
        clearAllTimers()
        isHandlingSuccess.current = true
        setStatus('success')
        const targetRecord = recordRef.current || paymentRecord
        const verifiedRecord: PaymentRecord = {
          ...(targetRecord || {
            id: `pay_${Date.now()}`,
            eventId: pack.id,
            sessionId: session.id,
            deviceId: 'booth_device',
            paymentReference: ref,
            amount,
            currency,
            mode: 'individual',
            provider: 'mock_upi',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }),
          status: 'success',
          verifiedAt: verified.verifiedAt || Date.now(),
        }
        recordRef.current = verifiedRecord
        setPaymentRecord(verifiedRecord)
      } else {
        setErrorMessage(verified.error || 'Payment has not been confirmed by bank yet.')
      }
    } catch {
      setErrorMessage('Could not verify payment. Please retry.')
    } finally {
      setIsVerifying(false)
    }
  }

  const handleCancel = async () => {
    clearAllTimers()
    if (activeRef.current) {
      await paymentManager.cancelPayment(activeRef.current).catch(() => {})
    }
    onCancel()
  }

  // --- Prototype Simulation Controls ---
  const simulateScanAndPay = async () => {
    try {
      setIsVerifying(true)
      setErrorMessage(null)
      clearAllTimers()

      let ref = activeRef.current
      if (!ref) {
        const record = await paymentManager.createPayment({
          eventId: pack.id,
          sessionId: session.id,
          amount,
          currency,
          mode: 'individual',
          upiId,
          merchantName,
          timeoutSeconds: pack.payment?.timeoutSeconds || 300,
        })
        ref = record.paymentReference
        activeRef.current = ref
        recordRef.current = record
        setPaymentRecord(record)
      }

      const paymentRef = ref || `PB-demo-${Date.now()}`

      // 1. Mock provider & backend simulation
      mockPaymentProvider.simulateSuccess(paymentRef)
      await paymentManager.simulatePayment(paymentRef, 'success').catch(() => {})

      // 2. Verification
      const verifyRes = await paymentManager.verifyPayment(paymentRef).catch(() => ({
        verified: true,
        status: 'success' as PaymentStatus,
        paymentReference: paymentRef,
        verifiedAt: Date.now(),
      }))

      const successRec: PaymentRecord = {
        ...(recordRef.current || paymentRecord || {
          id: `pay_${Date.now()}`,
          eventId: pack.id,
          sessionId: session.id,
          deviceId: 'booth_device',
          paymentReference: paymentRef,
          amount,
          currency,
          mode: 'individual',
          provider: 'mock_upi',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
        status: 'success',
        verifiedAt: verifyRes.verifiedAt || Date.now(),
      }

      recordRef.current = successRec
      setPaymentRecord(successRec)
      setStatus('success')
    } catch (err) {
      console.error('[PaymentScreen] Error in simulateScanAndPay:', err)
      const fallbackRec: PaymentRecord = {
        ...(recordRef.current || paymentRecord || {
          id: `pay_${Date.now()}`,
          eventId: pack.id,
          sessionId: session.id,
          deviceId: 'booth_device',
          paymentReference: activeRef.current || `PB-demo-${Date.now()}`,
          amount,
          currency,
          mode: 'individual',
          provider: 'mock_upi',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
        status: 'success',
        verifiedAt: Date.now(),
      }
      recordRef.current = fallbackRec
      setPaymentRecord(fallbackRec)
      setStatus('success')
    } finally {
      setIsVerifying(false)
    }
  }

  const simulateFail = async () => {
    clearAllTimers()
    const ref = activeRef.current || `PB-fail-${Date.now()}`
    mockPaymentProvider.simulateFailure(ref, 'UPI Transaction Declined by Bank')
    await paymentManager.simulatePayment(ref, 'failed', 'UPI Transaction Declined by Bank').catch(() => {})
    setStatus('failed')
    setErrorMessage('UPI Transaction Declined by Bank')
  }

  const simulateCancel = async () => {
    clearAllTimers()
    const ref = activeRef.current || `PB-cancel-${Date.now()}`
    mockPaymentProvider.simulateCancel(ref)
    await paymentManager.simulatePayment(ref, 'cancelled').catch(() => {})
    await paymentManager.cancelPayment(ref).catch(() => {})
    setStatus('cancelled')
    setErrorMessage('Payment cancelled.')
  }

  const simulateExpire = async () => {
    clearAllTimers()
    const ref = activeRef.current || `PB-expire-${Date.now()}`
    mockPaymentProvider.simulateExpired(ref)
    await paymentManager.simulatePayment(ref, 'expired', 'Payment session expired.').catch(() => {})
    setStatus('expired')
    setErrorMessage('Payment session expired.')
  }

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60
  const formattedTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`

  return (
    <section className="payment-screen">
      {/* HEADER */}
      <div className="payment-header">
        <div className="payment-badge">
          <span>✨ Pehchaan Photobooth</span>
        </div>
        <h1 className="payment-title">Complete Payment</h1>
        <p className="payment-event-name">{pack.eventName}</p>
      </div>

      {/* PAYMENT CARD */}
      <div className="payment-card">
        <div className="payment-amount-box">
          <span className="payment-amount-label">Pay Amount</span>
          <span className="payment-amount-value">
            {currencySymbol}
            {amount}
          </span>
        </div>

        {/* UPI QR CODE DISPLAY */}
        <div className="payment-qr-wrap">
          {qrSvg ? (
            <div
              className="payment-qr-svg"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
              aria-label="UPI QR Code"
            />
          ) : (
            <p style={{ color: '#888' }}>Generating QR Code...</p>
          )}
        </div>

        {/* INSTRUCTIONS */}
        <p className="payment-instructions">
          Scan the QR code using any UPI app (GPay, PhonePe, Paytm, BHIM) to complete payment.
        </p>

        {/* STATUS PILL */}
        <div className={`payment-status-pill is-${status}`}>
          {status === 'pending' && <span>⏳ Waiting for payment...</span>}
          {status === 'success' && <span>✓ Payment successful!</span>}
          {status === 'failed' && <span>⚠ Payment was not completed</span>}
          {status === 'expired' && <span>⏱ Payment session expired</span>}
          {status === 'cancelled' && <span>✕ Payment cancelled</span>}
        </div>

        {status === 'pending' && (
          <span className="payment-timer">Session expires in {formattedTime}</span>
        )}

        {isOffline && (
          <p className="staff-alert" style={{ margin: 0 }}>
            ⚠ Payment requires an internet connection.
          </p>
        )}

        {errorMessage && status !== 'pending' && (
          <p className="staff-alert" style={{ margin: 0 }}>
            {errorMessage}
          </p>
        )}

        {/* ACTIONS */}
        <div className="payment-actions">
          {status === 'pending' ? (
            <>
              <button
                type="button"
                className="payment-btn"
                disabled={busy || isVerifying}
                onClick={handleCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="payment-btn is-primary"
                disabled={busy || isVerifying}
                onClick={handleManualVerify}
              >
                {isVerifying ? 'Verifying...' : 'Check Status'}
              </button>
            </>
          ) : status === 'success' ? (
            <button
              type="button"
              className="payment-btn is-primary"
              disabled={isVerifying}
              onClick={() => void handleProceed()}
            >
              Done / Continue →
            </button>
          ) : (
            <>
              <button type="button" className="payment-btn" onClick={handleCancel}>
                Back to Review
              </button>
              <button
                type="button"
                className="payment-btn is-primary"
                disabled={busy}
                onClick={initPayment}
              >
                Try Again
              </button>
            </>
          )}
        </div>
      </div>

      {/* CHROME PROTOTYPE DEMO / TESTING CONTROLS */}
      <div className="payment-proto-tools">
        <div className="payment-proto-header">
          <span className="payment-proto-badge">DEMO / TESTING ONLY</span>
        </div>
        <div className="payment-proto-buttons">
          <button
            type="button"
            className="payment-proto-btn is-success-demo"
            disabled={status === 'success' || isVerifying}
            onClick={simulateScanAndPay}
          >
            DEMO — Simulate Payment Success
          </button>
          <button
            type="button"
            className="payment-proto-btn is-fail-demo"
            disabled={status === 'success' || isVerifying}
            onClick={simulateFail}
          >
            Simulate Payment Failure
          </button>
          <button
            type="button"
            className="payment-proto-btn is-fail-demo"
            disabled={status === 'success' || isVerifying}
            onClick={simulateCancel}
          >
            Simulate Payment Cancellation
          </button>
          <button
            type="button"
            className="payment-proto-btn is-expire-demo"
            disabled={status === 'success' || isVerifying}
            onClick={simulateExpire}
          >
            Simulate Payment Timeout
          </button>
        </div>
      </div>
    </section>
  )
}
