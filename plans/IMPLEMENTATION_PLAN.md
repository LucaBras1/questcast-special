# QUESTCAST SPECIAL - Detailed Implementation Plan
## Based on All 9 Strategy Documents + MASTER_PLAN
### Created: March 26, 2026

---

# PROJECT STATE ASSESSMENT

## What EXISTS (Scaffolded/Partial)

| Area | Status | Completeness |
|------|--------|-------------|
| **Monorepo Structure** | Complete | 100% |
| **Database Schema (Prisma)** | Defined, no migrations run | 90% |
| **Backend Routes** | Scaffolded, no real logic | 30% |
| **AI Service Abstraction** | Interfaces defined, no implementation | 20% |
| **Mobile Pages** | All screens created, minimal logic | 20% |
| **Mobile Components** | 11 components, mostly empty shells | 15% |
| **Shared Types/Constants** | Complete | 100% |
| **Prompt Templates** | 40+ files, comprehensive | 95% |
| **CI/CD Pipelines** | 3 GitHub Actions workflows | 80% |
| **Docker Compose** | Dev environment ready | 100% |
| **Documentation** | 9 strategy docs + test docs | 100% |
| **Tests** | Structure exists, tests are empty | 10% |

## What NEEDS TO BE BUILT

### Critical Path (P0 - Must Ship)
1. **Backend AI Pipeline** - STT -> LLM -> TTS streaming chain
2. **Backend Auth** - Working JWT auth with Supabase
3. **Backend Game Logic** - Session CRUD, turn processing, state management
4. **Mobile Voice Loop** - Record -> Send -> Receive stream -> Play audio
5. **Mobile Game Screen** - The core interactive game experience
6. **Mobile Auth Screens** - Functional login/register
7. **Content Safety** - Input/output moderation
8. **Error Handling** - Graceful degradation for all AI services
9. **Conversation Memory** - 10-turn summary mechanism
10. **SSE Streaming** - Real-time event delivery with reconnection

### Stretch (P1)
11. AI Scene Images (2/session)
12. Character Creation (name + class)
13. Dice Rolling (visual + haptic)
14. Tutorial/Onboarding
15. Settings (language toggle)
16. Session Timer

---

# IMPLEMENTATION PHASES

## Phase 1: Infrastructure & Latency Validation (Sprint 1 - Weeks 1-2)

