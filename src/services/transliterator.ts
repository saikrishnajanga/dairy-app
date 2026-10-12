// ═══════════════════════════════════════════════════════════
//  Telugu → Roman (English letters) TRANSLITERATION engine
//
//  This converts the SOUND of Telugu into English letters.
//  It is NOT translation: "నాకు హైదరాబాద్ వెళ్లాలి" →
//  "Naaku Hyderabad vellaali" (never "I need to go to Hyderabad").
//
//  Design notes:
//  • Rule based, so it scales to arbitrarily long transcripts.
//  • Anusvara (ం) picks its nasal from the following consonant
//    (నచ్చింది → nacchindi, గురించి → gurinchi, మనం → manam).
//  • Geminate clusters drop the aspirate on the first element
//    (నచ్చింది → nacchindi, వెళ్లాలి → vellaali).
//  • Telugu-script ENGLISH loanwords/code-switches map back to the
//    English word (కాలేజీకి → college ki, టీమ్తో → team tho) instead
//    of being spelled out syllable by syllable.
//  • Pure Roman text (English words inside Telugu speech) passes
//    through untouched, so mixed speech keeps working.
//  • Configurable custom vocabulary for names, brands, and terms
//    is loaded from vocabulary.ts and merged into the loanword map.
// ═══════════════════════════════════════════════════════════

import { getCustomVocabulary, POST_CORRECTIONS } from './vocabulary';

// ─── Vowels (independent letters) ───────────────────────────
const VOWELS: Record<string, string> = {
  'అ': 'a', 'ఆ': 'aa', 'ఇ': 'i', 'ఈ': 'ee', 'ఉ': 'u', 'ఊ': 'oo',
  'ఋ': 'ru', 'ౠ': 'roo', 'ఌ': 'lu', 'ౡ': 'loo',
  'ఎ': 'e', 'ఏ': 'e', 'ఐ': 'ai',
  'ఒ': 'o', 'ఓ': 'o', 'ఔ': 'au',
};

// ─── Vowel signs / matras (modify the preceding consonant) ──
const VOWEL_SIGNS: Record<string, string> = {
  'ా': 'aa', 'ి': 'i', 'ీ': 'ee', 'ు': 'u', 'ూ': 'oo',
  'ృ': 'ru', 'ౄ': 'roo',
  'ె': 'e', 'ే': 'e', 'ై': 'ai',
  'ొ': 'o', 'ో': 'o', 'ౌ': 'au',
};

// ─── Consonants, INHERENT VOWEL STRIPPED (base form) ────────
const CONSONANT_BASE: Record<string, string> = {
  'క': 'k', 'ఖ': 'kh', 'గ': 'g', 'ఘ': 'gh', 'ఙ': 'ng',
  'చ': 'ch', 'ఛ': 'chh', 'జ': 'j', 'ఝ': 'jh', 'ఞ': 'ny',
  'ట': 't', 'ఠ': 'th', 'డ': 'd', 'ఢ': 'dh', 'ణ': 'n',
  'త': 't', 'థ': 'th', 'ద': 'd', 'ధ': 'dh', 'న': 'n',
  'ప': 'p', 'ఫ': 'ph', 'బ': 'b', 'భ': 'bh', 'మ': 'm',
  'య': 'y', 'ర': 'r', 'ల': 'l', 'వ': 'v', 'ళ': 'l', 'ఱ': 'r',
  'శ': 'sh', 'ష': 'sh', 'స': 's', 'హ': 'h',
};

const VIRAMA = '్';        // ్  — kills the inherent 'a'
const ANUSVARA = 'ం';      // ం  — nasal, sound depends on next consonant
const VISARGA = 'ః';       // ః  — h
const CHANDRABINDU = 'ఁ';  // ఁ  — nasal

const TELUGU_DIGITS: Record<string, string> = {
  '౦': '0', '౧': '1', '౨': '2', '౩': '3', '౪': '4',
  '౫': '5', '౬': '6', '౭': '7', '౮': '8', '౯': '9',
};

const TELUGU_RANGE = /[\u0C00-\u0C7F]/;

// Zero-width joiners/non-joiners are invisible and carry no sound — speech
// engines sprinkle them inside words like టీమ్‌తో, so drop them everywhere.
const INVISIBLE = /[\u200B-\u200D\uFEFF]/g;
const stripInvisible = (s: string) => s.replace(INVISIBLE, '');

