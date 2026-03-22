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

const TeluguUniversalConverter = () => {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
  const [mode, setMode] = useState<'speech' | 'text'>('speech');
  const [copied, setCopied] = useState(false);

  // Mobile detection + Speech init
  useEffect(() => {
    const checkMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    setIsMobile(checkMobile);

    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SpeechRecognitionCtor();
      rec.lang = 'te-IN';
      rec.continuous = true;
      rec.interimResults = true;

      rec.onstart = () => setIsListening(true);
      rec.onresult = (event: SpeechRecognitionEvent) => {
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          }
        }
        if (final) {
          setInputText(prev => {
            const newText = prev + final;
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
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const buttonStyle: React.CSSProperties = {
    padding: isMobile ? '18px 30px' : '14px 28px',
    fontSize: isMobile ? '20px' : '16px',
    minHeight: isMobile ? '55px' : '48px',
    borderRadius: '14px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 'bold',
    touchAction: 'manipulation'
  };

  return (
    <div style={{ padding: isMobile ? '20px 15px' : '30px', maxWidth: '100%', margin: '0 auto' }}>
      <h2 style={{ textAlign: 'center' }}>🔄 Telugu ↔ English Words Converter</h2>

      {/* Mode Toggle */}
      <div style={{ textAlign: 'center', marginBottom: '25px' }}>
        <button
          onClick={() => setMode(mode === 'speech' ? 'text' : 'speech')}
          style={{
            ...buttonStyle,
            backgroundColor: mode === 'speech' ? '#4CAF50' : '#FF9800',
            color: 'white'
          }}
        >
          {mode === 'speech' ? '🎤 Speech Mode' : '⌨️ Text Paste Mode'}
        </button>
      </div>

      {/* Telugu Input */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
          {mode === 'speech' ? '🎙️ Telugu Speech Input' : '📝 Paste Telugu Text'}
        </label>
        <textarea
          value={inputText}
          onChange={handleInputChange}
          placeholder={mode === 'speech' ? 'Start speaking Telugu...' : 'Paste Telugu text here... (ఏంట్రా...)'}
          style={{
            width: '100%',
            height: '120px',
            fontSize: '18px',
            padding: '15px',
            border: '2px solid #ddd',
            borderRadius: '12px',
            fontFamily: 'monospace',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Speech Controls */}
      {mode === 'speech' && isSupported && (
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '25px', flexWrap: 'wrap' }}>
          <button
            onClick={toggleListening}
            disabled={!isSupported}
            style={{
              ...buttonStyle,
              backgroundColor: isListening ? '#f44336' : '#4CAF50',
              color: 'white'
            }}
          >
            {isListening ? '⏹️ Stop' : '🎤 Start Recording'}
          </button>
        </div>
      )}

      {/* Convert Button for Text Mode */}
      {mode === 'text' && (
        <div style={{ textAlign: 'center', marginBottom: '25px' }}>
          <button
            onClick={convertText}
            style={{
              ...buttonStyle,
              backgroundColor: '#2196F3',
              color: 'white',
              padding: isMobile ? '20px 40px' : '16px 32px'
            }}
          >
            ✨ Convert to English Words
          </button>
        </div>
      )}

      {/* Output — Editable */}
      <div>
        <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
          📤 English-like Text (Editable & Ready to Copy)
        </label>
        <div style={{
          border: '2px solid #4CAF50',
          borderRadius: '16px',
          padding: '20px',
          minHeight: '150px',
          background: '#f1f8e9'
        }}>
          <textarea
            value={outputText}
            onChange={handleOutputChange}
            placeholder="Converted text will appear here... You can also edit it."
            style={{
              width: '100%',
              height: '140px',
              fontSize: '18px',
              fontFamily: 'monospace',
              border: 'none',
              background: 'transparent',
              resize: 'none',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Action Buttons */}
      {outputText && (
        <div style={{
          display: 'flex',
          gap: '12px',
          marginTop: '20px',
          justifyContent: 'center',
          flexDirection: isMobile ? 'column' : 'row'
        }}>
          <button onClick={copyOutput} style={{ ...buttonStyle, backgroundColor: copied ? '#4CAF50' : '#FF5722', color: 'white' }}>
            {copied ? '✅ Copied!' : '📋 Copy Output'}
          </button>
          <button onClick={() => { setInputText(''); setOutputText(''); }} style={{ ...buttonStyle, backgroundColor: '#757575', color: 'white' }}>
            🗑️ Clear All
          </button>
        </div>
      )}
    </div>
  );
};

export default TeluguUniversalConverter;
