/**
 * WhatsApp Chat Enhancer Service
 *
 * Removes all timestamps, dates, and sender names from WhatsApp exports / copied chat text,
 * removes WhatsApp system notices (like <Media omitted>, encryption notices, deleted messages),
 * and combines all messages into a single continuous text with each message separated by a space
 * (as one seamless paragraph of sentences).
 */

export interface EnhanceOptions {
  /**
   * 'single_paragraph': Combine all messages into a single continuous text separated by a space.
   * 'preserve_lines': Keep each message on a new line.
   */
  mode?: 'single_paragraph' | 'preserve_lines';
  /** Remove WhatsApp system messages like <Media omitted>, encryption notices, etc. Default: true */
  removeSystemMessages?: boolean;
  /** Automatically ensure sentence-ending punctuation (., ?, !) before combining. Default: false */
  autoPunctuate?: boolean;
  /** Remove emojis from text. Default: false */
  removeEmojis?: boolean;
}

export interface EnhanceResult {
  /** The extracted, cleaned continuous text */
  result: string;
  /** Total messages processed */
  messageCount: number;
  /** Names/numbers of participants detected */
  participants: string[];
  /** Count of input characters */
  inputCharCount: number;
  /** Count of output characters */
  outputCharCount: number;
  /** Count of input words */
  inputWordCount: number;
  /** Count of output words */
  outputWordCount: number;
  /** Number of system notices filtered out */
  systemNoticesRemoved: number;
}

/**
 * Strips invisible Unicode directional marks (often inserted by WhatsApp)
 * such as LTR (\u200E), RTL (\u200F), narrow no-break space (\u202F), etc.
 */
export function stripInvisibleMarks(text: string): string {
  return text
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\u202f/g, ' ')
    .replace(/\u00a0/g, ' ');
}

// Patterns identifying WhatsApp system / automated notices
const SYSTEM_PATTERNS = [
  /messages and calls are end-to-end encrypted/i,
  /<media omitted>/i,
  /image omitted/i,
  /audio omitted/i,
  /video omitted/i,
  /sticker omitted/i,
  /gif omitted/i,
  /contact card omitted/i,
  /document omitted/i,
  /location: https?:\/\//i,
  /this message was deleted/i,
  /you deleted this message/i,
  /missed (voice|video) call/i,
  /security code changed/i,
  /changed the subject to/i,
  /changed the group/i,
  /changed this group/i,
  /added you/i,
  /created group/i,
  /left the group/i,
  /waiting for this message/i,
  /tap to learn more/i,
  /disappearing messages/i,
];

export function isSystemMessage(text: string): boolean {
  return SYSTEM_PATTERNS.some(pattern => pattern.test(text));
}

// ─── Regular Expressions for WhatsApp message headers ───────────────────────

// 1. Android: "12/10/2023, 10:45 AM - Sender Name: Message text"
// Supports dates DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, DD.MM.YY with 12h/24h times
const ANDROID_MSG_REGEX = /^(\d{1,4}[-/. ]\d{1,2}[-/. ]\d{1,4}|\d{1,2}[-/. ]\d{1,2}[-/. ]\d{2,4})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:[\s]*[AaPp][Mm])?)\s*-\s*([^:\n\r]+):\s*(.*)$/;

// 2. Android system message line without sender colon: "12/10/2023, 10:45 AM - System notice"
const ANDROID_SYS_REGEX = /^(\d{1,4}[-/. ]\d{1,2}[-/. ]\d{1,4}|\d{1,2}[-/. ]\d{1,2}[-/. ]\d{2,4})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:[\s]*[AaPp][Mm])?)\s*-\s*(.*)$/;

// 3. iOS bracketed message: "[12/10/23, 10:45:12 AM] Sender: Message" or "[10:45 AM, 12/10/23] Sender: Message"
const IOS_MSG_REGEX = /^\[([^\]\r\n]+)\]\s*([^:\r\n]+):\s*(.*)$/;

// 4. iOS bracketed system line: "[12/10/23, 10:45:12 AM] System text"
const IOS_SYS_REGEX = /^\[([^\]\r\n]+)\]\s*(.*)$/;

// 5. Short time format without date: "10:45 AM - Sender: Message" or "[10:45 AM] Sender: Message"
const TIME_MSG_REGEX = /^(?:\[|\b)(\d{1,2}:\d{2}(?::\d{2})?(?:[\s]*[AaPp][Mm])?)(?:\]|\s*-\s*)\s*([^:\r\n]+):\s*(.*)$/;

