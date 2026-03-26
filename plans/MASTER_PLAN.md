# QUESTCAST MVP -- MASTER PLAN
## Consolidated Development Blueprint
### Version 1.0 | March 25, 2026

> This is the **single source of truth** for the Questcast MVP. It merges the Product Plan (Planner A), Technical Architecture (Planner B), and Devil's Advocate critique into one actionable document. **All contradictions are resolved. All decisions are FINAL.**

---

# PART 1: RESOLVED DECISIONS

All ambiguities between plans are settled here. These decisions are **non-negotiable** for MVP.

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Backend Framework** | Node.js + Fastify + TypeScript | Streaming-first, same-language stack, Planner B's ADR-002 |
| **Mobile Framework** | React Native + Expo SDK 52 | Larger talent pool, Expo DX, sufficient for audio |
| **Navigation** | Expo Router (file-based) | Built on React Navigation, better DX with Expo |
| **State Management** | Zustand | Lightweight, TypeScript-native, no boilerplate |
| **Hosting (Backend)** | Railway | Long-running processes needed for streaming/WebSocket |
| **Database** | Supabase (PostgreSQL + Auth) | Bundled services, EU data residency, open source |
| **Cache** | Upstash Redis | Serverless-friendly, pay-per-use |
| **Analytics** | PostHog | Open-source, feature flags, session replay, free tier |
| **Monitoring** | Sentry + PostHog | Errors in Sentry, product analytics in PostHog |
| **Payments (Phase 2)** | RevenueCat + Stripe | Industry standard; NOT built in MVP |
| **CI/CD** | GitHub Actions | Native GitHub integration, free for public repos |
| **Latency Target** | p50 < 2.0s, p95 < 3.0s, hard fail > 5.0s | Sprint 2 goal: <3s; final goal: <2s at p50 |
| **Auto-save** | Every 5 turns | Less DB write pressure; sufficient for recovery |
| **Image Generation** | DALL-E 3 (verify API name before Sprint 4) | "GPT Image 1 Mini" needs API verification |
| **VAD (Voice Detection)** | Push-to-talk (tap to start, tap to stop) | Skip automatic VAD for MVP -- unsolved UX problem |
| **Monorepo** | Simple folder structure (no Turborepo) | `backend/` + `mobile/` + `shared/` with TS path aliases |
| **Genre/Difficulty** | Hardcode: Fantasy, Standard, Epic narrator | Schema includes columns; UI does NOT expose selection |
| **Monetization in MVP** | Track usage data only; enforce nothing | Schema ready, RevenueCat NOT integrated |
| **Content Rating** | Default: Teen | Hardcoded for MVP; settings screen shows but doesn't change behavior |
| **Target Market** | Czech-first IF quality passes Week 2 test; English-first otherwise | Decision point at end of Week 2 |

---

# PART 2: MVP SCOPE

## P0 Features (MUST ship)

| # | Feature | Owner |
|---|---------|-------|
| 1 | Voice Input (STT via Whisper) | Backend + Mobile |
| 2 | AI Storytelling (GPT-4o-mini) | Backend + AI Engineer |
| 3 | Voice Output (TTS streaming) | Backend + Mobile |
| 4 | Text Fallback Display | Mobile |
| 5 | Single Player Mode | Backend + Mobile |
| 6 | Session Save/Load | Backend + Mobile |
| 7 | User Authentication (email + Google OAuth) | Backend + Mobile |
| 8 | Game State Management (character, inventory, location, quest) | Backend |
| 9 | Content Safety Filter (output + **input** moderation) | Backend + AI Engineer |
| 10 | Error/Fallback Handling (all AI services) | Backend + Mobile |
| 11 | **Player Input Moderation** (OpenAI Moderation API) | Backend |
| 12 | **Conversation Memory** (10-turn summary mechanism) | Backend + AI Engineer |

## P1 Features (include if time permits in Sprint 5-6)

| # | Feature | Owner |
|---|---------|-------|
| 1 | AI Scene Images (2/session) | Backend + Mobile |
| 2 | Basic Character Creation (name + class) | Mobile |
| 3 | Dice Rolling (visual + haptic) | Mobile + Backend |
| 4 | Tutorial/Onboarding (5-min guided adventure) | AI Engineer + Mobile |
| 5 | Settings Screen (language toggle CZ/EN) | Mobile |
| 6 | Session Timer (subtle display) | Mobile |

