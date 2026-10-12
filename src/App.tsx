import { useState, useCallback, useEffect, useRef } from 'react'
import VoiceRecorder from './components/VoiceRecorder'
import DiaryList from './components/DiaryList'
import TranslatorScreen from './components/TranslatorScreen'
import TextDiaryScreen from './components/TextDiaryScreen'
import WhatsAppEnhancerScreen from './components/WhatsAppEnhancerScreen'
import AppLock from './components/AppLock'
import PrivacyScreen from './components/PrivacyScreen'
import Onboarding, { needsOnboarding } from './components/Onboarding'
import ProfileGate from './components/ProfileGate'
import ProfileSwitcher from './components/ProfileSwitcher'
import { useToast } from './hooks/useToast'
import {
  saveEntry, getEntries, deleteEntry, updateEntry, toggleFavorite,
  searchEntries, exportEntries, getEntryCount, exportAllData, DiaryEntry,
  resetEntriesCache,
} from './services/storage'
import { getTextEntryCount, resetTextDiaryCache } from './services/textDiary'
import {
  listProfiles, getActiveProfile, clearActiveProfile, ensureGoogleProfile,
  type Profile,
} from './services/profiles'
import { initAuth, signInWithGoogle, signOut, type GoogleAccount } from './services/auth'
import { pullFromCloud, pushAllToCloud } from './services/cloudSync'
import { isSupabaseConfigured } from './services/supabase'
import { exportVoiceEntriesDocx } from './services/docExport'
import { hapticTap } from './services/utils'
import type { AuthChangeEvent } from '@supabase/supabase-js'

type Tab = 'home' | 'translate' | 'diary' | 'whatsapp' | 'privacy'

export const PALETTES = [
  { id: 'cozy', label: 'Cozy Café', swatch: '#f59e0b', desc: 'Mocha & Honey' },
  { id: 'obsidian', label: 'Obsidian Luxe', swatch: '#d4af37', desc: 'OLED & Gold' },
  { id: 'sage', label: 'Sage Calm', swatch: '#10b981', desc: 'Nordic Forest' },
  { id: 'cashmere', label: 'Warm Cashmere', swatch: '#d99b64', desc: 'Caramel Amber' },
  { id: 'indigo', label: 'Midnight Indigo', swatch: '#6366f1', desc: 'Cosmic Violet' },
] as const;