// ─── Anusvara → nasal of the following consonant ────────────
// ం + గ/ఘ/ఙ → "ng" (సంగతి → sangati)
// ం + క/ఖ   → "n"  (వెంకట → venkata)
// ం + dentals / retroflexes / palatals → "n" (ఇంటికి → intiki)
// ం + labials → "m" (కుందాం → kundaam) · word-final → "m" (మనం → manam)
const NG_CLASS = 'గఘఙ';
const N_CLASS = 'కఖచఛజఝఞటఠడఢణతథదధన';
const M_CLASS = 'పఫబభమ';

function anusvaraSound(nextChar: string): string {
  if (!nextChar) return 'm';
  if (NG_CLASS.includes(nextChar)) return 'ng';
  if (N_CLASS.includes(nextChar)) return 'n';
  if (M_CLASS.includes(nextChar)) return 'm';
  return 'm';
}

/** First element of a doubled consonant loses its aspiration: చ్చ → cch, త్త → tt */
function geminateBase(base: string): string {
  return base.endsWith('h') ? base.slice(0, -1) : base;
}

// ═══════════════════════════════════════════════════════════
//  English loanwords spoken in Telugu (code-switching)
//  Only genuine borrowings — never a translation of a Telugu word.
// ═══════════════════════════════════════════════════════════
const LOANWORDS: Record<string, string> = {
  'కాలేజ్': 'college', 'కాలేజి': 'college', 'కాలేజీ': 'college',
  'స్కూల్': 'school', 'స్కూలు': 'school', 'స్కూలుకి': 'school ki',
  'ఆఫీస్': 'office', 'ఆఫిస్': 'office', 'ఆఫీసు': 'office',
  'ప్రాజెక్ట్': 'project', 'టీమ్': 'team', 'లైబ్రరీ': 'library',
  'ఇంటర్వ్యూ': 'interview', 'మీటింగ్': 'meeting', 'మీటింగు': 'meeting',
  'ఫోన్': 'phone', 'ఫోను': 'phone', 'మొబైల్': 'mobile', 'ల్యాప్టాప్': 'laptop',
  'కంప్యూటర్': 'computer', 'ఇంటర్నెట్': 'internet', 'ఆన్లైన్': 'online',
  'ఆన్‌లైన్': 'online', 'ఇమెయిల్': 'email', 'పాస్‌వర్డ్': 'password',
  'మెసేజ్': 'message', 'మెసేజి': 'message', 'వాట్సాప్': 'WhatsApp',
  'వీడియో': 'video', 'ఆడియో': 'audio', 'మ్యూజిక్': 'music', 'మూవీ': 'movie',
  'గేమ్': 'game', 'గేమ్స్': 'games', 'షాపింగ్': 'shopping', 'మార్కెట్': 'market',
  'హాస్పిటల్': 'hospital', 'డాక్టర్': 'doctor', 'టీచర్': 'teacher',
  'స్టూడెంట్': 'student', 'బస్': 'bus', 'ట్రైన్': 'train', 'కార్': 'car',
  'బైక్': 'bike', 'రోడ్': 'road', 'సిటీ': 'city', 'ట్రాఫిక్': 'traffic',
  'ప్లాన్': 'plan', 'బుక్': 'book', 'టికెట్': 'ticket', 'స్టేషన్': 'station',
  'వర్క్': 'work', 'హోమ్': 'home', 'ఆఫీసులో': 'office lo',
  'ఫ్రెండ్': 'friend', 'ఫ్రెండు': 'friend', 'ఫ్రెండ్స్': 'friends',
  'ఫ్యామిలీ': 'family', 'బ్రదర్': 'brother', 'సిస్టర్': 'sister',
  'అంకుల్': 'uncle', 'ఆంటీ': 'aunty', 'పార్టీ': 'party',
  'మనీ': 'money', 'మణీ': 'money', 'ఫుడ్': 'food', 'ఫూడ్': 'food',
  'వాటర్': 'water', 'వాటరు': 'water', 'కాఫీ': 'coffee', 'టీ': 'tea',
  'లంచ్': 'lunch', 'డిన్నర్': 'dinner', 'బ్రేక్‌ఫాస్ట్': 'breakfast',
  'హ్యాపీ': 'happy', 'శాడ్': 'sad', 'లవ్': 'love', 'లైక్': 'like', 'హేట్': 'hate',
  'స్టార్ట్': 'start', 'స్టాప్': 'stop', 'డన్': 'done', 'ఫినిష్': 'finish',
  'రెడీ': 'ready', 'ప్రాబ్లమ్': 'problem', 'ప్రాబ్లెమ్': 'problem',
  'సొల్యూషన్': 'solution', 'క్వశ్చన్': 'question', 'ఆన్సర్': 'answer',
  'అప్‌డేట్': 'update', 'డీలీట్': 'delete', 'సేవ్': 'save',
  'ఓపెన్': 'open', 'క్లోజ్': 'close', 'షేర్': 'share', 'సెండ్': 'send',
  'వెరీ': 'very', 'మచ్': 'much', 'మోర్': 'more', 'ఫస్ట్': 'first',
  'లాస్ట్': 'last', 'నెక్స్ట్': 'next', 'బిజీ': 'busy', 'ఫ్రీ': 'free',
  'ఈజీ': 'easy', 'నైస్': 'nice', 'కూల్': 'cool', 'ఫన్': 'fun',
  'బోరింగ్': 'boring', 'టైమ్': 'time', 'టైం': 'time', 'వీక్': 'week',
  'వీకెండ్': 'weekend', 'మంత్': 'month', 'ఇయర్': 'year',
  'టుడే': 'today', 'టుమారో': 'tomorrow', 'ఎస్టర్‌డే': 'yesterday',
  'సారీ': 'sorry', 'ప్లీజ్': 'please', 'ప్లీస్': 'please',
  'థాంక్స్': 'thanks', 'థ్యాంక్స్': 'thanks', 'థాంక్యూ': 'thank you',
  'హలో': 'hello', 'హెలో': 'hello', 'హాయ్': 'hi', 'బై': 'bye',
  'యస్': 'yes', 'యెస్': 'yes', 'ఓకే': 'okay', 'ఓక్': 'ok', 'గుడ్': 'good',
  'బ్యాడ్': 'bad', 'మార్నింగ్': 'morning', 'నైట్': 'night',
  'గూగుల్': 'Google', 'వాట్స్‌ఆప్': 'WhatsApp', 'యూట్యూబ్': 'YouTube',
  'హైదరాబాద్': 'Hyderabad', 'బెంగళూరు': 'Bengaluru', 'చెన్నై': 'Chennai',
  'ముంబై': 'Mumbai', 'విజయవాడ': 'Vijayawada', 'తిరుపతి': 'Tirupati',
  'అమెరికా': 'America', 'ఇండియా': 'India', 'టాలీవుడ్': 'Tollywood',
};