// 6. WhatsApp Web copy format: "Sender, [12/10/23 10:45 AM]"
const WEB_SENDER_HEADER = /^([^,\r\n]+),\s*\[([^\]\r\n]+)\]$/;

// 7. Standalone date or timestamp lines that might be pasted alone
const STANDALONE_DATE_TIME = /^(\d{1,4}[-/. ]\d{1,2}[-/. ]\d{1,4}|\d{1,2}[-/. ]\d{1,2}[-/. ]\d{2,4})([,\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:[\s]*[AaPp][Mm])?))?$/;
const STANDALONE_TIME = /^\d{1,2}:\d{2}(?::\d{2})?(?:[\s]*[AaPp][Mm])?$/;

interface RawMessage {
  sender?: string;
  text: string;
  isSystem: boolean;
}

/**
 * Enhances and extracts WhatsApp chat content.
 */
export function enhanceWhatsAppChat(
  rawText: string,
  options: EnhanceOptions = {}
): EnhanceResult {
  const {
    mode = 'single_paragraph',
    removeSystemMessages = true,
    autoPunctuate = false,
    removeEmojis = false,
  } = options;

  const inputTrimmed = rawText.trim();
  if (!inputTrimmed) {
    return {
      result: '',
      messageCount: 0,
      participants: [],
      inputCharCount: 0,
      outputCharCount: 0,
      inputWordCount: 0,
      outputWordCount: 0,
      systemNoticesRemoved: 0,
    };
  }

  const cleanedRaw = stripInvisibleMarks(rawText);
  const lines = cleanedRaw.split(/\r?\n/);

  const messages: RawMessage[] = [];
  let currentMsg: RawMessage | null = null;
  let pendingSender: string | null = null;
  let systemNoticesRemoved = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;

    // Check WhatsApp Web header: "Sender, [Date Time]"
    const webHeaderMatch = line.match(WEB_SENDER_HEADER);
    if (webHeaderMatch && /\d+:\d+/.test(webHeaderMatch[2])) {
      if (currentMsg) {
        messages.push(currentMsg);
        currentMsg = null;
      }
      pendingSender = webHeaderMatch[1].trim();
      continue;
    }

    // Check Android message line
    const androidMatch = line.match(ANDROID_MSG_REGEX);
    if (androidMatch) {
      if (currentMsg) messages.push(currentMsg);
      const sender = androidMatch[3].trim();
      const content = androidMatch[4].trim();
      const isSys = isSystemMessage(content);
      if (isSys) systemNoticesRemoved++;
      currentMsg = { sender, text: content, isSystem: isSys };
      pendingSender = null;
      continue;
    }

    // Check Android system line (e.g. "12/10/2023, 10:45 AM - Messages and calls are end-to-end encrypted.")
    const androidSysMatch = line.match(ANDROID_SYS_REGEX);
    if (androidSysMatch) {
      if (currentMsg) messages.push(currentMsg);
      systemNoticesRemoved++;
      currentMsg = { sender: 'System', text: androidSysMatch[3].trim(), isSystem: true };
      pendingSender = null;
      continue;
    }

    // Check iOS bracketed message line
    const iosMatch = line.match(IOS_MSG_REGEX);
    if (iosMatch && /\d+:\d+/.test(iosMatch[1])) {
      if (currentMsg) messages.push(currentMsg);
      const sender = iosMatch[2].trim();
      const content = iosMatch[3].trim();
      const isSys = isSystemMessage(content);
      if (isSys) systemNoticesRemoved++;
      currentMsg = { sender, text: content, isSystem: isSys };
      pendingSender = null;
      continue;
    }

    // Check iOS bracketed system line
    const iosSysMatch = line.match(IOS_SYS_REGEX);
    if (iosSysMatch && /\d+:\d+/.test(iosSysMatch[1])) {
      if (currentMsg) messages.push(currentMsg);
      systemNoticesRemoved++;
      currentMsg = { sender: 'System', text: iosSysMatch[2].trim(), isSystem: true };
      pendingSender = null;
      continue;
    }

    // Check short time line: "10:45 AM - Sender: message"
    const timeMatch = line.match(TIME_MSG_REGEX);
    if (timeMatch) {
      if (currentMsg) messages.push(currentMsg);
      const sender = timeMatch[2].trim();
      const content = timeMatch[3].trim();
      const isSys = isSystemMessage(content);
      if (isSys) systemNoticesRemoved++;
      currentMsg = { sender, text: content, isSystem: isSys };
      pendingSender = null;
      continue;
    }

    // Check standalone timestamp / date line
    if (STANDALONE_DATE_TIME.test(line) || STANDALONE_TIME.test(line)) {
      continue;
    }

    // Check pending sender from WhatsApp Web format
    if (pendingSender) {
      if (currentMsg) messages.push(currentMsg);
      const isSys = isSystemMessage(line);
      if (isSys) systemNoticesRemoved++;
      currentMsg = { sender: pendingSender, text: line, isSystem: isSys };
      pendingSender = null;
      continue;
    }

    // If we have an existing message, this line is a multi-line continuation of the message!
    if (currentMsg) {
      currentMsg.text += ' ' + line;
    } else {
      // First line without standard timestamp
      const isSys = isSystemMessage(line);
      if (isSys) systemNoticesRemoved++;
      currentMsg = { text: line, isSystem: isSys };
    }
  }

  if (currentMsg) {
    messages.push(currentMsg);
  }

  // Filter out system messages
  const validMessages = messages.filter(m => {
    if (removeSystemMessages && (m.isSystem || isSystemMessage(m.text))) {
      return false;
    }
    const trimmed = m.text.trim();
    if (!trimmed) return false;
    if (removeSystemMessages && isSystemMessage(trimmed)) {
      return false;
    }
    return true;
  });

  const participantsList = Array.from(
    new Set(
      validMessages
        .map(m => m.sender?.trim())
        .filter((s): s is string => Boolean(s) && s !== 'System')
    )
  );

  // Clean each message: strip any leftover leading timestamps/senders and clean whitespace
  const cleanedTexts = validMessages.map(m => {
    let t = m.text.trim();

    // Secondary residual cleanup:
    // Remove any leftover leading timestamps or bracketed timestamps
    t = t.replace(/^(\d{1,4}[-/. ]\d{1,2}[-/. ]\d{1,4}|\d{1,2}[-/. ]\d{1,2}[-/. ]\d{2,4})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:[\s]*[AaPp][Mm])?)\s*-\s*/, '');
    t = t.replace(/^\[[^\]]+\]\s*/, '');
    // Remove any residual "Sender Name: " at the very start
    t = t.replace(/^[^:\r\n]{1,60}:\s*/, '');

    // Collapse multiple internal whitespaces/newlines into a single space
    t = t.replace(/\s+/g, ' ').trim();

    // Optional: remove emojis
    if (removeEmojis) {
      t = t.replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '').replace(/\s+/g, ' ').trim();
    }

    // Auto-punctuate if requested and punctuation missing
    if (autoPunctuate && t) {
      if (!/[.!?,:;]$/.test(t)) {
        t += '.';
      }
    }

    return t;
  }).filter(Boolean);

  let result = '';
  if (mode === 'preserve_lines') {
    result = cleanedTexts.join('\n\n');
  } else {
    // Default: combine all messages into a single continuous text with each message separated by a space
    result = cleanedTexts.join(' ');
  }

  const countWords = (str: string) => str.trim().split(/\s+/).filter(Boolean).length;

  return {
    result,
    messageCount: cleanedTexts.length,
    participants: participantsList,
    inputCharCount: rawText.length,
    outputCharCount: result.length,
    inputWordCount: countWords(rawText),
    outputWordCount: countWords(result),
    systemNoticesRemoved,
  };
}

/**
 * Realistic sample WhatsApp conversation for 1-click demonstration
 */
export const SAMPLE_WHATSAPP_CHAT = `12/10/2026, 10:15 AM - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.
12/10/2026, 10:16 AM - Sai Krishna: Good morning everyone! Hope you all had a restful weekend.
12/10/2026, 10:17 AM - Priya Sharma: Good morning Sai! Yes, ready for the new sprint.
12/10/2026, 10:18 AM - Sai Krishna: Today we need to review the voice journal application and finalize the WhatsApp chat enhancer module.
Everything is looking great so far.
Please check the live demo once you are at your desk.
12/10/2026, 10:20 AM - Rajesh Kumar: <Media omitted>
12/10/2026, 10:21 AM - Rajesh Kumar: I just tested the prototype. The speed and clean extraction of text is super smooth!
12/10/2026, 10:22 AM - Priya Sharma: Awesome! All timestamps, dates, and sender headers are completely stripped into a clean single paragraph.
12/10/2026, 10:23 AM - Sai Krishna: Perfect, let's ship this update today.`;