## Explicitly OUT of MVP (The Wall)

Monetization, multiplayer, multiple genres, referral program, achievements, adventure pass, UGC, B2B education, multiple narrator voices, rewarded ads, push notifications, custom analytics dashboard, offline mode, German localization, iOS.

---

# PART 3: TEAM STRUCTURE & AGENT ASSIGNMENTS

## 6 Agent Roles

### Agent 1: Backend Developer
**Agent Type:** `backend-engineer`
**Responsibilities:**
- REST API (Fastify + TypeScript) -- all game endpoints
- AI orchestration pipeline: STT -> LLM -> TTS -> Image
- Streaming: LLM sentence-by-sentence -> TTS starts before LLM finishes
- PostgreSQL schema (via Prisma) + Redis caching
- Supabase Auth integration (JWT)
- Game state management (save/load/update)
- Player input moderation (OpenAI Moderation API)
- Output content filtering
- Rate limiting + cost monitoring per session
- API documentation (OpenAPI/Swagger)
- **Model abstraction layer** -- all AI calls go through a service layer, never direct OpenAI SDK calls

**Key Endpoints:**
```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/game/session          (create new)
GET  /api/game/session/:id      (load)
GET  /api/game/sessions         (list user's sessions)
POST /api/game/session/:id/turn (player action -> AI response, SSE streaming)
POST /api/game/session/:id/save
POST /api/game/session/:id/dice (roll + AI interpretation)
POST /api/game/image            (generate scene image)
GET  /api/user/profile
```

---

### Agent 2: Mobile Developer
**Agent Type:** `frontend-engineer`
**Responsibilities:**
- React Native (Expo) app targeting Android
- All screens: Splash, Auth, Home, Game Session, Character Creation, Settings
- Audio recording (push-to-talk, expo-av)
- Audio streaming playback (TTS responses)
- SSE client with `Last-Event-ID` reconnection
- Text fallback display (scrollable transcript)
- Dice rolling animation + haptic feedback
- App lifecycle handling (background/foreground, auto-save trigger)
- Error state UIs for all failure scenarios
- Accessibility: screen reader, 48dp touch targets, AA contrast
- APK size budget: **<50MB** (audio assets to CDN)
- Client-side latency telemetry (mic release -> first audio play -> PostHog)

**Key Screens:**
```
(app)/
  _layout.tsx        -- root layout
  index.tsx          -- splash/welcome
  (auth)/
    login.tsx
    register.tsx
  (main)/
    home.tsx          -- session list + "New Adventure"
    new-game.tsx      -- character creation
    game/[id].tsx     -- game session (the core screen)
    settings.tsx
```

---

### Agent 3: AI/Prompt Engineer
**Agent Type:** `prompt-engineer`
**Responsibilities:**
- Dungeon Master system prompt (Czech + English)
- All prompt templates: scene, combat, dice, cliffhanger, recap, tutorial
- Image generation prompts (consistent art style)
- Content safety rules (prompt-level filtering)
- Fallback response templates (for API failures)
- Game state JSON schema (what gets injected into prompts)
- **Conversation summary mechanism** (every 10 turns, generate 100-token narrative summary)
- Token optimization (target: <150 tokens output per turn)
- Czech language quality tuning (dramatic, idiomatic, NOT robotic)
- **Week 2 Czech quality gate**: coordinate native speaker review; recommend CZ-first or EN-first
- Prompt test suite (automated quality, safety, length checks)
- A/B testing framework for prompt variants

**Key Deliverables:**
```
prompts/
  system_prompt_base_cs.txt
  system_prompt_base_en.txt
  scene_description.txt
  combat.txt
  dice_interpretation.txt
  cliffhanger.txt
  recap.txt
  tutorial.txt
  image_scene.txt
  image_character.txt
  content_safety_rules.txt
  fallback_responses.json
  game_state_schema.json
tests/
  prompt_quality_suite/
```

---

