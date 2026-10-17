import { useState, useEffect } from 'react';

// ─── Comprehensive Telugu → Roman Transliteration ─────────────────────────

const VOWELS: Record<string, string> = {
  'అ': 'a', 'ఆ': 'aa', 'ఇ': 'i', 'ఈ': 'ee', 'ఉ': 'u', 'ఊ': 'oo',
  'ఋ': 'ru', 'ౠ': 'roo', 'ఎ': 'e', 'ఏ': 'ae', 'ఐ': 'ai',
  'ఒ': 'o', 'ఓ': 'oh', 'ఔ': 'au',
};

const CONSONANTS: Record<string, string> = {
  'క': 'ka', 'ఖ': 'kha', 'గ': 'ga', 'ఘ': 'gha', 'ఙ': 'nga',
  'చ': 'cha', 'ఛ': 'chha', 'జ': 'ja', 'ఝ': 'jha', 'ఞ': 'gna',
  'ట': 'ta', 'ఠ': 'tha', 'డ': 'da', 'ఢ': 'dha', 'ణ': 'na',
  'త': 'tha', 'థ': 'thha', 'ద': 'dha', 'ధ': 'dhha', 'న': 'na',
  'ప': 'pa', 'ఫ': 'pha', 'బ': 'ba', 'భ': 'bha', 'మ': 'ma',
  'య': 'ya', 'ర': 'ra', 'ల': 'la', 'వ': 'va', 'శ': 'sha',
  'ష': 'sha', 'స': 'sa', 'హ': 'ha', 'ళ': 'la', 'క్ష': 'ksha',
  'ఱ': 'rra',
};

// Consonant base (without inherent 'a')
const CONSONANT_BASES: Record<string, string> = {};
for (const [tel, rom] of Object.entries(CONSONANTS)) {
  CONSONANT_BASES[tel] = rom.endsWith('a') ? rom.slice(0, -1) : rom;
}

// Vowel signs (matras) that modify a consonant
const VOWEL_SIGNS: Record<string, string> = {
  'ా': 'aa', 'ి': 'i', 'ీ': 'ee', 'ు': 'u', 'ూ': 'oo',
  'ృ': 'ru', 'ౄ': 'roo', 'ె': 'e', 'ే': 'ae', 'ై': 'ai',
  'ొ': 'o', 'ో': 'oh', 'ౌ': 'au',
};

const HALANT = '్';   // virama — strips the inherent vowel
const ANUSVARA = 'ం';
const VISARGA = 'ః';
const CHANDRABINDU = 'ఁ';

// Telugu digits
const DIGITS: Record<string, string> = {
  '౦': '0', '౧': '1', '౨': '2', '౩': '3', '౪': '4',
  '౫': '5', '౬': '6', '౭': '7', '౮': '8', '౯': '9',
};

function isConsonant(ch: string): boolean {
  return ch in CONSONANTS;
}

function transliterateTeluguToRoman(text: string): string {
  const result: string[] = [];
  const chars = [...text]; // proper unicode split
  let i = 0;

  while (i < chars.length) {
    const ch = chars[i];
    const next = i + 1 < chars.length ? chars[i + 1] : '';

    // --- Telugu digit ---
    if (ch in DIGITS) {
      result.push(DIGITS[ch]);
      i++;
      continue;
    }

    // --- Standalone vowel ---
    if (ch in VOWELS) {
      result.push(VOWELS[ch]);
      i++;
      continue;
    }

    // --- Consonant ---
    if (isConsonant(ch)) {
      const base = CONSONANT_BASES[ch];

      if (next === HALANT) {
        // Halant: strip inherent vowel, check for conjunct
        const afterHalant = i + 2 < chars.length ? chars[i + 2] : '';
        if (isConsonant(afterHalant)) {
          // Conjunct consonant: output base without vowel, move to next consonant
          result.push(base);
          i += 2; // skip halant, next consonant will be processed in next iteration
          continue;
        } else {
          // Halant at end or before non-consonant: just the base
          result.push(base);
          i += 2;
          continue;
        }
      } else if (next in VOWEL_SIGNS) {
        // Consonant + vowel sign
        result.push(base + VOWEL_SIGNS[next]);
        i += 2;
        continue;
      } else {
        // Consonant with inherent 'a'
        result.push(base + 'a');
        i++;
        continue;
      }
    }

    // --- Anusvara ---
    if (ch === ANUSVARA) {
      result.push('m');
      i++;
      continue;
    }

    // --- Visarga ---
    if (ch === VISARGA) {
      result.push('h');
      i++;
      continue;
    }

    // --- Chandrabindu ---
    if (ch === CHANDRABINDU) {
      result.push('n');
      i++;
      continue;
    }

    // --- Vowel sign appearing standalone (rare) ---
    if (ch in VOWEL_SIGNS) {
      result.push(VOWEL_SIGNS[ch]);
      i++;
      continue;
    }

    // --- Space / punctuation / everything else pass through ---
    result.push(ch);
    i++;
  }

  return result.join('');
}

// ─── Component ────────────────────────────────────────────────────────────

interface Props {
  onBack?: () => void;
  showToast?: (msg: string) => void;
  onSendToDiary?: (teluguText: string, romanizedText: string) => void;
}