// Telugu case/postpositions that glue onto a loanword stem.
const CASE_SUFFIXES: Record<string, string> = {
  'కి': 'ki', 'కు': 'ku', 'లో': 'lo', 'లోని': 'loni', 'తో': 'tho',
  'నుంచి': 'nunchi', 'నుండి': 'nundi', 'గా': 'ga', 'కోసం': 'kosam',
  'వైపు': 'vaipu', 'పై': 'pai', 'మీద': 'meeda', 'కంటే': 'kante',
  'వరకు': 'varaku', 'లకు': 'laku', 'లను': 'lanu', 'ను': 'nu',
  'లోకి': 'loki', 'లోపల': 'lopala', 'తోనే': 'thone',
  'ని': 'ni', 'కీ': 'ki', 'తోటి': 'thoti', 'ఐతే': 'aithe',
};

// ─── Merge custom vocabulary (names, brands, terms) ───
// This merges user-configurable vocabulary into the loanword map
// so that names like Roshan, Maheshwari, etc. are recognized.
const customVocab = getCustomVocabulary();
for (const [key, value] of Object.entries(customVocab)) {
  const clean = stripInvisible(key);
  LOANWORDS[clean] = value;
}

// Normalize the keys once: ZWNJ in a dictionary key must not defeat a match.
for (const key of Object.keys(LOANWORDS)) {
  const clean = stripInvisible(key);
  if (clean !== key) {
    LOANWORDS[clean] = LOANWORDS[key];
    delete LOANWORDS[key];
  }
}

// Longest-first so "కాలేజీ" beats "కాలేజ్".
// Rebuilt after merging custom vocabulary.
let LOANWORD_KEYS = Object.keys(LOANWORDS).sort((a, b) => b.length - a.length);

/** Punctuation that may be glued to a word; stripped before lookups. */
const EDGE_PUNCT = /^[^0-9A-Za-z\u0C00-\u0C7F]+|[^0-9A-Za-z\u0C00-\u0C7F]+$/g;

/**
 * Resolve a Telugu-script token to an English loanword if we know it,
 * including a glue-on case suffix (కాలేజీకి → "college ki").
 * Returns null when the token is normal Telugu and must be transliterated.
 */
