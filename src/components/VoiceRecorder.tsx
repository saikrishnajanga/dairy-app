import { useSpeechToText } from '../hooks/useSpeechToText'

interface Props {
  onSave: (teluguText: string, romanizedText: string) => void
}

export default function VoiceRecorder({ onSave }: Props) {
  const {
    isListening, teluguText, romanizedText, interimText,
    error, startListening, stopListening, resetTranscript,
  } = useSpeechToText()

  const handleToggle = () => {
    if (isListening) stopListening()
    else { resetTranscript(); startListening() }
  }

  const handleSave = () => {
    if (romanizedText.trim()) {
      onSave(teluguText, romanizedText)
      resetTranscript()
    }
  }

  const hasContent = romanizedText.trim().length > 0

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
        {isListening ? '🔴 Recording Telugu (te-IN)' : 'Telugu speech → Romanized text'}
      </div>

      {error && <div className="error-box">⚠️ {error}</div>}

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
            <div className="preview-empty">Start speaking in Telugu...</div>
          )}
        </div>
      )}

      {hasContent && !isListening && (
        <button className="save-btn" onClick={handleSave}>💾 Save Entry</button>
      )}
    </div>
  )
}
