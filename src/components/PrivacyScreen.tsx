import { useState } from 'react'
import {
  hasAppLock, hasAppPinSet, setAppPin, removeAppLock,
  isAutoLockEnabled, setAutoLock, verifyAppPin,
} from '../services/security'

interface Props {
  onBack: () => void
  showToast: (msg: string) => void
}

export default function PrivacyScreen({ onBack, showToast }: Props) {
  const [appLockEnabled, setAppLockEnabled] = useState(hasAppLock())
  const [autoLock, setAutoLockState] = useState(isAutoLockEnabled())
  const [showPinSetup, setShowPinSetup] = useState(false)
  const [showChangePinModal, setShowChangePinModal] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState('')

  const handleToggleAppLock = () => {
    if (appLockEnabled) {
      removeAppLock()
      setAppLockEnabled(false)
      showToast('🔓 App lock disabled')
    } else {
      if (hasAppPinSet()) {
        // Re-enable with existing PIN
        localStorage.setItem('vd_app_lock_enabled', 'true')
        setAppLockEnabled(true)
        showToast('🔒 App lock enabled')
      } else {
        setShowPinSetup(true)
      }
    }
  }

  const handleSetPin = () => {
    if (newPin.length < 4) { setPinError('PIN must be at least 4 digits'); return }
    if (newPin !== confirmPin) { setPinError('PINs do not match'); return }
    setAppPin(newPin)
    setAppLockEnabled(true)
    setShowPinSetup(false)
    setNewPin('')
    setConfirmPin('')
    setPinError('')
    showToast('🔒 App lock enabled with PIN')
  }

  const handleChangePin = () => {
    if (!verifyAppPin(currentPin)) { setPinError('Current PIN is wrong'); return }
    if (newPin.length < 4) { setPinError('New PIN must be at least 4 digits'); return }
    if (newPin !== confirmPin) { setPinError('PINs do not match'); return }
    setAppPin(newPin)
    setShowChangePinModal(false)
    setCurrentPin('')
    setNewPin('')
    setConfirmPin('')
    setPinError('')
    showToast('🔑 PIN changed successfully')
  }

  const handleToggleAutoLock = () => {
    const next = !autoLock
    setAutoLock(next)
    setAutoLockState(next)
    showToast(next ? '🔒 Auto-lock ON' : '🔓 Auto-lock OFF')
  }

  return (
    <div className="privacy-screen tab-content">
      <div className="privacy-header">
        <button className="action-btn" onClick={onBack}>← Back</button>
        <h2 className="privacy-title">🛡️ Security & Privacy</h2>
      </div>

      {/* App Lock Section */}
      <div className="privacy-section">
        <div className="privacy-section-title">🔒 App Lock</div>

        <div className="privacy-item" onClick={handleToggleAppLock}>
          <div className="privacy-item-info">
            <span className="privacy-item-label">App Lock</span>
            <span className="privacy-item-desc">Require PIN to open the app</span>
          </div>
          <div className={`toggle-switch ${appLockEnabled ? 'active' : ''}`}>
            <div className="toggle-knob" />
          </div>
        </div>

        {appLockEnabled && (
          <>
            <div className="privacy-item" onClick={handleToggleAutoLock}>
              <div className="privacy-item-info">
                <span className="privacy-item-label">Auto-Lock</span>
                <span className="privacy-item-desc">Lock when you leave the app</span>
              </div>
              <div className={`toggle-switch ${autoLock ? 'active' : ''}`}>
                <div className="toggle-knob" />
              </div>
            </div>

            <div className="privacy-item" onClick={() => {
              setShowChangePinModal(true)
              setCurrentPin('')
              setNewPin('')
              setConfirmPin('')
              setPinError('')
            }}>
              <div className="privacy-item-info">
                <span className="privacy-item-label">Change PIN</span>
                <span className="privacy-item-desc">Update your app lock PIN</span>
              </div>
              <span className="privacy-item-arrow">→</span>
            </div>
          </>
        )}
      </div>

      {/* Data Protection Section */}
      <div className="privacy-section">
        <div className="privacy-section-title">🔐 Data Protection</div>
        <div className="privacy-item">
          <div className="privacy-item-info">
            <span className="privacy-item-label">Local Storage</span>
            <span className="privacy-item-desc">All data is stored locally on your device</span>
          </div>
          <span className="privacy-badge">✅ Secure</span>
        </div>
        <div className="privacy-item">
          <div className="privacy-item-info">
            <span className="privacy-item-label">Encryption</span>
            <span className="privacy-item-desc">Diary entries are encrypted at rest</span>
          </div>
          <span className="privacy-badge">✅ Active</span>
        </div>
        <div className="privacy-item">
          <div className="privacy-item-info">
            <span className="privacy-item-label">No Cloud Sync</span>
            <span className="privacy-item-desc">Your data never leaves this device</span>
          </div>
          <span className="privacy-badge">✅ Private</span>
        </div>
      </div>

      {/* Privacy Info Section */}
      <div className="privacy-section">
        <div className="privacy-section-title">📋 Privacy Policy</div>
        <div className="privacy-policy-box">
          <p><strong>VoiceDiary Pro</strong> is committed to protecting your privacy.</p>
          <ul>
            <li>🔒 <strong>No data collection</strong> — We don't collect any personal data</li>
            <li>📱 <strong>Offline-first</strong> — All data stays on your device</li>
            <li>🚫 <strong>No analytics</strong> — No tracking or telemetry</li>
            <li>🔐 <strong>Encrypted storage</strong> — Your entries are encrypted locally</li>
            <li>🗑️ <strong>Full control</strong> — Delete your data anytime from the app</li>
            <li>🎤 <strong>Microphone access</strong> — Used only for voice recording, never recorded in background</li>
          </ul>
          <p className="privacy-version">Version 1.0 • Last updated: March 2026</p>
        </div>
      </div>

      {/* PIN Setup Modal */}
      {showPinSetup && (
        <div className="pin-overlay" onClick={() => setShowPinSetup(false)}>
          <div className="pin-modal" onClick={e => e.stopPropagation()}>
            <h3>🔐 Set App PIN</h3>
            <input type="password" className="pin-input" placeholder="New PIN"
              value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
              maxLength={8} inputMode="numeric" autoFocus />
            <input type="password" className="pin-input" placeholder="Confirm PIN"
              value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              maxLength={8} inputMode="numeric" />
            {pinError && <div className="pin-error">{pinError}</div>}
            <div className="pin-actions">
              <button className="pin-cancel" onClick={() => setShowPinSetup(false)}>Cancel</button>
              <button className="pin-submit" onClick={handleSetPin}>Set PIN</button>
            </div>
          </div>
        </div>
      )}

      {/* Change PIN Modal */}
      {showChangePinModal && (
        <div className="pin-overlay" onClick={() => setShowChangePinModal(false)}>
          <div className="pin-modal" onClick={e => e.stopPropagation()}>
            <h3>🔑 Change PIN</h3>
            <input type="password" className="pin-input" placeholder="Current PIN"
              value={currentPin} onChange={e => setCurrentPin(e.target.value.replace(/\D/g, ''))}
              maxLength={8} inputMode="numeric" autoFocus />
            <input type="password" className="pin-input" placeholder="New PIN"
              value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
              maxLength={8} inputMode="numeric" />
            <input type="password" className="pin-input" placeholder="Confirm New PIN"
              value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              maxLength={8} inputMode="numeric" />
            {pinError && <div className="pin-error">{pinError}</div>}
            <div className="pin-actions">
              <button className="pin-cancel" onClick={() => setShowChangePinModal(false)}>Cancel</button>
              <button className="pin-submit" onClick={handleChangePin}>Update PIN</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
