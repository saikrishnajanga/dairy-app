// Universal Translator using MyMemory free API (100+ languages, no key needed)

export interface Language {
  code: string;
  name: string;
  flag: string;
}

export const LANGUAGES: Language[] = [
  { code: 'te', name: 'Telugu', flag: '🇮🇳' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'ta', name: 'Tamil', flag: '🇮🇳' },
  { code: 'kn', name: 'Kannada', flag: '🇮🇳' },
  { code: 'ml', name: 'Malayalam', flag: '🇮🇳' },
  { code: 'mr', name: 'Marathi', flag: '🇮🇳' },
  { code: 'bn', name: 'Bengali', flag: '🇮🇳' },
  { code: 'gu', name: 'Gujarati', flag: '🇮🇳' },
  { code: 'pa', name: 'Punjabi', flag: '🇮🇳' },
  { code: 'ur', name: 'Urdu', flag: '🇵🇰' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇧🇷' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'th', name: 'Thai', flag: '🇹🇭' },
  { code: 'vi', name: 'Vietnamese', flag: '🇻🇳' },
  { code: 'id', name: 'Indonesian', flag: '🇮🇩' },
  { code: 'ms', name: 'Malay', flag: '🇲🇾' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
  { code: 'sv', name: 'Swedish', flag: '🇸🇪' },
  { code: 'uk', name: 'Ukrainian', flag: '🇺🇦' },
];

// Speech recognition language codes (for Web Speech API)
export const SPEECH_LANG_MAP: Record<string, string> = {
  te: 'te-IN', en: 'en-US', hi: 'hi-IN', ta: 'ta-IN', kn: 'kn-IN',
  ml: 'ml-IN', mr: 'mr-IN', bn: 'bn-IN', gu: 'gu-IN', pa: 'pa-IN',
  ur: 'ur-PK', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT',
  pt: 'pt-BR', ru: 'ru-RU', ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN',
  ar: 'ar-SA', th: 'th-TH', vi: 'vi-VN', id: 'id-ID', ms: 'ms-MY',
  tr: 'tr-TR', pl: 'pl-PL', nl: 'nl-NL', sv: 'sv-SE', uk: 'uk-UA',
};

export interface TranslationResult {
  translatedText: string;
  source: string;
}

export async function translate(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<TranslationResult> {
  if (!text.trim()) return { translatedText: '', source: '' };

  try {
    const pair = `${sourceLang}|${targetLang}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${pair}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.responseStatus === 200 && data.responseData) {
      return {
        translatedText: data.responseData.translatedText,
        source: 'MyMemory',
      };
    }
    throw new Error(data.responseDetails || 'Translation failed');
  } catch (err) {
    throw new Error(`Translation error: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

// Saved translations storage
export interface SavedTranslation {
  id: string;
  timestamp: number;
  date: string;
  sourceLang: string;
  targetLang: string;
  sourceText: string;
  translatedText: string;
}

const TRANS_KEY = 'vd_translations';

export function saveTranslation(t: Omit<SavedTranslation, 'id' | 'timestamp' | 'date'>): SavedTranslation {
  const entry: SavedTranslation = {
    ...t,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: Date.now(),
    date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
  };
  const all = getSavedTranslations();
  all.unshift(entry);
  localStorage.setItem(TRANS_KEY, JSON.stringify(all));
  return entry;
}

export function getSavedTranslations(): SavedTranslation[] {
  try { return JSON.parse(localStorage.getItem(TRANS_KEY) || '[]'); }
  catch { return []; }
}

export function deleteTranslation(id: string) {
  const filtered = getSavedTranslations().filter(t => t.id !== id);
  localStorage.setItem(TRANS_KEY, JSON.stringify(filtered));
}
