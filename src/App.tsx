import { useState, useCallback, useEffect } from 'react'
import VoiceRecorder from './components/VoiceRecorder'
import DiaryList from './components/DiaryList'
import TranslatorScreen from './components/TranslatorScreen'
import TextDiaryScreen from './components/TextDiaryScreen'
import AppLock from './components/AppLock'
import PrivacyScreen from './components/PrivacyScreen'
import {
  saveEntry, getEntries, deleteEntry, updateEntry,
  searchEntries, exportEntries, DiaryEntry,
} from './services/storage'

type Tab = 'home' | 'translate' | 'diary' | 'privacy'

function useToast() {
  const [msg, setMsg] = useState('')
  const [visible, setVisible] = useState(false)
  const show = useCallback((m: string) => {
    setMsg(m); setVisible(true)
    setTimeout(() => setVisible(false), 2500)
  }, [])
  return { msg, visible, show }
}

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [sortNewest, setSortNewest] = useState(true)
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('vd_theme') as 'dark' | 'light') || 'dark'
  )
  const toast = useToast()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('vd_theme', theme)
  }, [theme])

  const loadEntries = useCallback(() => {
    const data = searchQuery ? searchEntries(searchQuery) : getEntries()
    setEntries(sortNewest ? data : [...data].reverse())
  }, [searchQuery, sortNewest])

  useEffect(() => { loadEntries() }, [loadEntries])

  const handleSave = (teluguText: string, romanizedText: string) => {
    saveEntry(teluguText, romanizedText)
    loadEntries()
    toast.show('✅ Entry saved!')
  }

  const handleDelete = (id: string) => {
    deleteEntry(id)
    loadEntries()
    toast.show('🗑️ Entry deleted')
  }

  const handleUpdate = (id: string, text: string) => {
    updateEntry(id, { romanizedText: text })
    loadEntries()
    toast.show('✏️ Entry updated')
  }

  const handleShare = async (entry: DiaryEntry) => {
    const text = `${entry.romanizedText}\n\n${entry.teluguText ? `(${entry.teluguText})` : ''}\n— VoiceDiary ${entry.date}`
    try {
      await navigator.clipboard.writeText(text)
      toast.show('📋 Copied!')
    } catch { toast.show('📋 Could not copy') }
  }

  const handleExport = async () => {
    const text = exportEntries()
    if (!text) { toast.show('No entries to export'); return }
    try {
      const blob = new Blob([text], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `voicediary_${new Date().toISOString().slice(0, 10)}.txt`
      a.click(); URL.revokeObjectURL(url)
      toast.show('📥 Exported!')
    } catch { toast.show('Export failed') }
  }

  return (
    <AppLock>
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="app-brand">
          <img src="/logo.png" alt="VoiceDiary Logo" className="app-logo" />
          <div>
            <div className="app-title">VoiceDiary Pro</div>
            <div className="app-subtitle">Voice • Translate • Write</div>
          </div>
        </div>
        <div className="header-actions">
          <button className="theme-toggle" onClick={() => setTab('privacy')} title="Security & Privacy">
            🛡️
          </button>
          <button className="theme-toggle" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="main-content">
        <div className="nav-tabs">
          <button className={`nav-tab ${tab === 'home' ? 'active' : ''}`} onClick={() => setTab('home')}>
            🏠 Home
          </button>
          <button className={`nav-tab ${tab === 'translate' ? 'active' : ''}`} onClick={() => setTab('translate')}>
            🌐 Translate
          </button>
          <button className={`nav-tab ${tab === 'diary' ? 'active' : ''}`} onClick={() => setTab('diary')}>
            ✍️ Diary
          </button>
        </div>

        {/* TAB 1: Home — Voice Recorder + Diary Grid */}
        {tab === 'home' && (
          <>
            <VoiceRecorder onSave={handleSave} />

            {/* Actions bar */}
            <div className="home-section-header">
              <span className="section-title">📝 Your Entries</span>
              <div className="list-actions">
                <button className="action-btn" onClick={() => setSortNewest(s => !s)}>
                  {sortNewest ? '↓ Newest' : '↑ Oldest'}
                </button>
                {entries.length > 0 && (
                  <button className="action-btn accent" onClick={handleExport}>📥 Export</button>
                )}
              </div>
            </div>

            <DiaryList
              entries={entries}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
              onShare={handleShare}
            />
          </>
        )}

        {/* TAB 2: Translator */}
        {tab === 'translate' && <TranslatorScreen />}

        {/* TAB 3: Text Diary */}
        {tab === 'diary' && <TextDiaryScreen />}

        {/* TAB 4: Privacy & Security */}
        {tab === 'privacy' && <PrivacyScreen onBack={() => setTab('home')} showToast={toast.show} />}
      </div>

      {/* Toast */}
      <div className={`toast ${toast.visible ? 'visible' : ''}`}>{toast.msg}</div>
    </div>
    </AppLock>
  )
}