const TeluguUniversalConverter = ({ onBack, showToast, onSendToDiary }: Props) => {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  const [mode, setMode] = useState<'speech' | 'text'>('speech');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const SR = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SR) {
      const rec = new SR();
      rec.lang = 'te-IN';
      rec.continuous = true;
      rec.interimResults = true;

      rec.onstart = () => setIsListening(true);
      rec.onresult = (event: any) => {
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript + ' ';
          }
        }
        if (final) {
          setInputText(prev => {
            const newText = (prev + ' ' + final).trim();
            setOutputText(transliterateTeluguToRoman(newText));
            return newText;
          });
        }
      };
      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);

      setRecognition(rec);
      setIsSupported(true);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setInputText(text);
    setOutputText(transliterateTeluguToRoman(text));
  };

  const handleOutputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setOutputText(e.target.value);
  };

  const toggleListening = () => {
    if (!recognition || !isSupported) return;
    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      recognition.start();
    }
  };

  const convertText = () => {
    if (inputText) {
      setOutputText(transliterateTeluguToRoman(inputText));
    }
  };

  const copyOutput = async () => {
    if (outputText) {
      await navigator.clipboard.writeText(outputText);
      setCopied(true);
      showToast?.('📋 Romanized text copied!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSaveToDiary = () => {
    if (!outputText && !inputText) return;
    onSendToDiary?.(inputText, outputText);
    showToast?.('✅ Saved to Diary!');
  };

  const shareToWhatsApp = () => {
    if (!outputText && !inputText) return;
    const textToShare = outputText || inputText;
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
      <div className="converter-header-row">
        {onBack && (
          <button type="button" className="action-btn back-btn" onClick={onBack}>
            ← Back
          </button>
        )}
        <div>
          <h2 className="converter-title">🔄 Telugu ↔ English Words Converter</h2>
          <p className="converter-subtitle">
            Speak natural Telugu or paste Telugu script to get instant Romanized English letters (e.g., "Ela unnaru?").
          </p>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="converter-mode-switch">
        <button
          type="button"
          onClick={() => setMode('speech')}
          className={`converter-mode-btn ${mode === 'speech' ? 'active' : ''}`}
        >
          🎙️ Telugu Speech Mode
        </button>
        <button
          type="button"
          onClick={() => setMode('text')}
          className={`converter-mode-btn ${mode === 'text' ? 'active' : ''}`}
        >
          ⌨️ Text Paste Mode
        </button>
      </div>

      {/* Telugu Input Card */}
      <div className="converter-card">
        <div className="converter-card-header">
          <label className="converter-label">
            {mode === 'speech' ? '🎙️ Telugu Speech Recognition' : '📝 Telugu Text Input'}
          </label>
          {inputText && (
            <button
              type="button"
              className="action-btn-sm"
              onClick={() => { setInputText(''); setOutputText(''); }}
            >
              Clear
            </button>
          )}
        </div>

        <textarea
          value={inputText}
          onChange={handleInputChange}
          placeholder={mode === 'speech' ? 'Click Start Speaking and speak natural Telugu...' : 'Paste or type Telugu text here (e.g. ఎలా ఉన్నారు?)...'}
          className="converter-textarea"
          rows={4}
        />

        {mode === 'speech' && isSupported && (
          <div className="converter-speech-action">
            <button
              type="button"
              onClick={toggleListening}
              className={`action-btn primary large-record-btn ${isListening ? 'danger recording' : ''}`}
            >
              {isListening ? '⏹️ Stop Listening' : '🎙️ Start Speaking Telugu'}
            </button>
          </div>
        )}

        {mode === 'text' && (
          <div className="converter-speech-action">
            <button
              type="button"
              onClick={convertText}
              className="action-btn primary"
            >
              ✨ Convert to English Words
            </button>
          </div>
        )}
      </div>

      {/* Output Card */}
      <div className="converter-card output-card">
        <div className="converter-card-header">
          <label className="converter-label highlight">
            📤 Romanized English Script (Editable)
          </label>
          {outputText && (
            <span className="converted-badge">✓ Phonetic Match</span>
          )}
        </div>

        <textarea
          value={outputText}
          onChange={handleOutputChange}
          placeholder="Romanized English transliteration appears here automatically (e.g. Ela unnaru? Nenu bagunnanu)..."
          className="converter-textarea output-textarea"
          rows={5}
        />

        {outputText && (
          <div className="converter-actions-row">
            <button
              type="button"
              onClick={shareToWhatsApp}
              className="action-btn"
              style={{
                background: '#25d366',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                boxShadow: '0 2px 8px rgba(37, 211, 102, 0.3)',
              }}
            >
              💬 Share to WhatsApp
            </button>
            <button
              type="button"
              onClick={copyOutput}
              className="action-btn primary"
            >
              {copied ? '✅ Copied!' : '📋 Copy Output'}
            </button>
            {onSendToDiary && (
              <button
                type="button"
                onClick={handleSaveToDiary}
                className="action-btn accent"
              >
                💾 Save as Diary Note
              </button>
            )}
            <button
              type="button"
              onClick={() => { setInputText(''); setOutputText(''); }}
              className="action-btn"
            >
              🗑️ Clear All
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeluguUniversalConverter;
