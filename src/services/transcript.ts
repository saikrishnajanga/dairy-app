// ═══════════════════════════════════════════════════════════
//  Transcript stitching for long dictation
//
//  Speech engines return speech in chunks. These pure helpers glue
//  chunks into one continuous transcript without losing text and
//  without repeating words when a recognition session restarts.
// ═══════════════════════════════════════════════════════════

/** Cap the dedupe scan so very long transcripts stay fast to update. */
const MAX_OVERLAP_WORDS = 80;

export const normalizeTranscript = (s: string) => s.replace(/\s+/g, ' ').trim();

const toWords = (s: string): string[] => {
  const n = normalizeTranscript(s);
  return n ? n.split(' ') : [];
};

/** Strip punctuation and symbols attached to words (e.g. "సాయి," → "సాయి", "రిటర్నా." → "రిటర్నా") */
const cleanWord = (w: string): string =>
  w.replace(/^[^0-9A-Za-z\u0C00-\u0C7F]+|[^0-9A-Za-z\u0C00-\u0C7F]+$/g, '').toLowerCase();

/** Strip trailing Telugu vowel signs (matras) or virama to obtain the root stem (e.g. "రిటర్నా" & "రిటర్న్" → "రిటర్న") */
const stripTeluguSigns = (s: string): string =>
  s.replace(/[\u0C3E-\u0C4D]+$/, '');

/** Compare two words ignoring punctuation and subtle boundary elongation */
const sameWord = (a: string, b: string): boolean => {
  const ca = cleanWord(a);
  const cb = cleanWord(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;

  // Compare Telugu root stems (handles boundary elongation like "రిటర్నా" vs "రిటర్న్")
  const sa = stripTeluguSigns(ca);
  const sb = stripTeluguSigns(cb);
  if (sa === sb) return true;

  // Stem prefix match for longer Telugu words (e.g. "కూరియర్స్" vs "కూరియర్")
  if (sa.length >= 4 && sb.length >= 4) {
    if (sa.startsWith(sb) || sb.startsWith(sa)) return true;
  }

  return false;
};

/**
 * Length of the longest run where the words match at the seam.
 * Checks down to k >= 1 so single-word repeats from speech engine restarts
 * (e.g. "సాయి" or "రిటర్న్") are correctly deduplicated without doubling.
 */
function overlapLength(a: string[], b: string[], max: number): number {
  for (let k = max; k >= 1; k--) {
    let same = true;
    for (let j = 0; j < k; j++) {
      if (!sameWord(a[a.length - k + j], b[j])) { same = false; break; }
    }
    if (same) return k;
  }
  return 0;
}

/**
 * Append `chunk` to `base`, dropping duplicated overlap at the seam.
 * Handles the recognizer's habit of re-emitting the tail of the previous
 * segment when a new session starts.
 */
export function mergeTranscript(base: string, chunk: string): string {
  const b = toWords(base);
  const c = toWords(chunk);
  if (c.length === 0) return b.join(' ');
  if (b.length === 0) return c.join(' ');

  const max = Math.min(b.length, c.length, MAX_OVERLAP_WORDS);
  const k = overlapLength(b, c, max);
  return [...b, ...c.slice(k)].join(' ');
}

/**
 * The genuinely new part of a live (not-yet-final) interim segment, so the
 * live view shows each word once instead of doubling the committed text.
 */
export function newTranscriptTail(base: string, interim: string): string {
  const b = toWords(base);
  const c = toWords(interim);
  if (c.length === 0) return '';

  const max = Math.min(b.length, c.length, MAX_OVERLAP_WORDS);
  const k = overlapLength(b, c, max);
  return c.slice(k).join(' ');
}

