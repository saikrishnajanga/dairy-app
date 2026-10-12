import { useState, useRef, useEffect, useCallback } from 'react'
import { useSpeechToText } from '../hooks/useSpeechToText'
import { transliterate, countWords } from '../services/transliterator'
import { hapticTap } from '../services/utils'

interface Props {
  onSave: (teluguText: string, romanizedText: string) => void
}

/**
 * Detect browser speech recognition support and return a user-friendly message.
 * This helps users understand why voice recording may not work.
 */
function getBrowserSupportInfo(): { supported: boolean; message: string } {
  const ua = navigator.userAgent
  const isChrome = /Chrome\//.test(ua) && !/Edge\//.test(ua) && !/OPR\//.test(ua)
  const isEdge = /Edg\//.test(ua)
  const isFirefox = /Firefox\//.test(ua)
  const isSafari = /Safari\//.test(ua) && !/Chrome\//.test(ua)
  const isIOS = /iPad|iPhone|iPod/.test(ua)

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (SR) {
    if (isSafari || isIOS) {
      return {
        supported: true,
        message: 'Safari speech recognition may have limited Telugu support. For best results, use Chrome.',
      }
    }
    return { supported: true, message: '' }
  }

  if (isFirefox) {
    return {
      supported: false,
      message: 'Firefox does not support speech recognition. Please use Google Chrome or Microsoft Edge.',
    }
  }
  if (isSafari) {
    return {
      supported: false,
      message: 'This version of Safari does not support speech recognition. Update Safari or use Chrome.',
    }
  }
  return {
    supported: false,
    message: 'Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.',
  }
}

