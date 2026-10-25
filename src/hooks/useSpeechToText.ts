import { useState, useCallback, useRef, useEffect } from 'react';
import { transliterate } from '../services/transliterator';
import {
  mergeTranscript, newTranscriptTail, normalizeTranscript,
} from '../services/transcript';
import { scopedKey } from '../services/profiles';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

// ═══════════════════════════════════════════════════════════
//  Continuous Telugu speech → Roman transliteration hook
//
//  Goals (long-form dictation):
//  • Keep the mic alive across natural pauses (auto-restart)
//  • Merge every recognition chunk into ONE growing transcript
//  • Never lose or replace already transcribed text
//  • Never duplicate words when the recognizer restarts
//  • No character / word / length limit anywhere
//  • Recover from temporary errors and resume listening
//
//  Anti-hallucination rules:
//  • Never predict the next word or sentence
//  • Never autocomplete unfinished sentences
//  • Never add words based on previous conversations
//  • Never invent words to make sentences correct
//  • Never append temporary recognition results repeatedly
//  • Never repeat previously confirmed text on new events
//  • Preserve repeated words when genuinely spoken
//  • If speech is unclear, keep closest defensible result
// ═══════════════════════════════════════════════════════════

// The draft belongs to the active profile, so switching profiles never
// leaks one person's half-finished transcript into another's recorder.
const draftKey = () => scopedKey('vd_voice_draft');
const RESTART_DELAY_MS = 100;      // web: gap before re-opening the mic after a pause (fast to avoid missing words)
const NATIVE_GAP_MS = 150;         // native: gap before the next listening session
const NATIVE_FINAL_WAIT_MS = 200;  // native: let final results arrive before committing
const NATIVE_WATCHDOG_MS = 1500;   // native: how often to check the engine is alive

export interface SpeechToTextState {
  /** Mic is open (including short moments while it is being restarted). */
  isListening: boolean;
  /** A restart is in flight after a pause or a hiccup. */
  isRestarting: boolean;
  /** Committed Telugu transcript (final chunks only — the source of truth). */
  teluguText: string;
  /** Committed transcript written in English/Roman letters. */
  romanizedText: string;
  /** Live, not-yet-final Telugu tail. */
  interimTelugu: string;
  /** Live tail in Roman letters, with any overlap on the committed text removed. */
  interimText: string;
  /** Small, non-intrusive status line. */
  status: string;
  error: string | null;
  needsPermission: boolean;
  /** How many recognition chunks have been merged so far. */
  chunkCount: number;
  /** Whether the transcript has been manually edited by the user. */
  isEdited: boolean;
}

// ─── Pure text helpers (see services/transcript.ts) ───

function readDraft(): string {
  try { return localStorage.getItem(draftKey()) || ''; } catch { return ''; }
}