### Agent 4: QA Lead / Tester
**Agent Type:** `qa-specialist`
**Responsibilities:**
- Test strategy document (covering all P0/P1 features)
- Backend: unit tests (Jest) + integration tests (Supertest) -- 80%+ coverage
- Mobile: E2E tests (Detox) for critical flows -- 60%+ coverage
- Manual exploratory testing of game experience
- Voice interaction testing across devices (5 Android devices minimum)
- AI response quality evaluation (coherence, safety, length, language)
- Edge case marathon: network failures, background/foreground, low memory, phone calls
- Load testing: k6 with 100 concurrent sessions on `/session/:id/turn`
- Device compatibility matrix (Samsung Galaxy S24, Galaxy A54, Pixel 7a, Xiaomi Redmi Note 13, OPPO A58)
- Beta coordination: 500 users, feedback surveys, success metrics
- Release criteria checklist
- Bug triage and severity classification (GitHub Issues)
- **Czech quality testing**: coordinate with native speaker reviewer
- **Adversarial safety testing**: attempt to jailbreak content filters
- **Client-side latency monitoring**: verify p50/p95 from telemetry data

**Test Matrix Focus:**
| Test Type | When | Target |
|-----------|------|--------|
| Unit tests (backend) | Every PR | 80% coverage |
| Integration tests (API) | Every PR | All endpoints |
| E2E tests (mobile) | Nightly | Critical flows |
| Performance/latency | Sprint 3, 5 | p50<2s, p95<3s |
| Load test (100 concurrent) | Sprint 4 | <5% error rate |
| Device compatibility | Sprint 4-5 | 5 devices pass |
| Czech quality review | Sprint 3-4 | Native speaker 7+/10 |
| Security/adversarial | Sprint 4-5 | No jailbreaks |

---

### Agent 5: DevOps Engineer
**Agent Type:** `devops-engineer`
**Responsibilities:**
- Cloud infrastructure: Railway (API), Supabase (DB+Auth), Upstash (Redis), Cloudflare (CDN+R2)
- CI/CD: GitHub Actions -- backend lint+test+deploy on merge, mobile APK build on PR
- Environment management: dev / staging / production
- Sentry error tracking (backend + mobile)
- PostHog analytics setup
- Domain setup: api.questcast.app / api-staging.questcast.app
- SSL/TLS configuration
- CDN for TTS audio caching + image caching
- OpenAI API key management + cost alerting (daily spend alerts)
- Database backups (automated daily)
- APK bundle size check in CI (fail if >50MB)
- Google Play Store developer account + app signing
- **On-call setup**: PagerDuty (free tier), 2-person rotation for beta weeks
- Deployment runbook for production releases
- **SSE event buffering** infrastructure for reconnection

---

### Agent 6: Devil's Advocate (Ongoing)
**Agent Type:** `risk-assessor`
**Responsibilities:**
- Review every sprint deliverable against the master plan
- Challenge scope additions ("Is this really P0?")
- Monitor risk dashboard weekly
- Validate latency metrics against targets
- Flag when the team is over-engineering or under-engineering
- Ensure Czech quality gate is enforced at Week 2
- Raise red flags EARLY, not at the end of a sprint

---

# PART 4: SPRINT PLAN (12 Weeks / 6 Sprints)

## Pre-Sprint 0: Day 0 Actions (Before any code)

- [ ] Resolve all contradictions (this document does that)
- [ ] Set up GitHub repo with branch protection
- [ ] Set up project board (GitHub Projects)
- [ ] All agents read this Master Plan
- [ ] Domain registration: questcast.app

---

## Sprint 1: Foundation & Latency Spike (Weeks 1-2)

**CRITICAL: Week 1 includes a NON-NEGOTIABLE latency prototype.**

### Goals
1. Infrastructure up and running (all environments)
2. **Latency spike completed** -- measure real p50/p95 voice loop latency from EU
3. Auth system working
4. AI prompt v1 delivered
5. Mobile app skeleton running on device

### Backend Developer
- [ ] Initialize Fastify + TypeScript project
- [ ] PostgreSQL schema: users, characters, game_sessions, game_events, user_preferences
- [ ] Auth endpoints: register, login, refresh (JWT via Supabase Auth)
- [ ] OpenAI SDK integration: Whisper, GPT-4o-mini, TTS
- [ ] **LATENCY SPIKE**: CLI tool that records audio -> Whisper -> GPT-4o-mini -> TTS -> plays audio. Measure p50/p95 from Railway EU. Report by end of Week 1.
- [ ] OpenAPI spec draft for Mobile Developer

