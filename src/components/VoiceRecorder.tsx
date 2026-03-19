import { useState } from 'react'
import { useSpeechToText } from '../hooks/useSpeechToText'
import { transliterate } from '../services/transliterator'

interface Props {
  onSave: (teluguText: string, romanizedText: string) => void
}

export default function VoiceRecorder({ onSave }: Props) {
  const {
    isListening, teluguText, romanizedText, interimText,
    error, needsPermission, startListening, stopListening,
    clearTranscript, requestPermission,
  } = useSpeechToText()

  // Text-based transliteration input
  const [teluguInput, setTeluguInput] = useState('')
  const [showTextInput, setShowTextInput] = useState(false)

  const handleToggle = () => {
    if (isListening) stopListening()
    else startListening() // No reset — appends to existing text
  }

  const handleSave = () => {
    // Combine voice text with manually entered transliteration
    const combinedTelugu = [teluguText, teluguInput].filter(Boolean).join(' ')
    const combinedRoman = [romanizedText, teluguInput ? transliterate(teluguInput) : ''].filter(Boolean).join(' ')

    if (combinedRoman.trim()) {
      onSave(combinedTelugu.trim(), combinedRoman.trim())
      clearTranscript()
      setTeluguInput('')
    }
  }

  const handleClear = () => {
    clearTranscript()
    setTeluguInput('')
  }

  const hasContent = romanizedText.trim().length > 0 || teluguInput.trim().length > 0

  return (
    <div className={`recorder ${isListening ? 'recording' : ''}`}>
      <div className="recorder-header">
        <span>🎙️</span>
        <span>{isListening ? 'Listening...' : 'Tap to Record'}</span>
        {isListening && (
          <div className="wave-bars">
            {[...Array(5)].map((_, i) => <div key={i} className="wave-bar" />)}
          </div>
        )}
      </div>

      <div className="record-btn-container">
        {isListening && <div className="record-glow" />}
        <button
          className={`record-btn ${isListening ? 'active' : 'idle'}`}
          onClick={handleToggle}
          aria-label={isListening ? 'Stop recording' : 'Start recording'}
        >
          {isListening ? '⏹' : '🎤'}
        </button>
      </div>

      <div className={`recorder-status ${isListening ? 'active' : ''}`}>
        {isListening ? '🔴 Recording Telugu (te-IN) — speaks are appended' : 'Telugu speech → Romanized text'}
      </div>

      {error && <div className="error-box">⚠️ {error}</div>}

      {needsPermission && (
        <button className="permission-btn" onClick={requestPermission}>
          🎤 Grant Microphone Permission
        </button>
      )}

      {/* Live preview */}
      {(hasContent || isListening) && (
        <div className="preview">
          {romanizedText ? (
            <>
              <div className="preview-label">Romanized</div>
              <div className="preview-text">
                {romanizedText}
                {interimText && <span className="preview-interim"> {interimText}</span>}
              </div>
              {teluguText && (
                <>
                  <div className="preview-telugu-label">Telugu</div>
                  <div className="preview-telugu telugu-text">{teluguText}</div>
                </>
              )}
            </>
          ) : (
            !teluguInput && <div className="preview-empty">Start speaking in Telugu...</div>
          )}
        </div>
      )}

      {/* Text-based transliteration input */}
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
            placeholder="Paste Telugu text here... (e.g. నాకు చాలా ఆనందంగా ఉంది)"
            rows={3}
          />
          {teluguInput.trim() && (
            <div className="translit-preview">
              <div className="preview-label">Transliterated</div>
              <div className="preview-text">{transliterate(teluguInput)}</div>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="recorder-actions">
        {hasContent && !isListening && (
          <>
            <button className="modern-btn save" onClick={handleSave}>
              <span className="btn-icon">💾</span> Save Entry
            </button>
            <button className="modern-btn cancel" onClick={handleClear}>
              <span className="btn-icon">🗑️</span> Clear
            </button>
          </>
        )}
      </div>
    </div>
  )
}
