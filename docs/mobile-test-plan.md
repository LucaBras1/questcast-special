# Questcast -- Mobile E2E Test Plan

## Framework: Detox (Android)

---

## 1. E2E Test Scenarios

### Scenario 1: Auth Flow
**File:** `mobile/e2e/auth.e2e.ts`

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Launch app | Splash screen -> Welcome screen |
| 2 | Tap "Register" | Navigate to register screen |
| 3 | Fill email, password, display name | Inputs accept text |
| 4 | Tap "Create Account" | Loading indicator shown |
| 5 | Wait for response | Navigate to home screen |
| 6 | Verify home screen | "New Adventure" button visible, empty session list |
| 7 | Log out | Navigate back to welcome screen |
| 8 | Tap "Login" | Navigate to login screen |
| 9 | Fill email, password | Inputs accept text |
| 10 | Tap "Login" | Navigate to home screen with user greeting |

**Error paths:**
- Register with existing email -> error message shown
- Login with wrong password -> error message shown
- Register with invalid email -> validation error inline

### Scenario 2: New Game
**File:** `mobile/e2e/new-game.e2e.ts`

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | From home, tap "New Adventure" | Navigate to character creation |
| 2 | Enter character name "Thorin" | Input accepts text |
| 3 | Select class "Warrior" | Class icon highlighted |
| 4 | Tap "Begin Adventure" | Loading indicator, then game screen |
| 5 | Wait for AI narration | Text transcript shows opening narration |
| 6 | Verify game UI elements | Mic button, transcript area, character panel visible |

**Error paths:**
- Submit empty character name -> validation error
- Network failure during creation -> error message + retry button

### Scenario 3: Voice Loop
**File:** `mobile/e2e/voice-loop.e2e.ts`

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | In active game session | Game screen with transcript |
| 2 | Tap mic button | Recording indicator shown (red dot / waveform) |
| 3 | Speak "I open the door" | Waveform responds to voice |
| 4 | Tap mic button again (stop) | Recording stops, "Processing..." shown |
| 5 | Wait for transcription | Player text appears in transcript |
| 6 | Wait for AI response | "Dungeon Master is thinking..." animation |
| 7 | AI text appears | Narration text streams into transcript |
| 8 | Audio plays | TTS audio plays through speaker |

**Note:** Voice input in Detox requires mock audio injection. Use a pre-recorded .wav file injected via `device.setURLBlacklist` + mock audio route.

**Error paths:**
- Mic permission denied -> permission dialog + explanation
- Audio recording fails -> text input fallback shown
- AI response timeout -> timeout message + retry button

### Scenario 4: Save/Load
**File:** `mobile/e2e/save-load.e2e.ts`

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Play 2+ turns in a session | Transcript has multiple exchanges |
| 2 | Tap "Save & Quit" | Confirmation dialog |
| 3 | Confirm save | Loading indicator, then navigate to home |
| 4 | Verify session in list | Session card shows character name, class, last played |
| 5 | Tap session card | Loading indicator, then game screen |
| 6 | Verify game state | Character info matches, transcript shows recap |
| 7 | Continue playing | Voice loop works normally |

**Error paths:**
- Save fails (network) -> error message, stay in game
- Load session that was deleted server-side -> error message, refresh list

### Scenario 5: Error Handling & Recovery
**File:** `mobile/e2e/error-recovery.e2e.ts`

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start a game session | Game screen active |
| 2 | Simulate network drop | `device.setURLBlacklist(['.*'])` |
| 3 | Attempt a turn | Error message: "Connection lost" |
| 4 | Verify fallback UI | Text fallback visible, retry button shown |
| 5 | Restore network | `device.setURLBlacklist([])` |
| 6 | Tap retry | Turn processes normally |
| 7 | Verify game continues | Transcript updates, audio plays |

---

## 2. Device Compatibility Test Checklist

Run manually on each device. Check every box.

### Per-Device Checklist Template

**Device:** _______________
**OS Version:** _______________
**Tester:** _______________
**Date:** _______________

#### Installation & Launch
- [ ] APK installs successfully
- [ ] App launches without crash
- [ ] Splash screen displays correctly
- [ ] App startup < 3 seconds (cold start)

#### UI & Layout
- [ ] All screens render without overflow
- [ ] Text is readable (no truncation on key elements)
- [ ] Touch targets >= 48dp (all buttons, links)
- [ ] Orientation: portrait mode works (landscape not required for MVP)
- [ ] Status bar does not overlap content
- [ ] Notch/punch-hole camera does not obscure UI

