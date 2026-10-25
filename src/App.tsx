import { useState, useCallback, useEffect, useRef } from 'react';
import SplashAnimation from './components/SplashAnimation';
import AuthModal from './components/AuthModal';
import FullScreenEditor from './components/FullScreenEditor';
import DatePickerModal from './components/DatePickerModal';
import LockedDiariesScreen from './components/LockedDiariesScreen';
import DocumentsScreen from './components/DocumentsScreen';
import VoiceJournalScreen from './components/VoiceJournalScreen';
import NotificationPanel from './components/NotificationPanel';
import ProfileScreen from './components/ProfileScreen';
import VoiceRecorder from './components/VoiceRecorder';
import DiaryList from './components/DiaryList';
import TranslatorScreen from './components/TranslatorScreen';
import TextDiaryScreen from './components/TextDiaryScreen';
import WhatsAppEnhancerScreen from './components/WhatsAppEnhancerScreen';
import TeluguUniversalConverter from './components/TeluguUniversalConverter';
import AppLock from './components/AppLock';
import Onboarding, { needsOnboarding } from './components/Onboarding';
import ProfileSwitcher from './components/ProfileSwitcher';
import ResetPasswordModal from './components/ResetPasswordModal';
import TrashScreen from './components/TrashScreen';
import { TrashIcon } from './components/Icons';
import { useToast } from './hooks/useToast';
import { moveVoiceToTrash, getTrashCount } from './services/trash';
import {
  saveEntry, getEntries, deleteEntry, updateEntry, toggleFavorite,
  searchEntries, exportEntries, getEntryCount, exportAllData, DiaryEntry,
  resetEntriesCache,
} from './services/storage';
import {
  getTextEntryCount,
  resetTextDiaryCache,
  createTextEntry,
  type TextDiaryEntry,
} from './services/textDiary';
import {
  listProfiles, getActiveProfile, clearActiveProfile, ensureUserProfile,
  type Profile,
} from './services/profiles';
import { initAuth, signInWithGoogle, signOut, onPasswordRecoveryTriggered, type AuthAccount } from './services/auth';
import { pullFromCloud, pushAllToCloud } from './services/cloudSync';
import { isSupabaseConfigured } from './services/supabase';
import { exportVoiceEntriesDocx } from './services/docExport';
import { getNotifications, subscribeNotificationCount } from './services/notifications';
import { hapticTap } from './services/utils';
import { App as CapacitorApp } from '@capacitor/app';
import type { AuthChangeEvent } from '@supabase/supabase-js';

export type Tab = 'home' | 'voice' | 'diary' | 'locked' | 'documents' | 'whatsapp' | 'telugu_converter' | 'translate' | 'profile' | 'trash';

export const PALETTES = [
  { id: 'cozy', label: 'Cozy Café', swatch: '#f59e0b', desc: 'Mocha & Honey' },
  { id: 'obsidian', label: 'Obsidian Luxe', swatch: '#d4af37', desc: 'OLED & Gold' },
  { id: 'sage', label: 'Sage Calm', swatch: '#10b981', desc: 'Nordic Forest' },
  { id: 'cashmere', label: 'Warm Cashmere', swatch: '#d99b64', desc: 'Caramel Amber' },
  { id: 'indigo', label: 'Midnight Indigo', swatch: '#6366f1', desc: 'Cosmic Violet' },
] as const;

export type PaletteId = typeof PALETTES[number]['id'];