### Mobile Developer
- [ ] Initialize Expo project with TypeScript
- [ ] Expo Router navigation: splash, auth, home, game, settings
- [ ] Login/Register screens (connect to Supabase Auth)
- [ ] Home screen (session list + "New Adventure" button)
- [ ] **Audio spike**: test expo-av recording + playback on 3 Android devices
- [ ] Report audio compatibility by end of Week 1

### AI/Prompt Engineer
- [ ] Dungeon Master system prompt v1 (Czech + English)
- [ ] Prompt templates: scene, combat, dice, content safety rules
- [ ] Game state JSON schema
- [ ] Manual testing: 10 sessions against GPT-4o-mini API
- [ ] Token usage report: avg tokens/response, cost/session estimate
- [ ] Deliver prompt files + docs to Backend Developer

### QA Lead
- [ ] Write test strategy document
- [ ] Set up Jest (backend) + Detox (mobile)
- [ ] Auth flow test cases
- [ ] Bug severity classification + GitHub Issues labels
- [ ] Define device test matrix (5 devices)

### DevOps
- [ ] Provision: Railway, Supabase, Upstash Redis, Cloudflare
- [ ] GitHub Actions: backend CI (lint + test + deploy staging)
- [ ] GitHub Actions: mobile build APK on PR
- [ ] Sentry setup (backend + mobile)
- [ ] Domain: api-staging.questcast.app
- [ ] Secrets management (environment variables)

### Sprint 1 Gate
- **PASS**: Latency p95 < 3.5s from EU -> proceed as planned
- **YELLOW**: Latency p95 3.5-5.0s -> evaluate Deepgram (STT) + ElevenLabs (TTS) alternatives in Sprint 2
- **FAIL**: Latency p95 > 5.0s -> STOP. Re-evaluate architecture before proceeding.

---

## Sprint 2: End-to-End Voice Loop (Weeks 3-4)

### Goals
1. Player can speak -> hear AI response in the app (THE milestone)
2. Streaming pipeline working (LLM -> sentence buffer -> TTS)
3. Game session creation + basic game state
4. **Week 2 Czech Quality Gate**: native speaker evaluates Czech AI output

### Backend Developer
- [ ] POST /api/game/session -- create session with character
- [ ] POST /api/game/session/:id/turn -- full pipeline: audio -> STT -> moderation -> LLM -> TTS -> SSE stream
- [ ] Implement streaming: LLM streams sentences -> TTS generates per-sentence -> SSE events to client
- [ ] Game state persistence: save after each turn to Redis (hot), every 5 turns to PostgreSQL (cold)
- [ ] Player input moderation: OpenAI Moderation API before LLM call
- [ ] Basic Redis caching for TTS (common phrases)
- [ ] Model abstraction layer: `aiService.transcribe()`, `aiService.generate()`, `aiService.synthesize()`
- [ ] Zod schema validation for every LLM JSON response

### Mobile Developer
- [ ] Game Session screen: text transcript, mic button (push-to-talk), loading indicator
- [ ] Voice recording: tap -> record -> tap -> send to backend
- [ ] SSE client: receive streaming events -> display text + play audio
- [ ] Audio queue: play TTS segments sequentially without gaps
- [ ] "Dungeon Master is thinking..." animation during processing
- [ ] Connect to session creation API
- [ ] Basic error handling (timeout -> retry -> text fallback)
- [ ] Client-side latency telemetry: track mic_release -> first_audio_play -> send to PostHog

### AI/Prompt Engineer
- [ ] Refine prompts based on Sprint 1 test results
- [ ] Tutorial prompt (5-min guided adventure)
- [ ] Session recap prompt
- [ ] Cliffhanger prompt
- [ ] Optimize: average response <100 tokens
- [ ] **Conversation summary mechanism**: every 10 turns, generate narrative summary
- [ ] 10 sample game scenarios for testing
- [ ] **CZECH QUALITY GATE**: Get native Czech speaker (NOT a developer) to play 5 sessions and rate 1-10
- [ ] Begin prompt test automation