function lookupLoanword(token: string): string | null {
  if (LOANWORDS[token]) return LOANWORDS[token];
  for (const key of LOANWORD_KEYS) {
    if (token.length > key.length && token.startsWith(key)) {
      const rest = token.slice(key.length);
      if (CASE_SUFFIXES[rest]) return `${LOANWORDS[key]} ${CASE_SUFFIXES[rest]}`;
    }
  }
  return null;
}

/** Transliterate a single Telugu-script word (no spaces inside). */
function transliterateWord(word: string): string {
  const chars = Array.from(word);
  let out = '';
  let i = 0;

  while (i < chars.length) {
    const ch = chars[i];
    const next = i + 1 < chars.length ? chars[i + 1] : '';

    // Telugu digit
    if (TELUGU_DIGITS[ch]) { out += TELUGU_DIGITS[ch]; i++; continue; }

    // Independent vowel
    if (VOWELS[ch]) { out += VOWELS[ch]; i++; continue; }

    // Consonant
    if (CONSONANT_BASE[ch]) {
      const base = CONSONANT_BASE[ch];

      if (next === VIRAMA) {
        // Doubled consonant → first element loses aspiration (చ్చ → cch)
        const after = i + 2 < chars.length ? chars[i + 2] : '';
        out += after === ch ? geminateBase(base) : base;
        i += 2; // skip the virama; the next consonant is handled next loop
        continue;
      }
      if (VOWEL_SIGNS[next]) { out += base + VOWEL_SIGNS[next]; i += 2; continue; }
      out += base + 'a'; // inherent vowel
      i++;
      continue;
    }

    // Nasals
    if (ch === ANUSVARA) { out += anusvaraSound(next); i++; continue; }
    if (ch === CHANDRABINDU) { out += anusvaraSound(next); i++; continue; }
    if (ch === VISARGA) { out += 'h'; i++; continue; }

    // Orphan virama / vowel sign — keep the sound, drop the marker
    if (ch === VIRAMA) { i++; continue; }
    if (VOWEL_SIGNS[ch]) { out += VOWEL_SIGNS[ch]; i++; continue; }

    // Spaces, punctuation, English letters → unchanged
    out += ch;
    i++;
  }

  return out;
}

/** Capitalize the first letter of the transcript and of each sentence. */
function capitalizeSentences(text: string): string {
  return text.replace(/(^|[.!?]\s+|\n[ \t]*)([a-z])/g, (_m, lead: string, c: string) =>
    lead + c.toUpperCase()
  );
}

export interface TransliterateOptions {
  /** Capitalize the start of the text and of every sentence (default: true). */
  capitalize?: boolean;
}

/**
 * Telugu → Roman transliteration.
 * Roman/English text passes straight through, so Telugu-English
 * code-switched speech keeps both parts readable.
 */
export function transliterate(text: string, options: TransliterateOptions = {}): string {
  if (!text) return '';
  const { capitalize = true } = options;

  const words = stripInvisible(text).split(/(\s+)/); // keep whitespace runs intact
  const out: string[] = [];

  for (const token of words) {
    if (!token || /^\s+$/.test(token)) { out.push(token); continue; }
    // No Telugu script → English/mixed word, leave it exactly as spoken
    if (!TELUGU_RANGE.test(token)) { out.push(token); continue; }

    // Separate glued punctuation so lookups work, then re-attach
    const core = stripInvisible(token).replace(EDGE_PUNCT, '');
    const leading = token.slice(0, token.indexOf(core));
    const trailing = token.slice(leading.length + core.length);
    if (!core) { out.push(token); continue; }

    const borrowed = TELUGU_RANGE.test(core) ? lookupLoanword(core) : null;
    out.push(leading + (borrowed ?? transliterateWord(core)) + trailing);
  }

  let joined = out.join('');

  // Apply post-transliteration corrections from the vocabulary config.
  // These fix compound patterns that character-by-character transliteration can't.
  for (const { pattern, replacement } of POST_CORRECTIONS) {
    joined = joined.replace(pattern, replacement);
  }

  return capitalize ? capitalizeSentences(joined) : joined;
}

/**
 * Dynamically add a loanword entry at runtime.
 * Useful for future UI-based vocabulary management.
 */
export function addLoanword(teluguKey: string, englishValue: string): void {
  const clean = stripInvisible(teluguKey);
  LOANWORDS[clean] = englishValue;
  LOANWORD_KEYS = Object.keys(LOANWORDS).sort((a, b) => b.length - a.length);
}

/** True when the string contains at least one Telugu script character. */
export function isTeluguText(text: string): boolean {
  return TELUGU_RANGE.test(text);
}

/** Word count that tolerates long transcripts. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
