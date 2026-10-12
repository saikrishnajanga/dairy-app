import { useState } from 'react'
import { createProfile, type Profile } from '../services/profiles'
import { isSupabaseConfigured } from '../services/supabase'
import { hapticTap } from '../services/utils'

interface Props {
  onCreated: (profile: Profile) => void
  onSkip: () => void
  /** Opens the Google consent screen; resolves once it has started. */
  onGoogleSignIn: () => Promise<void>
}

/**
 * Local "sign up": creates a profile on this device.
 * No server, no email, no password — an optional PIN guards the profile.
 */
export default function ProfileGate({ onCreated, onSkip, onGoogleSignIn }: Props) {
  const [googleBusy, setGoogleBusy] = useState(false)
  const [name, setName] = useState('')
  const [usePin, setUsePin] = useState(false)
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) { setError('Please enter a name for your profile'); return }
    if (usePin) {
      if (pin.length < 4) { setError('PIN must be at least 4 digits'); return }
      if (pin !== confirmPin) { setError('PINs do not match'); return }
    }
    setBusy(true)
    hapticTap()
    try {
      const profile = await createProfile(name, usePin ? pin : undefined)
      onCreated(profile)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the profile')
      setBusy(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleCreate() }

  const handleGoogle = async () => {
    setGoogleBusy(true)
    hapticTap()
    try { await onGoogleSignIn() }
    finally { setGoogleBusy(false) }
  }

  return (
    <div className="lock-screen">
      <div className="lock-container">
        <img src="/logo.png" alt="VoiceDiary Logo" className="lock-logo" />
        <h2 className="lock-title">Welcome to VoiceDiary</h2>
        <p className="lock-subtitle">Sign in with Google to get your diary everywhere — or keep a profile on this phone</p>

        <button className="lock-btn google-btn" onClick={handleGoogle} disabled={googleBusy}>
          {googleBusy ? '⏳ Opening Google…' : 'G  Continue with Google'}
        </button>
        <p className="google-hint">
          {isSupabaseConfigured()
            ? '☁️ Your entries follow your Google account to all your devices'
            : '⚙️ Cloud login not configured yet — see SETUP_GOOGLE_LOGIN.md'}
        </p>

        <div className="gate-divider"><span>or create a local profile</span></div>

        <input
          className="lock-input profile-name-input"
          placeholder="Your name"
          value={name}
          onChange={e => { setName(e.target.value); setError('') }}
          onKeyDown={handleKeyDown}
          maxLength={40}
          autoComplete="off"
        />

        <button
          className={`profile-toggle ${usePin ? 'on' : ''}`}
          onClick={() => { setUsePin(v => !v); setError('') }}
        >
          {usePin ? '🔐 PIN protection on' : '🔓 Add a PIN (optional)'}
        </button>

        {usePin && (
          <>
            <input
              type="password"
              className="lock-input"
              placeholder="Choose a PIN"
              value={pin}
              onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError('') }}
              onKeyDown={handleKeyDown}
              maxLength={8}
              inputMode="numeric"
              autoComplete="off"
            />
            <input
              type="password"
              className="lock-input"
              placeholder="Confirm PIN"
              value={confirmPin}
              onChange={e => { setConfirmPin(e.target.value.replace(/\D/g, '')); setError('') }}
              onKeyDown={handleKeyDown}
              maxLength={8}
              inputMode="numeric"
              autoComplete="off"
            />
          </>
        )}

        {error && <div className="lock-error">{error}</div>}

        <button className="lock-btn" onClick={handleCreate} disabled={busy}>
          {busy ? '⏳ Creating…' : '🚀 Create Profile'}
        </button>

        <button className="profile-skip" onClick={onSkip}>Skip for now</button>

        <div className="lock-footer">
          <span>🛡️ Local profiles never leave your device — Google sync is optional</span>
        </div>
      </div>
    </div>
  )
}
