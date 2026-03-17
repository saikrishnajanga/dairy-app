import { useState, useCallback, useRef, useEffect } from 'react';
import { transliterate } from '../services/transliterator';
import { Capacitor } from '@capacitor/core';

// Dynamic import for native speech recognition
let SpeechRecognitionPlugin: any = null;

async function loadNativePlugin() {
  if (Capacitor.isNativePlatform()) {
    try {
      const mod = await import('@capacitor-community/speech-recognition');
      SpeechRecognitionPlugin = mod.SpeechRecognition;
      // Request permission on native
      const { permission } = await SpeechRecognitionPlugin.checkPermissions();
      if (permission !== 'granted') {
        await SpeechRecognitionPlugin.requestPermissions();
      }
    } catch (e) {
      console.warn('Native speech plugin not available:', e);
    }
  }
}

// Load plugin on import
loadNativePlugin();

interface SpeechState {
  isListening: boolean;
  teluguText: string;
  romanizedText: string;
  interimText: string;
  error: string | null;
  isSupported: boolean;
}

export function useSpeechToText() {
  const [state, setState] = useState<SpeechState>({
    isListening: false,
    teluguText: '',
    romanizedText: '',
    interimText: '',
    error: null,
    isSupported: true,
  });

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const accumulatedRef = useRef('');

  // ─── Native (Android/iOS) speech recognition ───
  const startNativeListening = useCallback(async () => {
    if (!SpeechRecognitionPlugin) {
      setState(p => ({ ...p, error: 'Speech plugin not loaded. Please restart the app.' }));
      return;
    }

    try {
      const { permission } = await SpeechRecognitionPlugin.checkPermissions();
      if (permission !== 'granted') {
        const res = await SpeechRecognitionPlugin.requestPermissions();
        if (res.permission !== 'granted') {
          setState(p => ({ ...p, error: 'Microphone permission denied. Go to Settings → App → Permissions.' }));
          return;
        }
      }

      setState(p => ({ ...p, isListening: true, error: null }));

      // Listen for partial results
      SpeechRecognitionPlugin.addListener('partialResults', (data: any) => {
        const text = data.matches?.[0] || data.value || '';
        if (text) {
          setState(p => ({
            ...p,
            interimText: transliterate(text),
            teluguText: text,
          }));
        }
      });

      await SpeechRecognitionPlugin.start({
        language: 'te-IN',
        maxResults: 5,
        prompt: 'Speak in Telugu...',
        partialResults: true,
        popup: false,
      });

      // Listen for final results
      SpeechRecognitionPlugin.addListener('results', (data: any) => {
        const text = data.matches?.[0] || '';
        const accumulated = accumulatedRef.current ? accumulatedRef.current + ' ' + text : text;
        accumulatedRef.current = accumulated;
        setState(p => ({
          ...p,
          teluguText: accumulated,
          romanizedText: transliterate(accumulated),
          interimText: '',
          isListening: false,
        }));
        SpeechRecognitionPlugin.removeAllListeners();
      });

    } catch (e: any) {
      setState(p => ({ ...p, error: `Speech error: ${e.message || e}`, isListening: false }));
    }
  }, []);

  const stopNativeListening = useCallback(async () => {
    try {
      await SpeechRecognitionPlugin?.stop();
      SpeechRecognitionPlugin?.removeAllListeners();
    } catch { /* ignore */ }
    setState(p => ({ ...p, isListening: false }));
  }, []);

  // ─── Web (Browser) speech recognition ───
  const startWebListening = useCallback(async () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setState(p => ({ ...p, error: 'Speech recognition not supported. Use Chrome or Edge.' }));
      return;
    }

    // Request mic permission
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch {
      setState(p => ({ ...p, error: 'Microphone access denied.' }));
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
          'not-allowed': 'Microphone access denied.',
          'no-speech': 'No speech detected. Try again.',
          'network': 'Network error. Check internet.',
          'audio-capture': 'No microphone found.',
        };
        setState(p => ({ ...p, error: msgs[e.error] || `Error: ${e.error}`, isListening: false }));
      };

      rec.onend = () => setState(p => ({ ...p, isListening: false }));

      recognitionRef.current = rec;
      rec.start();
    } catch {
      setState(p => ({ ...p, error: 'Failed to start speech recognition.', isListening: false }));
    }
  }, []);

  const stopWebListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setState(p => ({ ...p, isListening: false }));
  }, []);

  // ─── Unified API ───
  const isNative = Capacitor.isNativePlatform();

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
    if (isNative) SpeechRecognitionPlugin?.removeAllListeners();
  }, [isNative]);

  return { ...state, startListening, stopListening, resetTranscript };
}
