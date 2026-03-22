import { useState, useCallback, useEffect } from 'react'
import VoiceRecorder from './components/VoiceRecorder'
import DiaryList from './components/DiaryList'
import TranslatorScreen from './components/TranslatorScreen'
import TextDiaryScreen from './components/TextDiaryScreen'
import AppLock from './components/AppLock'
import PrivacyScreen from './components/PrivacyScreen'
import Onboarding, { needsOnboarding } from './components/Onboarding'
import { useToast } from './hooks/useToast'
import {
  saveEntry, getEntries, deleteEntry, updateEntry, toggleFavorite,
  searchEntries, exportEntries, getEntryCount, exportAllData, DiaryEntry,
} from './services/storage'
import { getTextEntryCount } from './services/textDiary'

type Tab = 'home' | 'translate' | 'diary' | 'privacy'

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [sortNewest, setSortNewest] = useState(true)
  const [showFavOnly, setShowFavOnly] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('vd_theme') as 'dark' | 'light') || 'dark'
  )
  const toast = useToast()
  const [showOnboarding, setShowOnboarding] = useState(needsOnboarding)

  const [voiceCount, setVoiceCount] = useState(0)
  const [diaryCount, setDiaryCount] = useState(0)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('vd_theme', theme)
  }, [theme])

  const loadEntries = useCallback(() => {
    let data = searchQuery ? searchEntries(searchQuery) : getEntries()
    if (showFavOnly) data = data.filter(e => e.favorite)
    setEntries(sortNewest ? data : [...data].reverse())
    setVoiceCount(getEntryCount())
    setDiaryCount(getTextEntryCount())
  }, [searchQuery, sortNewest, showFavOnly])

  useEffect(() => { loadEntries() }, [loadEntries])

  const handleSave = (teluguText: string, romanizedText: string) => {
    const { ok } = saveEntry(teluguText, romanizedText)
    loadEntries()
    toast.show(ok ? '✅ Entry saved!' : '⚠️ Storage full! Export & delete old entries.')
  }

  const handleDelete = (id: string) => { deleteEntry(id); loadEntries(); toast.show('🗑️ Entry deleted') }
  const handleUpdate = (id: string, text: string) => { updateEntry(id, { romanizedText: text }); loadEntries(); toast.show('✏️ Entry updated') }
  const handleFavorite = (id: string) => { toggleFavorite(id); loadEntries() }

  const handleShare = async (entry: DiaryEntry) => {
    const text = `${entry.romanizedText}\n\n${entry.teluguText ? `(${entry.teluguText})` : ''}\n— VoiceDiary ${entry.date}`
    try { await navigator.clipboard.writeText(text); toast.show('📋 Copied!') }
    catch { toast.show('📋 Could not copy') }
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

  const handleBackup = () => {
    try {
      const json = exportAllData()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `voicediary_backup_${new Date().toISOString().slice(0, 10)}.json`
      a.click(); URL.revokeObjectURL(url)
      toast.show('💾 Full backup exported!')
    } catch { toast.show('Backup failed') }
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

      {/* Main Content */}
      <div className="main-content has-bottom-nav">
        {/* TAB 1: Home */}
        {tab === 'home' && (
          <>
            <VoiceRecorder onSave={handleSave} />
            <div className="home-section-header">
              <span className="section-title">📝 Your Entries</span>
              <div className="list-actions">
                <button className={`action-btn ${showFavOnly ? 'fav-active' : ''}`} onClick={() => setShowFavOnly(f => !f)}>
                  {showFavOnly ? '❤️ Favorites' : '☺ All'}
                </button>
                <button className="action-btn" onClick={() => setSortNewest(s => !s)}>
                  {sortNewest ? '↓ Newest' : '↑ Oldest'}
                </button>
                {entries.length > 0 && (
                  <>
                    <button className="action-btn accent" onClick={handleExport}>📥 Export</button>
                    <button className="action-btn" onClick={handleBackup} title="Full data backup">💾</button>
                  </>
                )}
              </div>
            </div>
            <DiaryList
              entries={entries} searchQuery={searchQuery}
              onSearchChange={setSearchQuery} onDelete={handleDelete}
              onUpdate={handleUpdate} onShare={handleShare}
              onFavorite={handleFavorite}
            />
          </>
        )}

        {tab === 'translate' && <TranslatorScreen />}
        {tab === 'diary' && <TextDiaryScreen />}
        {tab === 'privacy' && <PrivacyScreen onBack={() => setTab('home')} showToast={toast.show} />}
      </div>

      {/* Bottom Navigation Bar */}
      <nav className="bottom-nav">
        <button className={`bottom-nav-item ${tab === 'home' ? 'active' : ''}`} onClick={() => setTab('home')}>
          <span className="bottom-nav-icon">🏠</span>
          <span className="bottom-nav-label">Home</span>
          {voiceCount > 0 && <span className="bottom-nav-badge">{voiceCount}</span>}
        </button>
        <button className={`bottom-nav-item ${tab === 'translate' ? 'active' : ''}`} onClick={() => setTab('translate')}>
          <span className="bottom-nav-icon">🌐</span>
          <span className="bottom-nav-label">Translate</span>
        </button>
        <button className={`bottom-nav-item ${tab === 'diary' ? 'active' : ''}`} onClick={() => setTab('diary')}>
          <span className="bottom-nav-icon">✍️</span>
          <span className="bottom-nav-label">Diary</span>
          {diaryCount > 0 && <span className="bottom-nav-badge">{diaryCount}</span>}
        </button>
        <button className={`bottom-nav-item ${tab === 'privacy' ? 'active' : ''}`} onClick={() => setTab('privacy')}>
          <span className="bottom-nav-icon">🛡️</span>
          <span className="bottom-nav-label">Security</span>
        </button>
      </nav>

      {/* Toast */}
      <div className={`toast ${toast.visible ? 'visible' : ''}`}>{toast.msg}</div>

      {/* Onboarding */}
      {showOnboarding && <Onboarding onDone={() => setShowOnboarding(false)} />}
    </div>
    </AppLock>
  )
}

