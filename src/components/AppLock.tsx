import { useState, useEffect, useRef } from 'react'
import { hasAppLock, hasAppPinSet, verifyAppPin, setAppPin, isAutoLockEnabled } from '../services/security'

interface AppLockProps {
  children: React.ReactNode
}

export default function AppLock({ children }: AppLockProps) {
  const [locked, setLocked] = useState(() => hasAppLock() && hasAppPinSet())
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'unlock' | 'setup'>(() =>
    hasAppPinSet() ? 'unlock' : 'setup'
  )
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-lock when app becomes hidden
  useEffect(() => {
    if (!hasAppLock() || !isAutoLockEnabled()) return
    const handleVisibility = () => {
      if (document.hidden && hasAppLock() && hasAppPinSet()) {
        setLocked(true)
        setPin('')
        setError('')
        setMode('unlock')
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  useEffect(() => {
    if (locked && inputRef.current) inputRef.current.focus()
  }, [locked])

  if (!locked) return <>{children}</>

  const handleSubmit = () => {
    if (mode === 'setup') {
      if (pin.length < 4) { setError('PIN must be at least 4 digits'); return }
      if (pin !== confirmPin) { setError('PINs do not match'); return }
      setAppPin(pin)
      setLocked(false)
      setPin('')
      setConfirmPin('')
      setError('')
    } else {
      if (verifyAppPin(pin)) {
        setLocked(false)
        setPin('')
        setError('')
      } else {
        setError('Wrong PIN. Try again.')
        setPin('')
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div className="lock-screen">
      <div className="lock-container">
        <img src="/logo.png" alt="VoiceDiary Logo" className="lock-logo" />
        <h2 className="lock-title">VoiceDiary Pro</h2>
        <p className="lock-subtitle">
          {mode === 'setup' ? 'Set up your app PIN' : 'Enter PIN to unlock'}
        </p>

        <input
          ref={inputRef}
          type="password"
          className="lock-input"
          placeholder="Enter PIN"
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={handleKeyDown}
          maxLength={8}
          inputMode="numeric"
          autoComplete="off"
        />

        {mode === 'setup' && (
          <input
            type="password"
            className="lock-input"
            placeholder="Confirm PIN"
            value={confirmPin}
            onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
            onKeyDown={handleKeyDown}
            maxLength={8}
            inputMode="numeric"
            autoComplete="off"
          />
        )}

        {error && <div className="lock-error">{error}</div>}

        <button className="lock-btn" onClick={handleSubmit}>
          {mode === 'setup' ? '🔐 Set PIN' : '🔓 Unlock'}
        </button>

        <div className="lock-footer">
          <span>🛡️ Your diary is protected</span>
        </div>
      </div>
    </div>
  )
}