export default function App() {
  // Startup Splash state
  const [splashFinished, setSplashFinished] = useState(false);

  // Authentication & Guest Mode
  const [authAccount, setAuthAccount] = useState<AuthAccount | null>(null);
  const [isGuest, setIsGuest] = useState(() => localStorage.getItem('vd_guest_mode') === 'true');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);

  // Navigation & Active Screen
  const [tab, setTab] = useState<Tab>('home');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortNewest, setSortNewest] = useState(true);
  const [showFavOnly, setShowFavOnly] = useState(false);

  // Full Screen Editor state
  const [activeEditorEntry, setActiveEditorEntry] = useState<TextDiaryEntry | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Desktop Navigation Tools Dropdown
  const [showDesktopToolsDropdown, setShowDesktopToolsDropdown] = useState(false);
  const toolsDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDesktopToolsDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (toolsDropdownRef.current && !toolsDropdownRef.current.contains(e.target as Node)) {
        setShowDesktopToolsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDesktopToolsDropdown]);

  // Notifications
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  // Theme & Appearance
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('vd_theme') as 'dark' | 'light') || 'dark'
  );
  const [palette, setPalette] = useState<PaletteId>(() => {
    return (localStorage.getItem('vd_palette') as PaletteId) || 'cozy';
  });

  const toast = useToast();
  const [showOnboarding, setShowOnboarding] = useState(needsOnboarding);

  const [voiceCount, setVoiceCount] = useState(0);
  const [diaryCount, setDiaryCount] = useState(0);

  // Profiles
  const [profiles, setProfiles] = useState<Profile[]>(() => listProfiles());
  const [activeProfile, setActiveProfileState] = useState<Profile | null>(() => getActiveProfile());
  const [showProfiles, setShowProfiles] = useState(false);

  // Theme application
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vd_theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-palette', palette);
    localStorage.setItem('vd_palette', palette);
  }, [palette]);

  // Real-time unread notification count subscription
  useEffect(() => {
    return subscribeNotificationCount((count) => {
      setUnreadNotifCount(count);
    });
  }, []);

  const loadEntries = useCallback(() => {
    resetEntriesCache();
    resetTextDiaryCache();
    let data = searchQuery ? searchEntries(searchQuery) : getEntries();
    if (showFavOnly) data = data.filter(e => e.favorite);
    setEntries(sortNewest ? data : [...data].reverse());
    setVoiceCount(getEntryCount());
    setDiaryCount(getTextEntryCount());
  }, [searchQuery, sortNewest, showFavOnly]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const loadEntriesRef = useRef(loadEntries);
  const toastRef = useRef(toast);
  useEffect(() => {
    loadEntriesRef.current = loadEntries;
    toastRef.current = toast;
  }, [loadEntries, toast]);

  const tabRef = useRef(tab);
  const activeEditorEntryRef = useRef(activeEditorEntry);
  const showNotificationPanelRef = useRef(showNotificationPanel);
  const showDatePickerRef = useRef(showDatePicker);
  const showMoreMenuRef = useRef(showMoreMenu);
  const showAuthModalRef = useRef(showAuthModal);
  const showResetPasswordModalRef = useRef(showResetPasswordModal);
  const showProfilesRef = useRef(showProfiles);

  useEffect(() => {
    tabRef.current = tab;
    activeEditorEntryRef.current = activeEditorEntry;
    showNotificationPanelRef.current = showNotificationPanel;
    showDatePickerRef.current = showDatePicker;
    showMoreMenuRef.current = showMoreMenu;
    showAuthModalRef.current = showAuthModal;
    showResetPasswordModalRef.current = showResetPasswordModal;
    showProfilesRef.current = showProfiles;
  }, [tab, activeEditorEntry, showNotificationPanel, showDatePicker, showMoreMenu, showAuthModal, showResetPasswordModal, showProfiles]);

  // ─── Mobile Hardware Back Button & Browser Back Handler ─────
  useEffect(() => {
    let removeListener: (() => void) | null = null;

    const setupBackHandler = async () => {
      try {
        const handler = await CapacitorApp.addListener('backButton', ({ canGoBack }) => {
          // 1. If FullScreenEditor is open: save, close, refresh and toast
          if (activeEditorEntryRef.current) {
            setActiveEditorEntry(null);
            resetTextDiaryCache();
            resetEntriesCache();
            loadEntriesRef.current();
            toastRef.current.show('💾 Note updated & saved');
            return;
          }

          // 2. If any modal / drawer is open: close it cleanly
          if (showNotificationPanelRef.current) {
            setShowNotificationPanel(false);
            return;
          }
          if (showDatePickerRef.current) {
            setShowDatePicker(false);
            return;
          }
          if (showMoreMenuRef.current) {
            setShowMoreMenu(false);
            return;
          }
          if (showAuthModalRef.current) {
            setShowAuthModal(false);
            return;
          }
          if (showResetPasswordModalRef.current) {
            setShowResetPasswordModal(false);
            return;
          }
          if (showProfilesRef.current) {
            setShowProfiles(false);
            return;
          }

          // 3. If on a sub-tab: go back to home and update view
          if (tabRef.current !== 'home') {
            setTab('home');
            resetTextDiaryCache();
            resetEntriesCache();
            loadEntriesRef.current();
            return;
          }

          // 4. On home tab: exit or minimize
          if (!canGoBack) {
            CapacitorApp.exitApp();
          } else {
            window.history.back();
          }
        });

        removeListener = () => {
          handler.remove();
        };
      } catch {
        // Running in non-Capacitor environment
      }
    };

    void setupBackHandler();

    const handlePopState = () => {
      if (activeEditorEntryRef.current) {
        setActiveEditorEntry(null);
        resetTextDiaryCache();
        resetEntriesCache();
        loadEntriesRef.current();
        toastRef.current.show('💾 Note updated & saved');
      } else if (showNotificationPanelRef.current) {
        setShowNotificationPanel(false);
      } else if (showMoreMenuRef.current) {
        setShowMoreMenu(false);
      } else if (tabRef.current !== 'home') {
        setTab('home');
        resetTextDiaryCache();
        resetEntriesCache();
        loadEntriesRef.current();
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      if (removeListener) removeListener();
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const handleProfileChanged = useCallback(() => {
    resetEntriesCache();
    resetTextDiaryCache();
    setProfiles(listProfiles());
    setActiveProfileState(getActiveProfile());
    loadEntries();
  }, [loadEntries]);

  // ─── Authentication Listener ──────────────────────────────
  useEffect(() => {
    const handleAuth = async (account: AuthAccount | null, event: AuthChangeEvent) => {
      if (!account) {
        if (event !== 'SIGNED_OUT') return;
        setAuthAccount(null);
        const active = getActiveProfile();
        if (active?.provider === 'google' || active?.provider === 'email') {
          clearActiveProfile();
          resetEntriesCache();
          resetTextDiaryCache();
          setProfiles(listProfiles());
          setActiveProfileState(null);
          loadEntriesRef.current();
          toastRef.current.show('👋 Signed out');
        }
        return;
      }

      setAuthAccount(account);
      setShowAuthModal(false);

      if (event === 'PASSWORD_RECOVERY') {
        setShowResetPasswordModal(true);
        toastRef.current.show('🔑 Reset link verified! Please enter your new password.');
        return;
      }

      const fresh = event === 'SIGNED_IN';
      const initial = event === 'INITIAL_SESSION';
      if (!fresh && !initial) return;

      try {
        await ensureUserProfile(account);
        const pulled = await pullFromCloud();
        resetEntriesCache();
        resetTextDiaryCache();
        setProfiles(listProfiles());
        setActiveProfileState(getActiveProfile());
        loadEntriesRef.current();
        void pushAllToCloud();
        if (fresh) {
          toastRef.current.show(pulled
            ? '☁️ Signed in — entries synced'
            : `👋 Welcome ${account.name || 'User'}!`);
        }
      } catch (e) {
        if (fresh) toastRef.current.show('Sync note: ' + (e instanceof Error ? e.message : e));
      }
    };
    return initAuth((account, event) => { void handleAuth(account, event); });
  }, []);

  // Listen for Password Recovery deep links or hash params
  useEffect(() => {
    const unsub = onPasswordRecoveryTriggered(() => {
      setShowResetPasswordModal(true);
      setShowAuthModal(false);
    });

    try {
      if (
        window.location.hash.includes('type=recovery') ||
        window.location.hash.includes('reset-password') ||
        window.location.href.includes('reset-password') ||
        window.location.search.includes('type=recovery')
      ) {
        setShowResetPasswordModal(true);
        setShowAuthModal(false);
      }
    } catch { /* ignore */ }

    return unsub;
  }, []);

  // Handle Splash complete
  const handleSplashFinish = () => {
    setSplashFinished(true);
    // If not logged in, not guest, and no local profile, prompt auth
    if (!authAccount && !isGuest && profiles.length === 0) {
      setShowAuthModal(true);
    }
  };

  const handleContinueAsGuest = () => {
    setIsGuest(true);
    localStorage.setItem('vd_guest_mode', 'true');
    setShowAuthModal(false);
    toast.show('📱 Continuing offline in Guest Mode');
  };

  const handleAuthSuccess = (acc?: AuthAccount) => {
    if (acc) setAuthAccount(acc);
    setShowAuthModal(false);
  };

  const handleGoogleSignIn = async () => {
    if (!isSupabaseConfigured()) {
      toast.show('⚙️ Cloud login not set up — add keys to .env.local');
      return;
    }
    try {
      await signInWithGoogle();
    } catch (e) {
      toast.show('Google sign-in error: ' + (e instanceof Error ? e.message : e));
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setAuthAccount(null);
      setIsGuest(false);
      localStorage.removeItem('vd_guest_mode');
      setTab('home');
      toast.show('Signed out');
    } catch (e) {
      toast.show('Sign out error: ' + (e instanceof Error ? e.message : e));
    }
  };

  // ─── New Note Workflow (Date Picker -> Full Screen Editor) ──
  const handleNewNoteClick = () => {
    hapticTap();
    setShowDatePicker(true);
  };

  const handleProceedNewNote = (entryDate: string, title: string) => {
    setShowDatePicker(false);
    const newEntry = createTextEntry(title, '', entryDate);
    setActiveEditorEntry(newEntry);
  };

  const handleSave = (teluguText: string, romanizedText: string) => {
    const { ok } = saveEntry(teluguText, romanizedText);
    loadEntries();
    toast.show(ok ? '✅ Entry saved!' : '⚠️ Storage full! Export & delete old entries.');
  };

  const handleDelete = (id: string) => {
    const entry = entries.find(e => e.id === id);
    if (entry) {
      moveVoiceToTrash(entry);
    }
    deleteEntry(id);
    loadEntries();
    toast.show('🗑️ Moved to Recycle Bin (30-day recovery)');
  };
  const handleUpdate = (id: string, text: string) => { updateEntry(id, { romanizedText: text }); loadEntries(); toast.show('✏️ Entry updated'); };
  const handleFavorite = (id: string) => { toggleFavorite(id); loadEntries(); };

  const handleShare = async (entry: DiaryEntry) => {
    const text = `${entry.romanizedText}\n\n${entry.teluguText ? `(${entry.teluguText})` : ''}\n— VoiceDiary ${entry.date}`;
    try { await navigator.clipboard.writeText(text); toast.show('📋 Copied!'); }
    catch { toast.show('📋 Could not copy'); }
  };

  const handleExportDocx = async (entry?: DiaryEntry) => {
    const list = entry ? [entry] : entries;
    if (list.length === 0) { toast.show('No entries to export'); return; }
    try {
      const result = await exportVoiceEntriesDocx(list);
      toast.show(result === 'shared' ? '📄 Ready to share' : '📄 Saved docx');
    } catch (e) {
      toast.show('Export failed: ' + (e instanceof Error ? e.message : e));
    }
  };

  const handleExport = async () => {
    const text = exportEntries();
    if (!text) { toast.show('No entries to export'); return; }
    try {
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `voicediary_${new Date().toISOString().slice(0, 10)}.txt`;
      a.click(); URL.revokeObjectURL(url);
      toast.show('📥 Exported!');
    } catch { toast.show('Export failed'); }
  };

  const handleBackup = () => {
    try {
      const json = exportAllData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `voicediary_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click(); URL.revokeObjectURL(url);
      toast.show('💾 Full backup exported!');
    } catch { toast.show('Backup failed'); }
  };

  const journalDays = Array.from(new Set(entries.map(e => e.date))).length;
  const nowTs = Date.now();
  const sevenDaysAgo = nowTs - 7 * 24 * 60 * 60 * 1000;
  const recentEntries = entries.filter(e => e.timestamp >= sevenDaysAgo);
  const totalWords = entries.reduce((acc, e) => {
    const entryAny = e as unknown as Record<string, unknown>;
    const telugu = (e.teluguText || (entryAny.content as string) || '');
    const roman = (e.romanizedText || (entryAny.romanizedContent as string) || '');
    const text = telugu + ' ' + roman;
    return acc + text.split(/\s+/).filter(Boolean).length;
  }, 0);

  // Show Splash Animation on startup (Requirement 3 & 4)
  if (!splashFinished) {
    return <SplashAnimation onFinish={handleSplashFinish} durationMs={3000} />;
  }

  // Show full-screen editor if currently editing a note (Requirement 5)
  if (activeEditorEntry) {
    return (
      <FullScreenEditor
        entry={activeEditorEntry}
        onBack={() => {
          setActiveEditorEntry(null);
          resetTextDiaryCache();
          resetEntriesCache();
          loadEntries();
          toast.show('💾 Note updated & saved');
        }}
        onDelete={() => {
          setActiveEditorEntry(null);
          resetTextDiaryCache();
          resetEntriesCache();
          loadEntries();
        }}
        showToast={toast.show}
      />
    );
  }

  return (
    <AppLock>
      <div className="app">
        {/* Header */}
        <header className="app-header">
          <div
            className="app-brand"
            onClick={() => setTab('home')}
            style={{ cursor: 'pointer' }}
            role="button"
            tabIndex={0}
          >
            <div className="brand-logo-container">
              <img src="/logo.png" alt="VoiceDiary Logo" className="app-logo" />
            </div>
            <div className="app-brand-text">
              <div className="app-title">VoiceDiary <span className="app-title-pro">Pro</span></div>
              <div className="app-subtitle">Private Voice & Thought Journal</div>
            </div>
          </div>

          {/* Desktop Navigation (Laptop / Desktop) */}
          <nav className="desktop-nav" aria-label="Main Navigation">
            <button
              type="button"
              className={`desktop-nav-link ${tab === 'home' ? 'active' : ''}`}
              onClick={() => {
                hapticTap();
                setTab('home');
              }}
            >
              <span className="nav-icon">🏠</span> Dashboard
            </button>
            <button
              type="button"
              className={`desktop-nav-link ${tab === 'diary' ? 'active' : ''}`}
              onClick={() => {
                hapticTap();
                setTab('diary');
              }}
            >
              <span className="nav-icon">✍️</span> Notebook
              {diaryCount > 0 && <span className="nav-badge">{diaryCount}</span>}
            </button>
            <button
              type="button"
              className={`desktop-nav-link ${tab === 'voice' ? 'active' : ''}`}
              onClick={() => {
                hapticTap();
                setTab('voice');
              }}
            >
              <span className="nav-icon">🎙️</span> Voice Journal
            </button>
            <button
              type="button"
              className={`desktop-nav-link ${tab === 'documents' ? 'active' : ''}`}
              onClick={() => {
                hapticTap();
                setTab('documents');
              }}
            >
              <span className="nav-icon">📁</span> Documents
            </button>
            <button
              type="button"
              className={`desktop-nav-link ${tab === 'locked' ? 'active' : ''}`}
              onClick={() => {
                hapticTap();
                setTab('locked');
              }}
            >
              <span className="nav-icon">🔒</span> Vault
            </button>

            {/* Compact More Tools Dropdown */}
            <div className="desktop-tools-wrapper" ref={toolsDropdownRef}>
              {(() => {
                const isToolActive =
                  tab === 'whatsapp' ||
                  tab === 'telugu_converter' ||
                  tab === 'translate' ||
                  tab === 'trash';
                const label =
                  tab === 'whatsapp'
                    ? '💬 WhatsApp'
                    : tab === 'telugu_converter'
                    ? '🔄 Telugu'
                    : tab === 'translate'
                    ? '🌐 Translate'
                    : tab === 'trash'
                    ? '🗑️ Bin'
                    : '⚡ More Tools';
                return (
                  <>
                    <button
                      type="button"
                      className={`desktop-nav-link desktop-tools-trigger ${isToolActive ? 'active' : ''}`}
                      onClick={() => {
                        hapticTap();
                        setShowDesktopToolsDropdown((prev) => !prev);
                      }}
                      title="More tools: WhatsApp, Telugu converter, Translator, Recycle Bin"
                    >
                      <span>{label}</span>
                      <span className="dropdown-caret" style={{ fontSize: 10, opacity: 0.7 }}>
                        {showDesktopToolsDropdown ? '▴' : '▾'}
                      </span>
                      {getTrashCount() > 0 && !isToolActive && (
                        <span className="nav-badge" style={{ background: 'var(--danger)', color: '#fff' }}>
                          {getTrashCount()}
                        </span>
                      )}
                    </button>

                    {showDesktopToolsDropdown && (
                      <div className="desktop-tools-popover">
                        <div className="desktop-tools-popover-header">Companion Tools</div>
                        <button
                          type="button"
                          className={`desktop-tool-item ${tab === 'whatsapp' ? 'active' : ''}`}
                          onClick={() => {
                            hapticTap();
                            setTab('whatsapp');
                            setShowDesktopToolsDropdown(false);
                          }}
                        >
                          <span className="tool-item-left">
                            <span className="tool-item-icon">💬</span>
                            <span className="tool-item-name">WhatsApp Enhancer</span>
                          </span>
                          <span className="tool-item-desc">Clean chats & audio</span>
                        </button>
                        <button
                          type="button"
                          className={`desktop-tool-item ${tab === 'telugu_converter' ? 'active' : ''}`}
                          onClick={() => {
                            hapticTap();
                            setTab('telugu_converter');
                            setShowDesktopToolsDropdown(false);
                          }}
                        >
                          <span className="tool-item-left">
                            <span className="tool-item-icon">🔄</span>
                            <span className="tool-item-name">Telugu Words</span>
                          </span>
                          <span className="tool-item-desc">Phonetic English script</span>
                        </button>
                        <button
                          type="button"
                          className={`desktop-tool-item ${tab === 'translate' ? 'active' : ''}`}
                          onClick={() => {
                            hapticTap();
                            setTab('translate');
                            setShowDesktopToolsDropdown(false);
                          }}
                        >
                          <span className="tool-item-left">
                            <span className="tool-item-icon">🌐</span>
                            <span className="tool-item-name">Translator</span>
                          </span>
                          <span className="tool-item-desc">English ↔ Telugu</span>
                        </button>
                        <div className="desktop-tool-divider" />
                        <button
                          type="button"
                          className="desktop-tool-item"
                          onClick={() => {
                            hapticTap();
                            setShowDesktopToolsDropdown(false);
                            setShowNotificationPanel(true);
                          }}
                        >
                          <span className="tool-item-left">
                            <span className="tool-item-icon">🔔</span>
                            <span className="tool-item-name">Notifications</span>
                          </span>
                          {unreadNotifCount > 0 ? (
                            <span className="nav-badge" style={{ background: '#ef4444', color: '#fff' }}>
                              {unreadNotifCount}
                            </span>
                          ) : (
                            <span className="tool-item-desc">Alerts</span>
                          )}
                        </button>
                        <button
                          type="button"
                          className={`desktop-tool-item ${tab === 'trash' ? 'active' : ''}`}
                          onClick={() => {
                            hapticTap();
                            setTab('trash');
                            setShowDesktopToolsDropdown(false);
                          }}
                        >
                          <span className="tool-item-left">
                            <span className="tool-item-icon">
                              <TrashIcon size={14} />
                            </span>
                            <span className="tool-item-name">Recycle Bin</span>
                          </span>
                          {getTrashCount() > 0 && (
                            <span className="nav-badge" style={{ background: 'var(--danger)', color: '#fff' }}>
                              {getTrashCount()}
                            </span>
                          )}
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </nav>

          <div className="header-actions">
            {/* Direct Sign In Button for Laptop / Desktop if not signed in */}
            {!authAccount && (
              <button
                type="button"
                className="action-btn signin-header-btn"
                onClick={() => setShowAuthModal(true)}
                title="Sign in with Google or Email to sync across devices"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 700,
                  fontSize: '13px',
                  background: 'linear-gradient(135deg, rgba(66, 133, 244, 0.15), rgba(52, 168, 83, 0.15))',
                  border: '1.5px solid rgba(66, 133, 244, 0.45)',
                  color: 'var(--text)',
                  borderRadius: '20px',
                  padding: '6px 14px',
                  cursor: 'pointer',
                }}
              >
                <span>🔑 Sign In</span>
              </button>
            )}

            {/* New Note Button (Fast Access) */}
            <button
              type="button"
              className="action-btn primary header-new-note-btn"
              onClick={handleNewNoteClick}
              title="Create new diary entry with date"
            >
              ✍️ New Note
            </button>

            {/* Notification Bell */}
            <button
              type="button"
              className="header-round-btn notif-btn"
              onClick={() => setShowNotificationPanel(true)}
              title="Notifications"
              style={{ position: 'relative' }}
            >
              🔔
              {unreadNotifCount > 0 && (
                <span className="notif-badge-count">{unreadNotifCount}</span>
              )}
            </button>

            {/* Theme Toggle Button */}
            <button
              type="button"
              className="header-round-btn theme-sun-btn"
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              title="Toggle Light/Dark Theme"
            >
              {theme === 'dark' ? '🌙' : '☀️'}
            </button>

            {/* Profile Avatar Chip */}
            <button
              type="button"
              className="profile-chip"
              onClick={() => setTab('profile')}
              title={authAccount ? `Signed in as ${authAccount.email}` : 'Profile'}
            >
              <span className="profile-avatar">
                {(() => {
                  const av = authAccount?.avatarUrl || activeProfile?.avatarUrl;
                  const isUrl = av && (av.startsWith('http://') || av.startsWith('https://') || av.startsWith('data:') || av.startsWith('blob:'));
                  if (isUrl) {
                    return (
                      <img
                        src={av}
                        alt="Avatar"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    );
                  }
                  if (av && !av.includes('/') && av.length <= 4) {
                    return av;
                  }
                  return (authAccount?.name || activeProfile?.name || 'S').trim().charAt(0).toUpperCase();
                })()}
              </span>
              <span className="profile-chip-name">
                {authAccount?.name || activeProfile?.name || 'Profile'}
              </span>
            </button>
          </div>
        </header>

        {/* Main View Area */}
        <div className="main-content has-bottom-nav">
          {/* TAB 1: Home Dashboard */}
          {tab === 'home' && (
            <>
              {/* Habit Streak & Overview Strip */}
              <div className="insights-strip">
                <span className="insight-item">🔥 {journalDays} {journalDays === 1 ? 'day' : 'days'} habit</span>
                <span className="insight-sep">•</span>
                <span className="insight-item">📅 {recentEntries.length} this week</span>
                <span className="insight-sep">•</span>
                <span className="insight-item">📝 {totalWords.toLocaleString()} words</span>
              </div>

              {/* Quick Feature Launch Bar */}
              <div className="quick-feature-bar" style={{
                display: 'flex',
                gap: '8px',
                overflowX: 'auto',
                padding: '6px 2px 14px',
                scrollbarWidth: 'none',
              }}>
                <button
                  type="button"
                  className="quick-chip-btn whatsapp-chip"
                  onClick={() => setTab('whatsapp')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '24px',
                    border: '1.5px solid #25d366',
                    background: 'rgba(37, 211, 102, 0.12)',
                    color: '#25d366',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 2px 8px rgba(37, 211, 102, 0.15)',
                  }}
                >
                  💬 WhatsApp Enhancer
                </button>
                <button
                  type="button"
                  className="quick-chip-btn telugu-chip"
                  onClick={() => setTab('telugu_converter')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '24px',
                    border: '1.5px solid #f59e0b',
                    background: 'rgba(245, 158, 11, 0.12)',
                    color: '#f59e0b',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 2px 8px rgba(245, 158, 11, 0.15)',
                  }}
                >
                  🔄 Telugu Words Converter
                </button>
                <button
                  type="button"
                  className="quick-chip-btn"
                  onClick={() => setTab('voice')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '24px',
                    border: '1px solid var(--border-color, #e5e7eb)',
                    background: 'var(--card-bg, #ffffff)',
                    color: 'var(--text-primary, #111827)',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  🎙️ Voice Studio
                </button>
                <button
                  type="button"
                  className="quick-chip-btn"
                  onClick={() => setTab('locked')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '24px',
                    border: '1px solid var(--border-color, #e5e7eb)',
                    background: 'var(--card-bg, #ffffff)',
                    color: 'var(--text-primary, #111827)',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  🔒 Locked Vault
                </button>
                <button
                  type="button"
                  className="quick-chip-btn"
                  onClick={() => setTab('documents')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '24px',
                    border: '1px solid var(--border-color, #e5e7eb)',
                    background: 'var(--card-bg, #ffffff)',
                    color: 'var(--text-primary, #111827)',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  📁 Documents
                </button>
                <button
                  type="button"
                  className="quick-chip-btn"
                  onClick={() => setTab('translate')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '24px',
                    border: '1px solid var(--border-color, #e5e7eb)',
                    background: 'var(--card-bg, #ffffff)',
                    color: 'var(--text-primary, #111827)',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  🌐 Translator
                </button>
              </div>

              {/* Dashboard Hub Cards */}
              <div className="dashboard-hub-grid">
                <div
                  className="dashboard-hub-card highlight-card"
                  onClick={handleNewNoteClick}
                  role="button"
                  tabIndex={0}
                >
                  <div className="hub-card-icon">✍️</div>
                  <h3 className="hub-card-title">New Note</h3>
                  <p className="hub-card-desc">Pick a date & start writing with full-screen focus</p>
                </div>

                <div
                  className="dashboard-hub-card"
                  onClick={() => setTab('whatsapp')}
                  role="button"
                  tabIndex={0}
                  style={{ borderLeft: '4px solid #25d366' }}
                >
                  <div className="hub-card-icon">💬</div>
                  <h3 className="hub-card-title">WhatsApp Enhancer</h3>
                  <p className="hub-card-desc">Strip dates/senders, auto-clean chats, and share formatted thoughts</p>
                </div>

                <div
                  className="dashboard-hub-card"
                  onClick={() => setTab('telugu_converter')}
                  role="button"
                  tabIndex={0}
                  style={{ borderLeft: '4px solid #f59e0b' }}
                >
                  <div className="hub-card-icon">🔄</div>
                  <h3 className="hub-card-title">Telugu Words Converter</h3>
                  <p className="hub-card-desc">Speak or type Telugu to get instant Romanized English letters (Ela unnaru?)</p>
                </div>

                <div
                  className="dashboard-hub-card"
                  onClick={() => setTab('voice')}
                  role="button"
                  tabIndex={0}
                >
                  <div className="hub-card-icon">🎙️</div>
                  <h3 className="hub-card-title">Voice Journal</h3>
                  <p className="hub-card-desc">Telugu & English voice dictation with audio playback</p>
                </div>

                <div
                  className="dashboard-hub-card"
                  onClick={() => setTab('locked')}
                  role="button"
                  tabIndex={0}
                >
                  <div className="hub-card-icon">🔒</div>
                  <h3 className="hub-card-title">Locked Diaries</h3>
                  <p className="hub-card-desc">AES-256 encrypted private vault with email recovery</p>
                </div>

                <div
                  className="dashboard-hub-card"
                  onClick={() => setTab('documents')}
                  role="button"
                  tabIndex={0}
                >
                  <div className="hub-card-icon">📁</div>
                  <h3 className="hub-card-title">Documents</h3>
                  <p className="hub-card-desc">Store, organize & preview PDF, Word and text files</p>
                </div>
              </div>

              {/* Quick Audio Recorder Component */}
              <VoiceRecorder key={activeProfile?.id ?? 'no-profile'} onSave={handleSave} />

              {/* Entries Timeline Header */}
              <div className="home-section-header">
                <span className="section-title">📝 Recent Journal Feed</span>
                <div className="list-actions">
                  <button
                    className={`action-btn ${showFavOnly ? 'fav-active' : ''}`}
                    onClick={() => setShowFavOnly(f => !f)}
                  >
                    {showFavOnly ? '❤️ Favorites' : '☺ All'}
                  </button>
                  <button className="action-btn" onClick={() => setSortNewest(s => !s)}>
                    {sortNewest ? '↓ Newest' : '↑ Oldest'}
                  </button>
                  {entries.length > 0 && (
                    <>
                      <button className="action-btn accent" onClick={handleExport}>📥 Export</button>
                      <button
                        className="action-btn"
                        onClick={() => handleExportDocx()}
                        title="Save all entries as a Word / Google Doc file"
                      >
                        📄 Doc
                      </button>
                      <button className="action-btn" onClick={handleBackup} title="Full data backup">
                        💾
                      </button>
                    </>
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
                onFavorite={handleFavorite}
                onExportDoc={handleExportDocx}
              />
            </>
          )}

          {/* TAB 2: Dedicated Voice Journal */}
          {tab === 'voice' && (
            <VoiceJournalScreen
              onBack={() => {
                resetEntriesCache();
                resetTextDiaryCache();
                setTab('home');
                loadEntries();
              }}
              showToast={toast.show}
            />
          )}

          {/* TAB 3: Text Diary / Notebook */}
          {tab === 'diary' && (
            <TextDiaryScreen
              key={activeProfile?.id ?? 'no-profile'}
              onOpenEditor={(entry) => setActiveEditorEntry(entry)}
            />
          )}

          {/* TAB 4: Locked Vault */}
          {tab === 'locked' && (
            <LockedDiariesScreen
              userEmail={authAccount?.email || activeProfile?.email}
              onOpenEditor={(entry) => setActiveEditorEntry(entry)}
              showToast={toast.show}
            />
          )}

          {/* TAB 5: Documents Vault */}
          {tab === 'documents' && (
            <DocumentsScreen
              showToast={toast.show}
              onOpenEditor={(entry) => setActiveEditorEntry(entry)}
            />
          )}

          {/* TAB 6: Translator */}
          {tab === 'translate' && <TranslatorScreen key={activeProfile?.id ?? 'no-profile'} />}

          {/* TAB 7: WhatsApp Enhancer */}
          {tab === 'whatsapp' && (
            <WhatsAppEnhancerScreen
              key={activeProfile?.id ?? 'no-profile'}
              showToast={toast.show}
              onNavigateToDiary={() => {
                resetTextDiaryCache();
                setTab('diary');
                loadEntries();
              }}
              onBack={() => {
                resetEntriesCache();
                resetTextDiaryCache();
                setTab('home');
                loadEntries();
              }}
            />
          )}

          {/* TAB 8: Telugu Words (Speech to Romanized Text Converter) */}
          {tab === 'telugu_converter' && (
            <TeluguUniversalConverter
              onBack={() => {
                resetEntriesCache();
                resetTextDiaryCache();
                setTab('home');
                loadEntries();
              }}
              onSendToDiary={(teluguText, romanizedText) => {
                handleSave(teluguText, romanizedText);
              }}
              showToast={toast.show}
            />
          )}

          {/* TAB 9: Profile & Settings */}
          {tab === 'profile' && (
            <ProfileScreen
              profile={activeProfile}
              authAccount={authAccount}
              theme={theme}
              palette={palette}
              onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              onPaletteChange={(p) => setPalette(p)}
              onSignOut={handleSignOut}
              onBack={() => {
                resetEntriesCache();
                resetTextDiaryCache();
                setTab('home');
                loadEntries();
              }}
              showToast={toast.show}
              onSwitchProfile={() => setShowProfiles(true)}
              onOpenAuthModal={() => setShowAuthModal(true)}
              onNavigateToTrash={() => setTab('trash')}
              onProfileUpdate={(updatedProfile, updatedAccount) => {
                if (updatedProfile !== undefined) setActiveProfileState(updatedProfile);
                if (updatedAccount !== undefined) setAuthAccount(updatedAccount);
              }}
            />
          )}

          {/* TAB 10: Recycle Bin / Trash */}
          {tab === 'trash' && (
            <TrashScreen
              onBack={() => {
                resetEntriesCache();
                resetTextDiaryCache();
                setTab('home');
                loadEntries();
              }}
              showToast={toast.show}
            />
          )}
        </div>

        {/* Streamlined Mobile Bottom Navigation (5 Clean Spacious Items) */}
        <nav className="bottom-nav">
          <button
            type="button"
            className={`bottom-nav-item ${tab === 'home' ? 'active' : ''}`}
            onClick={() => {
              hapticTap();
              setTab('home');
            }}
          >
            <div className="bottom-nav-icon-box">🏠</div>
            <span className="bottom-nav-label">Home</span>
            {tab === 'home' && <span className="bottom-nav-indicator-bar" />}
          </button>

          <button
            type="button"
            className={`bottom-nav-item ${tab === 'diary' ? 'active' : ''}`}
            onClick={() => {
              hapticTap();
              setTab('diary');
            }}
          >
            <div className="bottom-nav-icon-box diary-active-box">✍️</div>
            <span className="bottom-nav-label">Diary</span>
            {tab === 'diary' && <span className="bottom-nav-indicator-bar" />}
          </button>

          <button
            type="button"
            className={`bottom-nav-item ${tab === 'voice' ? 'active' : ''}`}
            onClick={() => {
              hapticTap();
              setTab('voice');
            }}
          >
            <div className="bottom-nav-icon-box">🎙️</div>
            <span className="bottom-nav-label">Voice</span>
            {tab === 'voice' && <span className="bottom-nav-indicator-bar" />}
          </button>

          <button
            type="button"
            className={`bottom-nav-item ${tab === 'locked' ? 'active' : ''}`}
            onClick={() => {
              hapticTap();
              setTab('locked');
            }}
          >
            <div className="bottom-nav-icon-box">🔒</div>
            <span className="bottom-nav-label">Vault</span>
            {tab === 'locked' && <span className="bottom-nav-indicator-bar" />}
          </button>

          <button
            type="button"
            className={`bottom-nav-item ${['whatsapp', 'telugu_converter', 'documents', 'translate', 'profile'].includes(tab) ? 'active' : ''}`}
            onClick={() => {
              hapticTap();
              setShowMoreMenu(prev => !prev);
            }}
            title="More Tools"
          >
            <div className="bottom-nav-icon-box">
              {tab === 'whatsapp' ? '💬' : tab === 'telugu_converter' ? '🔄' : tab === 'documents' ? '📁' : tab === 'profile' ? '👤' : tab === 'translate' ? '🌐' : '☰'}
            </div>
            <span className="bottom-nav-label">
              {tab === 'whatsapp' ? 'WhatsApp' : tab === 'telugu_converter' ? 'Telugu' : tab === 'documents' ? 'Docs' : tab === 'profile' ? 'Profile' : tab === 'translate' ? 'Translate' : 'More'}
            </span>
            {['whatsapp', 'telugu_converter', 'documents', 'translate', 'profile'].includes(tab) && (
              <span className="bottom-nav-indicator-bar" />
            )}
          </button>
        </nav>

        {/* Mobile "More Tools" Bottom Drawer */}
        {showMoreMenu && (
          <div className="more-menu-overlay" onClick={() => setShowMoreMenu(false)}>
            <div className="more-menu-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="more-menu-handle-bar" />
              <div className="more-menu-header">
                <div>
                  <h3 className="more-menu-title">⚡ More Features & Tools</h3>
                  <p className="more-menu-subtitle">Fast access to companion services & settings</p>
                </div>
                <button
                  type="button"
                  className="more-menu-close-btn"
                  onClick={() => setShowMoreMenu(false)}
                >
                  ✕
                </button>
              </div>

              <div className="more-menu-grid">
                <button
                  type="button"
                  className={`more-menu-card ${tab === 'whatsapp' ? 'active' : ''}`}
                  onClick={() => {
                    hapticTap();
                    setTab('whatsapp');
                    setShowMoreMenu(false);
                  }}
                >
                  <div className="more-card-icon" style={{ background: 'rgba(37, 211, 102, 0.15)', color: '#25d366' }}>
                    💬
                  </div>
                  <div className="more-card-text">
                    <div className="more-card-title">WhatsApp Enhancer</div>
                    <div className="more-card-desc">Strip dates/senders & reformat voice chats</div>
                  </div>
                </button>

                <button
                  type="button"
                  className={`more-menu-card ${tab === 'telugu_converter' ? 'active' : ''}`}
                  onClick={() => {
                    hapticTap();
                    setTab('telugu_converter');
                    setShowMoreMenu(false);
                  }}
                >
                  <div className="more-card-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
                    🔄
                  </div>
                  <div className="more-card-text">
                    <div className="more-card-title">Telugu Words Converter</div>
                    <div className="more-card-desc">Speech & text to Romanized English script</div>
                  </div>
                </button>

                <button
                  type="button"
                  className={`more-menu-card ${tab === 'documents' ? 'active' : ''}`}
                  onClick={() => {
                    hapticTap();
                    setTab('documents');
                    setShowMoreMenu(false);
                  }}
                >
                  <div className="more-card-icon" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
                    📁
                  </div>
                  <div className="more-card-text">
                    <div className="more-card-title">Document Vault</div>
                    <div className="more-card-desc">Store, preview & edit PDFs, Word, text files</div>
                  </div>
                </button>

                <button
                  type="button"
                  className={`more-menu-card ${tab === 'translate' ? 'active' : ''}`}
                  onClick={() => {
                    hapticTap();
                    setTab('translate');
                    setShowMoreMenu(false);
                  }}
                >
                  <div className="more-card-icon" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' }}>
                    🌐
                  </div>
                  <div className="more-card-text">
                    <div className="more-card-title">Translator</div>
                    <div className="more-card-desc">Instant English ↔ Telugu phrase translation</div>
                  </div>
                </button>

                <button
                  type="button"
                  className={`more-menu-card ${tab === 'profile' ? 'active' : ''}`}
                  onClick={() => {
                    hapticTap();
                    setTab('profile');
                    setShowMoreMenu(false);
                  }}
                >
                  <div className="more-card-icon" style={{ background: 'rgba(236, 72, 153, 0.15)', color: '#ec4899' }}>
                    👤
                  </div>
                  <div className="more-card-text">
                    <div className="more-card-title">Profile & Settings</div>
                    <div className="more-card-desc">Themes, cloud sync, security & backup</div>
                  </div>
                </button>

                <button
                  type="button"
                  className={`more-menu-card ${tab === 'trash' ? 'active' : ''}`}
                  onClick={() => {
                    hapticTap();
                    setTab('trash');
                    setShowMoreMenu(false);
                  }}
                >
                  <div className="more-card-icon" style={{ background: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <TrashIcon size={20} />
                  </div>
                  <div className="more-card-text">
                    <div className="more-card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Recycle Bin</span>
                      {getTrashCount() > 0 && (
                        <span style={{ fontSize: 11, background: 'var(--danger)', color: '#fff', padding: '1px 7px', borderRadius: 9999, fontWeight: 700 }}>
                          {getTrashCount()}
                        </span>
                      )}
                    </div>
                    <div className="more-card-desc">Recover deleted notes, voice & files within 30 days</div>
                  </div>
                </button>

                <button
                  type="button"
                  className="more-menu-card"
                  onClick={() => {
                    hapticTap();
                    setShowMoreMenu(false);
                    setShowNotificationPanel(true);
                  }}
                >
                  <div className="more-card-icon" style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#eab308' }}>
                    🔔
                  </div>
                  <div className="more-card-text">
                    <div className="more-card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Notifications</span>
                      {unreadNotifCount > 0 && (
                        <span style={{ fontSize: 11, background: '#ef4444', color: '#fff', padding: '1px 7px', borderRadius: 9999, fontWeight: 700 }}>
                          {unreadNotifCount}
                        </span>
                      )}
                    </div>
                    <div className="more-card-desc">Daily reminder settings & system alerts</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Toast */}
        <div className={`toast ${toast.visible ? 'visible' : ''}`}>{toast.msg}</div>

        {/* Onboarding */}
        {showOnboarding && <Onboarding onDone={() => setShowOnboarding(false)} />}

        {/* Auth Modal (Login / Sign Up / Google) */}
        {showAuthModal && (
          <AuthModal
            onSuccess={handleAuthSuccess}
            onContinueAsGuest={handleContinueAsGuest}
          />
        )}

        {/* Reset Account Password Modal (from email reset link or recovery event) */}
        {showResetPasswordModal && (
          <ResetPasswordModal
            email={authAccount?.email || ''}
            onClose={() => setShowResetPasswordModal(false)}
            onSuccess={() => {
              setShowResetPasswordModal(false);
              toast.show('🎉 Password updated successfully! You can sign in anytime.');
            }}
            showToast={toast.show}
          />
        )}

        {/* Date Picker Modal for New Note */}
        <DatePickerModal
          isOpen={showDatePicker}
          onClose={() => setShowDatePicker(false)}
          onProceed={handleProceedNewNote}
        />

        {/* Event Notification Drawer */}
        <NotificationPanel
          isOpen={showNotificationPanel}
          onClose={() => setShowNotificationPanel(false)}
          showToast={toast.show}
        />

        {/* Legacy Profile Switcher Modal if opened */}
        {showProfiles && (
          <ProfileSwitcher
            profiles={profiles}
            activeId={activeProfile?.id ?? null}
            googleEmail={authAccount?.email || null}
            onGoogleSignIn={handleGoogleSignIn}
            onSignOut={handleSignOut}
            onChanged={handleProfileChanged}
            onClose={() => setShowProfiles(false)}
          />
        )}
      </div>
    </AppLock>
  );
}
