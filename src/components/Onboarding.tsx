import { useState } from 'react'

const FLAG = 'vd_onboarded'

const slides = [
  { emoji: '🎙️', title: 'Voice Recording', desc: 'Speak in Telugu and get instant romanized text. Your voice entries are saved automatically.' },
  { emoji: '✍️', title: 'Text Diary', desc: 'Write rich-text diary entries with formatting, export to PDF/Word, and lock private entries with a PIN.' },
  { emoji: '🌐', title: 'Translator', desc: 'Translate between Telugu, Hindi, English & more — even with voice input!' },
  { emoji: '🔒', title: 'Private & Secure', desc: 'All data stays on your device. Entries are encrypted. PINs are SHA-256 hashed. No cloud, no tracking.' },
]

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [idx, setIdx] = useState(0)

  const finish = () => {
    localStorage.setItem(FLAG, 'true')
    onDone()
  }

  const slide = slides[idx]
  const isLast = idx === slides.length - 1

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <div className="onboarding-emoji">{slide.emoji}</div>
        <h2 className="onboarding-title">{slide.title}</h2>
        <p className="onboarding-desc">{slide.desc}</p>

        <div className="onboarding-dots">
          {slides.map((_, i) => (
            <span key={i} className={`onboarding-dot ${i === idx ? 'active' : ''}`} />
          ))}
        </div>

        <div className="onboarding-actions">
          {idx > 0 && (
            <button className="onboarding-btn secondary" onClick={() => setIdx(i => i - 1)}>
              ← Back
            </button>
          )}
          {isLast ? (
            <button className="onboarding-btn primary" onClick={finish}>
              🚀 Get Started
            </button>
          ) : (
            <button className="onboarding-btn primary" onClick={() => setIdx(i => i + 1)}>
              Next →
            </button>
          )}
        </div>

        <button className="onboarding-skip" onClick={finish}>Skip</button>
      </div>
    </div>
  )
}

export function needsOnboarding(): boolean {
  return localStorage.getItem(FLAG) !== 'true'
}
