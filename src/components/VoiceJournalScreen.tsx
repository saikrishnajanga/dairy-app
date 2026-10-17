import { useState, useRef, useEffect, useCallback } from 'react';
import {
  dbSaveAudioRecording,
  dbGetAudioRecordings,
  dbDeleteAudioRecording,
  type StoredAudioRecording,
} from '../services/db';
import { createTextEntry } from '../services/textDiary';
import { saveEntry } from '../services/storage';
import { transliterate } from '../services/transliterator';
import ConfirmDialog from './ConfirmDialog';
import { moveVoiceToTrash } from '../services/trash';
import { TrashIcon, BackIcon } from './Icons';

interface Props {
  onBack: () => void;
  showToast: (msg: string) => void;
}

export default function VoiceJournalScreen({ onBack, showToast }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [recordingTitle, setRecordingTitle] = useState('');
  const [selectedLang, setSelectedLang] = useState<'te-IN' | 'en-IN'>('te-IN');
  const [transcript, setTranscript] = useState('');
  const [romanizedTranscript, setRomanizedTranscript] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [savedRecordings, setSavedRecordings] = useState<StoredAudioRecording[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<StoredAudioRecording | null>(null);
  const [activePlaybackId, setActivePlaybackId] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<any>(null);

  // Load past recordings
  const loadRecordings = useCallback(async () => {
    try {
      const list = await dbGetAudioRecordings('local_user');
      setSavedRecordings(list);
    } catch (e) {
      console.warn('Could not load audio recordings:', e);
    }
  }, []);

  useEffect(() => {
    void loadRecordings();
  }, [loadRecordings]);

  // Clean up audio blob URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (timerRef.current) clearInterval(timerRef.current);
      if (recognitionRef.current) recognitionRef.current.stop();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, [audioUrl]);

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
  };

  // ─── Start Audio Recording & Speech Recognition ─────────────
  const startRecording = async () => {
    setPermissionError(null);
    hapticTap();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPermissionError('Microphone audio recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      // Initialize MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const fullBlob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(fullBlob);
        const url = URL.createObjectURL(fullBlob);
        setAudioUrl(url);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start(500);
      mediaRecorderRef.current = recorder;

      // Start duration counter
      setDuration(0);
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);

      // Start Speech Recognition
      const SR = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        const recognition = new SR();
        recognition.lang = selectedLang;
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
          let currentFinal = '';
          for (let i = 0; i < event.results.length; i++) {
            currentFinal += event.results[i][0].transcript + ' ';
          }
          const cleanTelugu = currentFinal.trim();
          setTranscript(cleanTelugu);
          if (selectedLang === 'te-IN') {
            setRomanizedTranscript(transliterate(cleanTelugu));
          } else {
            setRomanizedTranscript(cleanTelugu);
          }
        };

        recognition.onerror = (e: any) => {
          console.warn('Speech recognition error during audio recording:', e);
        };

        recognition.start();
        recognitionRef.current = recognition;
      }

      setIsRecording(true);
      setIsPaused(false);
      showToast('🎙️ Recording started… Speak clearly');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Microphone permission denied';
      setPermissionError(`Microphone access failed: ${msg}. Please allow microphone permissions in browser settings.`);
    }
  };

  const pauseRecording = () => {
    hapticTap();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
      if (recognitionRef.current) recognitionRef.current.stop();
      showToast('⏸️ Recording paused');
    }
  };

  const resumeRecording = () => {
    hapticTap();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch {}
      }
      showToast('▶️ Recording resumed');
    }
  };

  const stopRecording = () => {
    hapticTap();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    setIsRecording(false);
    setIsPaused(false);
    showToast('⏹️ Recording finished — review & save below');
  };

  // ─── Save Voice Entry ───────────────────────────────────────
  const handleSaveVoiceEntry = async () => {
    hapticTap();
    const titleToUse = recordingTitle.trim() || `Voice Entry (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
    const now = Date.now();

    try {
      // 1. Save audio recording in IndexedDB
      const recordingItem: StoredAudioRecording = {
        id: genId(),
        userId: 'local_user',
        title: titleToUse,
        date: fmtDate(now),
        timestamp: now,
        durationSeconds: duration,
        audioBlob: audioBlob || undefined,
        teluguTranscript: transcript,
        romanizedTranscript: romanizedTranscript || transcript,
        synced: false,
      };
      await dbSaveAudioRecording(recordingItem);

      // 2. Also save into VoiceDiary storage feed so it appears in entries
      if (transcript || romanizedTranscript) {
        saveEntry(transcript, romanizedTranscript || transcript);
      }

      showToast('✅ Voice recording & transcript saved!');
      // Reset state
      setAudioBlob(null);
      setAudioUrl(null);
      setTranscript('');
      setRomanizedTranscript('');
      setRecordingTitle('');
      setDuration(0);
      await loadRecordings();
    } catch (e) {
      showToast('Error saving recording: ' + (e instanceof Error ? e.message : 'Error'));
    }
  };

  const handleDeleteRecording = async () => {
    if (!deleteTarget) return;
    hapticTap();
    try {
      moveVoiceToTrash({
        id: deleteTarget.id,
        teluguText: deleteTarget.teluguTranscript,
        romanizedText: deleteTarget.romanizedTranscript,
        timestamp: deleteTarget.timestamp,
        date: deleteTarget.date,
        time: '',
      });
      await dbDeleteAudioRecording(deleteTarget.id);
      showToast('🗑️ Moved to Recycle Bin (30-day recovery)');
      setDeleteTarget(null);
      await loadRecordings();
    } catch {
      showToast('Could not delete recording');
    }
  };

  return (
    <div className="tab-content voice-journal-screen">
      {/* Top Header */}
      <div className="voice-journal-header">
        <button type="button" className="action-btn back-btn" onClick={onBack}>
          <BackIcon size={16} style={{ marginRight: 6 }} />
          <span>Back</span>
        </button>
        <div className="voice-journal-header-title">
          <h2>🎙️ Voice Journal</h2>
          <p>Record audio reflections with live Telugu & English speech-to-text</p>
        </div>
      </div>

      {permissionError && (
        <div className="auth-alert error" role="alert" style={{ marginBottom: 16 }}>
          <span>⚠️ {permissionError}</span>
        </div>
      )}

      {/* Main Recording Station */}
      <div className="voice-recording-card">
        <div className="recording-lang-selector">
          <label className="lang-selector-label">Language:</label>
          <button
            type="button"
            className={`lang-pill-btn ${selectedLang === 'te-IN' ? 'active' : ''}`}
            onClick={() => setSelectedLang('te-IN')}
            disabled={isRecording}
          >
            Telugu (తెలుగు)
          </button>
          <button
            type="button"
            className={`lang-pill-btn ${selectedLang === 'en-IN' ? 'active' : ''}`}
            onClick={() => setSelectedLang('en-IN')}
            disabled={isRecording}
          >
            English (English)
          </button>
        </div>

        {/* Central Visualizer & Duration */}
        <div className="recording-center-orb">
          <div className={`mic-pulsing-orb ${isRecording && !isPaused ? 'recording' : ''}`}>
            <span className="mic-icon-large">🎙️</span>
          </div>

          <div className="recording-timer-display" aria-live="polite">
            {formatDuration(duration)}
          </div>

          <div className="recording-status-label">
            {!isRecording && !audioUrl && 'Ready to record your thoughts'}
            {isRecording && !isPaused && '🔴 Listening and recording audio…'}
            {isRecording && isPaused && '⏸️ Paused'}
            {!isRecording && audioUrl && 'Audio ready for playback'}
          </div>
        </div>

        {/* Recording Controls */}
        <div className="recording-controls-row">
          {!isRecording ? (
            <button
              type="button"
              className="action-btn primary large-record-btn"
              onClick={startRecording}
            >
              🎙️ Start Recording
            </button>
          ) : (
            <div className="active-controls-group">
              {isPaused ? (
                <button type="button" className="action-btn" onClick={resumeRecording}>
                  ▶️ Resume
                </button>
              ) : (
                <button type="button" className="action-btn" onClick={pauseRecording}>
                  ⏸️ Pause
                </button>
              )}
              <button
                type="button"
                className="action-btn danger stop-btn"
                onClick={stopRecording}
              >
                ⏹️ Stop Recording
              </button>
            </div>
          )}
        </div>

        {/* Audio Playback Player */}
        {audioUrl && !isRecording && (
          <div className="audio-playback-box">
            <h4 className="audio-player-title">🎧 Audio Playback</h4>
            <audio controls src={audioUrl} className="native-audio-player" />
          </div>
        )}

        {/* Transcript & Save Section */}
        {(transcript || audioUrl) && !isRecording && (
          <div className="recording-save-section">
            <div className="date-picker-field">
              <label className="date-picker-label">Recording Title</label>
              <input
                type="text"
                className="date-picker-input text-input"
                placeholder="Title your voice reflection…"
                value={recordingTitle}
                onChange={e => setRecordingTitle(e.target.value)}
              />
            </div>

            <div className="date-picker-field">
              <label className="date-picker-label">
                {selectedLang === 'te-IN' ? 'Spoken Telugu Transcript' : 'Spoken Transcript'}
              </label>
              <textarea
                className="transcript-textarea"
                rows={3}
                value={transcript}
                onChange={e => {
                  setTranscript(e.target.value);
                  if (selectedLang === 'te-IN') {
                    setRomanizedTranscript(transliterate(e.target.value));
                  }
                }}
                placeholder="Transcript appears here automatically…"
              />
            </div>

            {selectedLang === 'te-IN' && (
              <div className="date-picker-field">
                <label className="date-picker-label">Romanized English Script</label>
                <textarea
                  className="transcript-textarea"
                  rows={3}
                  value={romanizedTranscript}
                  onChange={e => setRomanizedTranscript(e.target.value)}
                  placeholder="Romanized transliteration…"
                />
              </div>
            )}

            <button
              type="button"
              className="action-btn primary save-voice-btn"
              onClick={handleSaveVoiceEntry}
            >
              💾 Save to Diary & Audio Vault
            </button>
          </div>
        )}
      </div>

      {/* List of Previous Recordings */}
      <div className="saved-recordings-section">
        <h3 className="section-title">🎙️ Saved Voice Reflections ({savedRecordings.length})</h3>

        {savedRecordings.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px 0' }}>
            <div className="empty-emoji">📻</div>
            <div className="empty-title">No recordings saved yet</div>
            <div className="empty-desc">Your recorded audio journals will appear here.</div>
          </div>
        ) : (
          <div className="diary-grid">
            {savedRecordings.map(rec => (
              <div key={rec.id} className="diary-entry-card voice-rec-card">
                <div className="entry-header">
                  <span className="entry-date">📅 {rec.date}</span>
                  <span className="duration-pill">⏱️ {formatDuration(rec.durationSeconds)}</span>
                </div>

                <h4 className="entry-title">{rec.title}</h4>

                {rec.romanizedTranscript && (
                  <p className="entry-preview">
                    {rec.romanizedTranscript}
                  </p>
                )}

                {rec.audioBlob && (
                  <div className="card-audio-player">
                    <audio
                      controls
                      src={URL.createObjectURL(rec.audioBlob)}
                      style={{ width: '100%', height: 36, marginTop: 8 }}
                    />
                  </div>
                )}

                <div className="entry-footer">
                  <button
                    type="button"
                    className="action-btn-sm"
                    onClick={async () => {
                      const text = rec.romanizedTranscript || rec.teluguTranscript;
                      if (text) {
                        await navigator.clipboard.writeText(text);
                        showToast('📋 Transcript copied!');
                      }
                    }}
                  >
                    📋 Copy Text
                  </button>
                  <button
                    type="button"
                    className="action-btn-sm danger"
                    onClick={() => setDeleteTarget(rec)}
                  >
                    <TrashIcon size={14} style={{ marginRight: 6 }} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Move to Recycle Bin?"
          message={`Are you sure you want to delete "${deleteTarget.title}"? It will be kept in the Recycle Bin and can be recovered within 30 days.`}
          confirmLabel="Move to Bin"
          onConfirm={handleDeleteRecording}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
