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

const sameWord = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Length of the longest run where the words actually match (minimum 2 words to avoid dropping valid single-word speech). */
function overlapLength(a: string[], b: string[], max: number): number {
  for (let k = max; k >= 2; k--) {
    let same = true;
    for (let j = 0; j < k; j++) {
      if (!sameWord(a[a.length - k + j], b[j])) { same = false; break; }
    }
    if (same) return k;
  }
  return 0;
}

/**
 * Append `chunk` to `base`, dropping the duplicated overlap at the seam.
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
  return c.slice(overlapLength(b, c, max)).join(' ');
}
