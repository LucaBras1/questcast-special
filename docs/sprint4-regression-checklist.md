# Sprint 4 Regression Test Checklist

## Version 1.0 | Sprint 4 -- Feature Complete

This checklist covers ALL features for the Questcast MVP.
Every item must be verified before the Sprint 4 gate is considered passed.

---

## 1. Authentication

| # | Test | Status | Tester | Date | Notes |
|---|------|--------|--------|------|-------|
| 1.1 | Register with valid email + password (>= 8 chars) | [ ] | | | |
| 1.2 | Register rejects duplicate email | [ ] | | | |
| 1.3 | Register rejects invalid email format | [ ] | | | |
| 1.4 | Register rejects short password (< 8 chars) | [ ] | | | |
| 1.5 | Login with correct credentials returns JWT | [ ] | | | |
| 1.6 | Login with wrong password returns 401 | [ ] | | | |
| 1.7 | Login with non-existent email returns 401 | [ ] | | | |
| 1.8 | Token refresh with valid refresh token | [ ] | | | |
| 1.9 | Token refresh with expired token returns 401 | [ ] | | | |
| 1.10 | Logout invalidates session | [ ] | | | |
| 1.11 | All protected endpoints reject requests without token | [ ] | | | |
| 1.12 | All protected endpoints reject expired tokens | [ ] | | | |

---

## 2. Character Creation

| # | Test | Status | Tester | Date | Notes |
|---|------|--------|--------|------|-------|
| 2.1 | Create Warrior: correct starting HP, abilities, inventory | [ ] | | | HP=100, Shield Block + Sword Strike |
| 2.2 | Create Mage: correct starting HP, abilities, inventory | [ ] | | | HP=80, Fireball + Ice Shield |
| 2.3 | Create Rogue: correct starting HP, abilities, inventory | [ ] | | | HP=90, Backstab + Stealth |
| 2.4 | Create Ranger: correct starting HP, abilities, inventory | [ ] | | | HP=95, Arrow Shot + Track |
| 2.5 | Character name validation: min 1, max 50 chars | [ ] | | | |
| 2.6 | Reject invalid character class | [ ] | | | |
| 2.7 | Character stats persist after session creation | [ ] | | | |

---

## 3. Game Session Lifecycle

| # | Test | Status | Tester | Date | Notes |
|---|------|--------|--------|------|-------|
| 3.1 | Create new session: returns session ID + initial state | [ ] | | | |
| 3.2 | Load session: returns full game state | [ ] | | | |
| 3.3 | Save session: state persisted to PostgreSQL | [ ] | | | |
| 3.4 | Auto-save: triggers every 5 turns | [ ] | | | |
| 3.5 | Pause session: full state snapshot saved | [ ] | | | |
| 3.6 | Resume session: state restored + AI recap generated | [ ] | | | |
| 3.7 | Complete session: final save, status = completed | [ ] | | | |
| 3.8 | Cannot submit turns on paused session | [ ] | | | |
| 3.9 | Cannot submit turns on completed session | [ ] | | | |
| 3.10 | Session list: returns user's sessions with pagination | [ ] | | | |
| 3.11 | Session isolation: user cannot access another user's session | [ ] | | | |

---

## 4. Voice Loop (STT -> LLM -> TTS)

| # | Test | Status | Tester | Date | Notes |
|---|------|--------|--------|------|-------|
| 4.1 | Voice input: audio recorded and sent to backend | [ ] | | | Push-to-talk |
| 4.2 | STT: audio transcribed to text (Whisper) | [ ] | | | |
| 4.3 | Transcription displayed to player | [ ] | | | |
| 4.4 | LLM: generates narration response | [ ] | | | |
| 4.5 | LLM streaming: sentences streamed via SSE | [ ] | | | |
| 4.6 | TTS: narration converted to audio | [ ] | | | |
| 4.7 | Audio playback: TTS segments play sequentially | [ ] | | | |
| 4.8 | Full loop latency: mic release -> first audio < 3s (p50) | [ ] | | | |
| 4.9 | Czech voice input: recognized correctly | [ ] | | | |
| 4.10 | English voice input: recognized correctly | [ ] | | | |

---

## 5. Text Fallback

| # | Test | Status | Tester | Date | Notes |
|---|------|--------|--------|------|-------|
| 5.1 | Text input: typed action sent to backend | [ ] | | | |
| 5.2 | AI response displayed as text in transcript | [ ] | | | |
| 5.3 | Text fallback when STT fails | [ ] | | | |
| 5.4 | Text fallback when TTS fails | [ ] | | | |
| 5.5 | Transcript scrollable and readable | [ ] | | | |

