// ═══════════════════════════════════════════════════════════
//  Configurable custom vocabulary for speech recognition
//
//  Names, brands, locations, and technical terms that should
//  retain their correct English spelling when identified in
//  the transcript. This module is consumed by the transliterator.
//
//  To add new vocabulary: add entries to CUSTOM_NAMES or
//  CUSTOM_TERMS below. The transliterator will pick them up
//  automatically on the next recognition event.
// ═══════════════════════════════════════════════════════════

/**
 * Personal names that appear frequently in the user's recordings.
 * Key: Telugu-script form the recognizer may return.
 * Value: correct English spelling.
 *
 * Multiple Telugu spellings for the same name are encouraged —
 * the recognizer is inconsistent, especially with foreign names.
 */
export const CUSTOM_NAMES: Record<string, string> = {
  // ─── User-specified names ───
  'రోషన్': 'Roshan',
  'రోశన్': 'Roshan',
  'రోషణ్': 'Roshan',
  'అంకిత': 'Ankitha',
  'అంకితా': 'Ankitha',
  'అంకిథా': 'Ankitha',
  'మహేశ్వరి': 'Maheshwari',
  'మహేష్వరి': 'Maheshwari',
  'మహేశ్వరీ': 'Maheshwari',
  'ప్రదీప్': 'Pradeep',
  'ప్రదీప': 'Pradeep',
  'హిమవంత్': 'Himavanth',
  'హిమవంత': 'Himavanth',
  'హిమవన్త్': 'Himavanth',
  'సత్య': 'Sathya',
  'సత్యా': 'Sathya',
  'భవాని': 'Bhavani',
  'భవానీ': 'Bhavani',
  'దర్శన్': 'Darshan',
  'దర్షన్': 'Darshan',
  'లోకేష్': 'Lokesh',
  'లోకేశ్': 'Lokesh',
  'లోకేష': 'Lokesh',
  'వర్ధన్': 'Vardhan',
  'వర్దన్': 'Vardhan',
  'శ్యామ్': 'Shyam',
  'శ్యాం': 'Shyam',
  'శ్రావణ్': 'Sravan',
  'శ్రవణ్': 'Sravan',
};

/**
 * Technical terms, brands, locations, and other English vocabulary
 * that appear in Telugu speech. Key: Telugu-script form.
 * Value: correct English spelling.
 */
export const CUSTOM_TERMS: Record<string, string> = {
  // ─── Brands & Companies ───
  'మైక్రోసాఫ్ట్': 'Microsoft',
  'మైక్రోసాఫ్ట': 'Microsoft',
  'గూగుల్': 'Google',

  // ─── Locations ───
  'బొటానికల్': 'Botanical',
  'బొటానికల్ గార్డెన్': 'Botanical Garden',
  'డామినోస్': "Domino's",
  'డొమినోస్': "Domino's",

  // ─── Professional / Technical Terms ───
  'ఎచ్ఆర్': 'HR',
  'హెచ్ ఆర్': 'HR',
  'సీఎస్ఎం': 'CSM',
  'సి ఎస్ ఎం': 'CSM',
  'ఆప్టిట్యూడ్': 'Aptitude',
  'ఆప్టిట్యూడ': 'Aptitude',
  'హ్యాకథాన్': 'Hackathon',
  'హ్యాకథాన': 'Hackathon',
  'హ్యాకతాన్': 'Hackathon',
  'సోర్సింగ్': 'Sourcing',
  'సోర్సింగ': 'Sourcing',
  'స్క్రీనింగ్': 'Screening',
  'స్క్రీనింగ': 'Screening',
  'ఫ్రెషర్స్': 'Freshers',
  'ఫ్రెషర్స': 'Freshers',
  'సైన్': 'sign',

  // ─── Honorifics ───
  'సర్': 'Sir',
  'సార్': 'Sir',
};

/**
 * Post-transliteration corrections applied to the Roman output.
 * These fix patterns that the character-by-character transliterator
 * can't catch. Key: regex pattern or literal. Value: replacement.
 *
 * Only add corrections here when they are clearly correct in context.
 * Do NOT add aggressive global replacements.
 */
export const POST_CORRECTIONS: Array<{ pattern: RegExp; replacement: string }> = [
  // "Shyam Sir" / "Sravan Sir" compound forms
  { pattern: /\bshyam\s+sir\b/gi, replacement: 'Shyam Sir' },
  { pattern: /\bsravan\s+sir\b/gi, replacement: 'Sravan Sir' },
];

/**
 * Combine all custom vocabulary into a single lookup map.
 * Used by the transliterator's loanword system.
 */
export function getCustomVocabulary(): Record<string, string> {
  return { ...CUSTOM_NAMES, ...CUSTOM_TERMS };
}
