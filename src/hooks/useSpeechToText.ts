import { useState, useCallback, useRef, useEffect } from 'react';
import { transliterate } from '../services/transliterator';

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
    isSupported: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  });

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const accumulatedRef = useRef('');

  const startListening = useCallback(async () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setState(p => ({ ...p, error: 'Speech recognition not supported. Use Chrome or Edge.' }));
      return;
    }

    // Request microphone permission (triggers Android permission dialog)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop()); // Release immediately, just need the permission
    } catch {
      setState(p => ({ ...p, error: 'Microphone access denied. Please allow microphone permission in app settings.' }));
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
          'not-allowed': 'Microphone access denied. Please allow microphone.',
          'no-speech': 'No speech detected. Try again.',
          'network': 'Network error. Check internet connection.',
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

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setState(p => ({ ...p, isListening: false }));
  }, []);

  const resetTranscript = useCallback(() => {
    accumulatedRef.current = '';
    setState(p => ({ ...p, teluguText: '', romanizedText: '', interimText: '', error: null }));
  }, []);

  useEffect(() => () => { recognitionRef.current?.abort(); }, []);

  return { ...state, startListening, stopListening, resetTranscript };
}
