import { useState, useEffect, useRef, useCallback } from 'react';
import {
  type TextDiaryEntry,
  updateTextEntry,
  deleteTextEntry,
  formatMMDDYYYY,
  resetTextDiaryCache,
} from '../services/textDiary';
import { dbSaveDraft, dbGetDraft, dbDeleteDraft } from '../services/db';
import { subscribeSyncState, type SyncState } from '../services/cloudSync';
import { exportTextEntryDocx, saveOrShareFile } from '../services/docExport';
import ConfirmDialog from './ConfirmDialog';
import { hapticTap } from '../services/utils';
import { moveNoteToTrash } from '../services/trash';
import { TrashIcon } from './Icons';

interface Props {
  entry: TextDiaryEntry;
  onBack: () => void;
  onDelete: (id: string) => void;
  showToast: (msg: string) => void;
  isLockedScreen?: boolean;
}

export default function FullScreenEditor({
  entry,
  onBack,
  onDelete,
  showToast,
  isLockedScreen = false,
}: Props) {
  const [title, setTitle] = useState(entry.title || 'Untitled Entry');
  const [entryDate, setEntryDate] = useState(entry.entryDate || formatMMDDYYYY(entry.timestamp));
  const [wordCount, setWordCount] = useState(0);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [voiceLang, setVoiceLang] = useState<'te-IN' | 'en-IN'>('te-IN');
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'offline' | 'error'>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<string>('Just now');
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedFont, setSelectedFont] = useState("'Plus Jakarta Sans', system-ui, sans-serif");
  const [selectedFontSize, setSelectedFontSize] = useState('16px');

  const editorRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordCountTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<any>(null);

  // Sync state listener
  useEffect(() => {
    return subscribeSyncState((state) => {
      setSyncState(state);
    });
  }, []);

  // Update word count
  const updateWordCount = useCallback(() => {
    if (!editorRef.current) return;
    const text = editorRef.current.innerText || '';
    const words = text.trim().split(/\s+/).filter(Boolean);
    setWordCount(words.length);
  }, []);

  // Debounced word count to avoid re-rendering header chips on every keystroke
  const debouncedUpdateWordCount = useCallback(() => {
    if (wordCountTimeoutRef.current) clearTimeout(wordCountTimeoutRef.current);
    wordCountTimeoutRef.current = setTimeout(() => {
      updateWordCount();
    }, 600);
  }, [updateWordCount]);

  // Initial populate with draft restoration
  useEffect(() => {
    let active = true;
    const init = async () => {
      // Check if draft exists in IndexedDB
      const draft = await dbGetDraft(entry.id);
      if (!active) return;

      if (editorRef.current) {
        if (draft && draft.content && draft.updatedAt > (entry.updatedAt || entry.lastEdited)) {
          editorRef.current.innerHTML = draft.content;
          if (draft.title) setTitle(draft.title);
          showToast('Draft restored from local autosave');
        } else {
          editorRef.current.innerHTML = entry.content || '';
        }
        updateWordCount();
      }
    };
    void init();
    return () => { active = false; };
  }, [entry.id, entry.content, entry.title, entry.updatedAt, entry.lastEdited, showToast, updateWordCount]);

  // Debounced Autosave function (does not mutate React state on every single key press)
  const triggerSave = useCallback(() => {
    if (!editorRef.current) return;
    const currentHtml = editorRef.current.innerHTML;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        // Save to TextDiary store
        updateTextEntry(entry.id, {
          title: title.trim() || 'Untitled Entry',
          content: currentHtml,
          entryDate,
        });

        // Save to IndexedDB draft store
        await dbSaveDraft({
          id: entry.id,
          title: title.trim() || 'Untitled Entry',
          content: currentHtml,
          entryDate,
          updatedAt: Date.now(),
        });

        if (!navigator.onLine) {
          setSaveStatus('offline');
        } else {
          setSaveStatus('saved');
        }
        setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      } catch (e) {
        console.error('Autosave error:', e);
        setSaveStatus('error');
      }
    }, 800);
  }, [entry.id, title, entryDate]);

  // Input change handler in editor with caret guard
  const handleContentInput = () => {
    // Caret guard: keep caret in view without letting browser scroll up
    if (scrollAreaRef.current) {
      try {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const containerRect = scrollAreaRef.current.getBoundingClientRect();
          // If caret is near or below the visible container bottom, scroll down slightly
          // NEVER scroll up!
          if (rect.bottom > containerRect.bottom - 40) {
            scrollAreaRef.current.scrollTop += (rect.bottom - containerRect.bottom + 60);
          }
        }
      } catch { /* ignore */ }
    }
    debouncedUpdateWordCount();
    triggerSave();
  };

  // Title change handler
  const handleTitleChange = (val: string) => {
    setTitle(val);
    triggerSave();
  };

  // Exit editor safely and immediately update
  const handleBack = () => {
    hapticTap();
    if (editorRef.current) {
      updateTextEntry(entry.id, {
        title: title.trim() || 'Untitled Entry',
        content: editorRef.current.innerHTML,
        entryDate,
      });
      // Clear draft on intentional clean exit
      void dbDeleteDraft(entry.id);
    }
    resetTextDiaryCache();
    onBack();
  };

  // Formatting commands
  const execCmd = (cmd: string, value?: string) => {
    hapticTap();
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
    updateWordCount();
    triggerSave();
  };

  const applyFontFamily = (family: string) => {
    hapticTap();
    setSelectedFont(family);
    if (editorRef.current) {
      editorRef.current.style.fontFamily = family;
    }
    triggerSave();
  };

  const applyFontSize = (size: string) => {
    hapticTap();
    setSelectedFontSize(size);
    if (editorRef.current) {
      editorRef.current.style.fontSize = size;
    }
    triggerSave();
  };

  const applyTextColor = (color: string) => {
    hapticTap();
    document.execCommand('foreColor', false, color);
    setShowColorPicker(false);
    triggerSave();
  };

  const applyHighlightColor = (color: string) => {
    hapticTap();
    try {
      document.execCommand('hiliteColor', false, color);
    } catch {
      document.execCommand('backColor', false, color);
    }
    setShowHighlightPicker(false);
    triggerSave();
  };

  // Copy button handler (Requirement 16)
  const handleCopyText = async () => {
    hapticTap();
    if (!editorRef.current) return;
    const plainText = editorRef.current.innerText || '';
    if (!plainText.trim()) {
      showToast('Note is empty — nothing to copy');
      return;
    }
    const fullContent = `${title}\nDate: ${entryDate}\n\n${plainText}`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(fullContent);
        showToast('📋 Copied to clipboard with line breaks!');
      } else {
        // Fallback for restricted clipboard permissions
        const textarea = document.createElement('textarea');
        textarea.value = fullContent;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('📋 Copied to clipboard!');
      }
    } catch {
      showToast('⚠️ Could not copy: clipboard permission denied');
    }
  };

  // Direct Voice Input
  const toggleVoiceInput = () => {
    hapticTap();
    const SR = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      showToast('Speech recognition not supported in this browser. Use Chrome or Edge.');
      return;
    }

    if (isVoiceRecording) {
      recognitionRef.current?.stop();
      setIsVoiceRecording(false);
      showToast('⏹ Voice dictation stopped');
      return;
    }

    const rec = new SR();
    rec.lang = voiceLang;
    rec.continuous = true;
    rec.interimResults = true;

    rec.onstart = () => {
      setIsVoiceRecording(true);
      showToast(`🎙️ Listening in ${voiceLang === 'te-IN' ? 'Telugu' : 'English'}... speak now`);
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

  // Export DOCX
  const handleExportDocx = async () => {
    hapticTap();
    if (!editorRef.current) return;
    try {
      const res = await exportTextEntryDocx(
        { ...entry, title, entryDate },
        editorRef.current.innerHTML
      );
      showToast(res === 'shared' ? '📄 Shared document' : '📄 Word doc (.docx) saved!');
    } catch (e: any) {
      showToast('Export failed: ' + (e?.message || e));
    }
  };

  // Cross-platform PDF Export (works seamlessly on Android APK and Web)
  const handleExportPdf = async () => {
    hapticTap();
    if (!editorRef.current) return;
    try {
      showToast('Generating PDF…');
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 18;
      const contentWidth = pageWidth - margin * 2;

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(33, 24, 18);
      const titleLines = doc.splitTextToSize(title || 'Untitled Entry', contentWidth);
      doc.text(titleLines, margin, 24);
      let cursorY = 24 + titleLines.length * 8;

      // Metadata Bar
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(120, 100, 90);
      const metaText = `Date: ${entryDate}  |  Created: ${new Date(entry.createdAt || entry.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}  |  Words: ${wordCount}`;
      doc.text(metaText, margin, cursorY);
      cursorY += 6;

      // Divider line
      doc.setDrawColor(210, 185, 165);
      doc.setLineWidth(0.35);
      doc.line(margin, cursorY, pageWidth - margin, cursorY);
      cursorY += 8;

      // Body text with multi-page pagination
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(40, 30, 25);
      const rawText = editorRef.current.innerText || '';
      const paragraphs = rawText.split(/\n/);

      for (const p of paragraphs) {
        if (!p.trim()) {
          cursorY += 4.5;
          continue;
        }
        const lines = doc.splitTextToSize(p, contentWidth);
        for (const line of lines) {
          if (cursorY > pageHeight - 20) {
            doc.addPage();
            cursorY = 20;
          }
          doc.text(line, margin, cursorY);
          cursorY += 6.5;
        }
        cursorY += 3;
      }

      // Convert to Uint8Array for cross-platform delivery
      const arrayBuffer = doc.output('arraybuffer');
      const bytes = new Uint8Array(arrayBuffer);
      const safeName = (title || 'diary_note').replace(/[^\w-]/g, '_').slice(0, 50);
      const filename = `${safeName || 'diary_note'}.pdf`;

      const res = await saveOrShareFile({
        filename,
        bytes,
        mime: 'application/pdf',
        title: title || 'Diary Entry PDF',
        dialogTitle: 'Save or Share PDF Note',
      });

      if (res === 'shared') {
        showToast('📄 PDF ready in share & save dialog!');
      } else {
        showToast('📄 PDF downloaded successfully!');
      }
    } catch (e: any) {
      console.error('PDF export error:', e);
      showToast('PDF export failed: ' + (e?.message || e));
    }
  };

  // Timestamps
  const createdAtFormatted = new Date(entry.createdAt || entry.timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const updatedAtFormatted = new Date(entry.updatedAt || entry.lastEdited || entry.timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const EMOJIS = ['😊', '❤️', '✨', '🙏', '💭', '🔥', '🎉', '🌟', '💡', '🌿', '☕', '📝', '🌧️', '⚡', '🌸', '🏆'];
  const HIGHLIGHT_COLORS = [
    { label: 'Yellow', color: '#fef08a' },
    { label: 'Green', color: '#bbf7d0' },
    { label: 'Blue', color: '#bfdbfe' },
    { label: 'Pink', color: '#fbcfe8' },
    { label: 'Orange', color: '#fed7aa' },
    { label: 'Clear', color: 'transparent' },
  ];

  const TEXT_COLORS = [
    { label: 'Default', color: 'var(--text)' },
    { label: 'Violet', color: '#8b5cf6' },
    { label: 'Blue', color: '#3b82f6' },
    { label: 'Emerald', color: '#10b981' },
    { label: 'Amber', color: '#f59e0b' },
    { label: 'Rose', color: '#f43f5e' },
  ];

  const readingTimeMins = Math.max(1, Math.ceil(wordCount / 180));

  return (
    <div className="fullscreen-editor-container" role="region" aria-label="Diary Editor">
      {/* Top Header Bar */}
      <header className="editor-top-bar">
        <div className="editor-top-left">
          <button
            type="button"
            className="editor-back-btn action-btn"
            onClick={handleBack}
            title="Back to Diary (Auto-saves)"
          >
            <span className="back-arrow">←</span>
            <span className="back-label">Back</span>
          </button>

          <div className="editor-status-pill" title={`Last saved: ${lastSavedTime}`}>
            {saveStatus === 'saving' && <span className="status-badge saving">⏳ Saving…</span>}
            {saveStatus === 'saved' && (
              <span className="status-badge saved">
                {syncState === 'synced' ? '☁️ Synced' : '💾 Saved'}
              </span>
            )}
            {saveStatus === 'offline' && <span className="status-badge offline">⚠️ Offline Draft</span>}
            {saveStatus === 'error' && <span className="status-badge error">❌ Sync Failed</span>}
          </div>
        </div>

        <div className="editor-top-right">
          <button
            type="button"
            className="editor-pill-btn copy-pill"
            onClick={handleCopyText}
            title="Copy entry text with line breaks"
          >
            📋 <span className="btn-text">Copy</span>
          </button>

          <button
            type="button"
            className="editor-pill-btn export-btn"
            onClick={handleExportDocx}
            title="Export as Microsoft Word (.docx)"
          >
            📄 <span className="btn-text">Word</span>
          </button>

          <button
            type="button"
            className="editor-pill-btn export-btn"
            onClick={handleExportPdf}
            title="Export as PDF"
          >
            📑 <span className="btn-text">PDF</span>
          </button>

          <button
            type="button"
            className="editor-pill-btn delete-btn"
            onClick={() => setShowConfirmDelete(true)}
            title="Move to Recycle Bin"
          >
            <TrashIcon size={16} />
          </button>
        </div>
      </header>

      {/* Main Writing Canvas */}
      <main className="editor-scroll-area" ref={scrollAreaRef}>
        <div className="editor-document-sheet">
          {/* Metadata Row: Entry Date, Word count, Timestamps */}
          <div className="editor-meta-header">
            <div className="editor-meta-left">
              <span className="editor-date-chip" title="Entry Date">
                📅 {entryDate}
              </span>
              <span className="editor-words-chip">
                {wordCount} {wordCount === 1 ? 'word' : 'words'}
              </span>
              <span className="editor-words-chip reading-time" title="Estimated reading time">
                📖 ~{readingTimeMins} min read
              </span>
            </div>

            <div className="editor-meta-right">
              <span className="editor-timestamp-text" title="Original Creation Timestamp">
                Created: {createdAtFormatted}
              </span>
              <span className="editor-timestamp-sep">•</span>
              <span className="editor-timestamp-text" title="Last Edited Timestamp">
                Edited: {updatedAtFormatted}
              </span>
            </div>
          </div>

          {/* Title Input */}
          <div className="editor-title-container">
            <input
              type="text"
              className="editor-title-input"
              placeholder="Title your entry…"
              value={title}
              onChange={e => handleTitleChange(e.target.value)}
              maxLength={120}
            />
          </div>

          {/* Rich Text Toolbar */}
          <div className="editor-toolbar" role="toolbar" aria-label="Text Formatting">
            {/* Font Family Selector */}
            <select
              className="toolbar-select font-select"
              value={selectedFont}
              onChange={e => applyFontFamily(e.target.value)}
              title="Font Family"
            >
              <option value="'Plus Jakarta Sans', system-ui, sans-serif">Modern Sans</option>
              <option value="'Merriweather', Georgia, serif">Classic Serif</option>
              <option value="'Courier New', Courier, monospace">Typewriter</option>
              <option value="'Comic Sans MS', cursive, sans-serif">Handwriting</option>
            </select>

            {/* Font Size Selector */}
            <select
              className="toolbar-select size-select"
              value={selectedFontSize}
              onChange={e => applyFontSize(e.target.value)}
              title="Font Size"
            >
              <option value="14px">Small (14px)</option>
              <option value="16px">Normal (16px)</option>
              <option value="18px">Medium (18px)</option>
              <option value="22px">Large (22px)</option>
              <option value="26px">Heading (26px)</option>
            </select>

            <span className="toolbar-divider" />

            {/* Text Color Picker */}
            <div className="toolbar-dropdown-container">
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => {
                  setShowColorPicker(!showColorPicker);
                  setShowHighlightPicker(false);
                  setShowEmojiPicker(false);
                }}
                title="Text Color"
              >
                🎨 Text
              </button>
              {showColorPicker && (
                <div className="toolbar-color-palette">
                  {TEXT_COLORS.map(c => (
                    <button
                      key={c.label}
                      type="button"
                      className="color-dot-btn"
                      style={{ backgroundColor: c.color }}
                      onClick={() => applyTextColor(c.color)}
                      title={c.label}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Highlighter Picker */}
            <div className="toolbar-dropdown-container">
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => {
                  setShowHighlightPicker(!showHighlightPicker);
                  setShowColorPicker(false);
                  setShowEmojiPicker(false);
                }}
                title="Highlight Background"
              >
                🖍️ Mark
              </button>
              {showHighlightPicker && (
                <div className="toolbar-color-palette">
                  {HIGHLIGHT_COLORS.map(c => (
                    <button
                      key={c.label}
                      type="button"
                      className="color-dot-btn"
                      style={{ backgroundColor: c.color === 'transparent' ? '#555' : c.color }}
                      onClick={() => applyHighlightColor(c.color)}
                      title={c.label}
                    >
                      {c.color === 'transparent' && '✕'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <span className="toolbar-divider" />

            <button type="button" className="toolbar-btn" onClick={() => execCmd('bold')} title="Bold">
              <strong>B</strong>
            </button>
            <button type="button" className="toolbar-btn" onClick={() => execCmd('italic')} title="Italic">
              <em>I</em>
            </button>
            <button type="button" className="toolbar-btn" onClick={() => execCmd('underline')} title="Underline">
              <u>U</u>
            </button>
            <button type="button" className="toolbar-btn" onClick={() => execCmd('strikeThrough')} title="Strikethrough">
              <s>S</s>
            </button>

            <span className="toolbar-divider" />

            <button type="button" className="toolbar-btn" onClick={() => execCmd('formatBlock', '<h2>')} title="Heading">
              H2
            </button>
            <button type="button" className="toolbar-btn" onClick={() => execCmd('formatBlock', '<blockquote>')} title="Quote">
              ”
            </button>
            <button type="button" className="toolbar-btn" onClick={() => execCmd('insertUnorderedList')} title="Bullet List">
              • List
            </button>
            <button type="button" className="toolbar-btn" onClick={() => execCmd('insertOrderedList')} title="Numbered List">
              1. List
            </button>

            <span className="toolbar-divider" />

            <button type="button" className="toolbar-btn" onClick={() => execCmd('justifyLeft')} title="Align Left">
              ⇤
            </button>
            <button type="button" className="toolbar-btn" onClick={() => execCmd('justifyCenter')} title="Align Center">
              ≡
            </button>
            <button type="button" className="toolbar-btn" onClick={() => execCmd('justifyRight')} title="Align Right">
              ⇥
            </button>
            <button type="button" className="toolbar-btn" onClick={() => execCmd('justifyFull')} title="Justify Full">
              ≡≡
            </button>
            <button type="button" className="toolbar-btn" onClick={() => execCmd('insertHorizontalRule')} title="Horizontal Divider Line">
              ―
            </button>
            <button type="button" className="toolbar-btn" onClick={() => execCmd('removeFormat')} title="Clear Formatting">
              🧹
            </button>

            <span className="toolbar-divider" />

            {/* Emojis dropdown toggle */}
            <div className="toolbar-dropdown-container">
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                title="Insert Emoji"
              >
                😊
              </button>
              {showEmojiPicker && (
                <div className="toolbar-emoji-grid">
                  {EMOJIS.map(em => (
                    <button
                      key={em}
                      type="button"
                      className="emoji-item-btn"
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

            {/* Voice Dictation Button */}
            <div className="toolbar-voice-group">
              <select
                className="toolbar-lang-select"
                value={voiceLang}
                onChange={e => setVoiceLang(e.target.value as 'te-IN' | 'en-IN')}
                title="Dictation Language"
              >
                <option value="te-IN">Telugu</option>
                <option value="en-IN">English</option>
              </select>
              <button
                type="button"
                className={`toolbar-voice-btn ${isVoiceRecording ? 'recording' : ''}`}
                onClick={toggleVoiceInput}
                title="Voice Dictation into Note"
              >
                {isVoiceRecording ? '🔴 Listening…' : '🎙️ Dictate'}
              </button>
            </div>
          </div>

          {/* Editable Canvas */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            className="editor-editable-area"
            onInput={handleContentInput}
            role="textbox"
            aria-multiline="true"
            aria-label="Diary Entry Body"
            placeholder="Write your thoughts, memories, and voice reflections here…"
          />
        </div>
      </main>

      {/* Delete Confirmation Dialog */}
      {showConfirmDelete && (
        <ConfirmDialog
          title="Move to Recycle Bin?"
          message={`Are you sure you want to delete "${title}"? It will be moved to the Recycle Bin and can be recovered within 30 days.`}
          confirmLabel="Move to Bin"
          onConfirm={() => {
            setShowConfirmDelete(false);
            moveNoteToTrash(entry);
            deleteTextEntry(entry.id);
            void dbDeleteDraft(entry.id);
            onDelete(entry.id);
            showToast('🗑️ Moved to Recycle Bin (30-day recovery)');
          }}
          onCancel={() => setShowConfirmDelete(false)}
        />
      )}
    </div>
  );
}
