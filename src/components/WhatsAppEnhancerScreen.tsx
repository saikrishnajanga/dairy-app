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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const enhanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (enhanceTimerRef.current) clearTimeout(enhanceTimerRef.current);
    enhanceTimerRef.current = setTimeout(() => {
      runEnhance(inputText);
    }, 200);
    return () => {
      if (enhanceTimerRef.current) clearTimeout(enhanceTimerRef.current);
    };
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
    <div className="tab-content wa-enhancer-screen">
      {/* Sleek, Compact Mobile-First Header */}
      <div className="wa-top-header-row">
        {onBack && (
          <button
            type="button"
            className="action-btn back-btn wa-header-back-btn"
            onClick={() => {
              hapticTap();
              onBack();
            }}
            title="Back to Home"
          >
            <BackIcon size={16} />
            <span>Back</span>
          </button>
        )}
        <div className="wa-header-titles">
          <h2 className="wa-header-title">💬 WhatsApp Chat Cleaner</h2>
          <span className="wa-header-subtitle">Strips timestamps, dates & senders into clean text</span>
        </div>
        <button
          type="button"
          className="wa-header-guide-btn"
          onClick={() => {
            hapticTap();
            setShowGuide(g => !g);
          }}
          title="Export Guide"
        >
          {showGuide ? '✕ Close' : '❓ Guide'}
        </button>
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
              <span>Tap menu (⋮) or contact name &gt; <strong>More</strong> &gt; <strong>Export Chat</strong>.</span>
            </div>
            <div className="wa-guide-step">
              <span className="wa-step-num">3</span>
              <span>Select <strong>Without Media</strong> to generate a clean .txt export.</span>
            </div>
            <div className="wa-guide-step">
              <span className="wa-step-num">4</span>
              <span>Copy text and paste it below!</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Responsive Layout */}
      <div className="wa-workspace-flow">
        {/* Input Section */}
        <div className="wa-card wa-input-card">
          <div className="wa-card-header">
            <div className="wa-card-header-left">
              <span className="wa-card-title">📝 Paste WhatsApp Chat</span>
              {inputText.length > 0 && (
                <span className="wa-count-tag">
                  {inputText.length.toLocaleString()} chars
                </span>
              )}
            </div>

            <div className="wa-card-actions">
              <button type="button" className="wa-btn-secondary" onClick={handlePaste} title="Paste from clipboard">
                📋 Paste
              </button>
              <button type="button" className="wa-btn-secondary" onClick={handleLoadSample} title="Load sample chat">
                💡 Sample
              </button>
              {inputText.length > 0 && (
                <button type="button" className="wa-btn-ghost danger" onClick={handleClear} title="Clear text">
                  <TrashIcon size={14} /> Clear
                </button>
              )}
            </div>
          </div>

          <div className="wa-textarea-wrapper">
            <textarea
              ref={textareaRef}
              className="wa-textarea"
              placeholder="Paste exported WhatsApp chat or copied messages here (Android, iOS & Web formats supported)…"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              rows={4}
              aria-label="WhatsApp chat input"
            />
          </div>

          {/* Options Row (Responsive pills) */}
          <div className="wa-options-row">
            <div className="wa-mode-pills">
              <button
                type="button"
                className={`wa-pill-btn ${mode === 'single_paragraph' ? 'active' : ''}`}
                onClick={() => setMode('single_paragraph')}
              >
                Continuous Flow
              </button>
              <button
                type="button"
                className={`wa-pill-btn ${mode === 'preserve_lines' ? 'active' : ''}`}
                onClick={() => setMode('preserve_lines')}
              >
                Line by Line
              </button>
            </div>

            <div className="wa-checkbox-chips">
              <label className={`wa-chip-label ${removeSystem ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={removeSystem}
                  onChange={e => setRemoveSystem(e.target.checked)}
                />
                <span>Clean Notices</span>
              </label>
              <label className={`wa-chip-label ${autoPunctuate ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={autoPunctuate}
                  onChange={e => setAutoPunctuate(e.target.checked)}
                />
                <span>Add (.)</span>
              </label>
              <label className={`wa-chip-label ${removeEmojis ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={removeEmojis}
                  onChange={e => setRemoveEmojis(e.target.checked)}
                />
                <span>No Emojis</span>
              </label>
            </div>
          </div>
        </div>

        {/* Output Section */}
        <div className={`wa-card wa-output-card ${hasOutput ? 'has-content' : ''}`}>
          <div className="wa-card-header">
            <div className="wa-card-header-left">
              <span className="wa-card-title highlight">✨ Clean Extracted Text</span>
              {hasOutput && outputResult && (
                <span className="wa-count-tag">
                  {outputResult.outputWordCount.toLocaleString()} words • ~{readingTimeMins}m read
                </span>
              )}
            </div>

            {hasOutput && (
              <div className="wa-card-actions">
                <button
                  type="button"
                  className="wa-btn-primary wa-btn-share-mobile"
                  onClick={handleShareToWhatsApp}
                  title="Send directly to WhatsApp"
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
                  className="wa-btn-bigger-screen"
                  onClick={() => {
                    hapticTap();
                    setIsFullScreenOutput(true);
                  }}
                  title="Open output in full screen view"
                >
                  <MaximizeIcon size={13} />
                  <span>⛶ Bigger View</span>
                </button>
                <button
                  type="button"
                  className={`wa-btn-secondary ${isSpeaking ? 'active' : ''}`}
                  onClick={handleSpeak}
                  title="Read aloud"
                >
                  {isSpeaking ? '⏹️' : '🔊'}
                </button>
              </div>
            )}
          </div>

          {/* Output Text Area */}
          <div className="wa-textarea-wrapper">
            {hasOutput ? (
              <textarea
                className="wa-textarea wa-output-textarea"
                value={outputResult?.result || ''}
                onChange={e => {
                  setOutputResult(prev => (prev ? { ...prev, result: e.target.value } : null));
                }}
                rows={7}
                aria-label="Extracted continuous text output"
              />
            ) : (
              <div className="wa-compact-empty">
                <span>🪄 Paste your chat above or click <strong>Sample</strong> to extract clean continuous text.</span>
              </div>
            )}
          </div>

          {hasOutput && (
            <div className="wa-bottom-bar">
              <div className="wa-bottom-note">
                ✅ Timestamps, dates, and senders removed into clean text.
              </div>
              <div className="wa-bottom-actions">
                <button
                  type="button"
                  className="wa-btn-secondary"
                  onClick={handleDownloadTxt}
                  title="Download .txt"
                >
                  📥 .txt
                </button>
                <button
                  type="button"
                  className="wa-btn-bigger-screen"
                  onClick={() => setIsFullScreenOutput(true)}
                  title="Expand to Fullscreen Bigger View"
                >
                  <MaximizeIcon size={14} />
                  <span>⛶ Fullscreen</span>
                </button>
                <button
                  type="button"
                  className={`wa-btn-primary ${isCopied ? 'copied' : ''}`}
                  onClick={handleCopy}
                >
                  {isCopied ? '✓ Copied' : '📋 Copy All'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bigger Screen (Full-Screen) Modal */}
      {isFullScreenOutput && outputResult && (
        <div className="wa-fullscreen-modal" role="dialog" aria-modal="true">
          <div className="wa-fs-header">
            <div className="wa-fs-header-left">
              <button
                type="button"
                className="wa-fs-close-btn"
                onClick={() => setIsFullScreenOutput(false)}
                title="Close bigger view (Esc)"
              >
                <MinimizeIcon size={16} />
                <span>Close</span>
              </button>
              <div className="wa-fs-meta">
                <span className="wa-fs-title">📖 WhatsApp Cleaned Text</span>
                <span className="wa-fs-stats">
                  {outputResult.outputWordCount.toLocaleString()} words • ~{readingTimeMins} min read
                </span>
              </div>
            </div>

            <div className="wa-fs-toolbar">
              {/* Theme Selector */}
              <div className="wa-fs-theme-selector">
                {(['default', 'sepia', 'dark', 'focus'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    className={`wa-fs-theme-btn wa-fs-theme-${t} ${fsTheme === t ? 'active' : ''}`}
                    onClick={() => {
                      hapticTap();
                      setFsTheme(t);
                    }}
                    title={`${t} theme`}
                  >
                    {t === 'default' ? '🌙' : t === 'sepia' ? '📜' : t === 'dark' ? '⬛' : '🎯'}
                  </button>
                ))}
              </div>

              {/* Font Size Controls */}
              <div className="wa-fs-btn-group">
                <button
                  type="button"
                  className="wa-fs-tool-btn"
                  onClick={() => setFsFontSize(s => Math.max(14, s - 2))}
                  title="Smaller text"
                >
                  A-
                </button>
                <span className="wa-fs-size-label">{fsFontSize}px</span>
                <button
                  type="button"
                  className="wa-fs-tool-btn"
                  onClick={() => setFsFontSize(s => Math.min(32, s + 2))}
                  title="Larger text"
                >
                  A+
                </button>
              </div>

              {/* Line Height Toggle */}
              <button
                type="button"
                className={`wa-fs-tool-btn ${fsLineHeight === 'relaxed' ? 'active' : ''}`}
                onClick={() => setFsLineHeight(h => (h === 'normal' ? 'relaxed' : 'normal'))}
                title="Toggle line spacing"
              >
                ↕ Spacing
              </button>

              {/* Action Buttons */}
              <button
                type="button"
                className="wa-fs-tool-btn primary"
                onClick={handleShareToWhatsApp}
                title="Share to WhatsApp"
                style={{ background: '#25d366', color: '#fff', border: 'none' }}
              >
                💬 WhatsApp
              </button>
              <button
                type="button"
                className="wa-fs-tool-btn primary"
                onClick={handleCopy}
              >
                {isCopied ? '✓ Copied' : '📋 Copy'}
              </button>
              <button
                type="button"
                className="wa-fs-tool-btn"
                onClick={handleSaveToDiary}
                title="Save as note"
              >
                ✍️ Save
              </button>
            </div>
          </div>

          <div className={`wa-fs-body theme-${fsTheme} line-${fsLineHeight}`}>
            <textarea
              className="wa-fs-textarea"
              style={{ fontSize: `${fsFontSize}px` }}
              value={outputResult.result}
              onChange={e => {
                setOutputResult(prev => (prev ? { ...prev, result: e.target.value } : null));
              }}
              aria-label="Full-screen continuous text editor"
            />
          </div>
        </div>
      )}
    </div>
  );
}
