import { useState } from 'react'
import {
  createProfile, setActiveProfile, verifyProfilePin, profileHasPin,
  profileEntryCount, deleteProfile, type Profile,
} from '../services/profiles'
import { isSupabaseConfigured } from '../services/supabase'
import ConfirmDialog from './ConfirmDialog'
import { hapticTap } from '../services/utils'
import { TrashIcon } from './Icons'

interface Props {
  profiles: Profile[]
  activeId: string | null
  /** Email of the signed-in Google account (null when signed out). */
  googleEmail: string | null
  onGoogleSignIn: () => Promise<void>
  onSignOut: () => void
  /** Called after switching, creating or deleting — parent reloads its data. */
  onChanged: () => void
  onClose: () => void
}

export default function ProfileSwitcher({ profiles, activeId, googleEmail, onGoogleSignIn, onSignOut, onChanged, onClose }: Props) {
  const [mode, setMode] = useState<'list' | 'pin' | 'new'>('list')
  const [target, setTarget] = useState<Profile | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [usePin, setUsePin] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Profile | null>(null)
  const [googleBusy, setGoogleBusy] = useState(false)

  const handleGoogle = async () => {
    setGoogleBusy(true)
    hapticTap()
    try { await onGoogleSignIn() }
    finally { setGoogleBusy(false) }
  }

  const finish = () => { onChanged(); onClose() }

  const requestSwitch = (profile: Profile) => {
    if (profile.id === activeId) { onClose(); return }
    if (profileHasPin(profile.id)) {
      setTarget(profile); setPin(''); setError(''); setMode('pin')
      return
    }
    hapticTap()
    setActiveProfile(profile.id)
    finish()
  }

  const submitPin = async () => {
    if (!target) return
    const ok = await verifyProfilePin(target.id, pin)
    if (!ok) { setError('Wrong PIN'); setPin(''); return }
    hapticTap()
    setActiveProfile(target.id)
    finish()
  }

  const handleCreate = async () => {
    if (!name.trim()) { setError('Please enter a name'); return }
    if (usePin && newPin.length < 4) { setError('PIN must be at least 4 digits'); return }
    try {
      await createProfile(name, usePin ? newPin : undefined)
      hapticTap()
      finish()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the profile')
    }
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    const remaining = profiles.filter(p => p.id !== pendingDelete.id)
    deleteProfile(pendingDelete.id)
    setPendingDelete(null)
    // Deleting the last profile leaves the app in its original single-user mode.
    if (remaining.length === 0) setMode('new')
    onChanged()
  }

  const initial = (text: string) => (text.trim().charAt(0) || '?').toUpperCase()

  return (
    <div className="pin-overlay" onClick={onClose}>
      <div className="profile-sheet" onClick={e => e.stopPropagation()}>

        {mode === 'list' && (
          <>
            <h3 className="profile-sheet-title">👤 Profiles</h3>
            <div className="cloud-row">
              {googleEmail ? (
                <>
                  <span className="cloud-badge">☁️ {googleEmail}</span>
                  <button className="profile-cloud-btn" onClick={() => { hapticTap(); onSignOut() }}>
                    Sign out
                  </button>
                </>
              ) : (
                <button className="profile-cloud-btn google" disabled={googleBusy} onClick={handleGoogle}
                  title={isSupabaseConfigured() ? 'Sign in with Google' : 'Not configured — see SETUP_GOOGLE_LOGIN.md'}>
                  {googleBusy ? '⏳ Opening Google…' : 'G  Continue with Google'}
                </button>
              )}
            </div>
            <div className="profile-list">
              {profiles.map(profile => (
                <div key={profile.id}
                  className={`profile-item ${profile.id === activeId ? 'active' : ''}`}
                  onClick={() => requestSwitch(profile)}>
                  <span className="profile-avatar">{initial(profile.name)}</span>
                  <span className="profile-item-body">
                    <span className="profile-item-name">
                      {profile.name}
                      {profileHasPin(profile.id) && <span className="profile-lock"> 🔒</span>}
                    </span>
                    <span className="profile-item-meta">
                      {profileEntryCount(profile.id)} voice {profileEntryCount(profile.id) === 1 ? 'entry' : 'entries'}
                      {profile.email ? ` · ${profile.email}` : ''}
                      {profile.id === activeId ? ' · active' : ''}
                    </span>
                  </span>
                  <button className="profile-delete" title="Delete this profile"
                    onClick={e => { e.stopPropagation(); setPendingDelete(profile) }}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="pin-actions">
              <button className="pin-cancel" onClick={onClose}>Close</button>
              <button className="pin-submit" onClick={() => { setMode('new'); setName(''); setUsePin(false); setNewPin(''); setError('') }}>
                ＋ New Profile
              </button>
            </div>
          </>
        )}

        {mode === 'pin' && target && (
          <>
            <h3 className="profile-sheet-title">🔒 {target.name}'s PIN</h3>
            <input type="password" className="pin-input" placeholder="Enter PIN"
              value={pin} autoFocus
              onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter') submitPin() }}
              maxLength={8} inputMode="numeric" />
            {error && <div className="pin-error">{error}</div>}
            <div className="pin-actions">
              <button className="pin-cancel" onClick={() => setMode('list')}>Back</button>
              <button className="pin-submit" onClick={submitPin}>Unlock</button>
            </div>
          </>
        )}

        {mode === 'new' && (
          <>
            <h3 className="profile-sheet-title">🚀 New profile</h3>
            <input className="lock-input profile-name-input" placeholder="Name"
              value={name} autoFocus
              onChange={e => { setName(e.target.value); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
              maxLength={40} autoComplete="off" />
            <button className={`profile-toggle ${usePin ? 'on' : ''}`}
              onClick={() => { setUsePin(v => !v); setError('') }}>
              {usePin ? '🔐 PIN protection on' : '🔓 Add a PIN (optional)'}
            </button>
            {usePin && (
              <input type="password" className="lock-input" placeholder="Choose a PIN"
                value={newPin}
                onChange={e => { setNewPin(e.target.value.replace(/\D/g, '')); setError('') }}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                maxLength={8} inputMode="numeric" autoComplete="off" />
            )}
            {error && <div className="pin-error">{error}</div>}
            <div className="pin-actions">
              <button className="pin-cancel" onClick={() => (profiles.length ? setMode('list') : onClose())}>Cancel</button>
              <button className="pin-submit" onClick={handleCreate}>Create</button>
            </div>
          </>
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          message={`Delete "${pendingDelete.name}" and all of its entries? This cannot be undone.`}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