---

## 6. Dice Rolling

| # | Test | Status | Tester | Date | Notes |
|---|------|--------|--------|------|-------|
| 6.1 | d4 roll: result 1-4 | [ ] | | | |
| 6.2 | d6 roll: result 1-6 | [ ] | | | |
| 6.3 | d8 roll: result 1-8 | [ ] | | | |
| 6.4 | d10 roll: result 1-10 | [ ] | | | |
| 6.5 | d12 roll: result 1-12 | [ ] | | | |
| 6.6 | d20 roll: result 1-20 | [ ] | | | |
| 6.7 | Dice animation plays | [ ] | | | |
| 6.8 | Haptic feedback on roll | [ ] | | | |
| 6.9 | AI narrates dice result (critical success, success, failure, critical failure) | [ ] | | | |
| 6.10 | Dice result affects game state (HP, gold, inventory) | [ ] | | | |

---

## 7. Combat System

| # | Test | Status | Tester | Date | Notes |
|---|------|--------|--------|------|-------|
| 7.1 | Combat initiation: enemy generated, threat level critical | [ ] | | | |
| 7.2 | Attack action: damage on success, miss on fail | [ ] | | | |
| 7.3 | Attack critical (nat 20): double damage | [ ] | | | |
| 7.4 | Defend action: reduces incoming damage | [ ] | | | |
| 7.5 | Spell action: 1.5x damage on success, fizzle on fail | [ ] | | | |
| 7.6 | Flee action: end combat on success, free hit on fail | [ ] | | | |
| 7.7 | Victory: XP + gold rewards, threat level restored | [ ] | | | |
| 7.8 | Defeat: death save triggered | [ ] | | | |
| 7.9 | Death save roll 10+: stabilize at 1 HP | [ ] | | | |
| 7.10 | Death save roll 9-: mysterious revival at 1 HP | [ ] | | | |
| 7.11 | Player NEVER permanently dies | [ ] | | | |
| 7.12 | Combat state cleared after resolution | [ ] | | | |
| 7.13 | Enemy scaling with player level (15% per level) | [ ] | | | |
| 7.14 | All 5 enemy types: goblin, skeleton, bandit, wolf, troll | [ ] | | | |

---

## 8. Image Generation

| # | Test | Status | Tester | Date | Notes |
|---|------|--------|--------|------|-------|
| 8.1 | Auto-trigger: image generated when AI flags shouldGenerateImage | [ ] | | | |
| 8.2 | Image displayed above transcript | [ ] | | | |
| 8.3 | Cache hit: same description returns cached image | [ ] | | | |
| 8.4 | Max limit: 2 images per session enforced | [ ] | | | |
| 8.5 | 3rd image request returns 429 | [ ] | | | |
| 8.6 | Image generation failure: game continues without image | [ ] | | | |
| 8.7 | Art style consistent across session | [ ] | | | |
| 8.8 | Generated images appropriate (no NSFW content) | [ ] | | | |

---

## 9. Session Timer

| # | Test | Status | Tester | Date | Notes |
|---|------|--------|--------|------|-------|
| 9.1 | Timer displayed subtly on game screen | [ ] | | | |
| 9.2 | Timer increments correctly | [ ] | | | |
| 9.3 | 30 min: no visible warning (but tracked) | [ ] | | | |
| 9.4 | 45 min: soft limit -- AI begins wrapping up story | [ ] | | | |
| 9.5 | 60 min: hard limit -- session auto-paused | [ ] | | | |
| 9.6 | No turns accepted after hard limit | [ ] | | | |

---

## 10. Tutorial / Onboarding

| # | Test | Status | Tester | Date | Notes |
|---|------|--------|--------|------|-------|
| 10.1 | Tutorial starts for new users | [ ] | | | |
| 10.2 | Beat 1: Introduction to voice/text input | [ ] | | | |
| 10.3 | Beat 2: Introduction to map/exploration | [ ] | | | |
| 10.4 | Beat 3: Introduction to combat | [ ] | | | |
| 10.5 | Beat 4: Introduction to inventory | [ ] | | | |
| 10.6 | Beat 5: Tutorial completion | [ ] | | | |
| 10.7 | Skip tutorial option works | [ ] | | | |
| 10.8 | After tutorial/skip: navigate to character creation | [ ] | | | |
| 10.9 | Tutorial session cleaned up after skip | [ ] | | | |

---

## 11. Settings

