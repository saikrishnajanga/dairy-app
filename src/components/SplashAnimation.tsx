import { useState, useEffect } from 'react';

interface Props {
  onFinish: () => void;
  durationMs?: number;
}

export default function SplashAnimation({ onFinish, durationMs = 3000 }: Props) {
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    // Check if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const actualDuration = prefersReducedMotion ? 1200 : durationMs;

    // Start fade out 500ms before completion
    const fadeTimer = setTimeout(() => {
      setFadingOut(true);
    }, Math.max(actualDuration - 500, 300));

    const finishTimer = setTimeout(() => {
      onFinish();
    }, actualDuration);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
    };
  }, [durationMs, onFinish]);

  return (
    <div
      className={`splash-overlay ${fadingOut ? 'splash-fade-out' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Loading Voice Diary"
    >
      <div className="splash-ambient-glow" />

      <div className="splash-content">
        <div className="splash-logo-container">
          <div className="splash-logo-ring" />
          <div className="splash-logo-ring outer" />
          <img src="/logo.png" alt="Voice Diary Logo" className="splash-logo" />
        </div>

        <div className="splash-text-group">
          <h1 className="splash-title">
            VOICE <span className="splash-title-accent">DIARY</span>
          </h1>
          <p className="splash-tagline">Speak. Reflect. Preserve.</p>
        </div>

        <div className="splash-wave-visualizer" aria-hidden="true">
          <span className="splash-bar" />
          <span className="splash-bar" />
          <span className="splash-bar" />
          <span className="splash-bar" />
          <span className="splash-bar" />
          <span className="splash-bar" />
          <span className="splash-bar" />
        </div>
      </div>
    </div>
  );
}