### 1.1 Backend Foundation
**Owner: Backend Developer**
- [ ] Run initial Prisma migration (`npx prisma migrate dev`)
- [ ] Implement Supabase Auth integration (JWT verification in Fastify)
- [ ] Complete auth routes: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`
- [ ] Implement OpenAI SDK calls in `ai-service.ts`:
  - `transcribe()` - Whisper API call with audio buffer
  - `generateNarration()` - GPT-4o-mini chat completion
  - `generateNarrationStream()` - Streaming chat completion with sentence buffering
  - `synthesizeSpeech()` - OpenAI TTS API call
  - `moderateContent()` - OpenAI Moderation API
- [ ] **LATENCY SPIKE**: Build CLI tool (`scripts/latency-spike.ts`) that:
  1. Records/loads audio file
  2. Sends to Whisper API
  3. Sends transcription to GPT-4o-mini
  4. Sends response to TTS
  5. Measures and reports p50/p95 latency
- [ ] Set up Redis connection (Upstash)
- [ ] Health check endpoint working with DB + Redis checks
- [ ] OpenAPI/Swagger docs serving

### 1.2 Mobile Foundation
**Owner: Mobile Developer**
- [ ] Verify Expo project builds and runs on Android emulator
- [ ] Implement functional Login screen (Supabase Auth)
- [ ] Implement functional Register screen
- [ ] Implement auth state management in `authStore.ts` (Zustand)
- [ ] Home screen: fetch and display user's sessions from API
- [ ] **AUDIO SPIKE**: Test `expo-av` recording + playback on 3 Android devices
- [ ] Set up API client (`services/api.ts`) with auth token injection
- [ ] Navigation guards (redirect to auth if not logged in)

### 1.3 AI/Prompts Validation
**Owner: Prompt Engineer**
- [ ] Validate all existing prompt templates against GPT-4o-mini API
- [ ] Run 10 test sessions, measure: token usage, response quality, language quality
- [ ] Optimize system prompts for token efficiency (<150 tokens output)
- [ ] Verify Czech language quality (idiomatic, dramatic, not robotic)
- [ ] Document: avg tokens/response, cost/session estimate

### 1.4 DevOps
**Owner: DevOps Engineer**
- [ ] Provision Railway project (staging environment)
- [ ] Provision Supabase project (DB + Auth)
- [ ] Provision Upstash Redis
- [ ] Configure Sentry (backend + mobile DSN)
- [ ] Set up PostHog analytics
- [ ] Configure GitHub Actions secrets for all environments
- [ ] Domain setup: api-staging.questcast.app

### 1.5 QA Foundation
**Owner: QA Lead**
- [ ] Write first real unit tests for auth routes
- [ ] Set up test database in CI (verify backend-ci.yml works)
- [ ] Define bug severity classification
- [ ] Set up GitHub Issues with labels from `docs/issue-labels.md`

### Sprint 1 Gate Criteria
| Metric | Pass | Yellow | Fail |
|--------|------|--------|------|
| Voice latency p95 | <3.5s | 3.5-5.0s | >5.0s |
| Auth working E2E | Yes | - | No |
| Mobile builds on device | Yes | - | No |
| CI/CD pipeline green | Yes | - | No |

---

## Phase 2: End-to-End Voice Loop (Sprint 2 - Weeks 3-4)

### 2.1 Backend - Core Game Pipeline
- [ ] `POST /api/game/session` - Create session with character data
- [ ] `POST /api/game/session/:id/turn` - **THE critical endpoint**:
  1. Receive audio blob from client
  2. STT via Whisper -> transcription text
  3. Input moderation via OpenAI Moderation API
  4. Build prompt: system + game state + history summary + recent turns + user input
  5. Stream LLM response (GPT-4o-mini) with sentence buffering
  6. For each sentence: generate TTS audio chunk
  7. Send SSE events: `turn_start`, `transcription`, `narration_chunk` (text+audio), `turn_end`
- [ ] Game state persistence: save to Redis (hot) after each turn, PostgreSQL every 5 turns
- [ ] Model abstraction layer: all AI calls through `aiService` interface
- [ ] Zod validation for all LLM JSON responses
- [ ] Basic TTS caching in Redis (hash of text -> audio URL)
- [ ] **Conversation summary**: every 10 turns, generate 100-token narrative summary

### 2.2 Mobile - Voice Interaction
- [ ] Game Session screen (`game/[id].tsx`):
  - Scrollable text transcript
  - Push-to-talk mic button (tap start, tap stop)
  - Loading animation ("Dungeon Master is thinking...")
  - Audio playback queue (sequential TTS segments)
- [ ] Voice recording with `expo-av`: capture, encode, send to backend
- [ ] SSE client (`useSSE.ts`): connect, receive events, handle reconnection
- [ ] Audio player (`useAudioPlayer.ts`): queue and play TTS segments seamlessly
- [ ] Text fallback: always display narration text alongside audio
- [ ] Basic error handling: timeout -> retry -> text-only fallback
- [ ] Client-side latency telemetry: mic_release -> first_audio_play -> PostHog

### 2.3 Week 4 Czech Quality Gate
- [ ] Native Czech speaker plays 5 sessions
- [ ] Rate quality 1-10 on: grammar, naturalness, drama, vocabulary
- [ ] Decision: >= 7/10 -> Czech-first launch; < 7/10 -> English-first pivot

### Sprint 2 Gate Criteria
| Metric | Pass | Fail |
|--------|------|------|
| Voice loop works E2E | Player speaks -> hears AI response | No audio response |
| Client-side latency p50 | <3.0s | >4.0s |
| Czech quality rating | >=7/10 | <5/10 |
| SSE streaming working | Events received in mobile | Connection fails |

---

## Phase 3: Playable Game (Sprint 3 - Weeks 5-6)

### 3.1 Backend
- [ ] Character state management: HP, inventory CRUD, level, abilities
- [ ] `POST /api/game/session/:id/dice` - Roll + AI interpretation
- [ ] Save/load: full state snapshot + AI recap on session load
- [ ] `GET /api/game/sessions` - List user's sessions for home screen
- [ ] Per-user rate limiting
- [ ] Structured logging for all endpoints
- [ ] SSE reconnection: buffer recent events, support `Last-Event-ID`
- [ ] Request validation hardening

### 3.2 Mobile
- [ ] Character Creation screen (`new-game.tsx`): name input + class picker (warrior/mage/rogue/ranger)
- [ ] Dice rolling animation with haptic feedback (`DiceRoller.tsx` + `useDiceRoll.ts`)
- [ ] Save & Quit button + Continue Adventure flow
- [ ] Session list on home screen with `SessionCard.tsx`
- [ ] Character info panel (`CharacterPanel.tsx`): HP bar, inventory, quest
- [ ] Auto-save on app background (10s debounce)
- [ ] Mic interaction polish: press animation, waveform visualization
- [ ] Settings screen: language toggle (CZ/EN)
- [ ] `ConnectionStatus.tsx` component for network state
- [ ] SSE reconnection with `Last-Event-ID`

### 3.3 QA
- [ ] Full gameplay: 5+ complete 30-minute sessions
- [ ] Save/load reliability testing
- [ ] Character creation edge cases
- [ ] Dice mechanics verification
- [ ] Performance profiling: voice latency, memory, battery drain
- [ ] Begin E2E tests (Detox) for critical flows

### Sprint 3 Gate
- Internal team can play a full 30-minute game session
- Save/load works reliably
- Character creation + class selection working
- Performance baseline established

---

## Phase 4: Feature Complete (Sprint 4 - Weeks 7-8)

### 4.1 Backend
- [ ] Image generation endpoint (`POST /api/game/image`) using DALL-E 3
- [ ] Image caching (same prompt hash = cached image)
- [ ] Analytics event tracking: session starts/completion/duration/errors
- [ ] Hard session length limits: soft warning at 45 min, hard stop at 60 min
- [ ] API documentation complete (Swagger)
- [ ] Load test support: 100 concurrent sessions

### 4.2 Mobile
- [ ] Scene image display (`SceneImage.tsx`): show AI-generated images at key moments
- [ ] Tutorial/onboarding flow (`tutorial.tsx`): 5-min guided adventure
- [ ] Session timer (subtle display)
- [ ] Animation polish: transitions, mic button, dice, loading states
- [ ] Edge cases: double-tap mic, speaking during narration, rapid navigation
- [ ] Accessibility pass: screen reader labels, 48dp touch targets, AA contrast
- [ ] App icon + splash screen design
- [ ] `CombatOverlay.tsx` for combat sequences

### 4.3 QA
- [ ] Full regression of all features
- [ ] Edge case testing marathon
- [ ] AI image quality + appropriateness testing
- [ ] Tutorial flow evaluation (fresh user perspective)
- [ ] Czech quality re-evaluation with native speaker
- [ ] **Adversarial safety testing**: attempt to jailbreak content filters
- [ ] Begin beta test plan preparation

### 4.4 DevOps
- [ ] Load test: k6, 100 concurrent sessions
- [ ] Production environment (separate from staging)
- [ ] Production monitoring dashboards
- [ ] Production alerting (PagerDuty)
- [ ] Google Play developer account + app signing

### Sprint 4 Gate
- All P0 + P1 features implemented and working
- Load test: <5% error rate at 100 concurrent sessions
- No critical or high-severity open bugs
- Adversarial testing passed (no jailbreaks)

---

## Phase 5: Polish & Stabilization (Sprint 5 - Weeks 9-10)

### All Agents - Bug Fix Only (NO new features)
- [ ] Fix all P0/P1 bugs from QA
- [ ] Backend performance optimization (profiling-guided)
- [ ] TTS caching improvements (target 35% cost reduction)
- [ ] Database query optimization
- [ ] Mobile: startup time <3s, smooth 60fps animations
- [ ] Memory leak hunting
- [ ] Final device compatibility testing (5 Android devices)
- [ ] Store listing assets: screenshots, feature graphic, description
- [ ] Production deployment rehearsal
- [ ] On-call rotation setup
- [ ] Deployment runbook finalized
- [ ] Google Play AI content disclosure

### Sprint 5 Gate
- All P0/P1 bugs fixed
- Performance targets met (p50 <2s, p95 <3s)
- 5 Android devices pass compatibility
- Store listing assets ready

---

## Phase 6: Beta Launch (Sprint 6 - Weeks 11-12)

### Beta Operations
- [ ] Deploy to production
- [ ] Invite 500 beta users (closed access)
- [ ] Monitor: crash rate, latency, AI costs, session completion
- [ ] Daily bug triage and hotfix rotation
- [ ] Collect feedback: in-app survey + direct interviews
- [ ] Fix critical and high bugs immediately
- [ ] Google Play Store submission (if beta metrics pass)

### Beta Success Criteria
| Metric | Target | Failure |
|--------|--------|---------|
| First session completion | >70% | <50% |
| Crash rate | <5% | >10% |
| Voice latency p50 | <2.5s | >4s |
| D1 retention | >40% | <25% |
| Czech quality (user rating) | >3.5/5 | <2.5/5 |
| Critical bugs | <5 open | >15 open |

---

# TECHNOLOGY STACK (CONFIRMED)

| Component | Technology | Status |
|-----------|-----------|--------|
| Backend Runtime | Node.js 20 + TypeScript | Configured |
| Backend Framework | Fastify 5 | Configured |
| ORM | Prisma 6 | Schema defined |
| Database | PostgreSQL 16 (Supabase) | Schema ready |
| Cache | Upstash Redis | Client configured |
| Mobile | React Native + Expo SDK 52 | Scaffolded |
| Navigation | Expo Router 4 | Configured |
| State Management | Zustand 5 | Stores created |
| LLM | GPT-4o-mini | Service layer ready |
| STT | Whisper API | Service layer ready |
| TTS | OpenAI TTS (tts-1) | Service layer ready |
| Image Gen | DALL-E 3 | Endpoint scaffolded |
| Auth | Supabase Auth (JWT) | Middleware ready |
| Analytics | PostHog | SDK configured |
| Error Tracking | Sentry | SDK configured |
| CI/CD | GitHub Actions | 3 workflows ready |
| Hosting | Railway | Config exists |
| CDN | Cloudflare | Planned |

---

# AGENT TEAM ASSIGNMENTS

| Agent | Type | Primary Responsibilities |
|-------|------|------------------------|
| **Backend Developer** | `backend-engineer` | API endpoints, AI pipeline, game logic, auth, streaming |
| **Mobile Developer** | `frontend-engineer` | React Native app, voice UI, game screens, animations |
| **Prompt Engineer** | `prompt-engineer` | AI prompts, quality testing, Czech language, token optimization |
| **QA Lead** | `qa-specialist` | Testing strategy, unit/integration/E2E tests, bug triage |
| **DevOps Engineer** | `devops-engineer` | Infrastructure, CI/CD, monitoring, deployment |
| **Risk Assessor** | `risk-assessor` | Sprint reviews, scope control, risk monitoring |

---

# CRITICAL RISKS TO MONITOR

| Risk | Score | Mitigation | Decision Point |
|------|-------|-----------|----------------|
| Voice latency >4s | 9/9 | Week 1 spike; Deepgram/ElevenLabs fallback | End of Week 1 |
| Czech AI quality low | 6/9 | Native speaker test; EN-first pivot ready | End of Week 4 |
| OpenAI single point of failure | 6/9 | Model abstraction layer; fallback responses | Continuous |
| Negative unit economics | 6/9 | Cost tracking from Day 1; caching aggressive | Monthly |
| Scope creep | 6/9 | Strict P0/P1 separation; Devil's Advocate | Every sprint |

---

# ESTIMATED EFFORT

| Phase | Duration | Key Milestone |
|-------|----------|--------------|
| Phase 1: Foundation | 2 weeks | Latency validated, auth working, mobile runs |
| Phase 2: Voice Loop | 2 weeks | Player speaks -> hears AI in app |
| Phase 3: Playable Game | 2 weeks | 30-min game session possible |
| Phase 4: Feature Complete | 2 weeks | All P0+P1 features working |
| Phase 5: Polish | 2 weeks | Bug-free, performant, store-ready |
| Phase 6: Beta | 2 weeks | 500 users playing, feedback collected |
| **TOTAL** | **12 weeks** | **Google Play submission** |

---

*This plan is derived from: 01_Questcast_PRD, 02_Technical_Architecture, 03_Business_Plan, 04_Marketing_Strategy, 05_Development_Roadmap, 06_Risk_Management, 07_AI_Prompt_Engineering, 08_Scaling_Strategy, 09_Privacy_Policy, MASTER_PLAN, and current codebase state assessment.*

*Repository: https://github.com/LucaBras1/questcast-special*
*Created: March 26, 2026*
