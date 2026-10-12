# 🌌 VoiceDiary Pro — Master Architecture Specification & AI Master Prompt

> **Project Name:** VoiceDiary Pro (Telugu Voice & Text Diary)  
> **Platform:** React 18, TypeScript, Vite, Capacitor.js (Android & iOS) + Web PWA  
> **Theme System:** Aurora Night Glassmorphism (`#070b1a` Deep Space + Teal/Violet/Magenta Accents)  
> **Repository Root:** `e:\voice dairy app`

---

## TABLE OF CONTENTS
1. [AI Master Prompt (Copy & Paste for any AI Model)](#1-ai-master-prompt)
2. [Project Overview & Core Mission](#2-project-overview--core-mission)
3. [Technology Stack & Dependencies](#3-technology-stack--dependencies)
4. [UI & Visual Design System (Aurora Night Glassmorphism)](#4-ui--visual-design-system)
5. [Complete Component Architecture (All 13 Components)](#5-complete-component-architecture)
6. [Services & Business Logic (All 13 Services)](#6-services--business-logic)
7. [Custom Hooks & State Management](#7-custom-hooks--state-management)
8. [Database, Storage & Sync (Local + Supabase Cloud)](#8-database-storage--sync)
9. [Security, Privacy & App Lock Architecture](#9-security-privacy--app-lock)
10. [Document Export (Word DOCX & PDF/Text)](#10-document-export)
11. [Android Native & Capacitor Integration](#11-android-native--capacitor-integration)

---

## 1. AI MASTER PROMPT

> **Copy and paste the block below into any AI model (Claude, GPT-4, Gemini) whenever you want to add new features, refactor code, or rebuild this app from scratch:**

```markdown
You are an expert full-stack engineer and UI/UX designer. You are working on "VoiceDiary Pro", a modern cross-platform voice and text diary application designed specifically for Telugu speakers.

### CORE PURPOSE & WORKFLOW:
1. Spoken Telugu Speech-to-Text: The user speaks naturally in Telugu (te-IN).
2. Real-time Phonetic Transliteration: Spoken Telugu is converted into Romanized English script (e.g., "Nenu eeroju chaala happy ga unnanu") as well as native Telugu script.
3. Multi-Format Diary Management: Users can save voice recordings, transcribed text entries, and rich-formatted text diary notes with mood tags, weather, and photos.
4. Two-Way Translator: Instant Telugu ⇄ English bidirectional translation.
5. Multi-Profile & Cloud Sync: Multiple user profiles on one device, secured with PIN/Biometrics, and optional Supabase cloud synchronization.
6. Professional Export: Export diary entries to Microsoft Word (.docx), PDF, or plain text.

### DESIGN SYSTEM (AURORA NIGHT GLASSMORPHISM):
- Background: Deep cosmic space indigo (`#070b1a` to `#0d132d`).
- Aurora Gradient Accents:
  - Emerald Teal: `#06d6a0`
  - Cosmic Violet: `#8b5cf6`
  - Vivid Magenta: `#ec4899`
  - Sky Cyan: `#38bdf8`
- Surface Styling: Glassmorphism with `backdrop-filter: blur(16px)`, translucent dark backgrounds (`rgba(16, 24, 52, 0.65)`), and glowing borders (`1px solid rgba(255, 255, 255, 0.08)`).
- Record Button: Glowing floating orb with animated expanding multi-ring pulse radar during recording (`@keyframes pulse-ring`).
- Navigation: Floating frosted glass dock (`margin: 0 16px 16px; border-radius: 28px; backdrop-filter: blur(20px)`), with pill-shaped glowing active indicator.
- CSS Architecture: Pure Vanilla CSS in `src/index.css` using CSS custom properties (`:root`). Do NOT use Tailwind CSS. Maintain full dark/light mode parity (`data-theme="dark"` and `data-theme="light"`).

### TECHNICAL ARCHITECTURE:
- Frontend: React 18, TypeScript, Vite.
- Mobile Layer: Capacitor.js (`@capacitor/core`, `@capacitor/android`) with native safe-area inset handling (`env(safe-area-inset-bottom)`).
- Audio & Speech: Web Speech API (`webkitSpeechRecognition` with continuous listening fallback) + HTML5 MediaRecorder.
- Backend & Cloud: Supabase (Auth, Postgres DB, Row-Level Security) with offline-first localStorage/IndexedDB caching.
- Security: Salted SHA-256 PIN hashing, profile-isolated diary stores, and automatic timeout lock.
```

---

## 2. PROJECT OVERVIEW & CORE MISSION

**VoiceDiary Pro** solves a key communication gap: millions of Telugu speakers prefer speaking in Telugu but communicate digitally using Romanized English letters (e.g. typing *"Ela unnaru?"* instead of *"ఎలా ఉన్నారు?"*). 

The app provides:
1. **Zero-effort Voice Journaling**: Speak Telugu $\rightarrow$ instant Romanized text.
2. **Emotional Context**: Mood tagging (Happy, Calm, Thoughtful, Sad, Grateful, Excited).
3. **Ironclad Privacy**: Device-level PIN security, profile switching (e.g., Personal vs Work diary), and offline-first storage.
4. **Export Readiness**: Beautiful formatted Word documents (`.docx`) with headers, dates, and transliterated passages.

---

## 3. TECHNOLOGY STACK & DEPENDENCIES

| Layer | Technology | Details |
|---|---|---|
| **Language** | TypeScript 5.x | Strict typing throughout components and services |
| **Framework** | React 18.3 | Function components with hooks (`useState`, `useEffect`, `useRef`, `useCallback`) |
| **Build Tool** | Vite 6.x | Fast HMR dev server and optimized roll-up production bundle |
| **Mobile Runtime**| Capacitor 6.x | Android WebView bridge with hardware permissions |
| **Styling** | Vanilla CSS3 | 2,700+ lines in `src/index.css` with 40+ CSS custom variables |
| **Cloud Backend**| Supabase JS 2.x | Realtime database, authentication, cloud sync |
| **Doc Generator**| Docx JS | Generates formatted `.docx` binary files natively in the browser |
| **Icons** | Lucide React | Modern SVG icons matching the glassmorphic aesthetics |

---

## 4. UI & VISUAL DESIGN SYSTEM (AURORA NIGHT GLASSMORPHISM)

The application uses an atmospheric, high-contrast dark theme inspired by the Northern Lights.

### Color Tokens (`:root` variables)
```css
:root {
  --bg: #070b1a;                    /* Deep Cosmic Void */
  --bg-gradient: linear-gradient(135deg, #070b1a 0%, #0d132d 50%, #080d21 100%);
  --surface: rgba(16, 24, 52, 0.65); /* Frosted Glass Surface */
  --surface-hover: rgba(26, 38, 78, 0.75);
  --glass-border: rgba(255, 255, 255, 0.08);
  --glass-border-focus: rgba(139, 92, 246, 0.5);

  /* Aurora Accent Palette */
  --aurora-1: #06d6a0;               /* Emerald Teal */
  --aurora-2: #8b5cf6;               /* Cosmic Violet */
  --aurora-3: #ec4899;               /* Radiant Magenta */
  --aurora-4: #38bdf8;               /* Sky Cyan */
  --primary: #8b5cf6;
  --primary-gradient: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%);
  --accent-gradient: linear-gradient(135deg, #06d6a0 0%, #38bdf8 100%);

  /* Typography Colors */
  --text: #f8fafc;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --danger: #f43f5e;
  --success: #10b981;
  --warning: #f59e0b;
}
```

### Signature Components
- **Floating Recording Orb**: Centered on the screen with dynamic pulse animation rings that scale from `1.0` to `2.4` opacity-fading outward.
- **Floating Frosted Navigation Bar**: Positioned `16px` above the bottom edge with rounded pill geometry (`border-radius: 28px`) and active indicator background glow.
- **Glassmorphic Cards**: Each card has a `1px` translucent border, subtle top gradient hairline, and `transform: translateY(-2px)` on hover.

---

## 5. COMPLETE COMPONENT ARCHITECTURE (ALL 13 COMPONENTS)

### 1. `App.tsx` (Application Controller)
- **Role**: Master container, tab router, authentication guard, and profile state manager.
- **Key State**:
  - `activeTab`: `'record' | 'entries' | 'textdiary' | 'translate' | 'profiles'`
  - `isLocked`: Boolean indicating if PIN security overlay is active.
  - `currentProfile`: Current active profile object.
  - `theme`: `'dark' | 'light'` (synced with HTML `data-theme` attribute).

### 2. `VoiceRecorder.tsx` (Voice Hub)
- **Role**: Primary recording screen.
- **Features**: Live speech recognition, audio waveform visualizer, instant Romanized Telugu transliteration stream, mood picker, and one-tap save.

### 3. `TextDiaryScreen.tsx` (Rich Text Journal)
- **Role**: Traditional diary writing with rich features.
- **Features**: Multi-line writing canvas, date navigation, mood selector (😊, 😌, 🤔, 😢, 🙏, 🚀), weather tag, photo attachment, and auto-save.

### 4. `DiaryList.tsx` (Timeline & History)
- **Role**: Feed of all past voice and text entries.
- **Features**: Search bar, category filters, timeline layout, audio playback buttons, delete confirmation, and export launcher.

### 5. `DiaryEntry.tsx` (Single Card View)
- **Role**: Modular card representation of a single diary entry with expanded reading mode and audio playback.

### 6. `TranslatorScreen.tsx` (Language Hub)
- **Role**: Bidirectional Telugu $\leftrightarrow$ English translator with instant swap, clipboard copy, and voice input.

### 7. `TeluguUniversalConverter.tsx` (Rule Engine UI)
- **Role**: Dedicated transliteration workshop allowing fine-grained conversion between raw Telugu script and phonetic Roman English.

### 8. `AppLock.tsx` (Security Gateway)
- **Role**: 4-digit PIN pad overlay with biometric support, error shake feedback, and secure hashing.

### 9. `ProfileGate.tsx` (Onboarding Profile Creator)
- **Role**: Blocks access until a profile is created on fresh installations.

### 10. `ProfileSwitcher.tsx` (Multi-User Manager)
- **Role**: Modal/screen to switch profiles, create new personas (e.g. Work, Secret, Personal), and manage profile PINs.

### 11. `Onboarding.tsx` (First-Run Walkthrough)
- **Role**: Swipable feature cards introducing Telugu speech-to-text, privacy locks, and export tools.

### 12. `PrivacyScreen.tsx` (Privacy Policy & Legal)
- **Role**: Discloses data handling (100% local-first data retention, zero third-party tracking).

### 13. `ConfirmDialog.tsx` & `ErrorBoundary.tsx`
- **Role**: Safety dialogs for irreversible actions (e.g., deleting entries) and React error catching to prevent app crashes.

---

## 6. SERVICES & BUSINESS LOGIC (ALL 13 SERVICES)

| File | Purpose | Key Functions |
|---|---|---|
| `transliterator.ts` | Complete phonetic Telugu-to-English engine | `transliterateTeluguToRoman(text)`, `processVowels()`, `processConsonants()` |
| `translator.ts` | Translation API service | `translateTeluguToEnglish(text)`, `translateEnglishToTelugu(text)` |
| `textDiary.ts` | Text journal CRUD & indexing | `getTextEntries()`, `saveTextEntry()`, `deleteTextEntry()` |
| `storage.ts` | Core local persistence engine | `getStoredEntries()`, `persistEntry()`, `clearLocalData()` |
| `profiles.ts` | Multi-profile management | `getProfiles()`, `createProfile()`, `switchProfile()`, `deleteProfile()` |
| `security.ts` | PIN cryptographic hashing & verification | `hashPin(pin)`, `verifyPin(pin, hash)`, `setAppPin()` |
| `cloudSync.ts` | Supabase cloud synchronization | `syncEntriesToCloud()`, `pullCloudEntries()`, `resolveSyncConflicts()` |
| `supabase.ts` | Supabase client initialization | `supabaseClient`, session management |
| `auth.ts` | Google & Email authentication | `signInWithGoogle()`, `signOut()`, `getCurrentUser()` |
| `docx.ts` | Native Word document compiler | `generateDocx(entries)`, creates styled tables, headers, and paragraphs |
| `docExport.ts` | Multi-format export wrapper | `exportToPDF()`, `exportToTxt()`, `shareFile()` |
| `transcript.ts` | Transcript post-processing | Cleans punctuation, removes duplicate fillers, formats speech output |
| `utils.ts` | Formatting helpers | `formatDate()`, `formatDuration()`, `truncateText()` |

---

## 7. CUSTOM HOOKS & STATE MANAGEMENT

### `useSpeechToText.ts`
- Encapsulates `webkitSpeechRecognition` / native Capacitor speech recognition.
- Manages states: `isListening`, `transcript`, `interimTranscript`, `error`.
- Automatic restart logic on unexpected pauses.
- Language hardcoded to `'te-IN'` (Telugu India) with fallback capability.

### `useToast.ts`
- Provides non-intrusive floating toast notifications (`success`, `error`, `info`) with auto-dismissal.

---

## 8. DATABASE, STORAGE & SYNC

1. **Local Storage First**: All entries are stored locally under profile-scoped keys:
   - `voicediary_entries_<profileId>`
   - `textdiary_entries_<profileId>`
   - `voicediary_profiles`
2. **Cloud Sync (Supabase)**:
   - Table: `diary_entries` (Columns: `id`, `user_id`, `profile_id`, `title`, `content_telugu`, `content_romanized`, `audio_url`, `mood`, `created_at`).
   - Uses Row-Level Security (RLS) ensuring users only access their own synchronized rows.

---

## 9. SECURITY, PRIVACY & APP LOCK

- **Salted SHA-256**: PIN codes are never stored in plain text.
- **Auto-Lock Timer**: Configurable idle timeout (e.g. 1 min, 5 min) triggers `isLocked = true` when app is backgrounded.
- **Biometric Integration**: Capacitor Biometrics API invoked when available on Android/iOS.

---

## 10. DOCUMENT EXPORT (WORD DOCX & PDF)

Using `docx.ts`, the app generates `.docx` files on-device without needing a backend server:
- Custom cover block with app logo and user name.
- Daily timeline entries organized by date headers.
- Side-by-side or stacked Telugu + Romanized English text.
- Metadata footer with mood badges and word counts.

---

## 11. ANDROID NATIVE & CAPACITOR INTEGRATION

- **Configuration**: Defined in `capacitor.config.ts` (`appId: "com.voicediary.app"`).
- **Permissions**:
  - `RECORD_AUDIO` for voice diary recording.
  - `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` for saving exported DOCX/PDF files.
- **Safe Area**: Viewport meta tag `viewport-fit=cover` and CSS `env(safe-area-inset-top)` prevent notch overlap.