### QA Lead
- [ ] Integration tests for session/turn endpoints
- [ ] Manual testing: voice loop on 3+ devices
- [ ] STT accuracy testing (Czech + English)
- [ ] Document all bugs with reproduction steps
- [ ] Latency measurement from client perspective

### DevOps
- [ ] Redis instance configured for TTS caching
- [ ] S3/R2 bucket for TTS audio files
- [ ] CDN for audio delivery
- [ ] OpenAI cost monitoring (daily spend alerts via Slack)
- [ ] Cold start optimization for Railway

### Sprint 2 Gates
- **Voice Loop**: Player speaks -> hears response in app (binary pass/fail)
- **Latency**: Measured client-side p50 < 3s
- **Czech Quality**: Native speaker rates >= 7/10 -> Czech-first launch. <7/10 -> pivot to English-first.

---

## Sprint 3: Playable Game (Weeks 5-6)

### Goals
1. Full game experience: character, dice, save/load, combat
2. Internal team plays 30-minute sessions
3. Performance baseline established

### Backend Developer
- [ ] Character state: HP tracking, inventory CRUD, level
- [ ] Dice roll endpoint: generate result + AI narration
- [ ] Save/load: full state snapshot + AI recap on load
- [ ] Session listing for home screen
- [ ] Request validation + comprehensive error handling
- [ ] Rate limiting (per-user)
- [ ] Structured logging (all endpoints)
- [ ] SSE reconnection: buffer recent events, support `Last-Event-ID`

### Mobile Developer
- [ ] Character Creation screen (name + class picker with icons)
- [ ] Dice rolling animation (visual d20 + haptic)
- [ ] Save & Quit button + Continue Adventure flow
- [ ] Session list on home screen
- [ ] Auto-save on app background (10s debounce)
- [ ] Character info panel (HP bar, inventory, quest)
- [ ] Mic interaction polish: press animation, waveform, stop
- [ ] Settings screen: language toggle (CZ/EN)
- [ ] SSE reconnection with `Last-Event-ID`

### AI/Prompt Engineer
- [ ] Dice roll interpretation prompts (critical success/fail/normal)
- [ ] Combat prompt refinement (balanced, dramatic, concise)
- [ ] Czech language iteration (incorporate native speaker feedback)
- [ ] Class-specific opening prompts (warrior/mage/rogue/ranger)
- [ ] Optimize game state injection (only relevant data)
- [ ] Quality scoring rubric for automated tests

### QA Lead
- [ ] Full gameplay: 5+ complete 30-minute sessions
- [ ] Save/load reliability testing
- [ ] Character creation edge cases
- [ ] Dice mechanics verification
- [ ] Performance: voice latency, memory usage, battery drain
- [ ] Begin Detox E2E tests for critical flows

### DevOps
- [ ] Performance baseline: p50/p95 for all endpoints
- [ ] Database backup schedule (automated daily)
- [ ] APM monitoring active
- [ ] App size check in CI (fail if >50MB)

---

## Sprint 4: Feature Complete (Weeks 7-8)

### Goals
1. All P0 + P1 features implemented
2. App is feature-complete for MVP
3. Load testing passed

### Backend Developer
- [ ] Image generation endpoint (DALL-E 3 / verified API)
- [ ] Image caching (same description = cached image)
- [ ] Analytics event tracking: session starts/completion/duration/errors
- [ ] Hard session length limit: soft at 45 min, hard at 60 min
- [ ] API documentation complete (Swagger)
- [ ] Load test support: 100 concurrent sessions

### Mobile Developer
- [ ] Scene image display (above transcript at key moments)
- [ ] Tutorial/onboarding flow (5-min guided adventure)
- [ ] Session timer (subtle, non-intrusive)
- [ ] Animation polish: transitions, mic, dice, loading
- [ ] Deep linking foundation (for future sharing)
- [ ] Edge cases: double-tap mic, speaking during narration, rapid nav
- [ ] Accessibility pass: screen reader, touch targets, contrast
- [ ] App icon + splash screen