#### Audio Recording
- [ ] Microphone permission dialog appears on first use
- [ ] Push-to-talk: tap starts recording
- [ ] Push-to-talk: tap again stops recording
- [ ] Recording captures clear audio (play back locally)
- [ ] Recording works in quiet environment
- [ ] Recording works with moderate background noise
- [ ] Short recordings (< 1 second) are captured
- [ ] Long recordings (> 30 seconds) work without cutoff

#### Audio Playback
- [ ] TTS audio plays through speaker
- [ ] Audio volume matches system volume
- [ ] Audio plays through headphones (wired)
- [ ] Audio plays through Bluetooth headphones
- [ ] Multiple audio segments play sequentially without gaps
- [ ] Audio playback does not overlap with recording

#### Audio Interruptions
- [ ] Incoming phone call pauses audio, resumes after
- [ ] Notification sound does not break audio
- [ ] Switching to another app and back resumes correctly
- [ ] Volume buttons work during playback
- [ ] Silent/vibrate mode: audio still plays (game audio expected)

#### Voice Loop End-to-End
- [ ] Complete voice loop: speak -> transcription -> AI response -> audio
- [ ] Latency is acceptable (subjective: feels responsive)
- [ ] Text transcript updates correctly
- [ ] No audio artifacts or glitches

#### App Lifecycle
- [ ] Backgrounding app does not crash
- [ ] Returning from background: game state preserved
- [ ] Force-killing app: game state recoverable on relaunch
- [ ] Low memory warning does not crash app
- [ ] Screen rotation (if triggered accidentally) does not crash

#### Game Features
- [ ] Character creation works
- [ ] Game session starts correctly
- [ ] Save & Quit works
- [ ] Continue session works (load from list)
- [ ] Dice roll animation displays (if implemented)
- [ ] Haptic feedback works on dice roll

---

## 3. Audio Test Checklist

### Recording Quality

| Test | Method | Pass Criteria |
|------|--------|---------------|
| Clear speech recognition | Speak clearly at 30cm | Whisper transcription > 90% accurate |
| Whisper speech recognition | Speak softly at 30cm | Whisper transcription > 70% accurate |
| Background noise handling | TV/music in background | Whisper transcription > 70% accurate |
| Short utterance | Say "Yes" | Correctly transcribed |
| Long utterance | Speak for 30 seconds | Full speech captured, no cutoff |
| Czech speech | Speak Czech sentence | Correct Czech transcription |
| English speech | Speak English sentence | Correct English transcription |
| Accented speech | Non-native Czech speaker | Transcription reasonably accurate |

### Playback Quality

| Test | Method | Pass Criteria |
|------|--------|---------------|
| Audio clarity | Listen to TTS response | Clear, no distortion |
| Volume consistency | Compare multiple responses | Similar volume levels |
| Czech TTS | Generate Czech response | Pronunciation acceptable |
| English TTS | Generate English response | Pronunciation natural |
| Sequential playback | Multi-sentence response | No gaps, smooth transition |
| Audio with game SFX | Dice roll + narration | No overlap, proper sequencing |

### Interruption Handling

| Test | Method | Pass Criteria |
|------|--------|---------------|
| Phone call during playback | Receive call during TTS | Audio pauses, resumes or re-queues after |
| Phone call during recording | Receive call while speaking | Recording cancelled gracefully, user can redo |
| Bluetooth disconnect | Remove BT headphones during play | Audio routes to speaker |
| Headphone plug-in | Insert headphones during play | Audio routes to headphones |
| App background during record | Press home while recording | Recording cancelled, no crash |
| App background during play | Press home during TTS | Audio pauses or stops |
| Notification sound | Receive notification during TTS | Brief interruption, TTS resumes |

---

## 4. Test Data Requirements

### Pre-recorded Audio Files (for automated E2E tests)
- `test-audio-open-door-en.wav` -- "I open the door" (English)
- `test-audio-open-door-cs.wav` -- "Otviram dvere" (Czech)
- `test-audio-attack-en.wav` -- "I attack the goblin" (English)
- `test-audio-short-yes-en.wav` -- "Yes" (English)
- `test-audio-long-30s-en.wav` -- 30-second narration (English)
- `test-audio-silence.wav` -- 3 seconds of silence
- `test-audio-noise.wav` -- Background noise without speech

### Test Accounts
- `test-user-1@questcast.app` / `TestPassword123!` -- primary test account
- `test-user-2@questcast.app` / `TestPassword456!` -- secondary (for auth collision tests)
- `test-user-admin@questcast.app` -- admin account (if admin panel built)
