import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  createTextEntry,
  getTextEntries,
  updateTextEntry,
  deleteTextEntry,
  searchTextEntries,
  hasPinSet,
  setDiaryPin,
  verifyPin,
  type TextDiaryEntry,
} from '../services/textDiary';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from '../hooks/useToast';
import { exportTextEntryDocx } from '../services/docExport';
import { hapticTap } from '../services/utils';

export default function TextDiaryScreen() {
  const [entries, setEntries] = useState<TextDiaryEntry[]>(() => getTextEntries());
  const [search, setSearch] = useState('');
  const [activeEntry, setActiveEntry] = useState<TextDiaryEntry | null>(() => {
    const all = getTextEntries();
    // Open the latest entry by default or create a fresh one if empty
    return all.length > 0 ? all[0] : null;
  });
  const [title, setTitle] = useState(activeEntry?.title || 'Untitled Entry');
  const [wordCount, setWordCount] = useState(0);
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('center');
  const [fontSize, setFontSize] = useState('16px');
  const [fontColor, setFontColor] = useState('#1e1b4b');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const toast = useToast();
  const [pinModal, setPinModal] = useState<{ action: string; entryId?: string } | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; event: React.MouseEvent } | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const showToast = toast.show;

  const loadEntries = useCallback(() => {
    setEntries(search ? searchTextEntries(search) : getTextEntries());
  }, [search]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Sync content into editorRef when activeEntry changes
  useEffect(() => {
    if (activeEntry && editorRef.current) {
      editorRef.current.innerHTML = activeEntry.content || '';
      updateWordCount();
    }
  }, [activeEntry]);

  const updateWordCount = () => {
    if (!editorRef.current) {
      setWordCount(0);
      return;
    }
    const text = editorRef.current.innerText || '';
    const words = text.trim().split(/\s+/).filter(Boolean);
    setWordCount(words.length);
  };

  // Auto-save every 30 seconds
  useEffect(() => {
    if (!activeEntry) return;
    autoSaveTimer.current = setInterval(() => {
      if (editorRef.current && activeEntry) {
        updateTextEntry(activeEntry.id, {
          title: title || 'Untitled Entry',
          content: editorRef.current.innerHTML,
        });
        showToast('💾 Auto-saved');
      }
    }, 30000);
    return () => clearInterval(autoSaveTimer.current);
  }, [activeEntry, title, showToast]);

  const handleNew = () => {
    hapticTap();
    const entry = createTextEntry('Untitled Entry', '');
    setActiveEntry(entry);
    setTitle(entry.title);
    loadEntries();
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = '';
        editorRef.current.focus();
        updateWordCount();
      }
    }, 100);
  };

  const handleOpen = (entry: TextDiaryEntry) => {
    hapticTap();
    if (entry.locked) {
      setPinModal({ action: 'unlock_view', entryId: entry.id });
      setPinInput('');
      setPinError('');
      return;
    }
    openEntry(entry);
  };

  const openEntry = (entry: TextDiaryEntry) => {
    if (activeEntry && editorRef.current) {
      updateTextEntry(activeEntry.id, { title, content: editorRef.current.innerHTML });
    }
    setActiveEntry(entry);
    setTitle(entry.title);
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = entry.content || '';
        updateWordCount();
      }
    }, 50);
  };

  const handleSave = () => {
    hapticTap();
    if (!activeEntry || !editorRef.current) return;
    updateTextEntry(activeEntry.id, {
      title: title || 'Untitled Entry',
      content: editorRef.current.innerHTML,
    });
    loadEntries();
    showToast('💾 Saved!');
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    hapticTap();
    setConfirmDelete({ id, event: e });
  };

  const confirmDeleteEntry = () => {
    if (!confirmDelete) return;
    deleteTextEntry(confirmDelete.id);
    if (activeEntry?.id === confirmDelete.id) {
      const remaining = getTextEntries().filter(e => e.id !== confirmDelete.id);
      setActiveEntry(remaining.length > 0 ? remaining[0] : null);
      setTitle(remaining.length > 0 ? remaining[0].title : '');
    }
    loadEntries();
    showToast('🗑️ Deleted');
    setConfirmDelete(null);
  };

  const handleBack = () => {
    hapticTap();
    if (activeEntry && editorRef.current) {
      updateTextEntry(activeEntry.id, { title, content: editorRef.current.innerHTML });
      loadEntries();
    }
    setActiveEntry(null);
    setTitle('');
  };

  const execCmd = (cmd: string, value?: string) => {
    hapticTap();
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
    updateWordCount();
  };

  const handleAlign = (align: 'left' | 'center' | 'right') => {
    setTextAlign(align);
    if (align === 'left') execCmd('justifyLeft');
    else if (align === 'center') execCmd('justifyCenter');
    else if (align === 'right') execCmd('justifyRight');
  };

  // ─── Direct Voice Dictation into Note ───
  const handleVoiceInput = () => {
    hapticTap();
    const SR = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      showToast('Speech recognition not supported in this browser');
      return;
    }

    if (isVoiceRecording) {
      recognitionRef.current?.stop();
      setIsVoiceRecording(false);
      showToast('⏹ Voice dictation stopped');
      return;
    }

    const rec = new SR();
    rec.lang = 'te-IN'; // Default Telugu, also works with English
    rec.continuous = true;
    rec.interimResults = true;

    rec.onstart = () => {
      setIsVoiceRecording(true);
      showToast('🎙️ Listening... speak now');
    };

    rec.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const text = event.results[i][0].transcript;
          execCmd('insertText', ' ' + text);
        }
      }
    };

    rec.onerror = () => {
      setIsVoiceRecording(false);
    };

    rec.onend = () => {
      setIsVoiceRecording(false);
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      setIsVoiceRecording(false);
    }
  };

  // ─── Image Insertion ───
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        execCmd('insertImage', reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ─── Lock/Unlock ───
  const handleLockToggle = async () => {
    hapticTap();
    if (!activeEntry) return;
    if (activeEntry.locked) {
      updateTextEntry(activeEntry.id, { locked: false });
      setActiveEntry({ ...activeEntry, locked: false });
      showToast('🔓 Unlocked');
    } else {
      if (!hasPinSet()) {
        setPinModal({ action: 'set_pin' });
        setPinInput('');
        setPinConfirm('');
        setPinError('');
      } else {
        updateTextEntry(activeEntry.id, { locked: true });
        setActiveEntry({ ...activeEntry, locked: true });
        showToast('🔒 Locked');
      }
    }
  };

  const handlePinSubmit = async () => {
    if (pinModal?.action === 'set_pin') {
      if (pinInput.length < 4) {
        setPinError('PIN must be at least 4 digits');
        return;
      }
      if (pinInput !== pinConfirm) {
        setPinError('PINs do not match');
        return;
      }
      await setDiaryPin(pinInput);
      if (activeEntry) {
        updateTextEntry(activeEntry.id, { locked: true });
        setActiveEntry({ ...activeEntry, locked: true });
      }
      setPinModal(null);
      showToast('🔒 PIN set & entry locked');
    } else if (pinModal?.action === 'unlock_view') {
      const ok = await verifyPin(pinInput);
      if (!ok) {
        setPinError('Wrong PIN');
        return;
      }
      const entry = entries.find(e => e.id === pinModal.entryId);
      if (entry) openEntry(entry);
      setPinModal(null);
    }
  };

  // ─── Export PDF ───
  const handleExportPDF = async () => {
    hapticTap();
    if (!activeEntry || !editorRef.current) return;
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF();
      doc.setFontSize(22);
      doc.text(title || 'Untitled Entry', 20, 25);
      doc.setFontSize(10);
      doc.setTextColor(128);
      doc.text(`${activeEntry.date} • ${activeEntry.time}`, 20, 33);
      doc.setFontSize(12);
      doc.setTextColor(30);
      const text = editorRef.current.innerText;
      const lines = doc.splitTextToSize(text, 170);
      doc.text(lines, 20, 45);

      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const { Share } = await import('@capacitor/share');
        const base64 = doc.output('datauristring').split(',')[1];
        const fileName = `${(title || 'entry').replace(/\s+/g, '_')}.pdf`;
        const result = await Filesystem.writeFile({
          path: fileName,
          data: base64,
          directory: Directory.Cache,
        });
        await Share.share({ title: `${title} - VoiceDiary Pro`, url: result.uri });
        showToast('📄 PDF ready to share!');
      } else {
        doc.save(`${(title || 'entry').replace(/\s+/g, '_')}.pdf`);
        showToast('📄 PDF downloaded!');
      }
    } catch (e: any) {
      showToast('Export failed: ' + (e?.message || e));
    }
  };

  // ─── Export DOCX ───
  const handleExportDocx = async () => {
    hapticTap();
    if (!activeEntry || !editorRef.current) return;
    try {
      const result = await exportTextEntryDocx(
        { ...activeEntry, title: title || 'Untitled Entry' },
        editorRef.current.innerHTML
      );
      showToast(
        result === 'shared'
          ? '📄 Save to Google Drive or Docs'
          : '📄 Word Doc saved!'
      );
    } catch (e: any) {
      showToast('Export failed: ' + (e?.message || e));
    }
  };

  // Format date exactly like the screenshot: "Monday, 12 October 2026 • 06:57 pm"
  const formattedDate = (() => {
    const ts = activeEntry?.timestamp || Date.now();
    const d = new Date(ts);
    const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
    const day = d.getDate();
    const month = d.toLocaleDateString('en-US', { month: 'long' });
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strHours = hours.toString().padStart(2, '0');
    return `${weekday}, ${day} ${month} ${year} • ${strHours}:${minutes} ${ampm}`;
  })();

  const EMOJIS = ['😊', '❤️', '✨', '🙏', '💭', '🔥', '🎉', '🌟', '💡', '🌿', '☕', '📝'];
  const FONT_SIZES = ['13px', '14px', '16px', '18px', '20px', '24px'];
  const COLORS = ['#1e1b4b', '#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#475569'];

  // PIN Modal
  const renderPinModal = () => {
    if (!pinModal) return null;
    return (
      <div className="pin-overlay" onClick={() => setPinModal(null)}>
        <div className="pin-modal" onClick={e => e.stopPropagation()}>
          <h3>{pinModal.action === 'set_pin' ? '🔐 Set Diary PIN' : '🔒 Enter PIN'}</h3>
          <input
            type="password"
            className="pin-input"
            placeholder="Enter PIN"
            value={pinInput}
            onChange={e => setPinInput(e.target.value)}
            maxLength={8}
            autoFocus
          />
          {pinModal.action === 'set_pin' && (
            <input
              type="password"
              className="pin-input"
              placeholder="Confirm PIN"
              value={pinConfirm}
              onChange={e => setPinConfirm(e.target.value)}
              maxLength={8}
            />
          )}
          {pinError && <div className="pin-error">{pinError}</div>}
          <div className="pin-actions">
            <button className="pin-cancel" onClick={() => setPinModal(null)}>
              Cancel
            </button>
            <button className="pin-submit" onClick={handlePinSubmit}>
              {pinModal.action === 'set_pin' ? 'Set PIN & Lock' : 'Unlock'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ═════════════════════════════════════════════════════════════
  // EDITOR VIEW (Exact match to the screenshot)
  // ═════════════════════════════════════════════════════════════
  if (activeEntry) {
    return (
      <div className={`tab-content editor-canvas-view ${isFullscreen ? 'fullscreen-mode' : ''}`}>
        {/* Soft Decorative Landscape Header Banner matching screenshot */}
        <div className="decor-landscape-header">
          {/* Watercolor Landscape Art Background */}
          <div className="decor-landscape-art" aria-hidden="true">
            <svg viewBox="0 0 500 120" preserveAspectRatio="none" className="landscape-svg-art">
              <defs>
                <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fff8f2" />
                  <stop offset="60%" stopColor="#faedf6" />
                  <stop offset="100%" stopColor="#f4ebf8" />
                </linearGradient>
                <radialGradient id="sunGlow" cx="0.75" cy="0.4" r="0.35">
                  <stop offset="0%" stopColor="#fed7aa" stopOpacity="0.9" />
                  <stop offset="60%" stopColor="#fde68a" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#fdf4ff" stopOpacity="0" />
                </radialGradient>
              </defs>
              <rect width="500" height="120" fill="url(#skyGrad)" />
              {/* Warm Sunrise */}
              <circle cx="380" cy="55" r="32" fill="url(#sunGlow)" />
              <circle cx="380" cy="55" r="20" fill="#fde68a" opacity="0.6" />
              {/* Birds in distance */}
              <path d="M 270 42 Q 274 38 278 42 Q 282 38 286 42" fill="none" stroke="#94a3b8" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
              <path d="M 290 32 Q 293 29 296 32 Q 299 29 302 32" fill="none" stroke="#94a3b8" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
              {/* Back hills */}
              <path d="M 0 120 L 0 75 Q 120 50 250 80 T 500 70 L 500 120 Z" fill="#e9d5ff" opacity="0.45" />
              {/* Front hills */}
              <path d="M 0 120 L 0 92 Q 140 70 290 96 T 500 86 L 500 120 Z" fill="#ddd6fe" opacity="0.5" />
              {/* Foliage / Branch on the right */}
              <g opacity="0.55" stroke="#7e22ce" strokeWidth="1.3" fill="#a855f7">
                <path d="M 495 120 Q 470 65 485 10" fill="none" />
                <path d="M 473 70 C 460 66 458 55 470 58 C 476 60 480 66 473 70 Z" />
                <path d="M 482 48 C 470 44 472 32 482 36 C 487 38 488 44 482 48 Z" />
                <path d="M 487 25 C 478 20 482 10 490 14 C 493 16 493 22 487 25 Z" />
              </g>
              {/* Botanical leaves on the left */}
              <g opacity="0.35" stroke="#7e22ce" strokeWidth="1.2" fill="#c084fc">
                <path d="M 5 120 Q 25 80 15 35" fill="none" />
                <path d="M 18 80 C 28 76 29 66 21 68 C 16 70 14 76 18 80 Z" />
                <path d="M 16 55 C 26 50 24 40 16 43 C 12 45 12 51 16 55 Z" />
              </g>
            </svg>
          </div>

          {/* Action Row */}
          <div className="decor-action-row">
            <button className="all-notes-pill-btn" onClick={handleBack} title="View All Notes">
              <span className="all-notes-arrow">←</span>
              <span className="all-notes-text">All Notes</span>
            </button>

            <div className="decor-right-actions">
              <button
                className={`decor-pill-btn lock-pill ${activeEntry.locked ? 'locked' : ''}`}
                onClick={handleLockToggle}
                title={activeEntry.locked ? 'Unlock entry' : 'Lock entry with PIN'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  {activeEntry.locked ? (
                    <>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </>
                  ) : (
                    <>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                    </>
                  )}
                </svg>
                <span>{activeEntry.locked ? 'Locked' : 'Public'}</span>
                <span className="pill-chevron">⌵</span>
              </button>

              <button className="decor-pill-btn export-pill" onClick={handleExportPDF} title="Export as PDF document">
                <span className="pdf-doc-badge-icon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="#ef4444">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" opacity="0.2" />
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinejoin="round" />
                    <polyline points="14 2 14 8 20 8" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="export-badge-pdf">PDF</span>
              </button>

              <button className="decor-pill-btn export-pill" onClick={handleExportDocx} title="Save as Word / Google Doc">
                <span className="word-doc-badge-icon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="#2563eb">
                    <rect x="3" y="3" width="18" height="18" rx="3" fill="#2563eb" />
                    <path d="M7 8l2.5 8 2.5-6 2.5 6 2.5-8" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="export-badge-doc">DOC</span>
              </button>

              <button className="decor-pill-btn save-pill-btn" onClick={handleSave} title="Save note">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                <span>Save</span>
              </button>
            </div>
          </div>
        </div>

        {/* Floating Main White Card (Exact layout & styling from screenshot) */}
        <div className="notebook-main-card">
          {/* Date & Word Counter Row */}
          <div className="notebook-meta-strip">
            <div className="notebook-date-info">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span className="meta-date-text">{formattedDate}</span>
            </div>
            <div className="notebook-words-pill">{wordCount} words</div>
          </div>

          {/* Title Row with Pencil Badge */}
          <div className="notebook-title-strip">
            <div className="title-pencil-badge">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </div>
            <div className="title-input-wrapper">
              <input
                className="notebook-title-input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Untitled Entry"
              />
              <div className="notebook-title-sublabel">Add a title...</div>
            </div>
          </div>

          {/* Formatting Toolbar (Two Rows) */}
          <div className="rich-toolbar-card">
            {/* Row 1: B, I, U, S, | , H1, H2, H3, Quote */}
            <div className="rich-toolbar-row">
              <div className="toolbar-btn-group">
                <button className="format-btn" onClick={() => execCmd('bold')} title="Bold">
                  <b>B</b>
                </button>
                <button className="format-btn italic-btn" onClick={() => execCmd('italic')} title="Italic">
                  <i>I</i>
                </button>
                <button className="format-btn" onClick={() => execCmd('underline')} title="Underline">
                  <u>U</u>
                </button>
                <button className="format-btn" onClick={() => execCmd('strikeThrough')} title="Strikethrough">
                  <s>S</s>
                </button>
              </div>

              <div className="toolbar-sep-line" />

              <div className="toolbar-btn-group">
                <button className="format-btn tag-btn" onClick={() => execCmd('formatBlock', 'h1')} title="Heading 1">
                  H1
                </button>
                <button className="format-btn tag-btn" onClick={() => execCmd('formatBlock', 'h2')} title="Heading 2">
                  H2
                </button>
                <button className="format-btn tag-btn" onClick={() => execCmd('formatBlock', 'h3')} title="Heading 3">
                  H3
                </button>
                <button className="format-btn quote-square-btn" onClick={() => execCmd('formatBlock', 'blockquote')} title="Blockquote">
                  ❝
                </button>
              </div>
            </div>

            {/* Row 2: Bullet list, numbered list, align left/center/right, | , Color A ⌵, Size 16px ⌵ */}
            <div className="rich-toolbar-row">
              <div className="toolbar-btn-group">
                <button className="format-btn" onClick={() => execCmd('insertUnorderedList')} title="Bullet List">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="9" y1="6" x2="20" y2="6" />
                    <line x1="9" y1="12" x2="20" y2="12" />
                    <line x1="9" y1="18" x2="20" y2="18" />
                    <circle cx="4" cy="6" r="1.5" fill="currentColor" />
                    <circle cx="4" cy="12" r="1.5" fill="currentColor" />
                    <circle cx="4" cy="18" r="1.5" fill="currentColor" />
                  </svg>
                </button>
                <button className="format-btn" onClick={() => execCmd('insertOrderedList')} title="Numbered List">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="10" y1="6" x2="21" y2="6" />
                    <line x1="10" y1="12" x2="21" y2="12" />
                    <line x1="10" y1="18" x2="21" y2="18" />
                    <path d="M4 6h1.5v-3H4" />
                    <path d="M3.5 12h2.5v-1.5a1 1 0 0 0-1-1h-.5a1 1 0 0 0-1 1" />
                    <path d="M3.5 18h2.5v-1a1 1 0 0 0-1-1h-.5a1 1 0 0 0 1-1v-1" />
                  </svg>
                </button>
              </div>

              <div className="toolbar-btn-group">
                <button
                  className={`format-btn ${textAlign === 'center' ? 'active-align' : ''}`}
                  onClick={() => handleAlign('center')}
                  title="Align Center"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="4" y1="6" x2="20" y2="6" />
                    <line x1="7" y1="12" x2="17" y2="12" />
                    <line x1="5" y1="18" x2="19" y2="18" />
                  </svg>
                </button>
                <button
                  className={`format-btn ${textAlign === 'left' ? 'active-align' : ''}`}
                  onClick={() => handleAlign('left')}
                  title="Align Left"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="4" y1="6" x2="20" y2="6" />
                    <line x1="4" y1="12" x2="14" y2="12" />
                    <line x1="4" y1="18" x2="18" y2="18" />
                  </svg>
                </button>
                <button
                  className={`format-btn ${textAlign === 'right' ? 'active-align' : ''}`}
                  onClick={() => handleAlign('right')}
                  title="Align Right"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="4" y1="6" x2="20" y2="6" />
                    <line x1="10" y1="12" x2="20" y2="12" />
                    <line x1="6" y1="18" x2="20" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="toolbar-sep-line" />

              {/* Color Button with Dropdown */}
              <div className="color-tool-relative">
                <button
                  className="format-btn color-dropdown-btn"
                  onClick={() => {
                    hapticTap();
                    setShowColorPicker(s => !s);
                  }}
                  title="Text Color"
                >
                  <span className="color-letter" style={{ borderBottom: `2.5px solid ${fontColor}` }}>
                    A
                  </span>
                  <span className="tool-dropdown-arrow">⌵</span>
                </button>
                {showColorPicker && (
                  <div className="color-popover-box" onClick={e => e.stopPropagation()}>
                    {COLORS.map(c => (
                      <button
                        key={c}
                        className="color-dot-choice"
                        style={{ backgroundColor: c }}
                        onClick={() => {
                          setFontColor(c);
                          execCmd('foreColor', c);
                          setShowColorPicker(false);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Font Size Dropdown */}
              <div className="size-tool-relative">
                <button
                  className="size-dropdown-pill"
                  onClick={() => {
                    hapticTap();
                    setShowSizeDropdown(s => !s);
                  }}
                  title="Font Size"
                >
                  <span>{fontSize}</span>
                  <span className="tool-dropdown-arrow">⌵</span>
                </button>
                {showSizeDropdown && (
                  <div className="size-popover-box" onClick={e => e.stopPropagation()}>
                    {FONT_SIZES.map(s => (
                      <button
                        key={s}
                        className={`size-choice-btn ${fontSize === s ? 'active' : ''}`}
                        onClick={() => {
                          setFontSize(s);
                          execCmd('fontSize', '3'); // adjust standard
                          setShowSizeDropdown(false);
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Large Card Box with Embedded Content & Inside Bottom Bar */}
          <div className="notebook-canvas-frame">
            {/* Top-Right Expand Button */}
            <button
              className="canvas-expand-btn"
              onClick={() => {
                hapticTap();
                setIsFullscreen(f => !f);
              }}
              title={isFullscreen ? 'Exit Fullscreen' : 'Expand Fullscreen'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            </button>

            {/* Editable Content Area with Purple Cursor */}
            <div
              ref={editorRef}
              className="notebook-content-editable"
              contentEditable
              suppressContentEditableWarning
              onInput={updateWordCount}
              data-placeholder="Pour your thoughts onto this page..."
              style={{ textAlign, fontSize }}
              aria-label="Notebook content"
            />

            {/* Hidden image input */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleImageUpload}
            />

            {/* Bottom Floating Bar INSIDE the Canvas */}
            <div className="canvas-bottom-strip">
              <div className="canvas-bottom-left">
                {/* Lavender Mic Button for Direct Speech Dictation */}
                <button
                  className={`canvas-mic-circle-btn ${isVoiceRecording ? 'recording' : ''}`}
                  onClick={handleVoiceInput}
                  title={isVoiceRecording ? 'Stop Voice Dictation' : 'Speak into Note (Telugu / English)'}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </button>

                {/* Photo Upload Button */}
                <button
                  className="canvas-action-icon-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Insert Photo"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </button>

                {/* Attachment Button */}
                <button
                  className="canvas-action-icon-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach File"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>

                {/* Emoji Picker Button */}
                <div style={{ position: 'relative' }}>
                  <button
                    className="canvas-action-icon-btn"
                    onClick={() => {
                      hapticTap();
                      setShowEmojiPicker(e => !e);
                    }}
                    title="Insert Emoji"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                      <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="3" />
                      <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="3" />
                    </svg>
                  </button>
                  {showEmojiPicker && (
                    <div className="emoji-popover-box" onClick={e => e.stopPropagation()}>
                      {EMOJIS.map(em => (
                        <button
                          key={em}
                          className="emoji-select-btn"
                          onClick={() => {
                            execCmd('insertText', em);
                            setShowEmojiPicker(false);
                          }}
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="canvas-bottom-sep" />

              <div className="canvas-bottom-right">
                <button className="canvas-action-icon-btn" onClick={() => execCmd('undo')} title="Undo (Ctrl+Z)">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7v6h6" />
                    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                  </svg>
                </button>
                <button className="canvas-action-icon-btn" onClick={() => execCmd('redo')} title="Redo (Ctrl+Y)">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 7v6h-6" />
                    <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
                  </svg>
                </button>
                <button
                  className="canvas-action-icon-btn"
                  onClick={() => showToast('ℹ️ Auto-saves every 30s • End-to-end private')}
                  title="More Options"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round">
                    <circle cx="12" cy="5" r="1" fill="#64748b" />
                    <circle cx="12" cy="12" r="1" fill="#64748b" />
                    <circle cx="12" cy="19" r="1" fill="#64748b" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {renderPinModal()}
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════
  // LIST VIEW (when All Notes is clicked)
  // ═════════════════════════════════════════════════════════════
  return (
    <div className="tab-content notebook-list-view">
      <div className="notebook-banner">
        <div className="notebook-banner-info">
          <div className="notebook-banner-badge">📓 Private Journal</div>
          <h2 className="notebook-banner-title">Personal Notebook</h2>
          <p className="notebook-banner-subtitle">
            Long-form writing, reflections, memories & notes with rich formatting.
          </p>
        </div>
        <button className="new-entry-btn" onClick={handleNew}>
          <span className="btn-icon">✏️</span> New Note
        </button>
      </div>

      <div className="search-bar notebook-search">
        <span className="search-icon">🔍</span>
        <input
          className="search-input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search through notes, titles, thoughts..."
        />
        {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
      </div>

      {entries.length > 0 && (
        <div className="list-header">
          <span className="entry-count">
            {entries.length} {entries.length === 1 ? 'saved note' : 'saved notes'}
          </span>
          {search && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              matching "{search}"
            </span>
          )}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="empty-state notebook-empty-state">
          <div className="empty-emoji">📝</div>
          <div className="empty-title">Your notebook is quiet & empty</div>
          <div className="empty-desc">
            Write down whatever is on your mind today. Everything stays encrypted and private on your device.
          </div>
          <button className="empty-cta-btn" onClick={handleNew}>
            ✏️ Create First Note
          </button>
        </div>
      ) : (
        <div className="notebook-grid">
          {entries.map(entry => (
            <div key={entry.id} className="notebook-card" onClick={() => handleOpen(entry)}>
              <div className="notebook-card-header">
                <span className="notebook-card-date">📅 {entry.date}</span>
                <div className="notebook-card-badges">
                  {entry.locked && <span className="lock-tag" title="Protected with PIN">🔒 Private</span>}
                  <span className="notebook-card-time">🕐 {entry.time}</span>
                </div>
              </div>

              <div className="notebook-card-title">{entry.title || 'Untitled Entry'}</div>

              {entry.locked ? (
                <div className="notebook-card-preview locked-preview">
                  🔒 This note is locked. Tap to enter PIN.
                </div>
              ) : (
                <div className="notebook-card-preview">
                  {entry.content.replace(/<[^>]*>/g, '').slice(0, 140) || 'No text written yet...'}
                </div>
              )}

              <div className="notebook-card-footer">
                <span className="card-hint">Tap to open & edit</span>
                <button
                  className="notebook-card-delete"
                  title="Delete note"
                  onClick={e => handleDelete(entry.id, e)}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete Note?"
          message="Are you sure you want to delete this notebook entry? This cannot be undone."
          confirmLabel="Delete Note"
          onConfirm={confirmDeleteEntry}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {renderPinModal()}
    </div>
  );
}