### AI/Prompt Engineer
- [ ] Finalize all prompt templates (LOCK for beta)
- [ ] Image generation prompts with style consistency
- [ ] Complete automated prompt test suite
- [ ] Performance report: tokens/response, cost/session, quality scores
- [ ] Full prompt architecture documentation

### QA Lead
- [ ] Full regression of all features
- [ ] Edge case testing marathon
- [ ] AI image quality + appropriateness testing
- [ ] Tutorial flow evaluation (fresh user perspective)
- [ ] **Czech quality re-evaluation** with native speaker (hire 10 hours)
- [ ] **Adversarial safety testing** (attempt jailbreaks)
- [ ] Begin beta test plan: user selection, feedback survey

### DevOps
- [ ] Load test: k6, 100 concurrent sessions, measure p50/p95 + error rate
- [ ] Production environment (separate from staging)
- [ ] Production monitoring dashboards
- [ ] Production alerting (PagerDuty)
- [ ] Google Play developer account + app signing

---

## Sprint 5: Polish & Stabilization (Weeks 9-10)

### Goals
1. Bug fixes only -- no new features
2. Performance optimization
3. Beta infrastructure ready
4. Store listing prepared

### Backend Developer
- [ ] Fix all P0/P1 bugs from QA
- [ ] Performance optimization (based on profiling)
- [ ] Cost optimization (TTS caching improvements)
- [ ] Database query optimization
- [ ] API rate limiting tuning

### Mobile Developer
- [ ] Fix all P0/P1 bugs from QA
- [ ] Performance: startup time <3s, smooth animations
- [ ] Memory leak hunting
- [ ] Final device compatibility testing
- [ ] Store listing assets: screenshots, feature graphic, description

### AI/Prompt Engineer
- [ ] Final prompt tuning based on QA feedback
- [ ] Verify Czech quality improvements
- [ ] Cost-per-session final measurement
- [ ] Prompt documentation update

### QA Lead
- [ ] Regression testing (full suite)
- [ ] Device compatibility: all 5 devices pass
- [ ] Performance verification: latency targets met
- [ ] Release criteria checklist verification
- [ ] Beta feedback collection system ready (in-app survey)

### DevOps
- [ ] Production deployment rehearsal
- [ ] On-call rotation setup (PagerDuty, 2 people)
- [ ] Deployment runbook finalized
- [ ] Google Play AI content disclosure prepared
- [ ] Backup verification (restore test)

---

## Sprint 6: Beta Launch (Weeks 11-12)

### Goals
1. 500 beta users playing
2. Collect structured feedback
3. Fix critical bugs in real-time
4. Google Play Store submission

### All Agents
- [ ] Beta launch (500 users via closed access)
- [ ] Monitor: crash rate, latency, AI costs, session completion
- [ ] Daily bug triage and hotfix rotation
- [ ] Collect feedback: in-app survey + direct interviews
- [ ] Fix critical and high bugs immediately
- [ ] Google Play Store submission (if beta metrics pass)

### Beta Success Criteria
| Metric | Target | Failure Threshold |
|--------|--------|-------------------|
| First session completion | >70% | <50% |
| Crash rate | <5% | >10% |
| Voice loop latency (p50) | <2.5s | >4s |
| D1 retention | >40% | <25% |
| App Store readiness | Approved | Rejected |
| Czech quality (user rating) | >3.5/5 | <2.5/5 |
| Critical bugs | <5 open | >15 open |

---

# PART 5: RISK DASHBOARD

## Top 5 Fatal Risks (from Devil's Advocate)

| # | Risk | Score | Mitigation | Decision Point |
|---|------|-------|-----------|----------------|
| 1 | Voice latency >4s | 9/9 | Week 1 spike; Deepgram/ElevenLabs fallback | End of Week 1 |
| 2 | Czech AI quality too low | 6/9 | Native speaker test; EN-first pivot ready | End of Week 4 |
| 3 | OpenAI single point of failure | 6/9 | Model abstraction layer; fallback responses | Continuous |
| 4 | Negative unit economics | 6/9 | Cost tracking from Day 1; 5% conversion baseline | Monthly review |
| 5 | Team burnout at Month 2 | 6/9 | No scope creep; no weekends; weekly health check | Weekly |

## Devil's Advocate Recommended Changes (incorporated)

