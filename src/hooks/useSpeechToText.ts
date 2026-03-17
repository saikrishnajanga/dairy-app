import { useState, useCallback, useRef, useEffect } from 'react';
import { transliterate } from '../services/transliterator';
import { Capacitor } from '@capacitor/core';

// Native speech plugin
let NativeSpeech: any = null;

async function loadPlugin() {
  if (Capacitor.isNativePlatform() && !NativeSpeech) {
    try {
      const m = await import('@capacitor-community/speech-recognition');
      NativeSpeech = m.SpeechRecognition;
    } catch { /* not available */ }
  }
}
loadPlugin();

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

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const accumulatedRef = useRef('');
  const listeningRef = useRef(false);

  // ─── Request Permission ───
  const requestPermission = useCallback(async () => {
    if (isNative && NativeSpeech) {
      try {
        const res = await NativeSpeech.requestPermissions();
        const granted = res?.speechRecognition === 'granted';
        setState(p => ({ ...p, needsPermission: !granted, error: granted ? null : 'Go to Settings → Apps → VoiceDiary Pro → Permissions → Microphone → Allow' }));
        return granted;
      } catch { return false; }
    } else {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach(t => t.stop());
        setState(p => ({ ...p, needsPermission: false, error: null }));
        return true;
      } catch {
        setState(p => ({ ...p, error: 'Microphone denied in browser.' }));
        return false;
      }
    }
  }, [isNative]);

  // ═══════════════════════════════════
  //  NATIVE (Android) — Simple approach
  //  Uses popup:true for reliable results
  // ═══════════════════════════════════
  const startNative = useCallback(async () => {
    if (!NativeSpeech) {
      await loadPlugin();
      if (!NativeSpeech) {
        setState(p => ({ ...p, error: 'Speech not available. Restart app.' }));
        return;
      }
    }

    // Check permission
    try {
      const p = await NativeSpeech.checkPermissions();
      if (p?.speechRecognition !== 'granted') {
        const r = await NativeSpeech.requestPermissions();
        if (r?.speechRecognition !== 'granted') {
          setState(s => ({ ...s, needsPermission: true, error: 'Tap "Grant Permission" below' }));
          return;
        }
      }
    } catch {
      setState(p => ({ ...p, error: 'Permission check failed' }));
      return;
    }

    setState(p => ({ ...p, isListening: true, error: null, needsPermission: false }));
    listeningRef.current = true;

    try {
      // Remove any old listeners
      await NativeSpeech.removeAllListeners();

      // Set up listeners BEFORE starting
      await NativeSpeech.addListener('partialResults', (data: any) => {
        if (!listeningRef.current) return;
        const text = data.matches?.[0] || data.value || '';
        if (text) {
          setState(p => ({
            ...p,
            teluguText: (accumulatedRef.current ? accumulatedRef.current + ' ' : '') + text,
            interimText: transliterate(text),
          }));
        }
      });

      // Start recognition
      const result = await NativeSpeech.start({
        language: 'te-IN',
        maxResults: 3,
        partialResults: true,
        popup: false,
      });

      // If start() returns results directly (some plugin versions)
      if (result?.matches?.length) {
        const text = result.matches[0];
        const full = accumulatedRef.current ? accumulatedRef.current + ' ' + text : text;
        accumulatedRef.current = full;
        setState(p => ({
          ...p,
          teluguText: full,
          romanizedText: transliterate(full),
          interimText: '',
          isListening: false,
        }));
        listeningRef.current = false;
        await NativeSpeech.removeAllListeners();
      }
    } catch (e: any) {
      listeningRef.current = false;
      setState(p => ({
        ...p,
        error: e?.message || 'Speech recognition failed',
        isListening: false,
      }));
      try { await NativeSpeech.removeAllListeners(); } catch {}
    }
  }, []);

  const stopNative = useCallback(async () => {
    listeningRef.current = false;
    try {
      await NativeSpeech?.stop();
    } catch { /* ignore */ }
    try {
      await NativeSpeech?.removeAllListeners();
    } catch { /* ignore */ }

    // Finalize whatever we have
    setState(p => {
      if (p.teluguText && !p.romanizedText) {
        return {
          ...p,
          romanizedText: transliterate(p.teluguText),
          interimText: '',
          isListening: false,
        };
      }
      return { ...p, isListening: false, interimText: '' };
    });
  }, []);

  // ═══════════════════════════════════
  //  WEB (Browser) — Web Speech API
  // ═══════════════════════════════════
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

    rec.onstart = () => {
      listeningRef.current = true;
      setState(p => ({ ...p, isListening: true, error: null }));
    };

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript + ' ';
        else interim += r[0].transcript;
      }
      if (finalText.trim()) accumulatedRef.current = finalText.trim();
      const combined = accumulatedRef.current + (interim.trim() ? ' ' + interim.trim() : '');
      setState(p => ({
        ...p,
        teluguText: combined,
        romanizedText: transliterate(combined),
        interimText: interim.trim() ? transliterate(interim.trim()) : '',
      }));
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      listeningRef.current = false;
      const msgs: Record<string, string> = {
        'not-allowed': 'Microphone denied.',
        'no-speech': 'No speech detected.',
        'network': 'Network error.',
      };
      setState(p => ({ ...p, error: msgs[e.error] || `Error: ${e.error}`, isListening: false }));
    };

    rec.onend = () => {
      listeningRef.current = false;
      setState(p => ({ ...p, isListening: false }));
    };

    recognitionRef.current = rec;
    try { rec.start(); } catch {
      setState(p => ({ ...p, error: 'Could not start recognition.', isListening: false }));
    }
  }, []);

  const stopWeb = useCallback(() => {
    listeningRef.current = false;
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
    setState(p => ({ ...p, isListening: false }));
  }, []);

  // ─── Unified ───
  const startListening = useCallback(async () => {
    if (isNative) await startNative();
    else await startWeb();
  }, [isNative, startNative, startWeb]);

  const stopListening = useCallback(() => {
    if (isNative) stopNative();
    else stopWeb();
  }, [isNative, stopNative, stopWeb]);

  const resetTranscript = useCallback(() => {
    accumulatedRef.current = '';
    setState(p => ({ ...p, teluguText: '', romanizedText: '', interimText: '', error: null }));
  }, []);

  useEffect(() => () => {
    listeningRef.current = false;
    recognitionRef.current?.abort();
    if (isNative) { try { NativeSpeech?.stop(); NativeSpeech?.removeAllListeners(); } catch {} }
  }, [isNative]);

  return { ...state, startListening, stopListening, resetTranscript, requestPermission };
}
