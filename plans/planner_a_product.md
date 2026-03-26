# QUESTCAST -- Planner A: Product & Architecture Strategy
## Comprehensive MVP Development Plan
### Version 1.0 | March 2026

---

# Table of Contents

1. [MVP Scope Definition](#1-mvp-scope-definition)
2. [User Journey & UX Flow](#2-user-journey--ux-flow)
3. [Development Team Roles & Responsibilities](#3-development-team-roles--responsibilities)
4. [Sprint Plan (3-Month MVP)](#4-sprint-plan-3-month-mvp)
5. [Risk Flags from Product Perspective](#5-risk-flags-from-product-perspective)
6. [Technical Decisions That Need Resolution](#6-technical-decisions-that-need-resolution)

---

# 1. MVP Scope Definition

## 1.1 Product Vision (One Sentence)

Questcast is a voice-first AI RPG mobile app where players speak their actions and an AI Dungeon Master narrates back with voice and illustrations, delivering a tabletop RPG experience on a phone with zero preparation.

## 1.2 MVP Goal

Ship a single-player, voice-driven RPG experience on Android (Czech market primary, English secondary) that proves the core game loop is engaging enough to retain users past Day 7 and generate organic word-of-mouth. Monetization is NOT in MVP scope -- the first 3 months are about proving the game loop works.

## 1.3 P0 Features (MUST HAVE for MVP)

These are the absolute minimum features without which the product has no value proposition.

| ID | Feature | Description | Rationale |
|----|---------|-------------|-----------|
| P0-01 | **Voice Input (STT)** | Player taps a button, speaks an action, app transcribes it via Whisper API | Core differentiator -- voice-first interface |
| P0-02 | **AI Storytelling (LLM)** | GPT-4o-mini receives transcribed text + game state, generates narrative response | The AI Dungeon Master IS the product |
| P0-03 | **Voice Output (TTS)** | AI response is narrated aloud via OpenAI TTS with streaming | Voice-first means hearing the story, not reading it |
| P0-04 | **Text Fallback Display** | All AI narration is also displayed as scrollable text on screen | Accessibility; users in noisy environments; fallback if TTS fails |
| P0-05 | **Single Player Mode** | One player, one AI DM, one adventure | Simplest form of the game loop |
| P0-06 | **Session Save/Load** | Player can pause, close the app, and resume their adventure later | Mobile users get interrupted constantly -- this is essential |
| P0-07 | **User Authentication** | Email + password signup/login (Google OAuth as bonus) | Required for save/load, user data, and future monetization |
| P0-08 | **Basic Game State Management** | Track player character (name, class, HP, inventory), current location, quest progress, conversation history | AI needs context to tell a coherent story |
| P0-09 | **Content Safety Filter** | Prompt-level content filtering + output moderation to prevent inappropriate AI content | App store requirement; brand safety; children/teen audience |
| P0-10 | **Error/Fallback Handling** | Graceful degradation when AI APIs fail (pre-written fallback responses, text mode, retry logic) | AI APIs will fail -- the app must not crash or freeze |

## 1.4 P1 Features (SHOULD HAVE -- include if time permits in Month 3)

| ID | Feature | Description |
|----|---------|-------------|
| P1-01 | **AI Scene Images** | Generate 1-2 images per session at key story moments via GPT Image 1 Mini |
| P1-02 | **Basic Character Creation** | Choose name, class (warrior/mage/rogue/ranger), and race before starting |
| P1-03 | **Dice Rolling** | Visual + audio dice roll for combat/skill checks (d20 system) |
| P1-04 | **Tutorial/Onboarding** | Guided first 5-minute mini-adventure that teaches voice interaction |
| P1-05 | **Settings Screen** | Language toggle (CZ/EN), narrator voice selection, content rating (family/teen) |
| P1-06 | **Session Timer** | Display elapsed time; notify player at 30/45/60 min marks |

## 1.5 Explicitly OUT of MVP Scope

The following features are documented in the full roadmap but are NOT part of the 3-month MVP. Any developer working on MVP must not build toward these unless explicitly directed.

| Feature | Why Deferred | Target Phase |
|---------|-------------|--------------|
| **Monetization (subscriptions, IAP)** | Prove game loop first; premature monetization kills retention metrics | Phase 2 (Month 4-6) |
| **Multiplayer** | Massive complexity (WebSocket, speaker diarization, turn management) | Phase 3 (Month 7-9) |
| **Multiple Genres** (Sci-Fi, Horror) | Fantasy only for MVP; genre expansion is content, not infrastructure | Phase 2 (Month 5) |
| **Referral Program** | Need users first | Phase 2 (Month 5) |
| **Achievements System** | Engagement feature, not core loop | Phase 2 (Month 5) |
| **Adventure Pass / Seasonal Content** | Requires content pipeline and monetization infrastructure | Phase 3 (Month 8) |
| **UGC / Story Creator** | Platform feature, not game feature | Phase 4 (Month 10) |
| **B2B / Education Module** | Entirely different market segment | Phase 4 (Month 11) |
| **Multiple Narrator Voices** | One good voice is enough for MVP; selection is a retention lever | Phase 2 (Month 5) |
| **Rewarded Video Ads** | Adds complexity; anti-privacy-first brand | Phase 2+ |
| **Push Notifications** | Nice to have but not core game loop | Phase 2 (Month 4) |
| **Analytics Dashboard** | Use basic Mixpanel/Firebase Analytics events; no custom dashboard in MVP | Phase 2 (Month 6) |
| **Offline Mode** | Requires massive caching infrastructure; AI is inherently online | Phase 2 (Month 6) |
| **German Localization** | Czech + English for MVP | Phase 3 (Month 9) |
| **iOS Version** | Android first; iOS after market validation | Phase 2+ |

## 1.6 User Stories for MVP Features

### US-001: Voice-Driven Game Interaction
```
As a player
I want to speak my actions aloud and hear the AI Dungeon Master respond with voice
So that I can experience an immersive RPG adventure hands-free

Acceptance Criteria:
- Given the player is in an active game session
  When they tap the microphone button and speak an action
  Then the app transcribes their speech within 1.5 seconds
  And sends it to the AI DM for processing
  And plays back the AI's narrated response as audio within 3 seconds of finishing speech

- Given the player speaks in Czech
  When the AI processes the input
  Then the AI responds in Czech with proper grammar and dramatic tone

- Given the player speaks in English
  When the AI processes the input
  Then the AI responds in English

- Given the STT transcription is unclear or empty
  When the app receives the result
  Then it shows the transcribed text and asks "Did you mean this?" with option to retry or type manually
```

### US-002: Start a New Adventure
```
As a new player
I want to start a new adventure with a single tap
So that I can immediately begin playing without complex setup

Acceptance Criteria:
- Given the player is on the home screen
  When they tap "New Adventure"
  Then they are taken to a character creation screen (name + class selection)
  And after confirming, the AI DM begins the adventure with an opening narration

- Given the player creates a character
  When the adventure starts
  Then the opening narration is played as audio
  And the text is displayed on screen simultaneously
  And the player is prompted for their first action
```

### US-003: Save and Resume a Game
```
As a player who needs to stop mid-adventure
I want to save my progress and resume later
So that I do not lose my story progress

Acceptance Criteria:
- Given the player is in an active session
  When they tap "Save & Quit" or the app is backgrounded for >5 minutes
  Then the full game state is saved (character, location, inventory, conversation history, quest progress)

- Given the player has a saved game
  When they open the app and tap "Continue Adventure"
  Then the game loads the exact state where they left off
  And the AI provides a brief recap of where they were ("Last time, you were...")
```

### US-004: User Registration and Login
```
As a new user
I want to create an account quickly
So that my game data is saved and I can play across sessions

Acceptance Criteria:
- Given a new user opens the app for the first time
  When they reach the auth screen
  Then they can sign up with email + password
  And optionally with Google OAuth (one-tap)

- Given a returning user opens the app
  When they enter their credentials
  Then they are logged in and see their saved adventures

- Given a user forgets their password
  When they tap "Forgot password"
  Then they receive a password reset email
```

### US-005: AI Content Safety
```
As a player (or parent of a young player)
I want the AI to never produce inappropriate content
So that the experience is safe for the selected age rating

Acceptance Criteria:
- Given the content rating is set to "family"
  When the AI generates a response
  Then it contains no graphic violence, sexual content, real-world hate speech, or profanity

- Given a player deliberately tries to provoke inappropriate content
  When they speak an inappropriate request
  Then the AI redirects the story naturally without breaking immersion
  And no inappropriate content is generated

- Given any AI response is generated
  When it is received by the app
  Then it passes through an output moderation check before being displayed/spoken
```

### US-006: Error Recovery
```
As a player
I want the game to handle AI failures gracefully
So that my experience is not ruined by technical issues

Acceptance Criteria:
- Given the LLM API times out (>10 seconds)
  When the timeout is detected
  Then the app retries once
  And if the retry fails, displays a pre-written fallback response ("The magical energies flicker momentarily... Let's continue.")
  And the player can still take their next action

- Given the TTS API fails
  When the failure is detected
  Then the AI's text response is displayed on screen immediately
  And a retry button appears for audio

- Given the STT API fails
  When the failure is detected
  Then a text input field appears so the player can type their action
```

### US-007: Game State Tracking
```
As a player
I want the AI to remember my character, inventory, and story decisions
So that the adventure feels consistent and my choices matter

Acceptance Criteria:
- Given the player picked up a sword in turn 3
  When they reference "my sword" in turn 15
  Then the AI knows they have the sword and responds accordingly

- Given the player chose to spare a goblin in an earlier encounter
  When they encounter that goblin's tribe later
  Then the AI references the earlier decision

- Given the player's HP drops to 0
  When this is detected
  Then the AI triggers a death-save scenario (not instant death)
```

---

# 2. User Journey & UX Flow

## 2.1 Complete Onboarding Flow

```
STEP 1: App Launch (First Time)
+------------------------------------------+
|  QUESTCAST                               |
|  "Your AI Dungeon Master in Your Pocket" |
|                                          |
|  [Dramatic 3-second animation with       |
|   ambient fantasy music]                 |
|                                          |
|  [Get Started]                           |
+------------------------------------------+
          |
          v
STEP 2: Account Creation
+------------------------------------------+
|  Create Your Account                     |
|                                          |
|  [Continue with Google]  <-- Primary     |
|                                          |
|  - or -                                  |
|                                          |
|  Email: [____________]                   |
|  Password: [____________]                |
|                                          |
|  [Create Account]                        |
|                                          |
|  Already have an account? [Log in]       |
+------------------------------------------+
          |
          v
STEP 3: Language Selection
+------------------------------------------+
|  Choose your language                    |
|                                          |
|  [Cestina]          [English]            |
|                                          |
|  (This sets AI language + UI language)   |
+------------------------------------------+
          |
          v
STEP 4: Microphone Permission
+------------------------------------------+
|  Questcast needs your microphone         |
|                                          |
|  [Icon: microphone with fantasy aura]    |
|                                          |
|  "Speak your actions, hear your story.   |
|   Voice is the heart of Questcast."      |
|                                          |
|  [Allow Microphone Access]               |
|                                          |
|  [I prefer to type]  <-- fallback        |
+------------------------------------------+
          |
          v
STEP 5: Mini-Tutorial (Guided First Encounter)
+------------------------------------------+
|  TUTORIAL: "The Awakening"               |
|  (5-minute guided mini-adventure)        |
|                                          |
|  AI narrates: "You awaken in a dimly     |
|  lit tavern. A hooded figure approaches. |
|  What do you say?"                       |
|                                          |
|  [Tap the gem to speak]  <-- pulsing     |
|  indicator on mic button                 |
|                                          |
|  (Tutorial teaches: speak, listen,       |
|   make choices, dice roll)               |
+------------------------------------------+
          |
          v
STEP 6: Home Screen
+------------------------------------------+
|  Welcome, [Player Name]!                 |
|                                          |
|  [+ New Adventure]     <-- Primary CTA   |
|                                          |
|  Saved Adventures:                       |
|  (empty for new users)                   |
|                                          |
|  [Settings]                              |
+------------------------------------------+
```

**Critical UX Note:** The tutorial at Step 5 is the MOST IMPORTANT moment in the entire user lifecycle. The player must hear the AI speak within the first 30 seconds. If the first voice interaction takes more than 5 seconds, we will lose the user. Pre-cache the tutorial's opening narration TTS audio at app install time.

## 2.2 Core Game Loop (Step by Step)

```
CORE LOOP (repeats every 15-45 seconds):

  +-------------------+
  | AI Narrates Scene |  (TTS audio plays + text scrolls on screen)
  | (10-20 seconds)   |  (Optional: scene image displays)
  +--------+----------+
           |
           v
  +-------------------+
  | Player Thinks     |  (Brief pause; ambient music plays)
  | (5-10 seconds)    |
  +--------+----------+
           |
           v
  +-------------------+
  | Player Speaks     |  (Mic button held/tapped; STT active)
  | (3-15 seconds)    |  (Visual: waveform animation)
  +--------+----------+
           |
           v
  +-------------------+
  | Transcription     |  (Whisper API; <1.5s target)
  | Displayed         |  (Player sees their words; can edit/retry)
  +--------+----------+
           |
           v
  +-------------------+
  | AI Processes      |  (GPT-4o-mini; streaming response)
  | (1-3 seconds)     |  (Visual: "The Dungeon Master ponders...")
  +--------+----------+
           |
           v
  +------- +----------+
  | AI Narrates       |  (Back to top of loop)
  | Response          |
  +-------------------+

SPECIAL EVENTS (interrupt the loop):
- DICE ROLL: AI requests a skill check -> dice animation + result -> AI narrates outcome
- COMBAT: Structured turn sequence (attack/defend/spell/flee) with dice rolls
- IMAGE: At scene transitions or dramatic moments, a generated image appears
- LEVEL UP / ITEM FOUND: Brief celebration animation + game state update
```

## 2.3 Session Lifecycle

```
SESSION START
=============
1. Player taps "New Adventure" or "Continue Adventure"
2. If new: Character creation (name, class) -> AI generates opening scene
3. If continue: Load game state -> AI provides 1-sentence recap
4. Session timer starts (visible but unobtrusive)

ACTIVE PLAY
===========
5. Core game loop repeats (see 2.2)
6. Game state auto-saves every 3 turns (background, invisible to user)
7. At 30 minutes: subtle notification "You've been playing for 30 minutes"
   (No interruption -- just informational)
8. At 45 minutes: "Great session! Save point coming up..."
   (AI is instructed to reach a natural pause point soon)

SESSION END (Player-Initiated)
==============================
9a. Player taps "Save & Quit"
10a. AI generates a brief closing narration ("To be continued...")
11a. Game state saved -> return to home screen

SESSION END (Natural)
=====================
9b. AI reaches a natural story chapter end
10b. "Chapter complete! Continue or save for later?"
11b. Player chooses -> game continues or saves

SESSION END (Interrupted)
=========================
9c. Player backgrounds the app / receives phone call
10c. App detects backgrounding -> auto-saves after 10 seconds
11c. On return within 5 minutes: seamless resume
12c. On return after 5+ minutes: "Welcome back!" + brief recap

SESSION END (Error)
===================
9d. AI API fails irrecoverably
10d. App saves last known good state
11d. Shows: "The magical realm needs a moment to stabilize. Your progress is saved."
12d. Return to home screen with "Continue" available
```

## 2.4 Monetization Touchpoints (MVP Preparation)

**Important:** MVP does NOT include monetization. However, the architecture must be built to support these touchpoints, which will be activated in Phase 2 (Month 4).

| Touchpoint | Trigger | What Happens in MVP | What Happens Post-MVP |
|------------|---------|--------------------|-----------------------|
| **Cliffhanger Moment** | AI reaches a dramatic peak at ~45 minutes | AI naturally wraps up the session | Paywall: "+15 min for $0.99" or "Subscribe for unlimited" |
| **Session Limit** | Free users hit 3 sessions/week | Not enforced in MVP (unlimited for beta) | Usage limit enforced; subscription CTA |
| **Image Generation** | Player sees their first AI-generated scene | Image displayed for free | Free users get 1 image/session; paid get unlimited |
| **Premium Voices** | Player hears narrator voice | Default voice only | Voice selection locked behind subscription |

**Architecture Requirement:** The backend must track session count, image count, and session duration per user from Day 1, even though limits are not enforced in MVP. This data feeds Phase 2 monetization decisions.

## 2.5 Error/Fallback UX

| Failure | User-Facing Behavior | Technical Detail |
|---------|---------------------|-----------------|
| **STT fails** | Text input field slides up with message: "Voice magic disrupted -- type your action instead" | Automatic fallback; no user action needed beyond typing |
| **LLM timeout (>10s)** | Animated loading: "The Dungeon Master consults the ancient tomes..." then retry | 1 automatic retry; if fails, use pre-written fallback response |
| **LLM error (500)** | Same loading animation, then fallback: "The magical energies flicker... What do you do?" | Log error; use fallback; alert backend team |
| **TTS fails** | Text response appears immediately; small speaker icon with retry | Player reads instead of listens; can tap to retry TTS |
| **Image gen fails** | Placeholder image with retry icon; game continues without interruption | Image generation is non-blocking; failure does not halt the game |
| **No internet** | "You've wandered beyond the reach of magic. Please reconnect to continue." | Disable mic button; show cached last response; check connectivity every 5s |
| **Auth token expired** | Silent refresh in background; if fails, redirect to login | Use refresh tokens; seamless re-auth |

---

# 3. Development Team Roles & Responsibilities

## 3.1 Role: Backend Developer

**Specialization:** API design, game logic, AI service orchestration, database management

**Exact Responsibilities:**
- Design and implement the REST API (all game endpoints)
- Build the AI orchestration pipeline: STT -> LLM -> TTS -> Image Gen
- Implement streaming LLM responses to TTS (sentence-by-sentence)
- Design and maintain PostgreSQL database schema (users, sessions, game states, events)
- Set up Redis for session caching and TTS response caching
- Implement user authentication (signup, login, token refresh, password reset)
- Build game state management logic (save/load/update)
- Implement content moderation layer (prompt filters + output checks)
- Set up API rate limiting and cost monitoring for OpenAI calls
- Write API documentation for Mobile Developer consumption

**Key Deliverables:**
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`
- `POST /api/game/session` (create new session)
- `GET /api/game/session/:id` (load session)
- `POST /api/game/action` (player speaks an action -> returns AI response as streaming text + TTS audio URL)
- `POST /api/game/save` (save game state)
- `POST /api/game/image` (generate scene image)
- `POST /api/game/dice-roll` (roll dice, return result + AI narration)
- Database schema migration files
- Redis caching layer for TTS and common responses
- OpenAI cost monitoring dashboard (Grafana or equivalent)
- API documentation (OpenAPI/Swagger spec)

**Dependencies:**
- Needs UX wireframes from Product/Design (for API contract)
- Needs prompt templates from AI/Prompt Engineer
- Needs database schema review from DevOps

**Tech Stack:** Node.js with Express/Fastify OR Python FastAPI (see Section 6 for decision), PostgreSQL, Redis, OpenAI SDK

---

## 3.2 Role: Mobile Developer

**Specialization:** React Native app development, audio handling, UI/UX implementation

**Exact Responsibilities:**
- Set up React Native project with Expo (managed workflow to start; eject only if necessary)
- Implement all UI screens (onboarding, home, game session, character creation, settings)
- Build the voice interaction UI: microphone button, waveform animation, recording/playback
- Implement audio recording (capture player speech) and streaming audio playback (play TTS responses)
- Handle microphone permissions and audio focus (respect phone calls, other apps)
- Integrate with backend API (all endpoints)
- Implement local storage for offline-first data (user preferences, last session state cache)
- Build navigation structure (React Navigation)
- Implement the dice rolling animation (visual + haptic feedback)
- Handle app lifecycle (background/foreground transitions, auto-save triggers)
- Implement text fallback display (scrollable transcript of the adventure)
- Build character creation screen (name input, class selection with illustrations)
- Implement the tutorial/onboarding flow
- Handle error states and fallback UIs for all failure scenarios
- Manage app state (Zustand or similar lightweight state manager)

**Key Deliverables:**
- Complete React Native app targeting Android (APK/AAB)
- Screens: Splash, Onboarding (4 steps), Login/Register, Home, New Game, Game Session, Settings, Loading/Error states
- Audio module: record, upload, stream playback, caching
- API integration layer (typed API client)
- Game session UI: text transcript, mic button, dice roller, scene image display
- Character creation UI with class/race selection
- Tutorial flow (scripted mini-adventure)
- Google Play Store listing assets (screenshots, description)

**Dependencies:**
- Needs API documentation from Backend Developer
- Needs UI designs/wireframes from Product (or builds from spec if no dedicated designer)
- Needs TTS audio streaming format agreed with Backend Developer

**Tech Stack:** React Native (Expo), TypeScript, Zustand (state), React Navigation, expo-av (audio), Axios/fetch (API)

---

## 3.3 Role: AI/Prompt Engineer

**Specialization:** LLM prompt design, AI pipeline optimization, response quality tuning

**Exact Responsibilities:**
- Design and refine the Dungeon Master system prompt (the core personality of the game)
- Create prompt templates for all game scenarios: scene descriptions, combat, dice interpretation, NPC dialogue, cliffhangers, session openings/closings
- Optimize prompts for token efficiency (target: <150 tokens per response)
- Build and maintain the game state JSON schema that is injected into prompts
- Design the content safety layer (prompt-level filtering rules)
- Create fallback response templates for when AI fails
- Tune response length and style for voice output (short, dramatic, second-person)
- Create Czech-language prompts that are natural and dramatic (not robotic translations)
- Create English-language prompts
- Build a prompt testing suite: automated tests that verify response quality, safety, length, and consistency
- Design the image generation prompt templates (scene illustrations, character portraits)
- Optimize the conversation history window (how many turns to include for context vs. token cost)
- A/B test prompt variants and measure engagement metrics
- Document all prompts with variable descriptions for Backend Developer

**Key Deliverables:**
- `system_prompt_base.txt` -- The master DM system prompt
- `prompt_scene_description.txt` -- For entering new locations
- `prompt_combat.txt` -- For combat encounters
- `prompt_dice_interpretation.txt` -- For dice roll outcomes
- `prompt_cliffhanger.txt` -- For session endings
- `prompt_recap.txt` -- For session resumption
- `prompt_tutorial.txt` -- For the onboarding mini-adventure
- `prompt_image_scene.txt` -- For scene illustration generation
- `prompt_image_character.txt` -- For character portrait generation
- `game_state_schema.json` -- The JSON structure injected into prompts
- `content_safety_rules.txt` -- Content filtering directives
- `fallback_responses.json` -- Pre-written responses for AI failures
- `prompt_test_suite/` -- Automated tests for prompt quality
- Performance report: tokens/response, cost/session, response quality scores

**Dependencies:**
- Needs game design decisions from Product (what RPG mechanics to support)
- Needs Backend Developer to expose prompt configuration (not hardcoded)
- Needs Mobile Developer feedback on response length for voice pacing

---

## 3.4 Role: QA Lead

**Specialization:** Test strategy, test automation, quality assurance, bug triage

**Exact Responsibilities:**
- Define and execute the overall test strategy for MVP
- Write and maintain end-to-end test scenarios for critical user flows
- Set up automated testing: unit tests (backend), integration tests (API), E2E tests (Detox for React Native)
- Perform manual exploratory testing of the game experience
- Test voice interaction across devices (different microphones, accents, background noise)
- Test AI response quality: are responses coherent, safe, appropriate length, in correct language?
- Test error handling: simulate API failures, network drops, timeout scenarios
- Test edge cases: very long player inputs, silence, gibberish speech, rapid repeated inputs
- Test app lifecycle: background/foreground, low battery, incoming calls, multitasking
- Test accessibility: screen reader compatibility, font scaling, color contrast
- Manage bug tracking (GitHub Issues with severity labels)
- Define release criteria (what must pass before beta)
- Coordinate closed beta testing (500 users) in Sprint 6

**Key Deliverables:**
- Test plan document (covering all P0 and P1 features)
- Automated test suite: 80%+ coverage on backend, 60%+ on critical mobile flows
- Bug reports with reproduction steps, severity, and environment details
- Beta test plan: user selection criteria, feedback collection method, success metrics
- Release criteria checklist
- Device compatibility matrix (minimum 5 Android devices tested)

**Dependencies:**
- Needs stable APIs from Backend Developer to write integration tests
- Needs stable app builds from Mobile Developer to run E2E tests
- Needs prompt test suite from AI/Prompt Engineer to verify AI quality

---

## 3.5 Role: DevOps Engineer

**Specialization:** CI/CD, infrastructure, deployment, monitoring

**Exact Responsibilities:**
- Set up cloud infrastructure for MVP (Tier 1 architecture: Vercel/Railway + Supabase + Cloudflare)
- Configure CI/CD pipeline: GitHub Actions for backend tests, lint, build, deploy
- Configure CI/CD for mobile: build APK/AAB on every PR, automated tests
- Set up environment management: development, staging, production
- Configure PostgreSQL database (Supabase or standalone)
- Set up Redis instance (Upstash or equivalent)
- Configure monitoring and alerting: Sentry for errors, basic uptime monitoring
- Set up logging infrastructure (structured logs, searchable)
- Configure OpenAI API key management and cost monitoring
- Set up CDN for TTS audio caching (Cloudflare R2 + CDN)
- Configure SSL/TLS, domain setup (api.questcast.app)
- Set up database backups (automated daily)
- Prepare Google Play Store developer account and signing certificates
- Configure secrets management (environment variables, not in code)

**Key Deliverables:**
- Infrastructure-as-code (Terraform or equivalent) for all environments
- CI/CD pipelines (GitHub Actions): backend deploy, mobile build, test automation
- Monitoring dashboard: API latency, error rates, AI costs, database metrics
- Alerting rules: critical errors -> Slack/email within 1 minute
- Staging environment that mirrors production
- Deployment runbook for production releases
- Google Play Store submission pipeline
- Backup and disaster recovery procedures

**Dependencies:**
- Needs Backend Developer to define environment variables and service dependencies
- Needs Mobile Developer to define build configuration
- Budget approval for cloud services (~$500-1000/month for MVP)

---

## 3.6 Role Interaction Matrix

```
                  Backend    Mobile    AI/Prompt    QA       DevOps
Backend             --       API spec   Prompts    Tests    Deploy
Mobile           API spec      --       Voice UX   Tests    Builds
AI/Prompt        Prompts    Voice UX      --       Quality  Config
QA               Tests      Tests      Quality      --     Envs
DevOps           Deploy     Builds     Config      Envs      --
```

**Critical Handoff Points:**
1. **Sprint 1, Week 2:** Backend provides API spec (OpenAPI) to Mobile Developer
2. **Sprint 1, Week 2:** AI/Prompt Engineer provides prompt templates to Backend Developer
3. **Sprint 2, Week 1:** Backend provides working STT->LLM->TTS endpoint to Mobile Developer
4. **Sprint 3, Week 1:** Mobile provides testable build to QA Lead
5. **Sprint 5, Week 1:** All roles provide deliverables for integration testing

---

# 4. Sprint Plan (3-Month MVP)

## Overview

| Sprint | Dates | Theme | Key Milestone |
|--------|-------|-------|---------------|
| Sprint 1 | Weeks 1-2 | Foundation & Infrastructure | Backend API skeleton + AI proof-of-concept working |
| Sprint 2 | Weeks 3-4 | AI Pipeline & App Shell | Voice-in, voice-out loop working end-to-end |
| Sprint 3 | Weeks 5-6 | Core Gameplay | Playable single-player game (internal demo) |
| Sprint 4 | Weeks 7-8 | Feature Completion | All P0 + P1 features integrated |
| Sprint 5 | Weeks 9-10 | Polish & Testing | Bug fixing, performance, stability |
| Sprint 6 | Weeks 11-12 | Beta Launch | Closed beta (500 users) + App Store submission |

---

### Sprint 1: Foundation & Infrastructure (Weeks 1-2)

**Sprint Goal:** Set up all infrastructure, get the AI pipeline producing responses in a test environment, get the mobile app skeleton running on a device.

**Backend Developer:**
- Set up Node.js/FastAPI project with folder structure, linting, TypeScript (if Node)
- Design and implement PostgreSQL schema: users, sessions, game_states, game_events
- Implement auth endpoints: register, login, token refresh (JWT)
- Integrate OpenAI SDK: GPT-4o-mini chat completion (basic call, no game logic yet)
- Integrate Whisper API: send audio file, get transcription
- Integrate OpenAI TTS: send text, get audio stream
- Create a test endpoint: POST /api/test/voice-loop (send audio -> get text -> get AI response -> get TTS audio)
- Write OpenAPI spec for all planned endpoints (draft)

**Mobile Developer:**
- Initialize React Native (Expo) project
- Set up TypeScript, ESLint, Prettier
- Set up navigation structure (React Navigation): Splash, Auth, Home, Game, Settings
- Build Login/Register screens (UI only, connect to auth API)
- Build Home screen (list saved sessions, "New Adventure" button)
- Test audio recording on Android device (expo-av)
- Test audio playback on Android device (expo-av)

**AI/Prompt Engineer:**
- Write the base Dungeon Master system prompt (v1)
- Write the game state JSON schema
- Write scene description, combat, and dice interpretation prompt templates
- Write content safety rules
- Write Czech and English language variants
- Test all prompts manually against GPT-4o-mini API (measure quality, length, token usage)
- Deliver prompt files and documentation to Backend Developer

**QA Lead:**
- Define test strategy document
- Set up testing infrastructure: Jest (backend), Detox (mobile)
- Write test cases for auth flow
- Define bug severity classification
- Set up GitHub Issues board with labels

**DevOps:**
- Provision cloud infrastructure (Vercel/Railway for API, Supabase for DB/Auth, Upstash for Redis)
- Set up GitHub repository with branch protection rules
- Create CI/CD pipeline: backend lint + test + deploy on merge to main
- Create CI/CD pipeline: mobile build APK on merge to develop
- Set up staging environment
- Configure Sentry error tracking for backend and mobile
- Set up domain: api.questcast.app (staging: api-staging.questcast.app)

**Sprint 1 Deliverables:**
- [ ] Backend: Auth API working (register/login/refresh)
- [ ] Backend: OpenAI integration working (STT + LLM + TTS in sequence)
- [ ] Backend: OpenAPI spec draft shared with Mobile Developer
- [ ] Mobile: App runs on Android device with navigation between screens
- [ ] Mobile: Audio recording and playback tested on device
- [ ] AI: All v1 prompt templates delivered and tested
- [ ] QA: Test strategy documented; auth test cases written
- [ ] DevOps: Staging environment live; CI/CD running

**Definition of Done:** A developer can call POST /api/test/voice-loop with an audio file and receive back an AI-narrated audio response. The mobile app builds and runs on an Android device.

---

### Sprint 2: AI Pipeline & App Shell (Weeks 3-4)

**Sprint Goal:** End-to-end voice loop working in the app: player speaks -> app records -> sends to backend -> backend processes (STT->LLM->TTS) -> app plays response audio. This is the "it works!" moment.

**Backend Developer:**
- Implement game session creation endpoint (POST /api/game/session) with character creation
- Implement game action endpoint (POST /api/game/action) with full pipeline: receive audio -> STT -> inject game state into prompt -> LLM -> TTS -> return audio URL + text
- Implement streaming: LLM response streams sentence-by-sentence; TTS starts before full response is complete
- Implement game state persistence: save game state after each turn to PostgreSQL
- Implement basic Redis caching for TTS responses (cache common phrases)
- Implement session load endpoint (GET /api/game/session/:id)

**Mobile Developer:**
- Build the Game Session screen: text transcript area, microphone button, loading indicator
- Implement voice recording: tap mic -> record -> stop -> send audio to backend
- Implement audio streaming playback: receive TTS audio -> play immediately
- Implement text display: show AI response text as it streams in
- Connect to session creation API (New Adventure flow)
- Connect to game action API (the core loop)
- Build basic loading/thinking state ("The Dungeon Master ponders...")
- Handle basic errors (timeout, network failure)

**AI/Prompt Engineer:**
- Refine prompts based on Sprint 1 test results
- Write tutorial prompt (the guided first adventure)
- Write session recap prompt (for resuming saved games)
- Write cliffhanger prompt (for session endings)
- Optimize token usage: ensure average response <100 tokens
- Create 10 sample game scenarios for testing variety and quality
- Begin building prompt test suite (automated quality checks)

**QA Lead:**
- Write integration tests for game session API endpoints
- Write test cases for the voice interaction loop
- Manual testing: play through the voice loop on 3+ Android devices
- Document all bugs found with reproduction steps
- Test STT accuracy with Czech and English speech

**DevOps:**
- Set up Redis instance for TTS caching
- Set up S3/R2 bucket for TTS audio file storage
- Configure CDN for audio file delivery
- Set up cost monitoring for OpenAI API usage (daily spend alerts)
- Optimize backend deployment for cold start times (important for Vercel/serverless)

**Sprint 2 Deliverables:**
- [ ] Backend: Full voice loop endpoint working (audio in -> audio + text out)
- [ ] Backend: Streaming response working (TTS starts before LLM finishes)
- [ ] Backend: Game state saves after each turn
- [ ] Mobile: Player can speak, hear AI response, and see text -- end to end
- [ ] Mobile: Game Session screen functional with mic, transcript, loading states
- [ ] AI: Tutorial prompts ready; response quality at acceptable level
- [ ] QA: Voice loop tested on 3+ devices; critical bugs filed
- [ ] DevOps: Redis caching live; audio CDN configured; cost monitoring active

**Definition of Done:** A tester can open the app on an Android phone, start a new adventure, speak an action, and hear the AI respond -- multiple turns in sequence, with text displayed on screen. Total voice-to-voice latency is under 5 seconds.

---

### Sprint 3: Core Gameplay (Weeks 5-6)

**Sprint Goal:** The app is a playable game with character state, dice rolling, and save/load. Internal team plays full 30-minute sessions and provides feedback.

**Backend Developer:**
- Implement character state management: HP tracking, inventory add/remove, level tracking
- Implement dice roll endpoint (POST /api/game/dice-roll): generate result, return with AI narration
- Implement game save endpoint (POST /api/game/save) with full state snapshot
- Implement game load with AI-generated recap
- Implement session listing endpoint (GET /api/game/sessions) for home screen
- Add request validation and error handling to all endpoints
- Implement rate limiting (protect against abuse)
- Add structured logging to all endpoints

**Mobile Developer:**
- Build Character Creation screen: name input, class picker (4 classes with icons), race picker
- Build dice rolling animation (visual d20 roll with result display + haptic feedback)
- Implement save/load flow: "Save & Quit" button, "Continue Adventure" on home screen
- Build session list on home screen (show saved adventures with last-played date)
- Implement auto-save on app background
- Add character info panel in game session (HP bar, inventory list, current quest)
- Polish the microphone interaction: button press animation, recording waveform, stop detection
- Build Settings screen: language toggle, content rating, narrator voice (placeholder for future)

**AI/Prompt Engineer:**
- Integrate dice roll interpretation into prompts
- Refine combat prompts (balanced, dramatic, not too long)
- Test and improve Czech language prompts (natural dramatic tone, not robotic)
- Write character class-specific opening prompts (warrior/mage/rogue/ranger get different intros)
- Optimize game state injection (include only relevant state data to minimize tokens)
- Create quality scoring rubric for AI responses

**QA Lead:**
- Full gameplay testing: play 5+ complete 30-minute sessions
- Test save/load reliability (save mid-combat, resume, verify state consistency)
- Test character creation with edge cases (empty name, special characters, very long names)
- Test dice rolling mechanics (correct probability distribution, appropriate AI interpretation)
- Performance testing: measure voice latency, app memory usage, battery drain
- Begin writing E2E tests (Detox) for critical flows

**DevOps:**
- Performance baseline: measure and document p50/p95 latency for all endpoints
- Set up database backup schedule (daily automated)
- Optimize API cold starts if on serverless
- Set up application performance monitoring (APM)
- Prepare for increased test traffic

**Sprint 3 Deliverables:**
- [ ] Backend: Character state, dice rolls, save/load all working
- [ ] Mobile: Full game experience playable with character creation, dice, save/load
- [ ] Mobile: Settings screen with language and content rating
- [ ] AI: Class-specific openings; Czech prompts natural and engaging
- [ ] QA: 5+ full sessions played; major bugs filed and triaged
- [ ] DevOps: Performance baseline documented; backups running

**Definition of Done:** An internal tester can: create account -> create character (name + class) -> play a 30-minute adventure with voice -> roll dice in combat -> save and quit -> reopen app -> continue where they left off. All in Czech or English.

---

### Sprint 4: Feature Completion (Weeks 7-8)

**Sprint Goal:** All P0 and P1 features are implemented. The app is feature-complete for MVP. Focus shifts from building to stabilizing.

**Backend Developer:**
- Implement image generation endpoint (POST /api/game/image) using GPT Image 1 Mini
- Add image generation triggers: call automatically at scene transitions (limit 2/session for free)
- Implement image caching (same scene description = cached image)
- Add analytics event tracking: session starts, completion, duration, errors, actions per session
- Implement user profile endpoint (GET/PUT /api/user/profile)
- Harden all error handling: graceful degradation for every external API call
- API documentation complete and accurate (Swagger/OpenAPI)
- Load testing: simulate 100 concurrent sessions

**Mobile Developer:**
- Implement scene image display (appears above transcript at key moments)
- Build the tutorial/onboarding flow (5-minute guided adventure with step-by-step prompts)
- Implement session timer (subtle, non-intrusive display)
- Polish all animations: screen transitions, mic button, dice roll, loading states
- Implement deep linking (for future sharing/referral features)
- Handle edge cases: double-tap mic, speaking while AI is still narrating, rapid navigation
- Accessibility pass: ensure screen readers work, minimum touch targets 48dp, color contrast AA
- App icon, splash screen, and store listing assets

**AI/Prompt Engineer:**
- Finalize all prompt templates (lock for beta)
- Write image generation prompts with art style consistency
- Complete prompt test suite (automated tests for all templates)
- Performance report: average tokens/response, cost/session, quality scores
- Document the full prompt architecture for team knowledge sharing

**QA Lead:**
- Full regression testing of all features
- Edge case testing marathon: network failures, background/foreground, low memory
- Test AI image generation quality and appropriateness
- Test tutorial flow with fresh user mindset (is it clear? engaging?)
- Update test plan to cover all P1 features
- Begin defining beta test plan: user selection, feedback survey, success metrics

**DevOps:**
- Load testing: 100 concurrent sessions, measure infrastructure behavior
- Optimize based on load test results
- Set up production environment (separate from staging)
- Configure production monitoring dashboards
- Set up alerting for production (PagerDuty/Slack)
- Prepare Google Play Store developer account and app signing

**Sprint 4 Deliverables:**
- [ ] Backend: Image generation working; analytics events firing; all APIs hardened
- [ ] Mobile: All P0 + P1 features implemented; tutorial complete; polished UI
- [ ] AI: All prompts finalized; image prompts working; test suite passing
- [ ] QA: Full regression complete; critical/high bugs resolved; beta plan ready
- [ ] DevOps: Load test passed for 100 concurrent; production environment ready

**Definition of Done:** The app is feature-complete. A new user can download, onboard, play the tutorial, create a character, play a full adventure with voice, see AI images, roll dice, save/quit, and resume. All P0 and P1 features work. No critical or high-severity bugs open.

---

### Sprint 5: Polish & Testing (Weeks 9-10)

**Sprint Goal:** Fix all bugs. Optimize performance. Achieve target latency (<3s voice-to-voice). Prepare for beta users.

**Backend Developer:**
- Fix all bugs from Sprint 4 regression
- Performance optimization: reduce voice-to-voice latency to <3s (target <2s)
- Optimize database queries (add indexes, reduce N+1 queries)
- Implement proper error logging and structured error responses
- Review and harden security: input validation, SQL injection prevention, rate limiting
- Ensure GDPR compliance: data deletion endpoint, data export endpoint
- Final API documentation review

**Mobile Developer:**
- Fix all UI bugs from Sprint 4 regression
- Performance optimization: reduce app load time to <3s, smooth animations at 60fps
- Memory optimization: ensure no memory leaks during long sessions
- Battery optimization: efficient audio handling, minimal background processing
- Final polish: consistent spacing, typography, colors across all screens
- Test on 5+ Android devices (different screen sizes, OS versions, manufacturers)
- Prepare store listing: screenshots, description (CZ + EN), promotional text

**AI/Prompt Engineer:**
- Fine-tune prompts based on all testing feedback
- Optimize for voice pacing: responses should sound natural when spoken aloud
- Final Czech language quality review (native speaker review if possible)
- Create pre-cached TTS audio for tutorial opening and common phrases
- Document lessons learned and optimization opportunities for Phase 2

**QA Lead:**
- Full regression test on production environment
- Performance testing: voice latency, app load time, session stability
- Security testing: basic penetration test, input fuzzing
- Compatibility testing: Android 10+ on 5+ devices
- Write and execute beta test scripts
- Prepare feedback collection system (in-app survey or Typeform link)

**DevOps:**
- Production deployment and smoke testing
- Set up production monitoring for all key metrics
- Configure auto-scaling rules
- Final security audit: SSL, secrets management, network configuration
- Set up on-call rotation for beta period
- Prepare rollback procedure in case of critical production issues

**Sprint 5 Deliverables:**
- [ ] Backend: All bugs fixed; latency <3s; security hardened; GDPR endpoints ready
- [ ] Mobile: All bugs fixed; smooth 60fps; tested on 5+ devices; store listing ready
- [ ] AI: Prompts finalized and pre-cached; Czech quality verified
- [ ] QA: Full regression pass; <5 medium bugs open; no critical/high bugs
- [ ] DevOps: Production live and stable; monitoring active; rollback ready

**Definition of Done:** The app is production-ready. Voice-to-voice latency is under 3 seconds. No critical or high bugs. Tested on 5+ Android devices. Store listing assets complete.

---

### Sprint 6: Beta Launch (Weeks 11-12)

**Sprint Goal:** Launch closed beta to 500 users. Collect feedback. Fix critical issues. Submit to Google Play Store.

**Backend Developer:**
- Monitor production during beta: fix critical bugs within 4 hours
- Implement any quick fixes based on beta feedback
- Monitor AI costs and optimize if needed
- Prepare for scaling if beta generates more traffic than expected

**Mobile Developer:**
- Respond to beta bug reports: fix UI issues, crash reports
- Implement quick UX improvements based on beta feedback
- Submit final build to Google Play Store (review takes 1-7 days)
- Monitor crash reports (Sentry)

**AI/Prompt Engineer:**
- Analyze AI response quality from real user sessions
- Identify common prompt failure patterns (when does the AI produce bad responses?)
- Propose prompt improvements for Phase 2

**QA Lead:**
- Coordinate beta testing: onboard users, collect feedback, triage reports
- Daily bug triage during beta
- Analyze beta metrics: session completion rate, retention, crash rate, NPS
- Write beta results report with recommendations

**DevOps:**
- Monitor infrastructure during beta (24/7 for first 3 days)
- Scale infrastructure if needed
- Ensure backup and recovery procedures work
- Post-mortem any production incidents

**Sprint 6 Deliverables:**
- [ ] 500 beta users onboarded and playing
- [ ] Beta feedback collected and analyzed
- [ ] Critical beta bugs fixed
- [ ] App submitted to Google Play Store
- [ ] Beta results report: completion rate, retention, NPS, top issues
- [ ] Phase 2 backlog prioritized based on beta learnings

**Definition of Done:** 500 users have played at least 1 session. First session completion rate >70%. Crash rate <5%. App Store rating (if tracked via beta) >4.0. App submitted and approved on Google Play.

**Beta Success Metrics:**
| Metric | Target | Failure Threshold |
|--------|--------|-------------------|
| First session completion rate | >80% | <60% |
| D1 retention (return next day) | >40% | <20% |
| D7 retention | >20% | <10% |
| Average session length | >15 min | <5 min |
| Crash rate | <2% | >5% |
| Voice interaction success rate | >90% | <70% |
| User satisfaction (NPS) | >30 | <0 |

---

# 5. Risk Flags from Product Perspective

## Risk 1: Voice Latency Kills the Experience (CRITICAL)

**The Problem:** If the total time from "player stops speaking" to "AI voice starts playing" exceeds 4 seconds, the experience feels broken. Players will compare it to talking to a human, not to loading a web page. Every second matters.

**Latency Budget:**
| Step | Target | Max Acceptable |
|------|--------|----------------|
| Audio upload + STT | 1.0s | 1.5s |
| LLM processing (first token) | 0.5s | 1.0s |
| TTS generation (first audio chunk) | 0.5s | 1.0s |
| Total | 2.0s | 3.5s |

**Mitigation:**
- Stream LLM responses; start TTS on first complete sentence (do not wait for full response)
- Use Whisper's streaming mode if available, or send smaller audio chunks
- Pre-cache TTS for common phrases (greetings, dice prompts, combat phrases)
- Deploy backend in EU region (closest to Czech users)
- Implement a "thinking" animation that makes the wait feel intentional, not broken

**Go/No-Go:** If p95 latency exceeds 5 seconds in beta, the product is NOT ready for public launch. Fix latency before launching.

## Risk 2: AI Response Quality is Inconsistent

**The Problem:** GPT-4o-mini is good but not perfect. It sometimes produces: overly long responses, breaks character, gives inconsistent game state references, or generates bland/repetitive narration. In a voice-first app, bad AI text becomes bad AI voice -- and it is painfully obvious.

**Mitigation:**
- Invest heavily in prompt engineering (Sprint 1-2 priority)
- Constrain response length aggressively (max 150 words)
- Include game state in every prompt so the AI has context
- Build automated quality checks (response length, safety, language)
- Have fallback responses ready for when quality is unacceptable
- Monitor session completion rates as a proxy for quality

**Go/No-Go:** If >20% of AI responses in beta are rated "poor" by users, stop and fix prompts before public launch.

## Risk 3: Czech Language AI Quality is Subpar

**The Problem:** GPT-4o-mini handles Czech, but not as well as English. Czech grammar is complex (7 cases, gendered nouns, formal vs. informal address). Robotic or grammatically incorrect Czech will immediately break immersion for Czech players.

**Mitigation:**
- Native Czech speaker must review all Czech prompts
- Test with Czech-speaking beta users specifically for language quality
- Consider using formal "vy" (as specified in the prompts) consistently
- Have a feedback mechanism for players to flag bad language quality
- Be prepared to fall back to English-first if Czech quality cannot be achieved by beta

**Go/No-Go:** If Czech-speaking beta users rate language quality below 3/5, either fix or launch English-first with Czech as beta.

## Risk 4: AI API Costs Exceed Budget

**The Problem:** Each game session involves multiple API calls (STT + LLM + TTS + potentially Image Gen). At $0.20/session, 500 beta users playing 5 sessions = 2,500 sessions = $500 in AI costs for beta alone. At scale, this is the #1 cost driver.

**Mitigation:**
- Track cost per session from Day 1 (not post-launch)
- Implement TTS caching (35% savings per documents)
- Optimize prompt tokens aggressively
- Set hard limits: max 50 LLM turns per session, max 2 images per session
- Implement daily cost alerts ($50/day warning, $100/day critical for beta)

**Go/No-Go:** If cost per session exceeds $0.50, monetization math does not work. Optimize before public launch.

## Risk 5: Onboarding Dropout Rate is High

**The Problem:** The app requires: account creation + microphone permission + language selection + tutorial before the first real game. Each step loses users. If the first voice interaction (the WOW moment) takes too long to reach, users leave.

**Mitigation:**
- Allow "Try without account" (guest mode) -- create account later for save
- Pre-cache the tutorial opening narration at app install
- Make the tutorial start within 60 seconds of first app open
- Keep the tutorial to 5 minutes max (3 is better)
- Show the value (AI speaking dramatically) within 30 seconds
- Track funnel metrics at every onboarding step

**Go/No-Go:** If less than 50% of users who open the app complete the tutorial, redesign onboarding before public launch.

---

# 6. Technical Decisions That Need Resolution

## Decision 1: React Native (RECOMMENDED) vs. Flutter

| Factor | React Native | Flutter |
|--------|-------------|---------|
| **Audio handling** | Good (expo-av, react-native-audio) | Good (just_audio, record) |
| **Hiring pool** | Larger, especially in CZ market | Smaller |
| **Expo ecosystem** | Expo simplifies builds, OTA updates, dev workflow | No equivalent |
| **Performance** | Sufficient for this app (no heavy animation/3D) | Better raw performance |
| **Web support** | React Native Web exists but limited | Flutter Web is strong |
| **Community/packages** | Larger npm ecosystem | Growing but smaller |
| **Developer experience** | TypeScript + hot reload = fast iteration | Dart + hot reload = fast iteration |

**Recommendation: React Native with Expo**

Reasoning:
1. The app is NOT performance-intensive (no 3D, no complex animations beyond dice roll). React Native is more than sufficient.
2. Expo provides enormous DX benefits: managed builds, OTA updates (can push fixes without store review), simplified audio handling.
3. Larger hiring pool matters for a Czech startup. Finding React Native devs is easier than Flutter devs.
4. The npm ecosystem has better OpenAI SDK support and more audio libraries.
5. TypeScript provides strong type safety that Dart also provides, so no advantage to Flutter here.

**Risk if we choose React Native:** Audio recording/playback may require ejecting from Expo managed workflow if expo-av has limitations. Mitigation: start with managed workflow; eject to bare workflow only if needed.

---

## Decision 2: Backend -- Node.js (RECOMMENDED) vs. Python FastAPI

| Factor | Node.js (Express/Fastify) | Python (FastAPI) |
|--------|---------------------------|-------------------|
| **Streaming support** | Excellent (native streams, SSE) | Good (async generators) |
| **OpenAI SDK** | Official SDK, well-maintained | Official SDK, well-maintained |
| **Real-time (WebSockets)** | Native strength (Socket.IO) | Possible but less natural |
| **Serverless deployment** | Excellent (Vercel, AWS Lambda) | Good (but cold starts worse) |
| **Type safety** | TypeScript | Python type hints (weaker) |
| **Async performance** | V8 event loop, excellent for I/O-bound | asyncio, good for I/O-bound |
| **Hiring** | Abundant | Abundant |
| **AI/ML ecosystem** | Limited | Excellent (if we need custom models later) |

**Recommendation: Node.js with Fastify + TypeScript**

Reasoning:
1. The backend is primarily an API gateway and AI orchestration layer. It is 100% I/O-bound (calling OpenAI APIs, database queries). Node.js excels at this.
2. Streaming is critical for our latency budget. Node.js has the most mature streaming ecosystem (native streams, SSE, WebSockets via Socket.IO for future multiplayer).
3. Using TypeScript on both frontend (React Native) and backend means one language across the stack. Shared types for API contracts reduce bugs.
4. Serverless deployment on Vercel/Railway is trivially easy with Node.js. Python on serverless has worse cold starts.
5. We do NOT need Python's ML ecosystem -- we are calling OpenAI APIs, not training models.
6. Fastify is significantly faster than Express and has better TypeScript support.

**Risk if we choose Node.js:** If we ever need custom ML models (unlikely for MVP or even Year 1), we'd need a Python microservice. This is acceptable -- add it later if needed.

---

## Decision 3: Auth -- Supabase Auth (RECOMMENDED) vs. Firebase vs. Auth0

| Factor | Supabase Auth | Firebase Auth | Auth0 |
|--------|--------------|---------------|-------|
| **Cost** | Free tier generous | Free tier generous | Free tier limited (7K users) |
| **Email + Password** | Yes | Yes | Yes |
| **Google OAuth** | Yes | Yes (best integration) | Yes |
| **Database bundle** | Comes with PostgreSQL | Firestore (NoSQL) | No database |
| **Self-hostable** | Yes (open source) | No | No |
| **Row Level Security** | Yes (PostgreSQL RLS) | Firestore rules | N/A |
| **React Native SDK** | Community-maintained | Official, mature | Official |
| **Vendor lock-in** | Low (standard PostgreSQL) | High (Google ecosystem) | Medium |

**Recommendation: Supabase Auth + Supabase PostgreSQL**

Reasoning:
1. Supabase provides Auth + PostgreSQL + Storage + Real-time in one platform. For a 4-person team, reducing the number of services to manage is critical.
2. Supabase uses standard PostgreSQL, so there is zero vendor lock-in. If we outgrow Supabase, we migrate to RDS/Aurora with no schema changes.
3. Free tier supports 50K monthly active users -- more than enough for MVP and early growth.
4. Row Level Security (RLS) on PostgreSQL provides database-level access control, which is more secure than application-level checks alone.
5. Supabase is open-source, aligning with the privacy-first brand.

**Risk:** Supabase's React Native SDK is community-maintained. Mitigation: use Supabase JS SDK directly (it works in React Native); Auth is just REST calls under the hood.

---

## Decision 4: State Management (Mobile) -- Zustand (RECOMMENDED)

| Factor | Zustand | Redux Toolkit | MobX | Jotai |
|--------|---------|---------------|------|-------|
| Boilerplate | Minimal | Moderate | Moderate | Minimal |
| Learning curve | Low | Medium | Medium | Low |
| Bundle size | 1.5KB | 11KB | 16KB | 3KB |
| Async support | Built-in | RTK Query | Built-in | Built-in |
| DevTools | Yes | Yes (best) | Yes | Yes |
| TypeScript | Excellent | Excellent | Good | Excellent |

**Recommendation: Zustand**

Reasoning: Minimal boilerplate, tiny bundle, excellent TypeScript support. For a game app with relatively simple state (user session, game state, UI state), Zustand is the right balance of simplicity and power. Redux is overkill; MobX adds unnecessary complexity.

---

## Decision 5: Audio Streaming Format

**Decision needed:** What format does the backend send TTS audio to the mobile app?

**Options:**
1. **Pre-signed URL to audio file (MP3)** -- Backend generates full TTS audio, uploads to S3/R2, returns URL. Mobile downloads and plays.
2. **Streaming audio chunks (PCM/Opus)** -- Backend streams audio chunks in real-time as TTS generates them. Mobile plays chunks as they arrive.
3. **Base64 in JSON response** -- Backend returns audio as base64-encoded data in the API response. No extra download.

**Recommendation: Option 2 (Streaming) as primary, Option 1 (URL) as fallback**

Reasoning: Streaming reduces perceived latency because the app starts playing audio before the full response is generated. However, streaming audio on mobile is more complex. Implementation strategy: start with Option 1 (simpler) in Sprint 1-2, upgrade to Option 2 (streaming) in Sprint 3-4 when the foundation is stable.

---

## Decision 6: Hosting Strategy for MVP

**Recommendation: Start simple, scale later.**

| Service | Provider | Why |
|---------|----------|-----|
| API Hosting | Railway or Render | Better than Vercel for long-running requests (AI calls take 5-10s); no serverless timeout issues |
| Database | Supabase (managed PostgreSQL) | Bundled with Auth; generous free tier |
| Cache | Upstash Redis | Serverless Redis; pay-per-request; no idle cost |
| File Storage (TTS audio, images) | Cloudflare R2 | No egress fees (critical for audio files); S3-compatible |
| CDN | Cloudflare | Free tier; automatic with R2; global edge network |
| Error Monitoring | Sentry | Industry standard; free tier sufficient |
| Analytics | Mixpanel or Amplitude | Free tier for basic event tracking |

**Why NOT Vercel for backend:** Vercel serverless functions have a 10-second timeout on the free plan and 60-second on Pro. Our AI pipeline (STT -> LLM -> TTS) can take 5-15 seconds. Railway/Render give us persistent servers with no timeout limits.

**Monthly cost estimate for MVP:** ~$100-200/month (excluding OpenAI API costs)

---

## Decision 7: OpenAI Model Versions (Pin Specific Versions)

**Recommendation:**
- LLM: `gpt-4o-mini-2024-07-18` (pin to specific version; do NOT use `gpt-4o-mini` alias which auto-updates)
- STT: `whisper-1`
- TTS: `tts-1` (standard quality) or `tts-1-hd` (higher quality, higher cost) -- start with `tts-1` for MVP
- Images: `gpt-image-1` with size `1024x1024` and quality `low` for speed

**Why pin versions:** Model updates can change behavior, tone, and quality. In a voice-first app where the AI IS the product, an unexpected behavior change is catastrophic. Pin versions, test new versions in staging, and upgrade deliberately.

---

# Summary: What Happens Next

This plan is ready for handoff to:

1. **Solutions Architect / Tech Lead:** Review technical decisions (Section 6), validate architecture, refine API design.
2. **Backend Developer:** Start Sprint 1 tasks immediately. The API spec draft is the first deliverable.
3. **Mobile Developer:** Start Sprint 1 tasks immediately. Focus on Expo setup and audio testing.
4. **AI/Prompt Engineer:** Start writing prompts immediately (Sprint 1, Week 1). The DM prompt is the #1 priority.
5. **QA Lead:** Write the test strategy document (Sprint 1). Start writing test cases.
6. **DevOps:** Provision infrastructure (Sprint 1, Week 1). CI/CD is the first deliverable.

**The single most important thing to get right in the first 2 weeks:** The voice loop latency. If STT -> LLM -> TTS takes too long, nothing else matters. Sprint 1-2 must prove that sub-3-second voice-to-voice is achievable.

---

*Document created: March 25, 2026*
*Author: Planner A (Product & Architecture Strategist)*
*Status: Ready for team review and Sprint 1 kickoff*
