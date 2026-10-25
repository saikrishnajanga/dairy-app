import { useState, useEffect } from 'react';
import { TrashIcon } from './Icons';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { transliterate } from '../services/transliterator';
import { hapticTap } from '../services/utils';

interface Props {
  onBack?: () => void;
  showToast?: (msg: string) => void;
  onSendToDiary?: (teluguText: string, romanizedText: string) => void;
}

const TeluguUniversalConverter = ({ onBack, showToast, onSendToDiary }: Props) => {
  const [mode, setMode] = useState<'speech' | 'text'>('speech');
  const [pastedTelugu, setPastedTelugu] = useState('');
  const [customRoman, setCustomRoman] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Hook for robust, deduplicated speech recognition with Telugu + Roman transliteration
  const {
    isListening,
    teluguText,
    romanizedText,
    interimTelugu,
    interimText,
    startListening,
    stopListening,
    clearTranscript,
    setTeluguText,
  } = useSpeechToText();

  // Active Telugu and Roman text depending on mode
  const currentTelugu = mode === 'speech'
    ? [teluguText, interimTelugu].filter(Boolean).join(' ')
    : pastedTelugu;

  const currentRoman = customRoman !== null
    ? customRoman
    : mode === 'speech'
      ? [romanizedText, interimText].filter(Boolean).join(' ')
      : (pastedTelugu.trim() ? transliterate(pastedTelugu) : '');

  // Reset custom Roman override when mode or source text resets
  useEffect(() => {
    if (!currentTelugu) {
      setCustomRoman(null);
    }
  }, [currentTelugu]);

  const handleTeluguChange = (val: string) => {
    setCustomRoman(null);
    if (mode === 'speech') {
      setTeluguText(val);
    } else {
      setPastedTelugu(val);
    }
  };

  const handleRomanChange = (val: string) => {
    setCustomRoman(val);
  };

  const handleToggleListening = () => {
    hapticTap();
    if (isListening) {
      stopListening();
    } else {
      setCustomRoman(null);
      startListening();
    }
  };

  const handleClearAll = () => {
    hapticTap();
    clearTranscript();
    setPastedTelugu('');
    setCustomRoman(null);
    showToast?.('🧹 Cleared');
  };

  const copyOutput = async () => {
    if (!currentRoman) return;
    hapticTap();
    try {
      await navigator.clipboard.writeText(currentRoman);
      setCopied(true);
      showToast?.('📋 Romanized text copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast?.('Could not copy text');
    }
  };

  const handleSaveToDiary = () => {
    if (!currentRoman && !currentTelugu) return;
    hapticTap();
    onSendToDiary?.(currentTelugu, currentRoman);
    showToast?.('✅ Saved to Diary!');
  };

  const shareToWhatsApp = () => {
    if (!currentRoman && !currentTelugu) return;
    hapticTap();
    const textToShare = currentRoman || currentTelugu;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(textToShare)}`;
    if (navigator.share) {
      navigator.share({
        title: 'Telugu Romanized Note',
        text: textToShare,
      }).catch(() => {
        window.open(waUrl, '_blank');
      });
    } else {
      window.open(waUrl, '_blank');
    }
    showToast?.('💬 Opening WhatsApp to share...');
  };

  return (
    <div className="tab-content telugu-converter-screen">
      {/* Compact Header */}
      <div className="converter-header-row">
        {onBack && (
          <button type="button" className="action-btn back-btn" onClick={onBack}>
            ← Back
          </button>
        )}
        <div style={{ flex: 1 }}>
          <h2 className="converter-title" style={{ fontSize: '1.15rem', margin: 0, fontWeight: 700 }}>
            🔄 Telugu ↔ English Words Converter
          </h2>
          <p className="converter-subtitle" style={{ fontSize: '0.82rem', margin: '4px 0 0', opacity: 0.8 }}>
            Speak natural Telugu or paste Telugu script for instant phonetic English words without repetition.
          </p>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="converter-mode-switch" style={{ display: 'flex', gap: '8px', margin: '14px 0' }}>
        <button
          type="button"
          onClick={() => {
            hapticTap();
            setMode('speech');
          }}
          className={`converter-mode-btn ${mode === 'speech' ? 'active' : ''}`}
          style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 600 }}
        >
          🎙️ Telugu Speech Mode
        </button>
        <button
          type="button"
          onClick={() => {
            hapticTap();
            if (isListening) stopListening();
            setMode('text');
          }}
          className={`converter-mode-btn ${mode === 'text' ? 'active' : ''}`}
          style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 600 }}
        >
          ⌨️ Text Paste Mode
        </button>
      </div>

      {/* Telugu Input Card */}
      <div className="converter-card" style={{ marginBottom: '14px' }}>
        <div className="converter-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label className="converter-label" style={{ fontWeight: 600, fontSize: '0.88rem' }}>
            {mode === 'speech' ? '🎙️ Telugu Speech Recognition' : '📝 Telugu Text Input'}
          </label>
          {currentTelugu && (
            <button
              type="button"
              className="action-btn-sm"
              onClick={handleClearAll}
              style={{ fontSize: '0.78rem', padding: '4px 8px' }}
            >
              Clear
            </button>
          )}
        </div>

        <textarea
          value={currentTelugu}
          onChange={e => handleTeluguChange(e.target.value)}
          placeholder={mode === 'speech' ? 'Tap Start Speaking below and speak natural Telugu…' : 'Paste or type Telugu text here (e.g. విష్ణు తిన్నావా ఏం చేస్తున్నావ్?)…'}
          className="converter-textarea"
          rows={3}
          style={{ width: '100%', boxSizing: 'border-box' }}
        />

        {mode === 'speech' && (
          <div className="converter-speech-action" style={{ marginTop: '10px' }}>
            <button
              type="button"
              onClick={handleToggleListening}
              className={`action-btn primary large-record-btn ${isListening ? 'danger recording' : ''}`}
              style={{
                width: '100%',
                padding: '12px 18px',
                borderRadius: '12px',
                fontWeight: 700,
                fontSize: '0.95rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {isListening ? '⏹️ Stop Listening' : '🎙️ Start Speaking Telugu'}
            </button>
          </div>
        )}
      </div>

      {/* Output Card */}
      <div className="converter-card output-card">
        <div className="converter-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label className="converter-label highlight" style={{ fontWeight: 600, fontSize: '0.88rem', color: '#10b981' }}>
            📤 Romanized English Script (Editable)
          </label>
          {currentRoman && (
            <span className="converted-badge" style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
              ✓ Phonetic Match
            </span>
          )}
        </div>

        <textarea
          value={currentRoman}
          onChange={e => handleRomanChange(e.target.value)}
          placeholder="Romanized English transliteration appears here automatically (e.g. Vishnu tinnaavaa em chestunnaav)…"
          className="converter-textarea output-textarea"
          rows={4}
          style={{ width: '100%', boxSizing: 'border-box' }}
        />

        {currentRoman && (
          <div className="converter-actions-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
            <button
              type="button"
              onClick={shareToWhatsApp}
              className="action-btn"
              style={{
                flex: 1,
                minWidth: '130px',
                background: '#25d366',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                padding: '10px 14px',
                borderRadius: '10px',
                boxShadow: '0 2px 8px rgba(37, 211, 102, 0.3)',
              }}
            >
              💬 Share to WhatsApp
            </button>
            <button
              type="button"
              onClick={copyOutput}
              className="action-btn primary"
              style={{ flex: 1, minWidth: '110px', padding: '10px 14px', borderRadius: '10px', fontWeight: 600 }}
            >
              {copied ? '✅ Copied!' : '📋 Copy Output'}
            </button>
            {onSendToDiary && (
              <button
                type="button"
                onClick={handleSaveToDiary}
                className="action-btn accent"
                style={{ padding: '10px 14px', borderRadius: '10px', fontWeight: 600 }}
              >
                💾 Save as Note
              </button>
            )}
            <button
              type="button"
              onClick={handleClearAll}
              className="action-btn"
              style={{ padding: '10px 12px', borderRadius: '10px' }}
            >
              <TrashIcon size={14} style={{ marginRight: 4 }} />
              <span>Clear</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeluguUniversalConverter;
