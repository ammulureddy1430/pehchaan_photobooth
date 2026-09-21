import { useEffect, useRef, useState } from 'react'
import { formatLockout, PIN_LENGTH, remainingLockMs } from '../staff/pinAuth'
import './StaffPinScreen.css'

type StaffPinScreenProps = {
  disabled?: boolean
  error: string | null
  lockUntil: number | null
  onSubmit: (pin: string) => void
  onCancel: () => void
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'enter'] as const

export function StaffPinScreen({ error, lockUntil, onSubmit, onCancel, disabled = false }: StaffPinScreenProps) {
  const [digits, setDigits] = useState('')
  const [lockMessage, setLockMessage] = useState<string | null>(null)
  const submittedRef = useRef(false)

  useEffect(() => {
    function tick() {
      if (!lockUntil) {
        setLockMessage(null)
        return
      }

      const remaining = remainingLockMs({
        salt: '',
        hash: '',
        iterations: 0,
        failedAttempts: 0,
        lockUntil,
      })

      setLockMessage(remaining > 0 ? formatLockout(remaining) : null)
    }

    tick()
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [lockUntil])

  const locked = Boolean(lockMessage)
  const displayError = lockMessage ?? error

  const handleKey = (key: (typeof KEYS)[number]) => {
    if ((locked || disabled) && key !== 'clear') {
      return
    }

    if (key === 'clear') {
      setDigits('')
      return
    }

    if (key === 'enter') {
      if (digits.length === PIN_LENGTH && !submittedRef.current) {
        submittedRef.current = true
        onSubmit(digits)
        setDigits('')
      }
      return
    }

    setDigits((current) => {
      if (current.length >= PIN_LENGTH) {
        return current
      }
      return `${current}${key}`
    })
  }

  useEffect(() => {
    if (digits.length === 0) {
      submittedRef.current = false
    }
  }, [digits])

  useEffect(() => {
    if (digits.length === PIN_LENGTH && !locked && !disabled && !submittedRef.current) {
      submittedRef.current = true
      onSubmit(digits)
      setDigits('')
    }
  }, [digits, locked, disabled, onSubmit])

  return (
    <section className="screen staff-pin">
      <div className="gold-frame" />
      <p className="staff-kicker">Operator</p>
      <h1 className="staff-title">Staff PIN</h1>
      <div className="pin-dots" aria-hidden="true">
        {Array.from({ length: PIN_LENGTH }, (_, index) => (
          <span key={index} className={index < digits.length ? 'pin-dot is-on' : 'pin-dot'} />
        ))}
      </div>
      {displayError && <p className="pin-error">{displayError}</p>}
      <div className="pin-pad">
        {KEYS.map((key) => (
          <button
            key={key}
            className={key === 'enter' ? 'pin-key is-enter' : 'pin-key'}
            type="button"
            disabled={(locked || disabled) && key !== 'clear'}
            onClick={() => handleKey(key)}
          >
            {key === 'clear' ? 'Clear' : key === 'enter' ? 'OK' : key}
          </button>
        ))}
      </div>
      <button className="btn btn-ghost pin-exit" type="button" onClick={onCancel}>
        Back
      </button>
    </section>
  )
}
