import { useState, useEffect, useRef, useCallback } from 'react'
import {
  createTextEntry, getTextEntries, updateTextEntry, deleteTextEntry,
  searchTextEntries, hasPinSet, setDiaryPin, verifyPin,
  type TextDiaryEntry,
} from '../services/textDiary'

export default function TextDiaryScreen() {
  const [entries, setEntries] = useState<TextDiaryEntry[]>([])
  const [search, setSearch] = useState('')
  const [activeEntry, setActiveEntry] = useState<TextDiaryEntry | null>(null)
  const [title, setTitle] = useState('')
  const [toast, setToast] = useState('')
  const [pinModal, setPinModal] = useState<{ action: string; entryId?: string } | null>(null)
  const [pinInput, setPinInput] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinError, setPinError] = useState('')
  const [fontSize, setFontSize] = useState(15)
  const [fontColor, setFontColor] = useState('#f0f0ff')
  const editorRef = useRef<HTMLDivElement>(null)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>()

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2000) }

  const loadEntries = useCallback(() => {
    setEntries(search ? searchTextEntries(search) : getTextEntries())
  }, [search])

  useEffect(() => { loadEntries() }, [loadEntries])

  // Auto-save every 30 seconds
  useEffect(() => {
    if (!activeEntry) return
    autoSaveTimer.current = setInterval(() => {
      if (editorRef.current && activeEntry) {
        updateTextEntry(activeEntry.id, {
          title: title || 'Untitled',
          content: editorRef.current.innerHTML,
        })
        showToast('💾 Auto-saved')
      }
    }, 30000)
    return () => clearInterval(autoSaveTimer.current)
  }, [activeEntry, title])

  const handleNew = () => {
    const entry = createTextEntry('Untitled Entry', '')
    setActiveEntry(entry); setTitle(entry.title)
    loadEntries()
    setTimeout(() => editorRef.current?.focus(), 100)
  }

  const handleOpen = (entry: TextDiaryEntry) => {
    // Check if locked
    if (entry.locked) {
      setPinModal({ action: 'unlock_view', entryId: entry.id })
      setPinInput(''); setPinError('')
      return
    }
    openEntry(entry)
  }

  const openEntry = (entry: TextDiaryEntry) => {
    if (activeEntry && editorRef.current) {
      updateTextEntry(activeEntry.id, { title, content: editorRef.current.innerHTML })
    }
    setActiveEntry(entry); setTitle(entry.title)
    setTimeout(() => {
      if (editorRef.current) editorRef.current.innerHTML = entry.content
    }, 50)
  }

  const handleSave = () => {
    if (!activeEntry || !editorRef.current) return
    updateTextEntry(activeEntry.id, {
      title: title || 'Untitled',
      content: editorRef.current.innerHTML,
    })
    loadEntries()
    showToast('✅ Saved!')
  }

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    deleteTextEntry(id)
    if (activeEntry?.id === id) { setActiveEntry(null); setTitle('') }
    loadEntries()
    showToast('🗑️ Deleted')
  }

  const handleBack = () => {
    if (activeEntry && editorRef.current) {
      updateTextEntry(activeEntry.id, { title, content: editorRef.current.innerHTML })
      loadEntries()
    }
    setActiveEntry(null); setTitle('')
  }

  const execCmd = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value)
    editorRef.current?.focus()
  }

  // ─── Lock/Unlock ───
  const handleLockToggle = () => {
    if (!activeEntry) return
    if (activeEntry.locked) {
      // Unlock
      updateTextEntry(activeEntry.id, { locked: false })
      setActiveEntry({ ...activeEntry, locked: false })
      showToast('🔓 Unlocked')
    } else {
      // Lock — need PIN
      if (!hasPinSet()) {
        setPinModal({ action: 'set_pin' })
        setPinInput(''); setPinConfirm(''); setPinError('')
      } else {
        updateTextEntry(activeEntry.id, { locked: true })
        setActiveEntry({ ...activeEntry, locked: true })
        showToast('🔒 Locked')
      }
    }
  }

  const handlePinSubmit = () => {
    if (pinModal?.action === 'set_pin') {
      if (pinInput.length < 4) { setPinError('PIN must be at least 4 digits'); return }
      if (pinInput !== pinConfirm) { setPinError('PINs do not match'); return }
      setDiaryPin(pinInput)
      if (activeEntry) {
        updateTextEntry(activeEntry.id, { locked: true })
        setActiveEntry({ ...activeEntry, locked: true })
      }
      setPinModal(null)
      showToast('🔒 PIN set & entry locked')
    } else if (pinModal?.action === 'unlock_view') {
      if (!verifyPin(pinInput)) { setPinError('Wrong PIN'); return }
      const entry = entries.find(e => e.id === pinModal.entryId)
      if (entry) openEntry(entry)
      setPinModal(null)
    }
  }

  // ─── Export PDF ───
  const handleExportPDF = async () => {
    if (!activeEntry || !editorRef.current) return
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF()
      doc.setFontSize(20)
      doc.text(title, 20, 25)
      doc.setFontSize(10)
      doc.setTextColor(128)
      doc.text(`${activeEntry.date} • ${activeEntry.time}`, 20, 33)
      doc.setFontSize(12)
      doc.setTextColor(0)
      const text = editorRef.current.innerText
      const lines = doc.splitTextToSize(text, 170)
      doc.text(lines, 20, 45)

      const { Capacitor } = await import('@capacitor/core')
      if (Capacitor.isNativePlatform()) {
        // Native: save to cache then share
        const { Filesystem, Directory } = await import('@capacitor/filesystem')
        const { Share } = await import('@capacitor/share')
        const base64 = doc.output('datauristring').split(',')[1]
        const fileName = `${title.replace(/\s+/g, '_')}.pdf`
        const result = await Filesystem.writeFile({
          path: fileName,
          data: base64,
          directory: Directory.Cache,
        })
        await Share.share({
          title: `${title} - VoiceDiary Pro`,
          url: result.uri,
        })
        showToast('📄 PDF ready to save!')
      } else {
        // Web: download
        doc.save(`${title.replace(/\s+/g, '_')}.pdf`)
        showToast('📄 PDF downloaded!')
      }
    } catch (e: any) { showToast('Export failed: ' + (e?.message || e)) }
  }

  // ─── Export Word ───
  const handleExportWord = async () => {
    if (!activeEntry || !editorRef.current) return
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
      <head><meta charset="utf-8"><title>${title}</title></head>
      <body>
        <h1>${title}</h1>
        <p style="color:gray">${activeEntry.date} • ${activeEntry.time}</p>
        <hr/>
        ${editorRef.current.innerHTML}
      </body></html>`

    try {
      const { Capacitor } = await import('@capacitor/core')
      if (Capacitor.isNativePlatform()) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem')
        const { Share } = await import('@capacitor/share')
        const fileName = `${title.replace(/\s+/g, '_')}.doc`
        const result = await Filesystem.writeFile({
          path: fileName,
          data: btoa(unescape(encodeURIComponent(html))),
          directory: Directory.Cache,
        })
        await Share.share({
          title: `${title} - VoiceDiary Pro`,
          url: result.uri,
        })
        showToast('📝 Word ready to save!')
      } else {
        const blob = new Blob([html], { type: 'application/msword' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `${title.replace(/\s+/g, '_')}.doc`; a.click()
        URL.revokeObjectURL(url)
        showToast('📝 Word downloaded!')
      }
    } catch (e: any) { showToast('Export failed: ' + (e?.message || e)) }
  }

  // ─── PIN Modal ───
  const renderPinModal = () => {
    if (!pinModal) return null
    return (
      <div className="pin-overlay" onClick={() => setPinModal(null)}>
        <div className="pin-modal" onClick={e => e.stopPropagation()}>
          <h3>{pinModal.action === 'set_pin' ? '🔐 Set Diary PIN' : '🔒 Enter PIN'}</h3>
          <input type="password" className="pin-input" placeholder="Enter PIN"
            value={pinInput} onChange={e => setPinInput(e.target.value)}
            maxLength={8} autoFocus />
          {pinModal.action === 'set_pin' && (
            <input type="password" className="pin-input" placeholder="Confirm PIN"
              value={pinConfirm} onChange={e => setPinConfirm(e.target.value)}
              maxLength={8} />
          )}
          {pinError && <div className="pin-error">{pinError}</div>}
          <div className="pin-actions">
            <button className="pin-cancel" onClick={() => setPinModal(null)}>Cancel</button>
            <button className="pin-submit" onClick={handlePinSubmit}>
              {pinModal.action === 'set_pin' ? 'Set PIN & Lock' : 'Unlock'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Editor View ───
  if (activeEntry) {
    return (
      <div className="tab-content editor-view">
        <div className="editor-header">
          <button className="back-btn" onClick={handleBack}>← Back</button>
          <div className="editor-actions">
            <button className="action-btn" onClick={handleLockToggle} title={activeEntry.locked ? 'Unlock' : 'Lock'}>
              {activeEntry.locked ? '🔓' : '🔒'}
            </button>
            <button className="action-btn" onClick={handleSave}>💾 Save</button>
            <button className="action-btn" onClick={handleExportPDF}>📄 PDF</button>
            <button className="action-btn" onClick={handleExportWord}>📝 Word</button>
          </div>
        </div>

        <input className="editor-title" value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Entry title..." />

        {/* Toolbar */}
        <div className="editor-toolbar">
          <button className="tool-btn" onClick={() => execCmd('bold')} title="Bold"><b>B</b></button>
          <button className="tool-btn" onClick={() => execCmd('italic')} title="Italic"><i>I</i></button>
          <button className="tool-btn" onClick={() => execCmd('underline')} title="Underline"><u>U</u></button>
          <button className="tool-btn" onClick={() => execCmd('strikeThrough')} title="Strikethrough"><s>S</s></button>
          <span className="tool-sep">|</span>
          <button className="tool-btn" onClick={() => execCmd('insertUnorderedList')}>• List</button>
          <button className="tool-btn" onClick={() => execCmd('insertOrderedList')}>1. List</button>
          <span className="tool-sep">|</span>
          <button className="tool-btn" onClick={() => execCmd('formatBlock', 'h2')}>H2</button>
          <button className="tool-btn" onClick={() => execCmd('formatBlock', 'h3')}>H3</button>
          <button className="tool-btn" onClick={() => execCmd('formatBlock', 'p')}>P</button>
          <button className="tool-btn" onClick={() => execCmd('formatBlock', 'blockquote')}>❝</button>
          <span className="tool-sep">|</span>
          <button className="tool-btn" onClick={() => execCmd('justifyLeft')}>⫷</button>
          <button className="tool-btn" onClick={() => execCmd('justifyCenter')}>≡</button>
          <button className="tool-btn" onClick={() => execCmd('justifyRight')}>⫸</button>
          <span className="tool-sep">|</span>
          <select className="tool-select" value={fontSize}
            onChange={e => { const s = Number(e.target.value); setFontSize(s); execCmd('fontSize', '3'); }}>
            <option value={12}>12px</option>
            <option value={15}>15px</option>
            <option value={18}>18px</option>
            <option value={22}>22px</option>
            <option value={28}>28px</option>
          </select>
          <input type="color" className="tool-color" value={fontColor}
            onChange={e => { setFontColor(e.target.value); execCmd('foreColor', e.target.value) }}
            title="Text Color" />
          <input type="color" className="tool-color" defaultValue="#ffff00"
            onChange={e => execCmd('hiliteColor', e.target.value)}
            title="Highlight" />
          <span className="tool-sep">|</span>
          <button className="tool-btn" onClick={() => execCmd('removeFormat')}>✕</button>
        </div>

        {/* Editor */}
        <div ref={editorRef} className="rich-editor" contentEditable suppressContentEditableWarning
          style={{ fontSize: `${fontSize}px` }}
          data-placeholder="Start writing your diary entry..." />

        <div className="editor-footer">
          <span className="auto-save-hint">Auto-saves every 30s</span>
          <span className="last-edited">Last edited: {new Date(activeEntry.lastEdited).toLocaleString('en-IN')}</span>
        </div>

        {renderPinModal()}
        {toast && <div className="mini-toast">{toast}</div>}
      </div>
    )
  }

  // ─── List View ───
  return (
    <div className="tab-content">
      <div className="diary-list-header">
        <button className="new-entry-btn" onClick={handleNew}>✏️ New Entry</button>
      </div>

      <div className="search-bar">
        <span className="search-icon">🔍</span>
        <input className="search-input" value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search diary entries..." />
        {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
      </div>

      {entries.length > 0 && (
        <div className="list-header">
          <span className="entry-count">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-emoji">✍️</div>
          <div className="empty-title">No diary entries yet</div>
          <div className="empty-desc">Tap "New Entry" to start writing</div>
        </div>
      ) : (
        entries.map(entry => (
          <div key={entry.id} className="entry-card" onClick={() => handleOpen(entry)}>
            <div className="entry-meta">
              <span className="entry-date">📅 {entry.date}</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {entry.locked && <span title="Locked">🔒</span>}
                <span className="entry-time">🕐 {entry.time}</span>
              </div>
            </div>
            <div className="text-entry-title">{entry.title}</div>
            {entry.locked ? (
              <div className="entry-text truncated" style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
                🔒 This entry is locked. Tap to unlock.
              </div>
            ) : (
              <div className="entry-text truncated">
                {entry.content.replace(/<[^>]*>/g, '').slice(0, 120) || 'Empty entry'}
              </div>
            )}
            <button className="entry-card-delete" onClick={e => handleDelete(entry.id, e)}>🗑️</button>
          </div>
        ))
      )}

      {renderPinModal()}
      {toast && <div className="mini-toast">{toast}</div>}
    </div>
  )
}
