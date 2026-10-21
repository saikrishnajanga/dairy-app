import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  enhanceWhatsAppChat,
  SAMPLE_WHATSAPP_CHAT,
  type EnhanceResult,
} from '../services/whatsappEnhancer';
import { createTextEntry } from '../services/textDiary';
import { hapticTap } from '../services/utils';
import { TrashIcon, BackIcon, MaximizeIcon, MinimizeIcon } from './Icons';

interface WhatsAppEnhancerScreenProps {
  showToast: (msg: string) => void;
  onNavigateToDiary?: () => void;
  onBack?: () => void;
}

export default function WhatsAppEnhancerScreen({
  showToast,
  onNavigateToDiary,
  onBack,
}: WhatsAppEnhancerScreenProps) {
  const [inputText, setInputText] = useState('');
  const [outputResult, setOutputResult] = useState<EnhanceResult | null>(null);
  const [mode, setMode] = useState<'single_paragraph' | 'preserve_lines'>('single_paragraph');
  const [removeSystem, setRemoveSystem] = useState(true);
  const [autoPunctuate, setAutoPunctuate] = useState(false);
  const [removeEmojis, setRemoveEmojis] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  // Bigger Screen (Full-Screen) state & preferences
  const [isFullScreenOutput, setIsFullScreenOutput] = useState(false);
  const [fsFontSize, setFsFontSize] = useState<number>(18);
  const [fsLineHeight, setFsLineHeight] = useState<'normal' | 'relaxed'>('relaxed');
  const [fsTheme, setFsTheme] = useState<'default' | 'sepia' | 'dark' | 'focus'>('default');
  const [isWideLayout, setIsWideLayout] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Run enhancement whenever inputs or options change
  const runEnhance = useCallback(
    (textToProcess: string) => {
      const res = enhanceWhatsAppChat(textToProcess, {
        mode,
        removeSystemMessages: removeSystem,
        autoPunctuate,
        removeEmojis,
      });
      setOutputResult(res);
    },
    [mode, removeSystem, autoPunctuate, removeEmojis]
  );

  useEffect(() => {
    runEnhance(inputText);
  }, [inputText, runEnhance]);

  // Support closing Full-Screen Output via Escape key
  useEffect(() => {
    if (!isFullScreenOutput) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullScreenOutput(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreenOutput]);

  // Handle clipboard paste
  const handlePaste = async () => {
    hapticTap();
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setInputText(text);
          showToast('📋 Pasted from clipboard!');
          return;
        }
      }
      textareaRef.current?.focus();
      showToast('👉 Press Ctrl+V (or Cmd+V) to paste');
    } catch {
      textareaRef.current?.focus();
      showToast('👉 Press Ctrl+V (or Cmd+V) to paste');
    }
  };

  // Handle Load Sample
  const handleLoadSample = () => {
    hapticTap();
    setInputText(SAMPLE_WHATSAPP_CHAT);
    showToast('💡 Sample WhatsApp chat loaded!');
  };

  // Handle Clear
  const handleClear = () => {
    hapticTap();
    setInputText('');
    setOutputResult(null);
    showToast('🧹 Cleared');
  };

  // Handle Copy
  const handleCopy = async () => {
    hapticTap();
    if (!outputResult?.result) {
      showToast('⚠️ No extracted text to copy');
      return;
    }
    try {
      await navigator.clipboard.writeText(outputResult.result);
      setIsCopied(true);
      showToast('📋 Extracted text copied to clipboard!');
      setTimeout(() => setIsCopied(false), 2500);
    } catch {
      showToast('Could not copy automatically');
    }
  };

  // Handle Save to Notebook (Text Diary)
  const handleSaveToDiary = () => {
    hapticTap();
    if (!outputResult?.result) {
      showToast('⚠️ No extracted text to save');
      return;
    }
    const title = `WhatsApp Notes — ${new Date().toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`;
    createTextEntry(title, outputResult.result);
    showToast('✍️ Saved to your Notebook Diary!');
    if (onNavigateToDiary) {
      onNavigateToDiary();
    }
  };

  // Handle Download as .txt file
  const handleDownloadTxt = () => {
    hapticTap();
    if (!outputResult?.result) {
      showToast('⚠️ No extracted text to download');
      return;
    }
    try {
      const blob = new Blob([outputResult.result], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whatsapp_cleaned_${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('📥 Downloaded text file!');
    } catch {
      showToast('Download failed');
    }
  };

  // Handle Direct Share to WhatsApp
  const handleShareToWhatsApp = () => {
    hapticTap();
    if (!outputResult?.result) {
      showToast('⚠️ No extracted text to share');
      return;
    }
    const textToShare = outputResult.result;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(textToShare)}`;
    if (navigator.share) {
      navigator.share({
        title: 'VoiceDiary WhatsApp Export',
        text: textToShare,
      }).catch(() => {
        window.open(waUrl, '_blank');
      });
    } else {
      window.open(waUrl, '_blank');
    }
    showToast('💬 Opening WhatsApp to share...');
  };

  // Text to Speech
  const handleSpeak = () => {
    hapticTap();
    if (!('speechSynthesis' in window)) {
      showToast('Speech not supported on this browser');
      return;
    }
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    if (!outputResult?.result) return;
    const utterance = new SpeechSynthesisUtterance(outputResult.result);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const hasOutput = Boolean(outputResult?.result);
  const readingTimeMins = outputResult ? Math.max(1, Math.ceil(outputResult.outputWordCount / 200)) : 1;

  return (
    <div className={`tab-content wa-enhancer-screen ${isWideLayout ? 'is-wide-layout' : ''}`}>
      {/* Top Navigation Row (Back Button) */}
      {onBack && (
        <div className="wa-top-nav-bar">
          <button
            type="button"
            className="action-btn back-btn wa-back-btn"
            onClick={() => {
              hapticTap();
              onBack();
            }}
            title="Back to Home"
          >
            <BackIcon size={16} />
            <span>Back to Home</span>
          </button>
        </div>
      )}

      {/* Hero Header */}
      <div className="wa-hero-card">
        <div className="wa-hero-left">
          <div className="wa-badge">
            <span className="wa-badge-dot" />
            <span className="wa-icon">💬</span>
            <span>WhatsApp Chat Cleaner & Enhancer</span>
          </div>
          <h2 className="wa-hero-title">Continuous Chat Extractor</h2>
          <p className="wa-hero-subtitle">
            Paste any WhatsApp chat export. Automatically strips all dates, timestamps, and
            sender names, and combines all messages into a single continuous text separated by a space.
          </p>
        </div>

        <div className="wa-hero-right-actions">
          {/* Wide Screen Layout Toggle */}
          <div className="wa-layout-mode-chips" title="Switch layout for bigger screens">
            <button
              type="button"
              className={`wa-layout-chip ${!isWideLayout ? 'active' : ''}`}
              onClick={() => {
                hapticTap();
                setIsWideLayout(false);
              }}
            >
              ↕️ Stacked
            </button>
            <button
              type="button"
              className={`wa-layout-chip ${isWideLayout ? 'active' : ''}`}
              onClick={() => {
                hapticTap();
                setIsWideLayout(true);
              }}
            >
              ↔️ Wide Screen
            </button>
          </div>

          <button
            type="button"
            className="wa-help-btn"
            onClick={() => {
              hapticTap();
              setShowGuide(g => !g);
            }}
            title="How to export chats from WhatsApp"
          >
            {showGuide ? '✕ Close Guide' : '❓ Export Guide'}
          </button>
        </div>
      </div>

      {/* Guide Banner (Collapsible) */}
      {showGuide && (
        <div className="wa-guide-card">
          <div className="wa-guide-title">📲 How to Export WhatsApp Chat:</div>
          <div className="wa-guide-steps">
            <div className="wa-guide-step">
              <span className="wa-step-num">1</span>
              <span>Open the WhatsApp chat you want to extract on Android or iPhone.</span>
            </div>
            <div className="wa-guide-step">
              <span className="wa-step-num">2</span>
              <span>Tap the top menu (⋮ on Android or contact name on iOS) &gt; <strong>More</strong> &gt; <strong>Export Chat</strong>.</span>
            </div>
            <div className="wa-guide-step">
              <span className="wa-step-num">3</span>
              <span>Select <strong>Without Media</strong> to generate a clean .txt export.</span>
            </div>
            <div className="wa-guide-step">
              <span className="wa-step-num">4</span>
              <span>Copy the text file content or copy selected messages directly, and paste them below!</span>
            </div>
          </div>
        </div>
      )}

      {/* Workspace Grid (Stacked by default or Side-by-Side in Wide Layout) */}
      <div className="wa-workspace-grid">
        {/* Input Section */}
        <div className="wa-card wa-input-card">
          <div className="wa-card-header">
            <div className="wa-card-header-left">
              <span className="wa-section-indicator">1</span>
              <span className="wa-card-title">Paste WhatsApp Content</span>
              {inputText.length > 0 && (
                <span className="wa-count-tag">
                  {inputText.length.toLocaleString()} chars • {inputText.split(/\r?\n/).filter(Boolean).length} lines
                </span>
              )}
            </div>

            <div className="wa-card-actions">
              <button type="button" className="wa-btn-secondary" onClick={handlePaste} title="Paste from clipboard">
                📋 Paste
              </button>
              <button type="button" className="wa-btn-secondary" onClick={handleLoadSample} title="Load sample WhatsApp conversation">
                💡 Sample Chat
              </button>
              {inputText.length > 0 && (
                <button type="button" className="wa-btn-ghost danger" onClick={handleClear} title="Clear text">
                  <TrashIcon size={14} style={{ marginRight: 6 }} /> Clear
                </button>
              )}
            </div>
          </div>

          <div className="wa-textarea-wrapper">
            <textarea
              ref={textareaRef}
              className="wa-textarea"
              placeholder="Paste your WhatsApp chat export here... (Supports multiple paragraphs, long chats, group chats, Android, iOS & Web formats)

Example:
12/10/2026, 10:45 AM - John Doe: Hello, how are you?
12/10/2026, 10:46 AM - Priya: Doing great! Let's connect today."
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              rows={8}
              aria-label="WhatsApp chat input"
            />
          </div>

          {/* Enhancement Controls */}
          <div className="wa-controls-row">
            <div className="wa-mode-toggle-group">
              <button
                type="button"
                className={`wa-toggle-btn ${mode === 'single_paragraph' ? 'active' : ''}`}
                onClick={() => {
                  hapticTap();
                  setMode('single_paragraph');
                }}
                title="Combine all messages into a single continuous text with each message separated by a space"
              >
                📄 Single Continuous Paragraph
              </button>
              <button
                type="button"
                className={`wa-toggle-btn ${mode === 'preserve_lines' ? 'active' : ''}`}
                onClick={() => {
                  hapticTap();
                  setMode('preserve_lines');
                }}
                title="Separate each cleaned message onto a new line"
              >
                📑 Clean Line-by-Line
              </button>
            </div>

            <div className="wa-toggles-options">
              <label className="wa-checkbox-label" title="Remove notices like <Media omitted>, encryption notices, and deleted messages">
                <input
                  type="checkbox"
                  checked={removeSystem}
                  onChange={e => {
                    hapticTap();
                    setRemoveSystem(e.target.checked);
                  }}
                />
                <span>Strip WhatsApp System Notices</span>
              </label>

              <label className="wa-checkbox-label" title="Ensure each sentence ends with proper punctuation">
                <input
                  type="checkbox"
                  checked={autoPunctuate}
                  onChange={e => {
                    hapticTap();
                    setAutoPunctuate(e.target.checked);
                  }}
                />
                <span>Auto-Punctuate (.)</span>
              </label>

              <label className="wa-checkbox-label" title="Remove emojis from final text">
                <input
                  type="checkbox"
                  checked={removeEmojis}
                  onChange={e => {
                    hapticTap();
                    setRemoveEmojis(e.target.checked);
                  }}
                />
                <span>Strip Emojis</span>
              </label>
            </div>
          </div>
        </div>

        {/* Output Section */}
        <div className={`wa-card wa-output-card ${hasOutput ? 'has-content' : ''}`}>
          <div className="wa-card-header">
            <div className="wa-card-header-left">
              <span className="wa-section-indicator wa-success-indicator">2</span>
              <span className="wa-card-title">Extracted Continuous Output</span>
            </div>

            <div className="wa-card-actions">
              {hasOutput && (
                <>
                  {/* Dedicated Bigger Screen Button in Header */}
                  <button
                    type="button"
                    className="wa-btn-bigger-screen"
                    onClick={() => {
                      hapticTap();
                      setIsFullScreenOutput(true);
                    }}
                    title="Open output in bigger screen / full screen view (Esc)"
                  >
                    <MaximizeIcon size={14} />
                    <span>⛶ Bigger Screen</span>
                  </button>

                  <button
                    type="button"
                    className="wa-btn-primary"
                    onClick={handleShareToWhatsApp}
                    title="Send directly to WhatsApp chat or contact"
                    style={{
                      background: 'linear-gradient(135deg, #25d366, #128c7e)',
                      color: '#ffffff',
                      fontWeight: 700,
                      boxShadow: '0 4px 12px rgba(37, 211, 102, 0.35)',
                    }}
                  >
                    💬 Share
                  </button>
                  <button
                    type="button"
                    className={`wa-btn-secondary ${isCopied ? 'copied' : ''}`}
                    onClick={handleCopy}
                    title="Copy continuous text to clipboard"
                  >
                    {isCopied ? '✓ Copied!' : '📋 Copy'}
                  </button>
                  <button
                    type="button"
                    className="wa-btn-secondary"
                    onClick={handleSaveToDiary}
                    title="Save into your Notebook Text Diary"
                  >
                    ✍️ Save
                  </button>
                  <button
                    type="button"
                    className="wa-btn-secondary"
                    onClick={handleDownloadTxt}
                    title="Download as .txt file"
                  >
                    📥 .txt
                  </button>
                  <button
                    type="button"
                    className={`wa-btn-secondary ${isSpeaking ? 'active' : ''}`}
                    onClick={handleSpeak}
                    title="Read aloud using Text-to-Speech"
                  >
                    {isSpeaking ? '⏹️ Stop' : '🔊 Listen'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Live Statistics Strip */}
          {hasOutput && outputResult && (
            <div className="wa-stats-strip">
              <div className="wa-stat-chip">
                <span className="wa-stat-icon">💬</span>
                <span className="wa-stat-value">{outputResult.messageCount}</span>
                <span className="wa-stat-label">Messages</span>
              </div>
              {outputResult.participants.length > 0 && (
                <div className="wa-stat-chip" title={outputResult.participants.join(', ')}>
                  <span className="wa-stat-icon">👥</span>
                  <span className="wa-stat-value">{outputResult.participants.length}</span>
                  <span className="wa-stat-label">Participants</span>
                </div>
              )}
              <div className="wa-stat-chip">
                <span className="wa-stat-icon">📝</span>
                <span className="wa-stat-value">{outputResult.outputWordCount.toLocaleString()}</span>
                <span className="wa-stat-label">Words</span>
              </div>
              <div className="wa-stat-chip">
                <span className="wa-stat-icon">📊</span>
                <span className="wa-stat-value">{outputResult.outputCharCount.toLocaleString()}</span>
                <span className="wa-stat-label">Chars</span>
              </div>
              {outputResult.systemNoticesRemoved > 0 && (
                <div className="wa-stat-chip">
                  <span className="wa-stat-icon">🧹</span>
                  <span className="wa-stat-value">{outputResult.systemNoticesRemoved}</span>
                  <span className="wa-stat-label">System notices cleaned</span>
                </div>
              )}
              <div className="wa-stat-chip accent">
                <span className="wa-stat-icon">✨</span>
                <span className="wa-stat-label">Dates, times & senders removed</span>
              </div>
            </div>
          )}

          {/* Prompt banner for Bigger Screen view */}
          {hasOutput && (
            <div
              className="wa-output-toolbar-strip"
              onClick={() => {
                hapticTap();
                setIsFullScreenOutput(true);
              }}
              style={{ cursor: 'pointer' }}
              title="Click to view output on a bigger screen"
            >
              <div className="wa-output-hint">
                <span>📖 Output Ready ({outputResult?.outputWordCount.toLocaleString()} words • ~{readingTimeMins}m read)</span>
              </div>
              <button
                type="button"
                className="wa-expand-banner-btn"
                onClick={e => {
                  e.stopPropagation();
                  hapticTap();
                  setIsFullScreenOutput(true);
                }}
              >
                <MaximizeIcon size={13} />
                <span>⛶ Open in Bigger Screen View</span>
              </button>
            </div>
          )}

          {/* Output Text Area (Now larger with 14 rows) */}
          <div className="wa-textarea-wrapper">
            {hasOutput ? (
              <textarea
                className="wa-textarea wa-output-textarea"
                value={outputResult?.result || ''}
                onChange={e => {
                  setOutputResult(prev => (prev ? { ...prev, result: e.target.value } : null));
                }}
                rows={13}
                aria-label="Extracted continuous text output"
              />
            ) : (
              <div className="wa-empty-state">
                <div className="wa-empty-icon">🪄</div>
                <div className="wa-empty-title">Ready to Enhance WhatsApp Chat</div>
                <div className="wa-empty-desc">
                  Paste your WhatsApp chat above or click <strong>Sample Chat</strong> to see all timestamps,
                  dates, and sender names removed into a clean continuous text.
                </div>
                <button type="button" className="wa-btn-primary small" onClick={handleLoadSample}>
                  💡 Try With Sample Chat
                </button>
              </div>
            )}
          </div>

          {/* Bottom Quick Action Bar */}
          {hasOutput && (
            <div className="wa-bottom-bar">
              <div className="wa-bottom-note">
                ✅ All timestamps, dates, and senders removed into one continuous paragraph.
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="wa-btn-secondary"
                  onClick={() => {
                    hapticTap();
                    setIsFullScreenOutput(true);
                  }}
                  title="Expand to Fullscreen Bigger View"
                >
                  <MaximizeIcon size={14} />
                  <span>⛶ Bigger Screen</span>
                </button>
                <button
                  type="button"
                  className={`wa-btn-primary ${isCopied ? 'copied' : ''}`}
                  onClick={handleCopy}
                >
                  {isCopied ? '✓ Copied to Clipboard!' : '📋 Copy Extracted Content'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ====================================================================
          BIGGER SCREEN / FULL-SCREEN OUTPUT MODAL OVERLAY
          ==================================================================== */}
      {isFullScreenOutput && hasOutput && (
        <div
          className={`wa-fullscreen-overlay wa-fs-theme-${fsTheme}`}
          role="dialog"
          aria-modal="true"
          aria-label="Full-Screen WhatsApp Chat Output"
        >
          {/* Top Header Bar */}
          <header className="wa-fs-header">
            <div className="wa-fs-header-left">
              <button
                type="button"
                className="action-btn back-btn wa-fs-back-btn"
                onClick={() => {
                  hapticTap();
                  setIsFullScreenOutput(false);
                }}
                title="Back to Editor (Esc)"
              >
                <BackIcon size={16} />
                <span>Back</span>
              </button>

              <div className="wa-fs-title-box">
                <h2 className="wa-fs-title">💬 WhatsApp Extracted Chat</h2>
                <span className="wa-fs-badge">Bigger Screen</span>
              </div>

              {outputResult && (
                <div className="wa-fs-stat-pills">
                  <span className="wa-fs-pill">📝 {outputResult.outputWordCount.toLocaleString()} words</span>
                  <span className="wa-fs-pill">💬 {outputResult.messageCount} messages</span>
                  <span className="wa-fs-pill">📊 {outputResult.outputCharCount.toLocaleString()} chars</span>
                  <span className="wa-fs-pill">⏱️ ~{readingTimeMins}m read</span>
                </div>
              )}
            </div>

            <div className="wa-fs-header-actions">
              <button
                type="button"
                className="wa-btn-primary"
                onClick={handleShareToWhatsApp}
                title="Send directly to WhatsApp"
                style={{
                  background: 'linear-gradient(135deg, #25d366, #128c7e)',
                  color: '#ffffff',
                  fontWeight: 700,
                  boxShadow: '0 4px 12px rgba(37, 211, 102, 0.35)',
                }}
              >
                💬 Share on WhatsApp
              </button>

              <button
                type="button"
                className={`wa-btn-secondary ${isCopied ? 'copied' : ''}`}
                onClick={handleCopy}
                title="Copy continuous text to clipboard"
              >
                {isCopied ? '✓ Copied!' : '📋 Copy Text'}
              </button>

              <button
                type="button"
                className="wa-btn-secondary"
                onClick={handleSaveToDiary}
                title="Save into your Notebook Text Diary"
              >
                ✍️ Save to Diary
              </button>

              <button
                type="button"
                className="wa-btn-secondary"
                onClick={handleDownloadTxt}
                title="Download as .txt file"
              >
                📥 Download
              </button>

              <button
                type="button"
                className={`wa-btn-secondary ${isSpeaking ? 'active' : ''}`}
                onClick={handleSpeak}
                title="Read aloud using Text-to-Speech"
              >
                {isSpeaking ? '⏹️ Stop' : '🔊 Listen'}
              </button>

              <button
                type="button"
                className="wa-fs-exit-btn"
                onClick={() => {
                  hapticTap();
                  setIsFullScreenOutput(false);
                }}
                title="Exit Full Screen (Esc)"
              >
                <MinimizeIcon size={16} />
                <span>Exit Bigger Screen</span>
              </button>
            </div>
          </header>

          {/* Reading Preferences Toolbar */}
          <div className="wa-fs-toolbar">
            <div className="wa-fs-tool-group">
              <span className="wa-fs-tool-label">Font Size:</span>
              <button
                type="button"
                className="wa-fs-tool-btn"
                onClick={() => setFsFontSize(s => Math.max(13, s - 2))}
                title="Decrease font size"
              >
                A-
              </button>
              <span className="wa-fs-size-display">{fsFontSize}px</span>
              <button
                type="button"
                className="wa-fs-tool-btn"
                onClick={() => setFsFontSize(s => Math.min(32, s + 2))}
                title="Increase font size"
              >
                A+
              </button>
            </div>

            <div className="wa-fs-tool-group">
              <span className="wa-fs-tool-label">Line Spacing:</span>
              <button
                type="button"
                className={`wa-fs-tool-btn ${fsLineHeight === 'normal' ? 'active' : ''}`}
                onClick={() => setFsLineHeight('normal')}
              >
                Compact
              </button>
              <button
                type="button"
                className={`wa-fs-tool-btn ${fsLineHeight === 'relaxed' ? 'active' : ''}`}
                onClick={() => setFsLineHeight('relaxed')}
              >
                Spacious
              </button>
            </div>

            <div className="wa-fs-tool-group">
              <span className="wa-fs-tool-label">Reading Theme:</span>
              <button
                type="button"
                className={`wa-fs-tool-btn ${fsTheme === 'default' ? 'active' : ''}`}
                onClick={() => setFsTheme('default')}
              >
                Standard
              </button>
              <button
                type="button"
                className={`wa-fs-tool-btn ${fsTheme === 'sepia' ? 'active' : ''}`}
                onClick={() => setFsTheme('sepia')}
              >
                📜 Sepia Book
              </button>
              <button
                type="button"
                className={`wa-fs-tool-btn ${fsTheme === 'dark' ? 'active' : ''}`}
                onClick={() => setFsTheme('dark')}
              >
                🌙 OLED Dark
              </button>
              <button
                type="button"
                className={`wa-fs-tool-btn ${fsTheme === 'focus' ? 'active' : ''}`}
                onClick={() => setFsTheme('focus')}
              >
                🎯 Clean Paper
              </button>
            </div>
          </div>

          {/* Massive Editor / Reading Surface */}
          <div className="wa-fs-editor-area">
            <textarea
              className="wa-fs-textarea"
              style={{
                fontSize: `${fsFontSize}px`,
                lineHeight: fsLineHeight === 'relaxed' ? '1.85' : '1.55',
              }}
              value={outputResult?.result || ''}
              onChange={e => {
                setOutputResult(prev => (prev ? { ...prev, result: e.target.value } : null));
              }}
              placeholder="Extracted continuous text..."
              aria-label="Full-screen continuous WhatsApp chat output"
            />
          </div>

          {/* Sticky Fullscreen Footer */}
          <footer className="wa-fs-footer">
            <div className="wa-fs-footer-info">
              ✨ Full continuous text extracted • Timestamps & sender names stripped • Press <kbd>Esc</kbd> or tap Back to return
            </div>
            <div className="wa-fs-footer-buttons">
              <button
                type="button"
                className={`wa-btn-primary ${isCopied ? 'copied' : ''}`}
                onClick={handleCopy}
              >
                {isCopied ? '✓ Copied to Clipboard!' : '📋 Copy All Text'}
              </button>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
}
