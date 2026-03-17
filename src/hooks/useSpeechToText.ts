import { useState, useCallback, useRef, useEffect } from 'react';
import { transliterate } from '../services/transliterator';
import { Capacitor } from '@capacitor/core';

// Native speech plugin (loaded dynamically)
let NativeSpeech: any = null;
let nativeLoaded = false;

async function loadNativePlugin() {
  if (Capacitor.isNativePlatform() && !nativeLoaded) {
    try {
      const mod = await import('@capacitor-community/speech-recognition');
      NativeSpeech = mod.SpeechRecognition;
      nativeLoaded = true;
    } catch (e) {
      console.warn('Native speech plugin not available:', e);
    }
  }
}

loadNativePlugin();

interface SpeechState {
  isListening: boolean;
  teluguText: string;
  romanizedText: string;
  interimText: string;
  error: string | null;
  isSupported: boolean;
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
    isSupported: true,
    needsPermission: false,
  });

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const accumulatedRef = useRef('');

  // ─── Request Permission (callable from UI button) ───
  const requestPermission = useCallback(async () => {
    if (isNative && NativeSpeech) {
      try {
        const res = await NativeSpeech.requestPermissions();
        if (res?.speechRecognition === 'granted') {
          setState(p => ({ ...p, needsPermission: false, error: null }));
          return true;
        }
        setState(p => ({ ...p, error: 'Permission denied. Go to phone Settings → Apps → VoiceDiary Pro → Permissions → Microphone → Allow' }));
        return false;
      } catch {
        setState(p => ({ ...p, error: 'Could not request permission' }));
        return false;
      }
    } else {
      // Web — use getUserMedia
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        setState(p => ({ ...p, needsPermission: false, error: null }));
        return true;
      } catch {
        setState(p => ({ ...p, error: 'Microphone access denied. Allow in browser settings.' }));
        return false;
      }
    }
  }, [isNative]);

  // ─── Native (Android) speech ───
  const startNativeListening = useCallback(async () => {
    if (!NativeSpeech) {
      await loadNativePlugin();
      if (!NativeSpeech) {
        setState(p => ({ ...p, error: 'Speech plugin not available. Restart app.' }));
        return;
      }
    }

    try {
      // Check permission
      const perms = await NativeSpeech.checkPermissions();
      if (perms?.speechRecognition !== 'granted') {
        const res = await NativeSpeech.requestPermissions();
        if (res?.speechRecognition !== 'granted') {
          setState(p => ({
            ...p,
            needsPermission: true,
            error: 'Microphone permission required. Tap "Grant Permission" below.',
          }));
          return;
        }
      }

      setState(p => ({ ...p, isListening: true, error: null, needsPermission: false }));

      // Partial results listener
      await NativeSpeech.addListener('partialResults', (data: any) => {
        const text = data.matches?.[0] || '';
        if (text) {
          setState(p => ({
            ...p,
            interimText: transliterate(text),
            teluguText: text,
          }));
        }
      });

      // Start listening
      await NativeSpeech.start({
        language: 'te-IN',
        maxResults: 5,
        prompt: 'Speak in Telugu...',
        partialResults: true,
        popup: false,
      });

      // Final results listener
      await NativeSpeech.addListener('results', (data: any) => {
        const text = data.matches?.[0] || '';
        const accumulated = accumulatedRef.current
          ? accumulatedRef.current + ' ' + text
          : text;
        accumulatedRef.current = accumulated;
        setState(p => ({
          ...p,
          teluguText: accumulated,
          romanizedText: transliterate(accumulated),
          interimText: '',
          isListening: false,
        }));
        NativeSpeech.removeAllListeners();
      });
    } catch (e: any) {
      setState(p => ({ ...p, error: `Speech error: ${e?.message || e}`, isListening: false }));
    }
  }, []);

  const stopNativeListening = useCallback(async () => {
    try {
      await NativeSpeech?.stop();
      await NativeSpeech?.removeAllListeners();
    } catch { /* ignore */ }
    setState(p => ({ ...p, isListening: false }));
  }, []);

  // ─── Web (Browser) speech ───
  const startWebListening = useCallback(async () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setState(p => ({ ...p, error: 'Speech not supported. Use Chrome/Edge.' }));
      return;
    }

    try {
      const rec = new SR();
      rec.lang = 'te-IN';
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onstart = () => setState(p => ({ ...p, isListening: true, error: null }));

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
        const msgs: Record<string, string> = {
          'not-allowed': 'Microphone denied. Allow in browser.',
          'no-speech': 'No speech detected.',
          'network': 'Network error.',
          'audio-capture': 'No microphone found.',
        };
        setState(p => ({ ...p, error: msgs[e.error] || `Error: ${e.error}`, isListening: false }));
      };

      rec.onend = () => setState(p => ({ ...p, isListening: false }));
      recognitionRef.current = rec;
      rec.start();
    } catch {
      setState(p => ({ ...p, error: 'Failed to start recognition.', isListening: false }));
    }
  }, []);

  const stopWebListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setState(p => ({ ...p, isListening: false }));
  }, []);

  // ─── Unified API ───
  const startListening = useCallback(async () => {
    if (isNative) await startNativeListening();
    else await startWebListening();
  }, [isNative, startNativeListening, startWebListening]);

  const stopListening = useCallback(() => {
    if (isNative) stopNativeListening();
    else stopWebListening();
  }, [isNative, stopNativeListening, stopWebListening]);

  const resetTranscript = useCallback(() => {
    accumulatedRef.current = '';
    setState(p => ({ ...p, teluguText: '', romanizedText: '', interimText: '', error: null }));
  }, []);

  useEffect(() => () => {
    recognitionRef.current?.abort();
    if (isNative) NativeSpeech?.removeAllListeners();
  }, [isNative]);

  return { ...state, startListening, stopListening, resetTranscript, requestPermission };
}
