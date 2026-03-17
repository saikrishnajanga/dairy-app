import { useState, useCallback, useRef } from 'react'
import {
  translate, LANGUAGES, SPEECH_LANG_MAP,
  saveTranslation, getSavedTranslations, deleteTranslation,
  type SavedTranslation, type Language,
} from '../services/translator'

export default function TranslatorScreen() {
  const [sourceLang, setSourceLang] = useState<Language>(LANGUAGES[0]) // Telugu
  const [targetLang, setTargetLang] = useState<Language>(LANGUAGES[1]) // English
  const [sourceText, setSourceText] = useState('')
  const [translatedText, setTranslatedText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<SavedTranslation[]>(getSavedTranslations())
  const [showSaved, setShowSaved] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [toast, setToast] = useState('')
  const recRef = useRef<SpeechRecognition | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2000) }

  const handleTranslate = useCallback(async (text?: string) => {
    const t = text || sourceText
    if (!t.trim()) return
    setLoading(true); setError(null)
    try {
      const result = await translate(t, sourceLang.code, targetLang.code)
      setTranslatedText(result.translatedText)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Translation failed')
    }
    setLoading(false)
  }, [sourceText, sourceLang, targetLang])

  const handleSwap = () => {
    setSourceLang(targetLang); setTargetLang(sourceLang)
    setSourceText(translatedText); setTranslatedText(sourceText)
  }

  const handleSave = () => {
    if (!sourceText.trim() || !translatedText.trim()) return
    saveTranslation({
      sourceLang: sourceLang.code, targetLang: targetLang.code,
      sourceText, translatedText,
    })
    setSaved(getSavedTranslations())
    showToast('✅ Translation saved!')
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(translatedText)
      showToast('📋 Copied!')
    } catch { showToast('Copy failed') }
  }

  const handleDelete = (id: string) => {
    deleteTranslation(id)
    setSaved(getSavedTranslations())
    showToast('🗑️ Deleted')
  }

  const handleVoiceInput = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setError('Speech not supported. Use Chrome/Edge.'); return }

    if (isListening) {
      recRef.current?.stop(); setIsListening(false); return
    }

    const rec = new SR()
    rec.lang = SPEECH_LANG_MAP[sourceLang.code] || 'en-US'
    rec.continuous = false; rec.interimResults = false

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0][0].transcript
      setSourceText(text)
      handleTranslate(text)
    }
    rec.onend = () => setIsListening(false)
    rec.onerror = () => { setIsListening(false); setError('Voice input failed') }
    recRef.current = rec; rec.start(); setIsListening(true)
  }

  return (
    <div className="tab-content">
      {/* Language Selectors */}
      <div className="translator-langs">
        <div className="lang-selector">
          <label className="lang-label">From</label>
          <select className="lang-select"
            value={sourceLang.code}
            onChange={e => setSourceLang(LANGUAGES.find(l => l.code === e.target.value)!)}
          >
            {LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.flag} {l.name}</option>
            ))}
          </select>
        </div>

        <button className="swap-btn" onClick={handleSwap} title="Swap languages">⇄</button>

        <div className="lang-selector">
          <label className="lang-label">To</label>
          <select className="lang-select"
            value={targetLang.code}
            onChange={e => setTargetLang(LANGUAGES.find(l => l.code === e.target.value)!)}
          >
            {LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.flag} {l.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Source Input */}
      <div className="trans-box">
        <div className="trans-box-header">
          <span className="trans-box-label">{sourceLang.flag} {sourceLang.name}</span>
          <button className={`voice-input-btn ${isListening ? 'active' : ''}`}
            onClick={handleVoiceInput}>
            {isListening ? '⏹ Stop' : '🎤 Speak'}
          </button>
        </div>
        <textarea
          className="trans-textarea"
          value={sourceText}
          onChange={e => setSourceText(e.target.value)}
          placeholder={`Type or speak in ${sourceLang.name}...`}
          rows={4}
        />
        <div className="trans-box-footer">
          <span className="char-count">{sourceText.length} chars</span>
          <button className="translate-btn" onClick={() => handleTranslate()} disabled={loading || !sourceText.trim()}>
            {loading ? '⏳ Translating...' : '🌐 Translate'}
          </button>
        </div>
      </div>

      {error && <div className="error-box">⚠️ {error}</div>}

      {/* Translation Result */}
      {translatedText && (
        <div className="trans-box result">
          <div className="trans-box-header">
            <span className="trans-box-label">{targetLang.flag} {targetLang.name}</span>
            <div className="trans-result-actions">
              <button className="icon-btn" onClick={handleCopy} title="Copy">📋</button>
              <button className="icon-btn" onClick={handleSave} title="Save">💾</button>
            </div>
          </div>
          <div className="trans-result-text">{translatedText}</div>
        </div>
      )}

      {/* Popular Pairs */}
      <div className="quick-pairs">
        <span className="quick-label">Quick:</span>
        {[
          { s: 'te', t: 'en', label: 'Telugu→English' },
          { s: 'hi', t: 'en', label: 'Hindi→English' },
          { s: 'en', t: 'te', label: 'English→Telugu' },
          { s: 'en', t: 'hi', label: 'English→Hindi' },
        ].map(p => (
          <button key={p.label} className="quick-pair-btn"
            onClick={() => {
              setSourceLang(LANGUAGES.find(l => l.code === p.s)!)
              setTargetLang(LANGUAGES.find(l => l.code === p.t)!)
            }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Saved Translations */}
      <div className="saved-section">
        <button className="saved-toggle" onClick={() => setShowSaved(!showSaved)}>
          📑 Saved Translations ({saved.length}) {showSaved ? '▲' : '▼'}
        </button>
        {showSaved && (
          <div className="saved-list">
            {saved.length === 0 ? (
              <div className="empty-small">No saved translations yet</div>
            ) : saved.map(s => (
              <div key={s.id} className="saved-item">
                <div className="saved-item-langs">
                  {LANGUAGES.find(l => l.code === s.sourceLang)?.flag} → {LANGUAGES.find(l => l.code === s.targetLang)?.flag}
                  <span className="saved-date">{s.date}</span>
                </div>
                <div className="saved-source">{s.sourceText}</div>
                <div className="saved-target">{s.translatedText}</div>
                <button className="saved-delete" onClick={() => handleDelete(s.id)}>🗑️</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && <div className="mini-toast">{toast}</div>}
    </div>
  )
}