export function useSpeechToText() {
  const isNative = Capacitor.isNativePlatform();

  const [state, setState] = useState<SpeechToTextState>(() => {
    const draft = readDraft();
    return {
      isListening: false,
      isRestarting: false,
      teluguText: draft,
      romanizedText: draft ? transliterate(draft) : '',
      interimTelugu: '',
      interimText: '',
      status: draft ? 'Restored your last transcript' : '',
      error: null,
      needsPermission: false,
      chunkCount: 0,
      isEdited: false,
    };
  });

  const committedRef = useRef(state.teluguText);
  const shouldListenRef = useRef(false);
  const pendingRef = useRef('');                 // latest raw interim segment
  const webRecRef = useRef<globalThis.SpeechRecognition | null>(null);
  const nativeListenersRef = useRef<{ remove: () => Promise<void> }[]>([]);
  const nativeRestartTimerRef = useRef<number | null>(null);
  const nativeFinalTimerRef = useRef<number | null>(null);
  const nativeWatchdogRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const scheduleRestartRef = useRef<(delay?: number) => void>(() => {});
  const beginNativeSessionRef = useRef<() => Promise<void>>(async () => {});
  const chunkCountRef = useRef(0);

  // ─── SESSION TRACKING: prevent stale events after stop ───
  // Each time we start listening, bump the session ID.
  // All recognition callbacks check this before modifying state.
  const sessionIdRef = useRef(0);

  // ─── DOUBLE-COMMIT GUARD ───
  // Track chunk & timestamp to prevent identical double-firing in same event
  const lastFinalChunkRef = useRef('');
  const lastCommitTimeRef = useRef(0);

  // ─── DEBOUNCE GUARD: prevent rapid double-clicks on start mic ───
  const lastToggleTimeRef = useRef(0);

  // ─── Persist the transcript so a tab switch / app close can't lose it ───
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        if (committedRef.current) localStorage.setItem(draftKey(), committedRef.current);
        else localStorage.removeItem(draftKey());
      } catch { /* storage full — transcript still lives in memory */ }
    }, 400);
    return () => window.clearTimeout(t);
  }, [state.teluguText]);

  const setError = useCallback((error: string | null, status?: string) => {
    setState(p => ({ ...p, error, status: status ?? p.status }));
  }, []);

  /** Merge a final chunk into the transcript. Returns true if anything changed. */
  const commit = useCallback((chunk: string): boolean => {
    const clean = normalizeTranscript(chunk);
    if (!clean) return false;

    const now = Date.now();
    // Guard against rapid identical duplicate event fired within 800ms
    if (clean === lastFinalChunkRef.current && (now - lastCommitTimeRef.current < 800)) {
      pendingRef.current = '';
      clearInterim();
      return false;
    }

    const merged = mergeTranscript(committedRef.current, clean);
    // If nothing new was added (already absorbed at boundary), exit cleanly
    if (merged === committedRef.current && committedRef.current.length > 0) {
      pendingRef.current = '';
      clearInterim();
      return false;
    }

    committedRef.current = merged;
    pendingRef.current = '';
    lastFinalChunkRef.current = clean;
    lastCommitTimeRef.current = now;
    chunkCountRef.current += 1;
    setState(p => ({
      ...p,
      teluguText: merged,
      romanizedText: transliterate(merged),
      interimTelugu: '',
      interimText: '',
      chunkCount: chunkCountRef.current,
      error: null,
      isEdited: false,
    }));
    return true;
  }, [clearInterim]);

  /** Show the live (uncommitted) tail without duplicating committed words. */
  const showInterim = useCallback((raw: string) => {
    const tail = newTranscriptTail(committedRef.current, raw);
    setState(p => {
      if (!tail) return p.interimTelugu ? { ...p, interimTelugu: '', interimText: '' } : p;
      if (p.interimTelugu === tail) return p;
      return { ...p, interimTelugu: tail, interimText: transliterate(tail) };
    });
  }, []);

  const clearInterim = useCallback(() => {
    pendingRef.current = '';
    setState(p => (p.interimTelugu ? { ...p, interimTelugu: '', interimText: '' } : p));
  }, []);

  // ─── Permissions ───────────────────────────────────────────
  const requestPermission = useCallback(async () => {
    if (isNative) {
      try {
        await SpeechRecognition.requestPermissions();
        const check = await SpeechRecognition.checkPermissions();
        const ok = check?.speechRecognition === 'granted';
        setState(p => ({
          ...p,
          needsPermission: !ok,
          error: ok ? null : 'Open Settings → Apps → VoiceDiary Pro → Permissions → Microphone → Allow',
        }));
        return ok;
      } catch { return false; }
    }
    return true;
  }, [isNative]);

  // ═══════════════════════════════════════════════════════════
  //  WEB: Web Speech API, continuous + self-healing restarts
  //
  //  Anti-duplication strategy:
  //  1. Only walk results from event.resultIndex (not 0)
  //  2. Only commit results marked isFinal
  //  3. Track lastFinalChunkRef to prevent double-commit in onend
  //  4. Track sessionId to discard stale callbacks after stop
  //  5. Clear pendingRef immediately after commit
  //  6. Never predict, autocomplete, or invent text
  // ═══════════════════════════════════════════════════════════
  const startWebSession = useCallback(() => {
    if (!shouldListenRef.current) return;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      shouldListenRef.current = false;
      setState(p => ({
        ...p, isListening: false,
        error: 'Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.',
      }));
      return;
    }

    const currentSession = sessionIdRef.current;
    const rec = new SR();
    rec.lang = 'te-IN';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      // Discard callbacks from previous or cancelled sessions
      if (currentSession !== sessionIdRef.current || !shouldListenRef.current) {
        try { rec.abort(); } catch { /* ignore */ }
        return;
      }
      setState(p => ({
        ...p, isListening: true, isRestarting: false, error: null,
        status: 'Listening… speak now in Telugu',
      }));
    };

    rec.onresult = (event: globalThis.SpeechRecognitionEvent) => {
      // ─── STALE SESSION GUARD ───
      if (currentSession !== sessionIdRef.current || !shouldListenRef.current) return;

      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript ?? '';

        if (result.isFinal) {
          commit(transcript);
        } else {
          interim += transcript;
        }
      }

      if (interim) {
        pendingRef.current = interim;
        showInterim(interim);
      } else {
        pendingRef.current = '';
        clearInterim();
      }
    };

    rec.onerror = (event: globalThis.SpeechRecognitionErrorEvent) => {
      // Discard errors from stale or stopped sessions
      if (currentSession !== sessionIdRef.current || !shouldListenRef.current) return;

      const code = event.error || 'unknown';

      if (code === 'not-allowed' || code === 'service-not-allowed') {
        shouldListenRef.current = false;
        setState(p => ({
          ...p, isListening: false, isRestarting: false, needsPermission: true,
          error: 'Microphone blocked. Allow mic access in browser settings, then tap the mic again.',
        }));
        return;
      }
      if (code === 'no-speech' || code === 'aborted' || code === 'audio-capture') {
        // Natural speech pause — onend will immediately keep the session going
        setState(p => ({ ...p, status: 'Listening… speak when ready' }));
        return;
      }
      setState(p => ({ ...p, status: `Continuing… (${code})` }));
    };

    rec.onend = () => {
      // Discard end from old session
      if (currentSession !== sessionIdRef.current) return;

      if (!shouldListenRef.current) {
        setState(p => ({ ...p, isListening: false, isRestarting: false, status: 'Stopped' }));
        return;
      }

      // Commit any pending words spoken during this chunk
      if (pendingRef.current) {
        commit(pendingRef.current);
        pendingRef.current = '';
      }
      clearInterim();

      if (shouldListenRef.current) {
        scheduleRestartRef.current(RESTART_DELAY_MS);
      } else {
        setState(p => ({ ...p, isListening: false, isRestarting: false, status: 'Stopped' }));
      }
    };

    webRecRef.current = rec;
    try {
      rec.start();
    } catch {
      // InvalidStateError etc. — retry quickly once previous session released
      if (shouldListenRef.current) scheduleRestartRef.current(150);
    }
  }, [commit, clearInterim, showInterim]);

  const scheduleRestart = useCallback((delay = RESTART_DELAY_MS) => {
    if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
    setState(p => ({ ...p, isListening: true, isRestarting: true, status: 'Continuing to listen…' }));
    restartTimerRef.current = window.setTimeout(() => {
      restartTimerRef.current = null;
      if (!shouldListenRef.current) return;
      startWebSession();
    }, delay);
  }, [startWebSession]);

  scheduleRestartRef.current = scheduleRestart;

  // ═══════════════════════════════════════════════════════════
  //  NATIVE (Android/iOS)
  //
  //  The Android plugin resolves start() IMMEDIATELY when
  //  partialResults is true and streams text through the
  //  `partialResults` event until the utterance ends. The end of an
  //  utterance is announced by `listeningState: "stopped"`
  //  (on Android that is onEndOfSpeech). So:
  //    • results are collected live in pendingRef
  //    • the utterance is COMMITTED when the session stops
  //    • a new session is started right after → speech never stops at
  //      the first sentence, and pauses are handled automatically
  //    • a watchdog resumes the engine if it dies without an event
  //      (the plugin swallows errors in partial mode)
  // ═══════════════════════════════════════════════════════════
  const endNativeSession = useCallback((restart: boolean) => {
    // Whatever the engine heard is committed — never dropped, never replaced.
    if (pendingRef.current) commit(pendingRef.current);
    clearInterim();

    if (!restart || !shouldListenRef.current) return;
    if (nativeRestartTimerRef.current !== null) return; // already scheduled

    setState(p => ({ ...p, isListening: true, isRestarting: true, status: 'Continuing to listen…' }));
    nativeRestartTimerRef.current = window.setTimeout(() => {
      nativeRestartTimerRef.current = null;
      if (!shouldListenRef.current) return;
      void beginNativeSessionRef.current();
    }, NATIVE_GAP_MS);
  }, [commit, clearInterim]);

  const beginNativeSession = useCallback(async () => {
    if (!shouldListenRef.current) return;

    try {
      const result = await SpeechRecognition.start({
        language: 'te-IN',
        maxResults: 5,
        partialResults: true, // stream text while the user is still speaking
        popup: false,         // no system dialog: the app owns the UI
      });
      // In partial mode this resolves with no matches; text arrives by event.
      const best = result?.matches?.[0];
      if (best) { pendingRef.current = best; showInterim(best); }
      setState(p => ({ ...p, isListening: true, isRestarting: false, error: null }));
    } catch (e) {
      // Engine refused this configuration (older device, no recognizer, …):
      // fall back to one-shot recognition, then keep the loop alive.
      try {
        const oneShot = await SpeechRecognition.start({
          language: 'te-IN', maxResults: 5, partialResults: false, popup: false,
        });
        const best = oneShot?.matches?.[0];
        if (best) commit(best);
      } catch {
        setState(p => ({ ...p, status: 'Speech engine hiccup — retrying…' }));
      }
      endNativeSession(true);
    }
  }, [commit, endNativeSession, showInterim]);

  beginNativeSessionRef.current = beginNativeSession;

  const ensureNativePermission = useCallback(async (): Promise<boolean> => {
    try {
      const perms = await SpeechRecognition.checkPermissions();
      if (perms?.speechRecognition === 'granted') return true;
      await SpeechRecognition.requestPermissions();
      const recheck = await SpeechRecognition.checkPermissions();
      if (recheck?.speechRecognition === 'granted') return true;
      setState(p => ({ ...p, needsPermission: true, error: 'Tap "Grant Microphone Permission" below' }));
      return false;
    } catch (e) {
      setError('Permission error: ' + (e instanceof Error ? e.message : String(e)));
      return false;
    }
  }, [setError]);

  const removeNativeListeners = useCallback(async () => {
    for (const handle of nativeListenersRef.current) {
      try { await handle.remove(); } catch { /* already gone */ }
    }
    nativeListenersRef.current = [];
  }, []);

  const startNative = useCallback(async () => {
    if (!(await ensureNativePermission())) return;

    shouldListenRef.current = true;
    setState(p => ({
      ...p, isListening: true, isRestarting: false, error: null,
      needsPermission: false, status: 'Listening… keep speaking, pauses are fine',
    }));

    try {
      nativeListenersRef.current.push(
        await SpeechRecognition.addListener('partialResults', (data: { matches?: string[] }) => {
          const live = data?.matches?.[0] || '';
          if (!live) return;
          pendingRef.current = live;
          showInterim(live);
        }),
        await SpeechRecognition.addListener('listeningState', (data: { status: 'started' | 'stopped' }) => {
          if (data?.status === 'started') {
            setState(p => ({ ...p, isListening: true, isRestarting: false }));
            return;
          }
          if (data?.status === 'stopped' && shouldListenRef.current) {
            // Let the final results land before committing, then resume.
            if (nativeFinalTimerRef.current !== null) {
              window.clearTimeout(nativeFinalTimerRef.current);
            }
            nativeFinalTimerRef.current = window.setTimeout(() => {
              nativeFinalTimerRef.current = null;
              if (shouldListenRef.current) {
                endNativeSession(true);
              }
            }, NATIVE_FINAL_WAIT_MS);
          }
        }),
      );
    } catch { /* listeners unavailable — the watchdog still resumes */ }

    await beginNativeSession();

    // Watchdog: the plugin reports "stopped" normally, but errors in partial
    // mode are swallowed, so poll to be sure listening never quietly dies.
    if (nativeWatchdogRef.current === null) {
      nativeWatchdogRef.current = window.setInterval(async () => {
        if (!shouldListenRef.current || nativeRestartTimerRef.current !== null) return;
        try {
          const status = await SpeechRecognition.isListening();
          if (!status?.listening && shouldListenRef.current) endNativeSession(true);
        } catch { /* ignore */ }
      }, NATIVE_WATCHDOG_MS);
    }
  }, [ensureNativePermission, beginNativeSession, endNativeSession, showInterim]);

  const stopNative = useCallback(async () => {
    shouldListenRef.current = false;
    if (nativeRestartTimerRef.current !== null) {
      window.clearTimeout(nativeRestartTimerRef.current);
      nativeRestartTimerRef.current = null;
    }
    if (nativeFinalTimerRef.current !== null) {
      window.clearTimeout(nativeFinalTimerRef.current);
      nativeFinalTimerRef.current = null;
    }
    if (nativeWatchdogRef.current !== null) {
      window.clearInterval(nativeWatchdogRef.current);
      nativeWatchdogRef.current = null;
    }
    try { await SpeechRecognition.stop(); } catch { /* already stopped */ }
    if (pendingRef.current) commit(pendingRef.current);
    clearInterim();
    await removeNativeListeners();
  }, [commit, clearInterim, removeNativeListeners]);

  // ─── Unified API ───────────────────────────────────────────
  const startListening = useCallback(async () => {
    // Prevent rapid multiple starts
    const now = Date.now();
    if (now - lastToggleTimeRef.current < 250) return;
    lastToggleTimeRef.current = now;

    shouldListenRef.current = true;
    sessionIdRef.current += 1;
    pendingRef.current = '';
    lastFinalChunkRef.current = '';

    setState(p => ({
      ...p,
      isListening: true,
      isRestarting: false,
      error: null,
      status: 'Listening… speak now in Telugu',
    }));

    if (isNative) {
      await startNative();
    } else {
      startWebSession();
    }
  }, [isNative, startNative, startWebSession]);

  const stopListening = useCallback(async () => {
    // ─── IMMEDIATE, UNCONDITIONAL STOP (NO DEBOUNCE BLOCKING!) ───
    shouldListenRef.current = false;
    sessionIdRef.current += 1;

    // 1. Clear all timers synchronously
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (nativeRestartTimerRef.current !== null) {
      window.clearTimeout(nativeRestartTimerRef.current);
      nativeRestartTimerRef.current = null;
    }
    if (nativeFinalTimerRef.current !== null) {
      window.clearTimeout(nativeFinalTimerRef.current);
      nativeFinalTimerRef.current = null;
    }
    if (nativeWatchdogRef.current !== null) {
      window.clearInterval(nativeWatchdogRef.current);
      nativeWatchdogRef.current = null;
    }

    // 2. Commit any pending spoken words so the final phrase is never lost
    if (pendingRef.current) {
      commit(pendingRef.current);
      pendingRef.current = '';
    }
    clearInterim();

    // 3. Immediately update UI state (0ms delay!)
    setState(p => ({
      ...p,
      isListening: false,
      isRestarting: false,
      status: 'Stopped',
      interimTelugu: '',
      interimText: '',
    }));

    // 4. Force active recognizers to release the microphone immediately
    if (webRecRef.current) {
      try {
        const rec = webRecRef.current;
        rec.onend = null;
        rec.onerror = null;
        rec.onresult = null;
        rec.abort(); // Immediately cut mic capture
      } catch { /* ignore */ }
      try { webRecRef.current?.stop(); } catch { /* ignore */ }
      webRecRef.current = null;
    }

    if (isNative) {
      try {
        await stopNative();
      } catch { /* already stopped */ }
    }
  }, [isNative, stopNative, commit, clearInterim]);

  /** Explicit "start over" — the only thing that discards transcript text. */
  const clearTranscript = useCallback(() => {
    committedRef.current = '';
    chunkCountRef.current = 0;
    pendingRef.current = '';
    lastFinalChunkRef.current = '';
    try { localStorage.removeItem(draftKey()); } catch { /* ignore */ }
    setState(p => ({
      ...p, teluguText: '', romanizedText: '', interimTelugu: '', interimText: '',
      error: null, status: 'Cleared', chunkCount: 0, isEdited: false,
    }));
  }, []);

  /**
   * Allow manual editing of the romanized transcript.
   * This replaces the romanized text without affecting the Telugu source,
   * so the user can fix recognition errors after recording.
   */
  const editTranscript = useCallback((newRomanText: string) => {
    setState(p => ({
      ...p,
      romanizedText: newRomanText,
      isEdited: true,
    }));
  }, []);

  /**
   * Update the committed Telugu text directly (e.g., after manual edit).
   * This also re-transliterates the text to keep both in sync.
   */
  const setTeluguText = useCallback((newText: string) => {
    committedRef.current = newText;
    setState(p => ({
      ...p,
      teluguText: newText,
      romanizedText: transliterate(newText),
      isEdited: false,
    }));
  }, []);

  // ─── Cleanup on unmount: stop the mic, KEEP the transcript ───
  useEffect(() => () => {
    shouldListenRef.current = false;
    sessionIdRef.current += 1; // invalidate any outstanding callbacks
    if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
    if (nativeRestartTimerRef.current !== null) window.clearTimeout(nativeRestartTimerRef.current);
    if (nativeWatchdogRef.current !== null) window.clearInterval(nativeWatchdogRef.current);
    try { webRecRef.current?.abort(); } catch { /* ignore */ }
    nativeListenersRef.current.forEach(handle => handle.remove().catch(() => { /* ignore */ }));
    nativeListenersRef.current = [];
  }, []);

  const fullRoman = [state.romanizedText, state.interimText].filter(Boolean).join(' ');

  return {
    ...state,
    fullRoman,
    startListening,
    stopListening,
    clearTranscript,
    requestPermission,
    editTranscript,
    setTeluguText,
  };
}
