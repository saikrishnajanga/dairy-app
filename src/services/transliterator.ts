// Telugu Unicode to Romanized transliteration engine

const VOWELS: Record<string, string> = {
  'అ': 'a', 'ఆ': 'aa', 'ఇ': 'i', 'ఈ': 'ee', 'ఉ': 'u', 'ఊ': 'oo',
  'ఋ': 'ru', 'ౠ': 'roo', 'ఌ': 'lu', 'ౡ': 'loo',
  'ఎ': 'e', 'ఏ': 'ae', 'ఐ': 'ai',
  'ఒ': 'o', 'ఓ': 'oe', 'ఔ': 'au',
};

const CONSONANTS: Record<string, string> = {
  'క': 'ka', 'ఖ': 'kha', 'గ': 'ga', 'ఘ': 'gha', 'ఙ': 'nga',
  'చ': 'cha', 'ఛ': 'chha', 'జ': 'ja', 'ఝ': 'jha', 'ఞ': 'nya',
  'ట': 'ta', 'ఠ': 'tha', 'డ': 'da', 'ఢ': 'dha', 'ణ': 'na',
  'త': 'tha', 'థ': 'thha', 'ద': 'da', 'ధ': 'dha', 'న': 'na',
  'ప': 'pa', 'ఫ': 'pha', 'బ': 'ba', 'భ': 'bha', 'మ': 'ma',
  'య': 'ya', 'ర': 'ra', 'ల': 'la', 'వ': 'va',
  'శ': 'sha', 'ష': 'sha', 'స': 'sa', 'హ': 'ha',
  'ళ': 'la', 'క్ష': 'ksha', 'ఱ': 'rra',
};

const CONSONANT_BASES: Record<string, string> = {};
for (const [telugu, roman] of Object.entries(CONSONANTS)) {
  CONSONANT_BASES[telugu] = roman.endsWith('a') && roman.length > 1
    ? roman.slice(0, -1) : roman;
}

const VOWEL_SIGNS: Record<string, string> = {
  'ా': 'aa', 'ి': 'i', 'ీ': 'ee', 'ు': 'u', 'ూ': 'oo',
  'ృ': 'ru', 'ౄ': 'roo',
  'ె': 'e', 'ే': 'ae', 'ై': 'ai',
  'ొ': 'o', 'ో': 'oe', 'ౌ': 'au',
};

const SPECIAL: Record<string, string> = {
  'ం': 'm', 'ః': 'h', 'ఁ': 'n',
};

const TELUGU_DIGITS: Record<string, string> = {
  '౦': '0', '౧': '1', '౨': '2', '౩': '3', '౪': '4',
  '౫': '5', '౬': '6', '౭': '7', '౮': '8', '౯': '9',
};

const VIRAMA = '్';