export type PaletteId = typeof PALETTES[number]['id'];

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [sortNewest, setSortNewest] = useState(true)
  const [showFavOnly, setShowFavOnly] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('vd_theme') as 'dark' | 'light') || 'dark'
  )
  const [palette, setPalette] = useState<PaletteId>(() => {
    return (localStorage.getItem('vd_palette') as PaletteId) || 'cozy'
  })
  const [showPaletteMenu, setShowPaletteMenu] = useState(false)
  const toast = useToast()
  const [showOnboarding, setShowOnboarding] = useState(needsOnboarding)

  const [voiceCount, setVoiceCount] = useState(0)
  const [diaryCount, setDiaryCount] = useState(0)

  // ─── On-device profiles ───
  const [profiles, setProfiles] = useState<Profile[]>(() => listProfiles())
  const [activeProfile, setActiveProfileState] = useState<Profile | null>(() => getActiveProfile())
  const [showProfiles, setShowProfiles] = useState(false)
  const [skipProfileGate, setSkipProfileGate] = useState(false)

  // Google account currently signed in (null when signed out / offline).
  const [googleUser, setGoogleUser] = useState<GoogleAccount | null>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('vd_theme', theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.setAttribute('data-palette', palette)
    localStorage.setItem('vd_palette', palette)
  }, [palette])

  useEffect(() => {
    if (!showPaletteMenu) return
    const handleOutsideClick = () => setShowPaletteMenu(false)
    window.addEventListener('click', handleOutsideClick)
    return () => window.removeEventListener('click', handleOutsideClick)
  }, [showPaletteMenu])

  const loadEntries = useCallback(() => {
    let data = searchQuery ? searchEntries(searchQuery) : getEntries()
    if (showFavOnly) data = data.filter(e => e.favorite)
    setEntries(sortNewest ? data : [...data].reverse())
    setVoiceCount(getEntryCount())
    setDiaryCount(getTextEntryCount())
  }, [searchQuery, sortNewest, showFavOnly])

  useEffect(() => { loadEntries() }, [loadEntries])

  // The auth listener is created exactly once; it reads the latest
  // callbacks through refs instead of re-subscribing on every render.
  const loadEntriesRef = useRef(loadEntries)
  const toastRef = useRef(toast)
  useEffect(() => {
    loadEntriesRef.current = loadEntries
    toastRef.current = toast
  }, [loadEntries, toast])

  /**
   * After a profile is created, switched or deleted the profile-scoped
   * caches must be dropped, otherwise one person's entries would keep
   * showing up in the other person's diary.
   */
  const handleProfileChanged = useCallback(() => {
    resetEntriesCache()
    resetTextDiaryCache()
    setProfiles(listProfiles())
    setActiveProfileState(getActiveProfile())
    loadEntries()
  }, [loadEntries])

  // ─── Google login (Supabase Auth) ───
  // On sign-in the app hands itself over to the Google account's own
  // profile (created on demand) and merges the cloud diary down into it,
  // so everything appears the moment the account is known.
  useEffect(() => {
    const handleAuth = async (account: GoogleAccount | null, event: AuthChangeEvent) => {
      if (!account) {
        if (event !== 'SIGNED_OUT') return
        setGoogleUser(null)
        const active = getActiveProfile()
        if (active?.provider !== 'google') return
        // Data stays on the device — but leave the Google profile's view
        // and ask which profile to use next.
        clearActiveProfile()
        resetEntriesCache()
        resetTextDiaryCache()
        setProfiles(listProfiles())
        setActiveProfileState(null)
        loadEntriesRef.current()
        setShowProfiles(true)
        toastRef.current.show('👋 Signed out of Google')
        return
      }

      setGoogleUser(account)
      const fresh = event === 'SIGNED_IN'
      const initial = event === 'INITIAL_SESSION'
      if (!fresh && !initial) return

      // A session restored on app start must not hijack a local profile
      // the user was looking at — only a fresh "Continue with Google"
      // switches the whole app over.
      const active = getActiveProfile()
      if (initial && active && !(active.provider === 'google' && active.id === `g-${account.id}`)) return

      try {
        await ensureGoogleProfile(account)
        const pulled = await pullFromCloud()
        resetEntriesCache()
        resetTextDiaryCache()
        setProfiles(listProfiles())
        setActiveProfileState(getActiveProfile())
        loadEntriesRef.current()
        void pushAllToCloud() // upload anything that only exists on this device
        if (fresh) {
          toastRef.current.show(pulled
            ? '☁️ Signed in — all your entries are here'
            : '👋 Signed in with Google')
        }
      } catch (e) {
        if (fresh) toastRef.current.show('Sync failed: ' + (e instanceof Error ? e.message : e))
      }
    }
    return initAuth((account, event) => { void handleAuth(account, event) })
  }, [])

  const handleGoogleSignIn = async () => {
    if (!isSupabaseConfigured()) {
      toast.show('⚙️ Cloud login not set up — add Supabase keys (.env.local), see SETUP_GOOGLE_LOGIN.md')
      return
    }
    try {
      await signInWithGoogle()
      toast.show('🌐 Finish signing in on the Google page')
    } catch (e) {
      toast.show('Google sign-in failed: ' + (e instanceof Error ? e.message : e))
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (e) {
      toast.show('Sign out failed: ' + (e instanceof Error ? e.message : e))
    }
  }

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

  // ─── Save as Google Doc / Word (.docx) ───
  const handleExportDocx = async (entry?: DiaryEntry) => {
    const list = entry ? [entry] : entries
    if (list.length === 0) { toast.show('No entries to export'); return }
    try {
      const result = await exportVoiceEntriesDocx(list)
      toast.show(result === 'shared'
        ? '📄 Pick Drive or Docs to save it as a Google Doc'
        : '📄 Saved — open it with Google Docs')
    } catch (e) {
      toast.show('Doc export failed: ' + (e instanceof Error ? e.message : e))
    }
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

  const journalDays = Array.from(new Set(entries.map(e => e.date))).length
  const nowTs = Date.now()
  const sevenDaysAgo = nowTs - 7 * 24 * 60 * 60 * 1000
  const recentEntries = entries.filter(e => e.timestamp >= sevenDaysAgo)
  const totalWords = entries.reduce((acc, e) => {
    const entryAny = e as unknown as Record<string, unknown>;
    const telugu = (e.teluguText || (entryAny.content as string) || '');
    const roman = (e.romanizedText || (entryAny.romanizedContent as string) || '');
    const text = telugu + ' ' + roman;
    return acc + text.split(/\s+/).filter(Boolean).length;
  }, 0);

  // Find most frequent mood tag if any
  const moodCounts: Record<string, number> = {};
  entries.forEach(e => {
    const entryAny = e as unknown as Record<string, unknown>;
    const text = (e.teluguText || (entryAny.content as string) || '') + ' ' + (e.romanizedText || (entryAny.romanizedContent as string) || '');
    const match = text.match(/\[(😊|😌|💭|🙏|⚡|🌧️)\s*([A-Za-z]+)\]/);
    if (match) {
      const tag = `${match[1]} ${match[2]}`;
      moodCounts[tag] = (moodCounts[tag] || 0) + 1;
    }
  });
  const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0]

  return (
    <AppLock>
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="app-brand" onClick={() => setTab('home')} style={{ cursor: 'pointer' }} role="button" tabIndex={0}>
          <div className="brand-logo-container">
            <img src="/logo.png" alt="VoiceDiary Logo" className="app-logo" />
          </div>
          <div className="app-brand-text">
            <div className="app-title">VoiceDiary <span className="app-title-pro">Pro</span></div>
            <div className="app-subtitle">Your Private Voice & Thought Journal</div>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="desktop-nav" aria-label="Main Navigation">
          <button className={`desktop-nav-link ${tab === 'home' ? 'active' : ''}`} onClick={() => setTab('home')}>
            <span className="nav-icon">🎙️</span> Voice Journal
            {voiceCount > 0 && <span className="nav-badge">{voiceCount}</span>}
          </button>
          <button className={`desktop-nav-link ${tab === 'translate' ? 'active' : ''}`} onClick={() => setTab('translate')}>
            <span className="nav-icon">🌐</span> Translator
          </button>
          <button className={`desktop-nav-link ${tab === 'diary' ? 'active' : ''}`} onClick={() => setTab('diary')}>
            <span className="nav-icon">✍️</span> Notebook
            {diaryCount > 0 && <span className="nav-badge">{diaryCount}</span>}
          </button>
          <button className={`desktop-nav-link ${tab === 'whatsapp' ? 'active' : ''}`} onClick={() => setTab('whatsapp')}>
            <span className="nav-icon">💬</span> WhatsApp Enhancer
          </button>
          <button className={`desktop-nav-link ${tab === 'privacy' ? 'active' : ''}`} onClick={() => setTab('privacy')}>
            <span className="nav-icon">🛡️</span> Security
          </button>
        </nav>

        <div className="header-actions">
          <button className="profile-chip" onClick={() => setShowProfiles(true)}
            title={googleUser ? `Signed in as ${googleUser.email}` : 'Profiles'}>
            <span className="profile-avatar">
              {(activeProfile?.name.trim().charAt(0) || 'S').toUpperCase()}
              {activeProfile?.avatarUrl && (
                <img src={activeProfile.avatarUrl} alt=""
                  onError={e => { e.currentTarget.style.display = 'none' }} />
              )}
            </span>
            <span className="profile-chip-name">{activeProfile?.name || 'Saikrishna Jan...'}</span>
            <span className="profile-chip-chevron">⌵</span>
            {googleUser && <span className="profile-chip-cloud" title="Cloud Sync Active">☁️</span>}
          </button>

          <button className="header-round-btn" onClick={() => toast.show('🔔 All clear — no new notifications')} title="Notifications">
            🔔
          </button>

          <button className="header-round-btn theme-sun-btn" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title="Toggle Light/Dark Theme">
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="main-content has-bottom-nav">
        {/* TAB 1: Home */}
        {tab === 'home' && (
          <>
            {/* Weekly Insights & Streak Strip */}
            <div className="insights-strip">
              <span className="insight-item">🔥 {journalDays} {journalDays === 1 ? 'day' : 'days'} habit</span>
              <span className="insight-sep">•</span>
              <span className="insight-item">📅 {recentEntries.length} this week</span>
              <span className="insight-sep">•</span>
              <span className="insight-item">📝 {totalWords.toLocaleString()} words</span>
              {topMood && (
                <>
                  <span className="insight-sep">•</span>
                  <span className="insight-item">{topMood}</span>
                </>
              )}
            </div>

            {/* keyed by profile so a switch remounts the recorder with fresh data */}
            <VoiceRecorder key={activeProfile?.id ?? 'no-profile'} onSave={handleSave} />
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
                    <button className="action-btn" onClick={() => handleExportDocx()}
                      title="Save all entries as a Google Doc / Word file">📄 Doc</button>
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
              onExportDoc={handleExportDocx}
            />
          </>
        )}

        {tab === 'translate' && <TranslatorScreen key={activeProfile?.id ?? 'no-profile'} />}
        {tab === 'diary' && <TextDiaryScreen key={activeProfile?.id ?? 'no-profile'} />}
        {tab === 'whatsapp' && (
          <WhatsAppEnhancerScreen
            key={activeProfile?.id ?? 'no-profile'}
            showToast={toast.show}
            onNavigateToDiary={() => setTab('diary')}
          />
        )}
        {tab === 'privacy' && <PrivacyScreen onBack={() => setTab('home')} showToast={toast.show} />}
      </div>

      {/* Bottom Navigation Bar */}
      <nav className="bottom-nav">
        <button className={`bottom-nav-item ${tab === 'home' ? 'active' : ''}`} onClick={() => setTab('home')}>
          <div className="bottom-nav-icon-box">
            <svg className="bottom-nav-icon-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <span className="bottom-nav-label">Home</span>
        </button>

        <button className={`bottom-nav-item ${tab === 'translate' ? 'active' : ''}`} onClick={() => setTab('translate')}>
          <div className="bottom-nav-icon-box">
            <svg className="bottom-nav-icon-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </div>
          <span className="bottom-nav-label">Translate</span>
        </button>

        <button className={`bottom-nav-item ${tab === 'diary' ? 'active' : ''}`} onClick={() => setTab('diary')}>
          <div className="bottom-nav-icon-box diary-active-box">
            <svg className="bottom-nav-icon-svg" width="24" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              <line x1="8" y1="6" x2="16" y2="6" strokeWidth="1.8" />
              <line x1="8" y1="10" x2="14" y2="10" strokeWidth="1.8" />
            </svg>
          </div>
          <span className="bottom-nav-label">Diary</span>
          {tab === 'diary' && <span className="bottom-nav-indicator-bar" />}
        </button>

        <button className={`bottom-nav-item ${tab === 'privacy' ? 'active' : ''}`} onClick={() => setTab('privacy')}>
          <div className="bottom-nav-icon-box">
            <svg className="bottom-nav-icon-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <span className="bottom-nav-label">Security</span>
        </button>
      </nav>

      {/* Toast */}
      <div className={`toast ${toast.visible ? 'visible' : ''}`}>{toast.msg}</div>

      {/* Onboarding */}
      {showOnboarding && <Onboarding onDone={() => setShowOnboarding(false)} />}

      {/* Local sign-up: create a profile on this device */}
      {!showOnboarding && profiles.length === 0 && !skipProfileGate && (
        <ProfileGate
          onCreated={() => handleProfileChanged()}
          onSkip={() => setSkipProfileGate(true)}
          onGoogleSignIn={handleGoogleSignIn}
        />
      )}

      {/* Profile switcher */}
      {showProfiles && (
        <ProfileSwitcher
          profiles={profiles}
          activeId={activeProfile?.id ?? null}
          googleEmail={googleUser ? (googleUser.email || googleUser.name) : null}
          onGoogleSignIn={handleGoogleSignIn}
          onSignOut={() => { void handleSignOut() }}
          onChanged={handleProfileChanged}
          onClose={() => setShowProfiles(false)}
        />
      )}
    </div>
    </AppLock>
  )
}