export default function VoiceRecorder({ onSave }: Props) {
  const {
    isListening, isRestarting, teluguText, romanizedText, interimTelugu, interimText,
    status, error, needsPermission, chunkCount, isEdited,
    startListening, stopListening, clearTranscript, requestPermission,
    editTranscript,
  } = useSpeechToText()

  // Text-based transliteration input
  const [teluguInput, setTeluguInput] = useState('')
  const [showTextInput, setShowTextInput] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isEditingTranscript, setIsEditingTranscript] = useState(false)
  const [editedRomanText, setEditedRomanText] = useState('')

  // Browser compatibility
  const [browserInfo] = useState(() => getBrowserSupportInfo())

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null)

  // The transcript as the user sees it: spoken-so-far + live tail
  const visibleTelugu = [teluguText, interimTelugu].filter(Boolean).join(' ')
  const displayRoman = isEdited ? romanizedText : romanizedText
  const visibleRoman = [displayRoman, interimText].filter(Boolean).join(' ')
  const manualRoman = teluguInput.trim() ? transliterate(teluguInput) : ''
  const hasContent = visibleRoman.trim().length > 0 || teluguInput.trim().length > 0

  // Keep the newest words in view while dictating
  useEffect(() => {
    const el = scrollRef.current
    if (el && isListening) el.scrollTop = el.scrollHeight
  }, [visibleRoman, isListening])

  // Sync editedRomanText when entering edit mode
  useEffect(() => {
    if (isEditingTranscript) {
      setEditedRomanText(romanizedText)
    }
  }, [isEditingTranscript, romanizedText])

  // Auto-resize the edit textarea
  useEffect(() => {
    if (editTextareaRef.current && isEditingTranscript) {
      const ta = editTextareaRef.current
      ta.style.height = 'auto'
      ta.style.height = `${ta.scrollHeight}px`
    }
  }, [editedRomanText, isEditingTranscript])

  const handleToggle = useCallback(() => {
    hapticTap()
    if (isListening) stopListening()
    else startListening() // appends to the existing transcript
  }, [isListening, stopListening, startListening])

  const [selectedMood, setSelectedMood] = useState<string | null>(null)
  const [elapsedSecs, setElapsedSecs] = useState(0)

  // Live timer while dictating voice notes
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    if (isListening) {
      timer = setInterval(() => {
        setElapsedSecs(s => s + 1)
      }, 1000)
    } else {
      setElapsedSecs(0)
      if (timer) clearInterval(timer)
    }
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [isListening])

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0')
    const s = (sec % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }
  const todayStr = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long', day: 'numeric', month: 'short'
  }).format(new Date())

  const MOODS = [
    { emoji: '😊', label: 'Joy' },
    { emoji: '😌', label: 'Calm' },
    { emoji: '💭', label: 'Reflective' },
    { emoji: '🙏', label: 'Grateful' },
    { emoji: '⚡', label: 'Inspired' },
    { emoji: '🌧️', label: 'Heavy' },
  ]

  const handleSave = () => {
    const moodPrefix = selectedMood ? `[${selectedMood}] ` : ''
    const combinedTelugu = [visibleTelugu, teluguInput].filter(Boolean).join(' ')
    const finalRoman = isEditingTranscript ? editedRomanText : visibleRoman
    const combinedRoman = [moodPrefix + finalRoman, manualRoman].filter(Boolean).join(' ')
    if (combinedRoman.trim()) {
      onSave(combinedTelugu.trim(), combinedRoman.trim())
      clearTranscript()
      setTeluguInput('')
      setSelectedMood(null)
      setIsEditingTranscript(false)
      setEditedRomanText('')
    }
  }

  const handleClear = () => {
    hapticTap()
    clearTranscript()
    setTeluguInput('')
    setSelectedMood(null)
    setIsEditingTranscript(false)
    setEditedRomanText('')
  }

  const handleCopy = async () => {
    const text = isEditingTranscript
      ? [editedRomanText, manualRoman].filter(Boolean).join(' ').trim()
      : [visibleRoman, manualRoman].filter(Boolean).join(' ').trim()
    if (!text) return
    hapticTap()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Fallback for browsers/WebViews without the async clipboard API
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      } catch { /* nothing else we can do */ }
    }
  }

  const handleEditToggle = () => {
    if (isEditingTranscript) {
      // Save edits — apply the edited roman text
      editTranscript(editedRomanText)
      setIsEditingTranscript(false)
    } else {
      // Enter edit mode
      setEditedRomanText(romanizedText)
      setIsEditingTranscript(true)
    }
  }

  const wordTotal = countWords(isEditingTranscript ? editedRomanText : visibleRoman)

  return (
    <div className={`recorder ${isListening ? 'recording' : ''}`}>
      {/* Emotional Journal Prompt Banner */}
      <div className="recorder-prompt-card">
        <div className="prompt-meta">
          <span className="prompt-date">📅 {todayStr}</span>
          <span className="prompt-greeting">{getGreeting()}</span>
        </div>
        <h2 className="prompt-heading">Capture what you're feeling.</h2>
        <p className="prompt-subtext">Speak naturally in Telugu. Instant phonetic English script.</p>

        {/* Browser Compatibility Notice */}
        {!browserInfo.supported && (
          <div className="browser-compat-warning">
            ⚠️ {browserInfo.message}
          </div>
        )}
        {browserInfo.supported && browserInfo.message && (
          <div className="browser-compat-info">
            ℹ️ {browserInfo.message}
          </div>
        )}

        {/* Mood Selector */}
        <div className="mood-chips" aria-label="Select your mood">
          {MOODS.map(m => (
            <button
              key={m.label}
              type="button"
              className={`mood-chip ${selectedMood === m.label ? 'selected' : ''}`}
              onClick={() => setSelectedMood(selectedMood === m.label ? null : m.label)}
            >
              <span className="mood-emoji">{m.emoji}</span>
              <span className="mood-text">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="record-center-stage">
        <div className="record-btn-container">
          {isListening && (
            <div className="tactile-pulse-rings">
              <span className="pulse-ring ring-1" />
              <span className="pulse-ring ring-2" />
            </div>
          )}
          <button
            className={`record-btn tactile-mic ${isListening ? 'active' : 'idle'}`}
            onClick={handleToggle}
            disabled={!browserInfo.supported}
            aria-label={isListening ? 'Stop recording' : 'Start recording'}
          >
            <div className="mic-icon-wrapper">
              {isListening ? (
                <span className="mic-symbol stop-square">⏹</span>
              ) : (
                <span className="mic-symbol">🎙️</span>
              )}
            </div>
            <span className="mic-label">
              {isListening ? 'Tap to Stop' : 'Tap to Speak'}
            </span>
          </button>
        </div>

        {isListening ? (
          <div className="recording-active-controls">
            <div className="live-wave-indicator">
              <span className="recording-dot-pulse" />
              <span className="recording-timer-badge">{formatElapsed(elapsedSecs)}</span>
              <span className="recording-live-text">Listening to Telugu…</span>
              <div className="wave-bars">
                {[...Array(6)].map((_, i) => <div key={i} className="wave-bar" />)}
              </div>
            </div>

            <button
              type="button"
              className="stop-recording-banner-btn"
              onClick={(e) => {
                e.stopPropagation();
                hapticTap();
                stopListening();
              }}
              aria-label="Stop recording now"
            >
              <span className="stop-banner-icon">⏹</span>
              <span className="stop-banner-text">Stop Recording</span>
            </button>
          </div>
        ) : (
          <div className="recorder-hint">
            <span>Telugu speech → Romanized English script</span>
          </div>
        )}
      </div>

      {/* Transient, non-intrusive status (pauses, retries, restored draft) */}
      {status && !error && <div className="status-hint">{status}</div>}

      {error && <div className="error-box">⚠️ {error}</div>}

      {needsPermission && (
        <button className="permission-btn" onClick={requestPermission}>
          🎤 Grant Microphone Permission
        </button>
      )}

      {/* ─── Live transcript (voice only — pasted text has its own preview) ─── */}
      {(visibleRoman || isListening || isEditingTranscript) && (
        <div className="transcript-panel">
          <div className="transcript-toolbar">
            <span className="transcript-title">
              {isEditingTranscript ? 'Editing Transcript' : 'Romanized (English letters)'}
            </span>
            <div className="transcript-toolbar-actions">
              {!isListening && visibleRoman && (
                <button
                  className={`transcript-edit-btn ${isEditingTranscript ? 'editing' : ''}`}
                  onClick={handleEditToggle}
                  aria-label={isEditingTranscript ? 'Save edits' : 'Edit transcript'}
                >
                  {isEditingTranscript ? '✅ Done' : '✏️ Edit'}
                </button>
              )}
              {isListening && (
                <span className="live-badge">
                  <span className="live-dot" />
                  {isRestarting ? 'Resuming' : 'Live'}
                </span>
              )}
            </div>
          </div>

          {isEditingTranscript ? (
            <div className="transcript-edit-area">
              <textarea
                ref={editTextareaRef}
                className="transcript-edit-textarea"
                value={editedRomanText}
                onChange={e => setEditedRomanText(e.target.value)}
                placeholder="Edit your transcript here…"
                autoFocus
              />
              <div className="transcript-edit-hint">
                ✏️ Fix any recognition errors. Your edits will be preserved when you save.
              </div>
            </div>
          ) : (
            <div className="transcript-scroll" ref={scrollRef}>
              {visibleRoman ? (
                <div className="preview-text">
                  {displayRoman}
                  {interimText && <span className="preview-interim"> {interimText}</span>}
                </div>
              ) : (
                <div className="preview-empty">Start speaking in Telugu…</div>
              )}
            </div>
          )}

          <div className="transcript-meta">
            <span>{wordTotal} words</span>
            <span>{(isEditingTranscript ? editedRomanText : visibleRoman).length} characters</span>
            {chunkCount > 0 && <span>{chunkCount} chunks merged</span>}
            {isEdited && <span className="edited-badge">✏️ edited</span>}
          </div>

          {visibleTelugu && !isEditingTranscript && (
            <>
              <div className="preview-telugu-label">Telugu (what was heard)</div>
              <div className="preview-telugu telugu-text">{visibleTelugu}</div>
            </>
          )}
        </div>
      )}

      {/* ─── Transcript controls ─── */}
      {(hasContent || isListening) && (
        <div className="recorder-actions">
          {isListening ? (
            <button className="modern-btn delete" onClick={() => { hapticTap(); stopListening() }}>
              <span className="btn-icon">⏹</span> Stop
            </button>
          ) : (
            <button
              className="modern-btn edit"
              onClick={handleToggle}
              disabled={!browserInfo.supported}
            >
              <span className="btn-icon">🎤</span> Continue
            </button>
          )}
          <button
            className="modern-btn share"
            onClick={handleCopy}
            disabled={!visibleRoman.trim() && !editedRomanText.trim()}
          >
            <span className="btn-icon">{copied ? '✅' : '📋'}</span> {copied ? 'Copied!' : 'Copy'}
          </button>
          <button className="modern-btn cancel" onClick={handleClear}>
            <span className="btn-icon">🗑️</span> Clear
          </button>
        </div>
      )}

      {hasContent && !isListening && (
        <div className="recorder-actions">
          <button className="modern-btn save" onClick={handleSave}>
            <span className="btn-icon">💾</span> Save Entry
          </button>
        </div>
      )}

      {/* ─── Text-based transliteration input ─── */}
      <button
        className="translit-toggle-btn"
        onClick={() => setShowTextInput(!showTextInput)}
      >
        🔤 {showTextInput ? 'Hide' : 'Paste Telugu Text'}
        <span className="toggle-arrow">{showTextInput ? '▲' : '▼'}</span>
      </button>

      {showTextInput && (
        <div className="translit-input-section">
          <textarea
            className="translit-textarea"
            value={teluguInput}
            onChange={e => setTeluguInput(e.target.value)}
            placeholder="Paste Telugu text here… (e.g. నాకు చాలా ఆనందంగా ఉంది)"
            rows={3}
          />
          {teluguInput.trim() && (
            <div className="translit-preview">
              <div className="preview-label">Transliterated</div>
              <div className="preview-text">{manualRoman}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