| # | Test | Status | Tester | Date | Notes |
|---|------|--------|--------|------|-------|
| 11.1 | Language toggle: CZ/EN | [ ] | | | |
| 11.2 | Language change persists across sessions | [ ] | | | |
| 11.3 | Volume control: affects TTS playback | [ ] | | | |
| 11.4 | Volume setting persists | [ ] | | | |
| 11.5 | Auto-save indicator visible | [ ] | | | |
| 11.6 | Content rating display (teen default) | [ ] | | | |

---

## 12. Error Handling

| # | Test | Status | Tester | Date | Notes |
|---|------|--------|--------|------|-------|
| 12.1 | STT failure: text fallback offered | [ ] | | | |
| 12.2 | LLM failure (streaming): non-streaming fallback attempted | [ ] | | | |
| 12.3 | LLM failure (both): canned response delivered | [ ] | | | |
| 12.4 | TTS failure: text displayed, game continues | [ ] | | | |
| 12.5 | Network drop: reconnection attempted | [ ] | | | |
| 12.6 | SSE reconnection: Last-Event-ID header sent, missed events replayed | [ ] | | | |
| 12.7 | Circuit breaker: opens after 3 consecutive failures | [ ] | | | |
| 12.8 | Circuit breaker: rejects immediately when open | [ ] | | | |
| 12.9 | Circuit breaker: recovers after timeout | [ ] | | | |
| 12.10 | App background: auto-save triggered | [ ] | | | |
| 12.11 | App foreground: state restored correctly | [ ] | | | |

---

## 13. Content Safety / Moderation

| # | Test | Status | Tester | Date | Notes |
|---|------|--------|--------|------|-------|
| 13.1 | Explicit content requests blocked | [ ] | | | |
| 13.2 | Hate speech blocked | [ ] | | | |
| 13.3 | Jailbreak attempts blocked | [ ] | | | |
| 13.4 | Prompt injection blocked | [ ] | | | |
| 13.5 | Blocked input returns in-game redirect (not error) | [ ] | | | |
| 13.6 | AI output moderation active | [ ] | | | |
| 13.7 | Legitimate game violence allowed (fantasy context) | [ ] | | | |
| 13.8 | Real-world violence references blocked | [ ] | | | |
| 13.9 | XSS in text input sanitized | [ ] | | | |
| 13.10 | SQL injection in text input harmless | [ ] | | | |

---

## 14. Save/Load Integrity

| # | Test | Status | Tester | Date | Notes |
|---|------|--------|--------|------|-------|
| 14.1 | Save preserves character stats (HP, level, gold, inventory) | [ ] | | | |
| 14.2 | Save preserves story state (location, quest, progress) | [ ] | | | |
| 14.3 | Save preserves world state (time, weather, threat) | [ ] | | | |
| 14.4 | Save preserves session metadata (turns, time, images) | [ ] | | | |
| 14.5 | Load restores all saved state correctly | [ ] | | | |
| 14.6 | Load from Redis (hot cache): fast | [ ] | | | |
| 14.7 | Load from PostgreSQL (cold): correct | [ ] | | | |
| 14.8 | Conversation history restored on resume (last 15 turns) | [ ] | | | |
| 14.9 | Multiple save/load cycles maintain integrity | [ ] | | | |

---

## 15. Performance

| # | Test | Target | Status | Measured | Notes |
|---|------|--------|--------|----------|-------|
| 15.1 | Voice loop latency p50 | < 2.0s | [ ] | | |
| 15.2 | Voice loop latency p95 | < 3.0s | [ ] | | |
| 15.3 | App cold start | < 3.0s | [ ] | | |
| 15.4 | Non-AI API response p95 | < 300ms | [ ] | | |
| 15.5 | SSE first event after turn request | < 1.0s | [ ] | | |
| 15.6 | APK size | < 50MB | [ ] | | |
| 15.7 | Load test: 100 concurrent sessions | < 5% error | [ ] | | |
| 15.8 | No OOM crashes under load | 0 | [ ] | | |

---

## Sign-off

| Role | Name | Date | Status |
|------|------|------|--------|
| QA Lead | | | [ ] Pass / [ ] Fail |
| Backend Developer | | | [ ] Pass / [ ] Fail |
| Mobile Developer | | | [ ] Pass / [ ] Fail |
| Prompt Engineer | | | [ ] Pass / [ ] Fail |
| DevOps Engineer | | | [ ] Pass / [ ] Fail |

**Sprint 4 Regression Status:** [ ] PASS / [ ] FAIL / [ ] CONDITIONAL PASS

**Blocking Issues:**

**Non-Blocking Issues:**

**Notes:**