const WORD_CORRECTIONS: Record<string, string> = {
  // Telugu common words
  'హాయ్': 'hi', 'ఏలా': 'ela', 'ఎలా': 'ela', 'ఉన్నావు': 'unnav',
  'నీవు': 'neevu', 'ఎక్కడ': 'ekkada', 'నేను': 'nenu', 'నువ్వు': 'nuvvu',
  'ఏమి': 'emi', 'ఏంటి': 'enti', 'బాగుంది': 'bagundi', 'వెళ్ళు': 'vellu',
  'రా': 'raa', 'పో': 'po', 'తిను': 'tinu', 'చేయి': 'cheyi',
  'ఇవ్వు': 'ivvu', 'చెప్పు': 'cheppu', 'చూడు': 'choodu', 'విను': 'vinu',

  // English words in Telugu script → English (speech API outputs these)
  'వెయిట్': 'wait', 'వేట్': 'wait', 'వెయిట్‌': 'wait',
  'హలో': 'hello', 'హెలో': 'hello',
  'బై': 'bye', 'బాయ్': 'bye',
  'థాంక్స్': 'thanks', 'థ్యాంక్స్': 'thanks', 'ధన్యవాదాలు': 'thanks',
  'థాంక్యూ': 'thank you', 'థాంక్': 'thank',
  'సారీ': 'sorry', 'సారి': 'sorry',
  'ప్లీజ్': 'please', 'ప్లీస్': 'please',
  'యస్': 'yes', 'యెస్': 'yes',
  'నో': 'no',
  'ఓకే': 'okay', 'ఒకే': 'okay', 'ఓక్': 'ok',
  'గుడ్': 'good', 'గుడ': 'good',
  'బ్యాడ్': 'bad', 'బాడ్': 'bad',
  'మార్నింగ్': 'morning', 'మార్నింగ': 'morning',
  'నైట్': 'night', 'నైట': 'night',
  'డే': 'day',
  'టైమ్': 'time', 'టైం': 'time',
  'వర్క్': 'work', 'వర్క': 'work',
  'హోమ్': 'home', 'హోం': 'home',
  'ఆఫీస్': 'office', 'ఆఫిస్': 'office',
  'స్కూల్': 'school', 'స్కూలు': 'school',
  'కాలేజ్': 'college', 'కాలేజి': 'college',
  'ఫోన్': 'phone', 'ఫోను': 'phone',
  'కాల్': 'call',
  'మెసేజ్': 'message', 'మెసేజి': 'message',
  'మీటింగ్': 'meeting', 'మీటింగు': 'meeting',
  'ఫ్రెండ్': 'friend', 'ఫ్రెండు': 'friend', 'ఫ్రెండ్స్': 'friends',
  'బ్రదర్': 'brother', 'సిస్టర్': 'sister',
  'అంకుల్': 'uncle', 'ఆంటీ': 'aunty',
  'మనీ': 'money', 'మణీ': 'money',
  'ఫుడ్': 'food', 'ఫూడ్': 'food',
  'వాటర్': 'water', 'వాటరు': 'water',
  'కాఫీ': 'coffee', 'టీ': 'tea',
  'లంచ్': 'lunch', 'డిన్నర్': 'dinner', 'బ్రేక్‌ఫాస్ట్': 'breakfast',
  'హ్యాపీ': 'happy', 'శాడ్': 'sad',
  'లవ్': 'love', 'లైక్': 'like',
  'హేట్': 'hate',
  'స్టార్ట్': 'start', 'స్టాప్': 'stop',
  'గో': 'go', 'కమ్': 'come',
  'డన్': 'done', 'ఫినిష్': 'finish',
  'రెడీ': 'ready',
  'ప్రాబ్లమ్': 'problem', 'ప్రాబ్లెమ్': 'problem',
  'సొల్యూషన్': 'solution',
  'క్వశ్చన్': 'question', 'ఆన్సర్': 'answer',
  'కంప్యూటర్': 'computer', 'ల్యాప్‌టాప్': 'laptop',
  'ఇంటర్నెట్': 'internet', 'ఆన్‌లైన్': 'online',
  'వీడియో': 'video', 'ఆడియో': 'audio',
  'మ్యూజిక్': 'music', 'మూవీ': 'movie',
  'గేమ్': 'game', 'గేమ్స్': 'games',
  'షాపింగ్': 'shopping', 'మార్కెట్': 'market',
  'హాస్పిటల్': 'hospital', 'డాక్టర్': 'doctor',
  'టీచర్': 'teacher', 'స్టూడెంట్': 'student',
  'బస్': 'bus', 'ట్రైన్': 'train', 'కార్': 'car', 'బైక్': 'bike',
  'రోడ్': 'road', 'సిటీ': 'city',
  'ప్లాన్': 'plan', 'కాన్సిల్': 'cancel',
  'బుక్': 'book', 'రీడ్': 'read',
  'స్లీప్': 'sleep', 'వేక్‌అప్': 'wake up',
  'టుడే': 'today', 'టుమారో': 'tomorrow', 'ఎస్టర్‌డే': 'yesterday',
  'మంత్': 'month', 'ఇయర్': 'year', 'వీక్': 'week',
  'ఇమెయిల్': 'email', 'పాస్‌వర్డ్': 'password',
  'అప్‌డేట్': 'update', 'డీలీట్': 'delete',
  'సేవ్': 'save', 'ఓపెన్': 'open', 'క్లోజ్': 'close',
  'వెరీ': 'very', 'మచ్': 'much', 'మోర్': 'more',
  'ఫస్ట్': 'first', 'లాస్ట్': 'last', 'నెక్స్ట్': 'next',
  'బిజీ': 'busy', 'ఫ్రీ': 'free', 'ఈజీ': 'easy',
  'నైస్': 'nice', 'క్యూట్': 'cute', 'కూల్': 'cool',
  'ఫన్': 'fun', 'బోరింగ్': 'boring',
  'చేంజ్': 'change', 'ట్రై': 'try',
};

function isTeluguConsonant(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 0x0C15 && code <= 0x0C39;
}

function isTeluguVowelSign(char: string): boolean {
  return char in VOWEL_SIGNS;
}

export function transliterate(text: string): string {
  if (!text) return '';

  const words = text.split(/\s+/);
  const result: string[] = [];

  for (const word of words) {
    if (WORD_CORRECTIONS[word]) { result.push(WORD_CORRECTIONS[word]); continue; }

    // If the word has no Telugu characters, keep it as-is (English pass-through)
    if (!/[\u0C00-\u0C7F]/.test(word)) { result.push(word); continue; }

    let output = '';
    const chars = Array.from(word);
    let i = 0;

    while (i < chars.length) {
      const char = chars[i];
      const next = i + 1 < chars.length ? chars[i + 1] : '';

      if (TELUGU_DIGITS[char]) { output += TELUGU_DIGITS[char]; i++; continue; }
      if (SPECIAL[char]) { output += SPECIAL[char]; i++; continue; }
      if (VOWELS[char]) { output += VOWELS[char]; i++; continue; }

      if (i + 1 < chars.length) {
        const two = char + next;
        if (CONSONANTS[two]) {
          const after = i + 2 < chars.length ? chars[i + 2] : '';
          if (after === VIRAMA) { output += CONSONANT_BASES[two] || CONSONANTS[two].replace(/a$/, ''); i += 3; }
          else if (isTeluguVowelSign(after)) { output += (CONSONANT_BASES[two] || CONSONANTS[two].replace(/a$/, '')) + VOWEL_SIGNS[after]; i += 3; }
          else { output += CONSONANTS[two]; i += 2; }
          continue;
        }
      }

      if (isTeluguConsonant(char)) {
        const base = CONSONANT_BASES[char] || CONSONANTS[char]?.replace(/a$/, '') || char;
        if (next === VIRAMA) { output += base; i += 2; }
        else if (isTeluguVowelSign(next)) { output += base + VOWEL_SIGNS[next]; i += 2; }
        else { output += CONSONANTS[char] || char; i++; }
        continue;
      }

      output += char;
      i++;
    }
    result.push(output);
  }
  return result.join(' ');
}

export function isTeluguText(text: string): boolean {
  return /[\u0C00-\u0C7F]/.test(text);
}