| # | Change | Status in this plan |
|---|--------|-------------------|
| 1 | Unified latency target | DONE -- p50<2s, p95<3s |
| 2 | Backend framework finalized | DONE -- Fastify |
| 3 | Analytics tool standardized | DONE -- PostHog |
| 4 | Player input moderation as P0 | DONE -- added as P0-11 |
| 5 | Conversation memory solution | DONE -- 10-turn summary, P0-12 |
| 6 | Client-side latency telemetry | DONE -- Sprint 2, Mobile |
| 7 | SSE reconnection logic | DONE -- Sprint 3 |
| 8 | Zod LLM output validation | DONE -- Sprint 2, Backend |
| 9 | Hard session length limit | DONE -- Sprint 4, 45/60 min |
| 10 | Realistic conversion (5% base) | DONE -- noted in assumptions |
| 11 | Push-to-talk (skip VAD) | DONE -- resolved decision |
| 12 | Drop Turborepo | DONE -- simple folder structure |
| 13 | Model abstraction layer | DONE -- Sprint 2, Backend |
| 14 | On-call for beta | DONE -- Sprint 5, DevOps |
| 15 | Czech copywriter review | DONE -- Sprint 4, QA coordinates |
| 16 | APK size budget 50MB | DONE -- Sprint 3, DevOps CI check |
| 17 | Google Play AI disclosure | DONE -- Sprint 5, DevOps |
| 18 | App size in CI | DONE -- Sprint 3 |

---

# PART 6: KEY ASSUMPTIONS (HONEST)

| Assumption | Base Case | Optimistic | Notes |
|------------|-----------|------------|-------|
| Free-to-paid conversion | 5% | 8% | NOT 12% -- plan financials accordingly |
| Cost per session | $0.20 | $0.15 | TTS is the cost killer; monitor char count |
| Voice latency (p50) | 2.0-2.5s | <2.0s | From EU; 3s is acceptable with good UX |
| Beta download-to-play rate | 70% | 80% | ~350 of 500 invitees actually play |
| Beta D1 retention | 40% | 55% | Need >40% to validate core loop |
| 3-month timeline | Achievable with P0 only | Includes P1 | P1 features are stretch goals |

---

# PART 7: WORKFLOW & COMMUNICATION

## Daily
- Async standup (Slack/Discord): What I did, what I'm doing, blockers
- No meetings unless a blocker requires synchronous discussion

## Weekly
- Sprint progress review (30 min)
- Devil's Advocate risk check (15 min)
- Team health check: "1-5, how sustainable is this pace?"

## Sprint Boundaries
- Sprint planning (1 hour): review goals, assign tasks
- Sprint retro (30 min): what worked, what didn't, what to change
- Demo: show working software to the team

## Code Standards
- All PRs require 1 review before merge
- Backend: TypeScript strict mode, ESLint, Prettier
- Mobile: TypeScript strict mode, ESLint, Prettier
- Conventional commits: feat/fix/docs/refactor/test/chore
- No secrets in code -- ever
- No `eslint-disable` for non-existent rules

---

# APPENDIX: File Structure

```
questcast/
  backend/
    src/
      routes/          -- Fastify route handlers
      services/        -- Business logic (game, ai, auth)
      ai/              -- AI service abstraction layer
      models/          -- Prisma models + Zod schemas
      middleware/       -- Auth, rate limiting, moderation
      utils/
    prisma/
      schema.prisma
      migrations/
    tests/
    package.json
  mobile/
    app/               -- Expo Router file-based routes
      (auth)/
      (main)/
    components/        -- Reusable UI components
    hooks/             -- Custom hooks (useAudio, useGame, useSSE)
    stores/            -- Zustand stores
    services/          -- API client
    assets/
    package.json
  shared/
    types/             -- Shared TypeScript types
    constants/
  prompts/             -- All AI prompt templates
    tests/             -- Prompt quality test suite
  .github/
    workflows/         -- CI/CD
  README.md
  package.json         -- Workspace root (npm workspaces, NOT Turborepo)
```

---

*This Master Plan is the single source of truth. When in doubt, check this document. When this document is silent, ask the Devil's Advocate.*

*Created: March 25, 2026*
*Status: Ready for development kickoff*
