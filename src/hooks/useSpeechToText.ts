import { useState, useCallback, useRef, useEffect } from 'react';
import { transliterate } from '../services/transliterator';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

interface SpeechState {
  isListening: boolean;
  teluguText: string;
  romanizedText: string;
  interimText: string;
  error: string | null;
  needsPermission: boolean;
}

export function useSpeechToText() {
  const isNative = Capacitor.isNativePlatform();

  const [state, setState] = useState<SpeechState>({
    isListening: false,
    teluguText: '',
    romanizedText: '',
    interimText: '',
    error: null,
    needsPermission: false,
  });

  const webRecRef = useRef<globalThis.SpeechRecognition | null>(null);
  const accumulatedRef = useRef('');

  // ─── Request Permission ───
  const requestPermission = useCallback(async () => {
    if (isNative) {
      try {
        await SpeechRecognition.requestPermissions();
        const check = await SpeechRecognition.checkPermissions();
        const ok = check?.speechRecognition === 'granted';
        setState(p => ({ ...p, needsPermission: !ok, error: ok ? null : 'Open Settings → Apps → VoiceDiary Pro → Permissions → Microphone → Allow' }));
        return ok;
      } catch { return false; }
    }
    return true;
  }, [isNative]);

  // ═══════════════════════════════════════════
  //  NATIVE: Use Google's speech popup dialog
  //  Appends each result to accumulated text
  // ═══════════════════════════════════════════
  const startNative = useCallback(async () => {
    // Permission check
    try {
      const perms = await SpeechRecognition.checkPermissions();
      if (perms?.speechRecognition !== 'granted') {
        await SpeechRecognition.requestPermissions();
        const recheck = await SpeechRecognition.checkPermissions();
        if (recheck?.speechRecognition !== 'granted') {
          setState(p => ({ ...p, needsPermission: true, error: 'Tap "Grant Permission" below' }));
          return;
        }
      }
    } catch (e: any) {
      setState(p => ({ ...p, error: 'Permission error: ' + (e?.message || e) }));
      return;
    }

    setState(p => ({ ...p, isListening: true, error: null, needsPermission: false }));

    try {
      const result = await SpeechRecognition.start({
        language: 'te-IN',
        maxResults: 3,
        partialResults: false,
        popup: true,
      });

      const text = result?.matches?.[0] || '';
      if (text) {
        // APPEND to existing accumulated text (continuous mode)
        const full = accumulatedRef.current ? accumulatedRef.current + ' ' + text : text;
        accumulatedRef.current = full;
        setState(p => ({
          ...p,
          teluguText: full,
          romanizedText: transliterate(full),
          interimText: '',
          isListening: false,
        }));
      } else {
        setState(p => ({ ...p, isListening: false, error: 'No speech detected. Try again.' }));
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes('cancel') || msg.includes('Cancel')) {
        setState(p => ({ ...p, isListening: false }));
      } else {
        setState(p => ({ ...p, isListening: false, error: 'Speech failed: ' + msg }));
      }
    }
  }, []);

  const stopNative = useCallback(async () => {
    try { await SpeechRecognition.stop(); } catch {}
    setState(p => ({ ...p, isListening: false }));
  }, []);

  // ═══════════════════════════════════════════
  //  WEB: Browser Web Speech API
  //  Continuous mode — appends across sessions
  // ═══════════════════════════════════════════
  const startWeb = useCallback(async () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setState(p => ({ ...p, error: 'Use Chrome or Edge for speech.' }));
      return;
    }

    const rec = new SR();
    rec.lang = 'te-IN';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    // Remember what we had before this session
    const previousText = accumulatedRef.current;

    rec.onstart = () => setState(p => ({ ...p, isListening: true, error: null }));

    rec.onresult = (event: globalThis.SpeechRecognitionEvent) => {
      let sessionFinal = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) sessionFinal += r[0].transcript + ' ';
        else interim += r[0].transcript;
      }

      // Combine previous accumulated text with this session's results
      const currentFinal = sessionFinal.trim();
      if (currentFinal) {
        accumulatedRef.current = previousText
          ? previousText + ' ' + currentFinal
          : currentFinal;
      }

      const combined = accumulatedRef.current + (interim.trim() ? ' ' + interim.trim() : '');
      setState(p => ({
        ...p,
        teluguText: combined,
        romanizedText: transliterate(combined),
        interimText: interim.trim() ? transliterate(interim.trim()) : '',
      }));
    };

    rec.onerror = (e: globalThis.SpeechRecognitionErrorEvent) => {
      const msgs: Record<string, string> = {
        'not-allowed': 'Microphone denied.',
        'no-speech': 'No speech detected.',
        'network': 'Network error.',
      };
      setState(p => ({ ...p, error: msgs[e.error] || `Error: ${e.error}`, isListening: false }));
    };

    rec.onend = () => setState(p => ({ ...p, isListening: false }));
    webRecRef.current = rec;
    try { rec.start(); } catch {
      setState(p => ({ ...p, error: 'Could not start.', isListening: false }));
    }
  }, []);

  const stopWeb = useCallback(() => {
    try { webRecRef.current?.stop(); } catch {}
    webRecRef.current = null;
    setState(p => ({ ...p, isListening: false }));
  }, []);

  // ─── Unified API ───
  const startListening = useCallback(async () => {
    // Do NOT reset accumulated text — append mode
    if (isNative) await startNative();
    else await startWeb();
  }, [isNative, startNative, startWeb]);

  const stopListening = useCallback(() => {
    if (isNative) stopNative();
    else stopWeb();
  }, [isNative, stopNative, stopWeb]);

  // Explicit clear — only called by user pressing "Clear" button
  const clearTranscript = useCallback(() => {
    accumulatedRef.current = '';
    setState(p => ({ ...p, teluguText: '', romanizedText: '', interimText: '', error: null }));
  }, []);

  useEffect(() => () => { webRecRef.current?.abort(); }, []);

  return { ...state, startListening, stopListening, clearTranscript, requestPermission };
}
