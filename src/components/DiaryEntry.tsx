import { useState, useRef, useEffect } from 'react'
import type { DiaryEntry as EntryType } from '../services/storage'
import ConfirmDialog from './ConfirmDialog'
import { hapticTap } from '../services/utils'

interface Props {
  entry: EntryType
  onDelete: (id: string) => void
  onUpdate: (id: string, text: string) => void
  onShare: (entry: EntryType) => void
  onFavorite: (id: string) => void
  onExportDoc: (entry: EntryType) => void
}

export default function DiaryEntry({ entry, onDelete, onUpdate, onShare, onFavorite, onExportDoc }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(entry.romanizedText)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Audio Playback & Waveform Simulation State
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackProgress, setPlaybackProgress] = useState(0)
  const animRef = useRef<number>()

  const title = entry.romanizedText.split(/[.\n]/)[0]?.slice(0, 40) || 'Untitled'

  // Approximate duration: ~2.2 words per second (minimum 4s)
  const words = entry.romanizedText.trim().split(/\s+/).filter(Boolean).length
  const totalSeconds = Math.max(4, Math.round(words / 2.2))
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  // Cleanup speech synthesis on unmount
  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      window.speechSynthesis?.cancel()
    }
  }, [])

  const handleTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation()
    hapticTap()

    if (isPlaying) {
      window.speechSynthesis?.cancel()
      setIsPlaying(false)
      setPlaybackProgress(0)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    } else {
      if (!window.speechSynthesis) return
      window.speechSynthesis.cancel()

      const textToSpeak = entry.teluguText || entry.romanizedText
      const utterance = new SpeechSynthesisUtterance(textToSpeak)
      utterance.lang = entry.teluguText ? 'te-IN' : 'en-US'
      utterance.rate = 0.95

      const startTime = Date.now()
      const durationMs = totalSeconds * 1000

      const updateProgress = () => {
        const elapsed = Date.now() - startTime
        const prog = Math.min(100, (elapsed / durationMs) * 100)
        setPlaybackProgress(prog)
        if (prog < 100 && window.speechSynthesis.speaking) {
          animRef.current = requestAnimationFrame(updateProgress)
        }
      }

      utterance.onend = () => {
        setIsPlaying(false)
        setPlaybackProgress(0)
        if (animRef.current) cancelAnimationFrame(animRef.current)
      }
      utterance.onerror = () => {
        setIsPlaying(false)
        setPlaybackProgress(0)
        if (animRef.current) cancelAnimationFrame(animRef.current)
      }

      window.speechSynthesis.speak(utterance)
      setIsPlaying(true)
      animRef.current = requestAnimationFrame(updateProgress)
    }
  }

  const handleSaveEdit = () => {
    if (editText.trim()) { onUpdate(entry.id, editText.trim()); setEditing(false) }
  }

  return (
    <>
      {/* Grid card */}
      <div className="grid-card" onClick={() => { if (!editing) setExpanded(true) }}>
        <div className="grid-card-date">
          <span className="card-date-badge">📅 {entry.date}</span>
          <div className="card-header-right">
            <span className="voice-tag-pill">🎙️ Voice Memo</span>
            <button className="fav-star" onClick={e => { e.stopPropagation(); onFavorite(entry.id) }}>
              {entry.favorite ? '⭐' : '☆'}
            </button>
          </div>
        </div>

        <div className="grid-card-title">{title}</div>
        <div className="grid-card-preview">{entry.romanizedText}</div>

        {/* Inline Audio Player Bar on Card */}
        <div className={`voice-memo-player card-mini ${isPlaying ? 'playing' : ''}`} onClick={handleTogglePlay}>
          <button className={`player-play-btn mini ${isPlaying ? 'playing' : ''}`} aria-label={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? '⏸' : '▶'}
          </button>
          <div className="player-waveform mini">
            {[45, 80, 40, 95, 60, 100, 50, 75, 90, 60, 85, 40].map((h, i) => (
              <span
                key={i}
                className="waveform-stick"
                style={{
                  height: isPlaying ? `${Math.max(20, (h * (0.5 + Math.sin((i + playbackProgress) * 0.6) * 0.5)))}%` : `${h * 0.6}%`,
                  opacity: (i / 12) * 100 <= playbackProgress ? 1 : 0.4
                }}
              />
            ))}
          </div>
          <span className="player-time-badge mini">
            {isPlaying ? formatTime((playbackProgress / 100) * totalSeconds) : formatTime(totalSeconds)}
          </span>
        </div>

        <div className="grid-card-time">🕐 {entry.time}</div>
      </div>

      {/* Detail modal */}
      {expanded && (
        <div className="entry-overlay" onClick={() => { if (!editing) setExpanded(false) }}>
          <div className="entry-detail" onClick={e => e.stopPropagation()}>
            <div className="entry-detail-header">
              <div>
                <span className="entry-date">📅 {entry.date}</span>
                <span className="entry-time" style={{ marginLeft: 12 }}>🕐 {entry.time}</span>
              </div>
              <button className="entry-close-btn" onClick={() => setExpanded(false)}>✕</button>
            </div>

            {/* Full-width Voice Memo Player inside Modal */}
            <div className="modal-player-wrapper">
              <div className={`voice-memo-player full ${isPlaying ? 'playing' : ''}`}>
                <button
                  className={`player-play-btn ${isPlaying ? 'playing' : ''}`}
                  onClick={handleTogglePlay}
                  aria-label={isPlaying ? 'Pause voice memo' : 'Play voice memo'}
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>
                <div className="player-waveform">
                  {[35, 65, 45, 90, 55, 100, 40, 85, 70, 95, 60, 45, 80, 50, 90, 75, 40, 60, 30].map((h, i) => (
                    <span
                      key={i}
                      className="waveform-stick"
                      style={{
                        height: isPlaying ? `${Math.max(18, (h * (0.5 + Math.sin((i + playbackProgress) * 0.5) * 0.5)))}%` : `${h * 0.65}%`,
                        opacity: (i / 19) * 100 <= playbackProgress ? 1 : 0.4
                      }}
                    />
                  ))}
                </div>
                <div className="player-time-badge">
                  {isPlaying
                    ? `${formatTime((playbackProgress / 100) * totalSeconds)} / ${formatTime(totalSeconds)}`
                    : formatTime(totalSeconds)}
                </div>
              </div>
            </div>

            {editing ? (
              <textarea className="entry-edit-input" value={editText}
                onChange={e => setEditText(e.target.value)} autoFocus />
            ) : (
              <div className="entry-text">{entry.romanizedText}</div>
            )}

            {entry.teluguText && !editing && (
              <div className="entry-telugu">
                <div className="entry-telugu-label">Telugu Original</div>
                <div className="entry-telugu-text telugu-text">{entry.teluguText}</div>
              </div>
            )}

            <div className="entry-actions">
              {editing ? (
                <>
                  <button className="modern-btn save" onClick={handleSaveEdit}>
                    <span className="btn-icon">💾</span> Save
                  </button>
                  <button className="modern-btn cancel"
                    onClick={() => { setEditing(false); setEditText(entry.romanizedText) }}>
                    <span className="btn-icon">✕</span> Cancel
                  </button>
                </>
              ) : (
                <>
                  <button className="modern-btn edit" onClick={() => setEditing(true)}>
                    <span className="btn-icon">✏️</span> Edit
                  </button>
                  <button className="modern-btn share" onClick={() => onShare(entry)}>
                    <span className="btn-icon">📤</span> Share
                  </button>
                  <button className="modern-btn doc" onClick={() => onExportDoc(entry)}
                    title="Save as Google Doc / Word">
                    <span className="btn-icon">📄</span> Google Doc
                  </button>
                  <button className={`modern-btn ${entry.favorite ? 'fav-active' : ''}`}
                    onClick={() => onFavorite(entry.id)}>
                    <span className="btn-icon">{entry.favorite ? '⭐' : '☆'}</span> {entry.favorite ? 'Unfav' : 'Fav'}
                  </button>
                  <button className="modern-btn delete" onClick={() => setConfirmDelete(true)}>
                    <span className="btn-icon">🗑️</span> Delete
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          message="Are you sure you want to delete this entry? This action cannot be undone."
          onConfirm={() => { hapticTap(); onDelete(entry.id); setExpanded(false); setConfirmDelete(false) }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}
