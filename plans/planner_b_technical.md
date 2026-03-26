# QUESTCAST -- Technical Architecture Plan (Planner B)
## Version 1.0 | March 2026

**Role:** Technical Architect
**Scope:** MVP (Phase 1, Months 1-3) with forward-looking design for Phase 2-4
**Audience:** Developer agents, engineering team, CTO

---

# Table of Contents

1. [System Architecture (MVP)](#1-system-architecture-mvp)
2. [Technology Stack Decisions](#2-technology-stack-decisions)
3. [Database Schema Design](#3-database-schema-design)
4. [API Design](#4-api-design)
5. [AI Pipeline Architecture](#5-ai-pipeline-architecture)
6. [Mobile App Architecture](#6-mobile-app-architecture)
7. [Infrastructure & DevOps](#7-infrastructure--devops)
8. [Security Considerations](#8-security-considerations)
9. [Performance Budget](#9-performance-budget)
10. [Technical Risks & Mitigations](#10-technical-risks--mitigations)

---

# 1. System Architecture (MVP)

## 1.1 Architecture Pattern: Modular Monolith

For the MVP we use a **modular monolith** backend -- a single deployable unit with clearly separated internal modules. This avoids the operational overhead of microservices while keeping the codebase organized for later extraction.

**Rationale:**
- Team of 4 cannot maintain microservices infra
- Single deployment = faster iteration
- Module boundaries allow future extraction into services (e.g. AI pipeline, multiplayer)
- Cheaper to host (single process, single DB)

## 1.2 Component Diagram

```
+------------------------------------------------------------------+
|                        MOBILE CLIENT                              |
|  (React Native / Expo)                                           |
|                                                                    |
|  +------------+  +-------------+  +-----------+  +------------+  |
|  | Audio      |  | Game UI     |  | Auth      |  | Settings   |  |
|  | Recorder   |  | & Narration |  | Screens   |  | & Profile  |  |
|  +-----+------+  +------+------+  +-----+-----+  +-----+------+  |
|        |                |               |               |         |
+--------|----------------|---------------|---------------|----------+
         |                |               |               |
    HTTPS|/WSS       HTTPS|          HTTPS|          HTTPS|
         |                |               |               |
+--------v----------------v---------------v---------------v----------+
|                     API GATEWAY / LOAD BALANCER                    |
|                     (Cloudflare / Vercel Edge)                     |
+--------+----------------------------------------------------------+
         |
+--------v----------------------------------------------------------+
|                    BACKEND (Node.js / Fastify)                     |
|                                                                    |
|  +------------------+  +------------------+  +------------------+ |
|  | Auth Module      |  | Game Module      |  | AI Module        | |
|  | - login/register |  | - sessions       |  | - prompt mgmt    | |
|  | - JWT tokens     |  | - game state     |  | - LLM calls      | |
|  | - profile mgmt   |  | - dice rolls     |  | - TTS pipeline   | |
|  | - subscriptions  |  | - save/load      |  | - STT pipeline   | |
|  +--------+---------+  +--------+---------+  | - image gen      | |
|           |                      |            | - cost tracking  | |
|           |                      |            +--------+---------+ |
|           |                      |                     |           |
|  +--------v----------+-----------v---------------------v---------+|
|  |                   DATA ACCESS LAYER                           ||
|  |  (Prisma ORM / Repository Pattern)                            ||
|  +--------+----------------------------+-------------------------+|
|           |                            |                          |
+-----------v----------------------------v--------------------------+
            |                            |
   +--------v--------+       +----------v----------+
   |   PostgreSQL     |       |      Redis           |
   |   (Supabase)     |       |      (Upstash)       |
   |                  |       |                      |
   | - users          |       | - session cache      |
   | - game_sessions  |       | - TTS audio cache    |
   | - game_events    |       | - rate limiting      |
   | - characters     |       | - real-time state    |
   | - subscriptions  |       | - job queues         |
   +------------------+       +----------------------+
            |
            |           +---------------------------+
            |           |    EXTERNAL SERVICES       |
            |           |                           |
            |           | +----------+ +----------+ |
            |           | | OpenAI   | | OpenAI   | |
            |           | | GPT-4o-  | | Whisper  | |
            |           | | mini     | | API      | |
            |           | +----------+ +----------+ |
            |           |                           |
            |           | +----------+ +----------+ |
            |           | | OpenAI   | | GPT      | |
            |           | | TTS      | | Image 1  | |
            |           | |          | | Mini     | |
            |           | +----------+ +----------+ |
            |           |                           |
            +---------->| +----------+ +----------+ |
                        | |RevenueCat| | Sentry   | |
                        | |(payments)| |(monitor) | |
                        | +----------+ +----------+ |
                        +---------------------------+

   +---------------------------+
   |    OBJECT STORAGE          |
   |    (Cloudflare R2 / S3)    |
   |                           |
   | - generated images        |
   | - cached TTS audio        |
   | - user avatars            |
   | - game assets             |
   +---------------------------+
```

## 1.3 Data Flow: Voice Input to Audio Output

```
VOICE LOOP (target: <2s end-to-end)
=========

1. RECORD          2. UPLOAD           3. STT              4. LLM
   (client)           (client->server)    (server->OpenAI)    (server->OpenAI)
   ~0ms               ~200ms              ~500ms              ~600ms (streaming)
   +--------+         +--------+          +--------+          +--------+
   | Record |-------->| Upload |--------->| Whisper|--------->| GPT-4o |
   | audio  |  opus/  | audio  |  binary  | API    |  text    | -mini  |
   | (VAD)  |  webm   | chunk  |          |        |          |stream  |
   +--------+         +--------+          +--------+          +---+----+
                                                                  |
                                                          streaming tokens
                                                                  |
   7. PLAY            6. STREAM           5. TTS                  |
   (client)           (server->client)    (server->OpenAI)        |
   ~0ms               ~50ms               ~300ms (first chunk)    |
   +--------+         +--------+          +--------+          +---v----+
   | Play   |<--------| Stream |<---------| OpenAI |<---------| Buffer |
   | audio  |  opus/  | audio  |  audio   | TTS    |  text    | until  |
   | to user|  mp3    | chunks |  stream  | stream |  sentence| full   |
   +--------+         +--------+          +--------+          | sentence|
                                                              +--------+

TOTAL LATENCY BUDGET:
- Audio upload:        ~200ms
- STT (Whisper):       ~400-600ms
- LLM first tokens:    ~300-500ms (streaming)
- Sentence buffer:     ~200ms (wait for first complete sentence)
- TTS first audio:     ~200-300ms (streaming)
- Audio stream start:  ~50ms
---------------------------------
  TOTAL:               ~1.4-1.8s to first audio playback
```

## 1.4 Image Generation Pipeline

```
IMAGE GENERATION (async, non-blocking)
======================================

Trigger: LLM response contains [IMAGE_TRIGGER] tag or scene change detected

1. EXTRACT             2. GENERATE            3. CACHE           4. DELIVER
   +--------+          +--------+             +--------+         +--------+
   | Parse  |--------->| GPT    |------------>| Store  |-------->| Push   |
   | scene  |  prompt  | Image  |   image     | in R2/ |  URL    | to     |
   | from   |          | 1 Mini |   (1024x)   | S3     |         | client |
   | LLM    |          |        |             | + CDN  |         | via WS |
   +--------+          +--------+             +--------+         +--------+
                       ~5-8s                   ~200ms            ~50ms

- Images generated ASYNCHRONOUSLY -- they do not block the voice loop
- Client receives image URL via push/polling and fades it in
- MVP limit: 2 images per free session, 10 per premium session
- Cache key: hash(scene_description + art_style + genre)
```

## 1.5 Authentication Flow

```
AUTH FLOW (Supabase Auth)
==========================

REGISTRATION:
  Client                    Backend                   Supabase
    |--- POST /auth/register -->|                        |
    |   {email, password, name} |--- createUser() ------>|
    |                           |<-- {user, session} ----|
    |                           |--- INSERT users ------>| (our DB)
    |<-- {accessToken, user} ---|                        |
    |                           |                        |
    |--- Store tokens ----------|                        |
    |   (SecureStore)           |                        |

LOGIN:
  Client                    Backend                   Supabase
    |--- POST /auth/login ----->|                        |
    |   {email, password}       |--- signIn() ---------->|
    |                           |<-- {session} ----------|
    |<-- {accessToken,          |                        |
    |     refreshToken, user} --|                        |

TOKEN REFRESH:
  Client                    Backend                   Supabase
    |--- POST /auth/refresh --->|                        |
    |   {refreshToken}          |--- refreshSession() -->|
    |                           |<-- {new session} ------|
    |<-- {newAccessToken} ------|                        |

SOCIAL AUTH (Google):
  Client                    Supabase                  Google
    |--- signInWithOAuth ------>|--- OAuth redirect ---->|
    |                           |<-- code ---------------|
    |<-- {session} -------------|                        |

MIDDLEWARE:
  Every API request:
    1. Extract Bearer token from Authorization header
    2. Verify JWT with Supabase secret
    3. Attach user context to request
    4. Check subscription status (cached in Redis, TTL 5min)
```

## 1.6 Game State Management Architecture

```
GAME STATE MANAGEMENT
======================

                    +-------------------+
                    |   Client State    |
                    |   (Zustand)       |
                    |                   |
                    | - UI state        |
                    | - audio state     |
                    | - local game copy |
                    +--------+----------+
                             |
                    Optimistic updates
                    + server sync
                             |
                    +--------v----------+
                    |   Server State    |
                    |   (Redis + PG)    |
                    |                   |
                    | Redis (hot):      |
                    | - active session  |
                    | - turn buffer     |
                    | - conversation    |
                    |   context (last   |
                    |   15 turns)       |
                    |                   |
                    | PostgreSQL (cold): |
                    | - full session    |
                    |   history         |
                    | - character data  |
                    | - saved games     |
                    +-------------------+

STATE UPDATE CYCLE:
  1. Player speaks -> STT -> player_action text
  2. Server loads game_state from Redis
  3. Server sends {system_prompt + game_state + conversation_history + player_action} to LLM
  4. LLM returns {narration, state_updates}
  5. Server applies state_updates to game_state
  6. Server writes updated game_state to Redis
  7. Server async-writes to PostgreSQL (every 5 turns or on save)
  8. Server returns narration to client
  9. Client updates local state

SAVE/LOAD:
  - Auto-save: Every 5 turns, write full state to PostgreSQL
  - Manual save: Immediate flush from Redis to PostgreSQL
  - Load: Read from PostgreSQL, populate Redis, send to client
  - Session resume: Check Redis first (may still have hot state)
```

## 1.7 Error Handling & Fallback Chain

```
ERROR HANDLING STRATEGY
========================

For each AI service, a 3-tier fallback chain:

STT (Speech-to-Text):
  1. OpenAI Whisper API (primary)
  2. Retry with exponential backoff (1s, 2s, 4s)
  3. FALLBACK: Show text input field on client
     -> User types instead of speaks
     -> Log degradation event

LLM (Story Generation):
  1. GPT-4o-mini with streaming (primary)
  2. Retry once with timeout=15s
  3. FALLBACK TIER 1: GPT-3.5-turbo (cheaper, faster, lower quality)
  4. FALLBACK TIER 2: Pre-written continuation responses
     -> Select from genre-appropriate templates
     -> "The adventure continues... What would you like to do?"
     -> Log degradation, alert team if >5% of requests

TTS (Text-to-Speech):
  1. OpenAI TTS with streaming (primary)
  2. Retry once
  3. FALLBACK: Display text on screen with
     -> typewriter animation
     -> "Tap to hear" retry button
     -> Log degradation event

Image Generation:
  1. GPT Image 1 Mini (primary)
  2. No retry (expensive, non-critical)
  3. FALLBACK: Show genre-appropriate placeholder image
     -> Pre-cache 20-30 atmospheric placeholder images per genre
     -> Still a good experience, just not scene-specific

GLOBAL ERROR HANDLING:
  - Circuit breaker pattern: If >50% of calls to a service fail in 60s,
    trip the circuit and use fallback for 30s before retrying
  - All errors logged to Sentry with context (session_id, user_id, service)
  - Client shows graceful in-game messages, never raw errors
  - "The magical energies flicker momentarily..." for transient failures
```

---

# 2. Technology Stack Decisions

## 2.1 Mobile Framework: React Native (Expo, Managed Workflow)

| Option | Pros | Cons |
|--------|------|------|
| **React Native (Expo)** | Largest RN talent pool, OTA updates, Expo AV for audio, fast dev cycle, EAS build/submit | Slightly larger bundle, some native modules need bare workflow |
| React Native (Bare) | Full native access, smaller bundle | More setup, manual linking, slower CI/CD |
| Flutter | Better perf, beautiful UI | Smaller talent pool (especially CZ market), Dart learning curve |

**Decision: React Native with Expo (SDK 52+)**

**Reasoning:**
1. **Hiring:** JavaScript/TypeScript devs are 3-5x more available than Dart devs in Czech Republic
2. **Expo AV:** Excellent audio recording/playback library -- critical for our voice-first app
3. **EAS Build:** Cloud builds + OTA updates = ship fixes without App Store review
4. **Expo Router:** File-based routing, similar to Next.js, fast to build
5. **Audio needs are well-served:** Expo AV handles recording (opus/m4a), playback, audio focus, interruption handling
6. **Risk:** If we hit Expo limitations (e.g., custom native audio processing), we can eject to bare workflow. Expo's "continuous native generation" (CNG) makes this smooth.

## 2.2 Backend: Node.js with Fastify

| Option | Pros | Cons |
|--------|------|------|
| **Node.js (Fastify)** | Streaming-native, same language as frontend, excellent OpenAI SDK, fast JSON serialization | Single-threaded (mitigated by async) |
| Node.js (NestJS) | Structured, DI, decorators | Heavy for MVP, slower startup |
| Python (FastAPI) | Great for AI/ML, good async | Two languages in stack, worse streaming story, team would need Python expertise |
| Python (Django) | Batteries included | Synchronous by default, overkill ORM |

**Decision: Node.js with Fastify + TypeScript**

**Reasoning:**
1. **Streaming is king:** Our core loop is streaming (LLM -> sentence buffer -> TTS -> audio stream -> client). Node.js streams and async iterators are first-class citizens.
2. **OpenAI SDK:** The official `openai` Node.js SDK has excellent streaming support with `stream: true` and async iterators.
3. **Single language:** TypeScript across the entire stack (mobile + backend) = shared types, shared validation schemas (Zod), faster context switching.
4. **Fastify over Express:** 2x faster JSON serialization, built-in schema validation, TypeBox for type-safe schemas, better plugin system.
5. **Why not Python/FastAPI:** While FastAPI is excellent for AI/ML, we are primarily *consuming* AI APIs (not training models). The streaming pipeline is simpler in Node.js, and sharing TypeScript types between mobile and backend eliminates an entire class of bugs.

```typescript
// Shared types example (packages/shared/types.ts)
export interface GameState {
  sessionId: string;
  players: Player[];
  story: StoryState;
  world: WorldState;
  session: SessionMeta;
}
// Used in both mobile app AND backend -- single source of truth
```

## 2.3 Database: PostgreSQL via Supabase

| Option | Pros | Cons |
|--------|------|------|
| **Supabase** | Managed PG + Auth + Realtime + Storage + Free tier, EU region | Vendor lock-in (mitigated: it's just PG), less control |
| AWS RDS | Full control, proven at scale | More expensive at MVP, more setup, no built-in auth |
| Self-hosted | Cheapest long-term | Operational burden, no team for this at MVP |
| PlanetScale/Neon | Serverless scaling | MySQL (PlanetScale) or less mature (Neon) |

**Decision: Supabase (Pro plan, EU region)**

**Reasoning:**
1. **All-in-one for MVP:** PostgreSQL + Auth + Row Level Security + Realtime subscriptions + Object Storage = fewer services to manage
2. **EU data residency:** Supabase has EU region (Frankfurt) -- critical for GDPR
3. **Cost:** Pro plan at $25/month includes 8GB DB, 250GB bandwidth, 100GB storage -- more than enough for MVP
4. **Migration path:** Supabase IS PostgreSQL. If we outgrow it, we pg_dump and move to RDS. Zero vendor lock-in on data.
5. **Auth included:** Supabase Auth handles email/password, Google OAuth, magic links, JWT tokens -- saves 2+ weeks of development
6. **Realtime:** Built-in Realtime feature useful for future multiplayer (Phase 3)

**Scaling trigger to AWS RDS:** When DAU > 5K or we need read replicas.

## 2.4 Cache: Redis via Upstash

| Option | Pros | Cons |
|--------|------|------|
| **Upstash** | Serverless, pay-per-request, global replication, REST API | Slightly higher latency than dedicated |
| AWS ElastiCache | Lowest latency, full Redis | $150+/month minimum, always-on cost |
| Self-hosted Redis | Cheapest | Operational burden |
| Dragonfly | Redis-compatible, more efficient | Less mature ecosystem |

**Decision: Upstash Redis (Pro plan)**

**Reasoning:**
1. **Serverless pricing:** Pay per command, not per hour. At MVP traffic (~500 sessions/day), this is ~$10-20/month vs $150+ for ElastiCache.
2. **Global replication:** Data replicated to EU and US edge -- useful for future expansion.
3. **REST API:** Works from edge functions and serverless environments.
4. **Redis-compatible:** Standard ioredis client works. Migration to ElastiCache is trivial when needed.
5. **Use cases at MVP:**
   - Game session cache (active sessions in Redis, TTL 2h)
   - TTS audio cache (hash -> audio URL, TTL 24h)
   - Rate limiting (sliding window counters)
   - Subscription status cache (TTL 5min)

**Scaling trigger to ElastiCache:** When monthly Upstash bill > $100 or latency p95 > 10ms.

## 2.5 Authentication: Supabase Auth

| Option | Pros | Cons |
|--------|------|------|
| **Supabase Auth** | Bundled with DB, RLS integration, free with Supabase plan | Fewer social providers than Auth0 |
| Firebase Auth | Most providers, proven at scale | Google lock-in, separate from DB |
| Auth0 | Enterprise-grade, every provider | Expensive ($23/month for 1K MAU), overkill |
| Clerk | Beautiful UI components | Expensive, less control |
| Custom JWT | Full control | 4+ weeks to build, security risk |

**Decision: Supabase Auth**

**Reasoning:**
1. **Already using Supabase:** No additional service, no additional cost, no additional SDK
2. **Covers MVP needs:** Email/password, Google OAuth, Apple Sign-In, magic links
3. **JWT-based:** Standard JWTs that our Fastify backend can verify independently
4. **Row Level Security:** Database-level auth policies = defense in depth
5. **Migration path:** JWTs are standard. If we switch auth providers later, we just change the JWT verification key.

## 2.6 Hosting: Vercel (backend) + EAS (mobile builds)

| Option | Pros | Cons |
|--------|------|------|
| **Vercel** | Edge functions, easy deploy, great DX | Cold starts, 30s function timeout (Pro: 300s) |
| AWS (ECS/Fargate) | Full control, no limits | Complex setup, more expensive at low scale |
| Railway | Simple, good DX, long-running processes | Less mature, smaller community |
| Fly.io | Edge deployment, good for real-time | More complex than Vercel |
| Render | Simple, long-running processes | Slower deploys |

**Decision: Railway for backend, Vercel for landing page/docs, EAS for mobile**

**Reasoning -- why NOT Vercel for backend:**
Vercel serverless functions have a critical limitation for our use case -- the voice loop involves streaming that can take 5-10 seconds, and under load, cold starts add latency. Our backend needs to be a **long-running process** (not serverless) because:
- WebSocket connections for future multiplayer
- Streaming responses (LLM -> TTS pipeline) benefit from persistent connections
- Background jobs (image generation, analytics)

**Why Railway:**
1. **Long-running process:** Deploys as a Docker container, always on, no cold starts
2. **Simple:** `railway up` deploys from Dockerfile or nixpacks
3. **Affordable:** $5/month base + usage. At MVP scale: ~$20-40/month
4. **WebSocket support:** Native, no workarounds needed
5. **EU region:** Available, GDPR-friendly
6. **Auto-scaling:** Scales replicas based on CPU/memory/requests

**Fallback/scale-up path:** When DAU > 5K, migrate to AWS ECS/Fargate for more control.

## 2.7 Payments: RevenueCat + App Store/Google Play Billing

| Option | Pros | Cons |
|--------|------|------|
| **RevenueCat** | Abstracts both stores, analytics, A/B testing, webhooks | 1% fee above $2.5K MTR |
| Stripe alone | Full control | Cannot handle App Store subscriptions |
| Adapty | Similar to RevenueCat | Smaller community |
| Custom | No fees | Months of development, compliance burden |

**Decision: RevenueCat**

**Reasoning:**
1. **Mandatory:** App Store and Google Play require in-app purchase for digital goods. We must use their billing systems.
2. **RevenueCat abstracts both:** Single SDK, single webhook endpoint, cross-platform subscription status
3. **Analytics included:** MRR, churn, LTV, trial conversion -- crucial business metrics for free
4. **Server-side verification:** Webhook to our backend on subscription events. No client-side trust.
5. **Entitlements system:** Map subscription tiers to feature access cleanly

```typescript
// RevenueCat entitlements mapping
const ENTITLEMENTS = {
  free: { sessionsPerDay: 1, sessionLength: 45, imagesPerSession: 2, voices: ['default'] },
  adventurer: { sessionsPerDay: 5, sessionLength: 120, imagesPerSession: 5, voices: ['all_standard'] },
  legend: { sessionsPerDay: -1, sessionLength: -1, imagesPerSession: 10, voices: ['all'] },
};
```

## 2.8 Monitoring: Sentry + PostHog + Uptime

| Tool | Purpose | Cost (MVP) |
|------|---------|------------|
| **Sentry** | Error tracking, performance monitoring | $26/month (Team) |
| **PostHog** | Product analytics, session replay, feature flags | Free tier (1M events/month) |
| **BetterStack** | Uptime monitoring, status page | Free tier |

**Reasoning:**
- **Sentry:** Industry standard for crash reporting. React Native + Node.js SDKs. Source maps support.
- **PostHog:** Open-source alternative to Mixpanel/Amplitude. Self-hostable later. Feature flags for A/B testing. Free tier generous enough for MVP.
- **BetterStack (formerly BetterUptime):** Simple uptime checks, status page, incident management. Free for small scale.

**NOT using Datadog/New Relic:** Overkill and expensive ($100+/month) for MVP.

## 2.9 CI/CD: GitHub Actions

**Decision: GitHub Actions**

No alternatives seriously considered -- GitHub Actions is the standard for open-source-friendly CI/CD, integrates directly with our GitHub repo, and the free tier (2,000 minutes/month) covers MVP needs.

```yaml
# Key workflows:
# 1. backend-ci.yml     -- lint, type-check, test on every PR
# 2. backend-deploy.yml -- deploy to Railway on merge to main
# 3. mobile-build.yml   -- EAS Build on release tags
# 4. mobile-submit.yml  -- EAS Submit to App Store/Google Play
```

## 2.10 Complete Stack Summary

```
+-------------------+--------------------+---------------------------+
| Layer             | Technology         | Rationale                 |
+-------------------+--------------------+---------------------------+
| Mobile Framework  | React Native/Expo  | Talent pool, Expo AV,    |
|                   | (SDK 52+)          | OTA updates               |
+-------------------+--------------------+---------------------------+
| Mobile Language   | TypeScript         | Shared types with backend |
+-------------------+--------------------+---------------------------+
| Backend Framework | Fastify + TS       | Streaming, speed, types   |
+-------------------+--------------------+---------------------------+
| Database          | PostgreSQL         | ACID, JSON, proven        |
|                   | (Supabase)         |                           |
+-------------------+--------------------+---------------------------+
| Cache             | Redis (Upstash)    | Serverless, cheap at MVP  |
+-------------------+--------------------+---------------------------+
| Auth              | Supabase Auth      | Bundled, JWT, RLS         |
+-------------------+--------------------+---------------------------+
| Object Storage    | Cloudflare R2      | S3-compatible, no egress  |
|                   |                    | fees, CDN built-in        |
+-------------------+--------------------+---------------------------+
| Backend Hosting   | Railway            | Long-running, WS support  |
+-------------------+--------------------+---------------------------+
| AI - LLM          | GPT-4o-mini        | Cost/quality balance      |
+-------------------+--------------------+---------------------------+
| AI - STT          | Whisper API        | Multilingual, accurate    |
+-------------------+--------------------+---------------------------+
| AI - TTS          | OpenAI TTS         | Natural, streaming        |
+-------------------+--------------------+---------------------------+
| AI - Images       | GPT Image 1 Mini   | Fast, consistent          |
+-------------------+--------------------+---------------------------+
| Payments          | RevenueCat         | Cross-platform subs       |
+-------------------+--------------------+---------------------------+
| Error Tracking    | Sentry             | Industry standard         |
+-------------------+--------------------+---------------------------+
| Analytics         | PostHog            | Free, feature flags       |
+-------------------+--------------------+---------------------------+
| Uptime            | BetterStack        | Free, status page         |
+-------------------+--------------------+---------------------------+
| CI/CD             | GitHub Actions     | Standard, free tier       |
+-------------------+--------------------+---------------------------+
| Mobile Builds     | EAS Build/Submit   | Cloud builds, OTA         |
+-------------------+--------------------+---------------------------+
```

---

# 3. Database Schema Design

## 3.1 Entity-Relationship Diagram

```
+-------------------+       +----------------------+       +-------------------+
|      users        |       |   game_sessions      |       |    characters     |
+-------------------+       +----------------------+       +-------------------+
| PK id (uuid)      |<---+  | PK id (uuid)         |  +--->| PK id (uuid)      |
| email (unique)    |    |  | FK user_id            |  |   | FK user_id        |
| username (unique) |    |  | FK character_id       |--+   | name              |
| display_name      |    |  | status (enum)         |      | class (enum)      |
| avatar_url        |    |  | genre (enum)          |      | race (enum)       |
| language (enum)   |    |  | difficulty (enum)     |      | level (int)       |
| content_rating    |    |  | narrator_style (enum) |      | health (int)      |
| subscription_tier |    |  | game_state (jsonb)    |      | max_health (int)  |
| subscription_exp  |    |  | conversation_ctx      |      | gold (int)        |
| sessions_today    |    |  |   (jsonb)             |      | inventory (jsonb) |
| total_sessions    |    |  | turn_count (int)      |      | abilities (jsonb) |
| created_at        |    |  | images_generated (int)|      | stats (jsonb)     |
| updated_at        |    |  | tokens_used (int)     |      | experience (int)  |
| last_active_at    |    |  | estimated_cost (dec)  |      | created_at        |
| supabase_uid      |    |  | duration_seconds (int)|      | updated_at        |
+-------------------+    |  | created_at            |      +-------------------+
         |               |  | updated_at            |
         |               |  | ended_at              |
         |               |  +----------------------+
         |               |           |
         |               |           | 1:N
         |               |           v
         |               |  +----------------------+
         |               |  |    game_events       |
         |               |  +----------------------+
         |               |  | PK id (uuid)         |
         |               |  | FK session_id        |
         |               |  | event_type (enum)    |
         |               |  | turn_number (int)    |
         |               |  | player_input (text)  |
         |               |  | ai_response (text)   |
         |               |  | state_delta (jsonb)  |
         |               |  | dice_roll (jsonb)    |
         |               |  | image_url (text)     |
         |               |  | tokens_input (int)   |
         |               |  | tokens_output (int)  |
         |               |  | latency_ms (int)     |
         |               |  | created_at           |
         |               |  +----------------------+
         |               |
         |               |  +----------------------+
         +---------------+--| user_preferences     |
         |                  +----------------------+
         |                  | PK id (uuid)         |
         |                  | FK user_id (unique)  |
         |                  | theme (enum)         |
         |                  | tts_voice (varchar)  |
         |                  | auto_play_audio (bool)|
         |                  | show_text (bool)     |
         |                  | push_enabled (bool)  |
         |                  | haptic_feedback (bool)|
         |                  | updated_at           |
         |                  +----------------------+
         |
         |               +------------------------+
         +-------------->| subscription_events    |
         |               +------------------------+
         |               | PK id (uuid)           |
         |               | FK user_id             |
         |               | event_type (enum)      |
         |               | tier (enum)            |
         |               | revenue_cat_id (varchar)|
         |               | platform (enum)        |
         |               | price_usd (decimal)    |
         |               | currency (varchar)     |
         |               | created_at             |
         |               +------------------------+
         |
         |               +------------------------+
         +-------------->| ai_cost_tracking       |
                         +------------------------+
                         | PK id (uuid)           |
                         | FK user_id             |
                         | FK session_id          |
                         | service (enum)         |
                         | model (varchar)        |
                         | tokens_input (int)     |
                         | tokens_output (int)    |
                         | estimated_cost (dec)   |
                         | cached (bool)          |
                         | created_at             |
                         +------------------------+
```

## 3.2 Complete Table Definitions

### users

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_uid UUID UNIQUE NOT NULL,           -- links to Supabase Auth
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  language VARCHAR(5) NOT NULL DEFAULT 'cs',   -- ISO 639-1
  content_rating VARCHAR(10) NOT NULL DEFAULT 'teen',  -- family, teen, mature
  subscription_tier VARCHAR(20) NOT NULL DEFAULT 'free',  -- free, adventurer, legend
  subscription_expires_at TIMESTAMPTZ,
  sessions_today INT NOT NULL DEFAULT 0,
  sessions_today_reset_at DATE NOT NULL DEFAULT CURRENT_DATE,
  total_sessions INT NOT NULL DEFAULT 0,
  total_playtime_seconds BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ                       -- soft delete
);

CREATE INDEX idx_users_supabase_uid ON users(supabase_uid);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_subscription ON users(subscription_tier) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_last_active ON users(last_active_at);
```

### characters

```sql
CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  class VARCHAR(30) NOT NULL,                  -- warrior, mage, rogue, cleric, ranger, bard
  race VARCHAR(30) NOT NULL,                   -- human, elf, dwarf, halfling, orc
  level INT NOT NULL DEFAULT 1,
  experience INT NOT NULL DEFAULT 0,
  health INT NOT NULL DEFAULT 50,
  max_health INT NOT NULL DEFAULT 50,
  gold INT NOT NULL DEFAULT 100,
  inventory JSONB NOT NULL DEFAULT '[]'::jsonb,
  abilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  stats JSONB NOT NULL DEFAULT '{
    "strength": 10, "dexterity": 10, "constitution": 10,
    "intelligence": 10, "wisdom": 10, "charisma": 10
  }'::jsonb,
  backstory TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_characters_user ON characters(user_id);
CREATE INDEX idx_characters_active ON characters(user_id, is_active) WHERE is_active = true;
```

### game_sessions

```sql
CREATE TABLE game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, paused, completed, abandoned
  genre VARCHAR(30) NOT NULL DEFAULT 'fantasy',   -- fantasy, scifi, horror, mystery
  difficulty VARCHAR(20) NOT NULL DEFAULT 'standard',  -- beginner, standard, advanced, hardcore
  narrator_style VARCHAR(20) NOT NULL DEFAULT 'epic',  -- epic, humorous, dark, serious
  game_state JSONB NOT NULL DEFAULT '{}'::jsonb,  -- current world/story state
  conversation_context JSONB NOT NULL DEFAULT '[]'::jsonb,  -- last N turns for LLM context
  turn_count INT NOT NULL DEFAULT 0,
  images_generated INT NOT NULL DEFAULT 0,
  total_tokens_input INT NOT NULL DEFAULT 0,
  total_tokens_output INT NOT NULL DEFAULT 0,
  estimated_cost_usd DECIMAL(8,4) NOT NULL DEFAULT 0,
  duration_seconds INT NOT NULL DEFAULT 0,
  session_length_limit INT NOT NULL DEFAULT 2700,  -- 45 min default (seconds)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX idx_sessions_user ON game_sessions(user_id);
CREATE INDEX idx_sessions_active ON game_sessions(user_id, status) WHERE status = 'active';
CREATE INDEX idx_sessions_created ON game_sessions(created_at);

-- Partition by month for older sessions (implement when table >1M rows)
-- CREATE TABLE game_sessions_y2026m01 PARTITION OF game_sessions
--   FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

### game_events

```sql
CREATE TABLE game_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL,  -- player_action, ai_narration, dice_roll,
                                     -- combat_start, combat_end, scene_change,
                                     -- image_generated, session_start, session_end
  turn_number INT NOT NULL,
  player_input TEXT,                 -- transcribed speech or typed text
  ai_response TEXT,                  -- LLM response text
  state_delta JSONB,                 -- what changed in game_state
  dice_roll JSONB,                   -- {type: "d20", value: 15, modifier: 3, dc: 12, success: true}
  image_url TEXT,                    -- if image was generated for this turn
  tokens_input INT DEFAULT 0,
  tokens_output INT DEFAULT 0,
  latency_ms INT,                   -- end-to-end response time
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_session ON game_events(session_id, turn_number);
CREATE INDEX idx_events_created ON game_events(created_at);
CREATE INDEX idx_events_type ON game_events(event_type);
```

### user_preferences

```sql
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  theme VARCHAR(10) NOT NULL DEFAULT 'dark',     -- dark, light
  tts_voice VARCHAR(30) NOT NULL DEFAULT 'onyx', -- alloy, echo, fable, onyx, nova, shimmer
  auto_play_audio BOOLEAN NOT NULL DEFAULT true,
  show_text_with_audio BOOLEAN NOT NULL DEFAULT false,
  push_notifications BOOLEAN NOT NULL DEFAULT true,
  haptic_feedback BOOLEAN NOT NULL DEFAULT true,
  sound_effects BOOLEAN NOT NULL DEFAULT true,
  background_music BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### subscription_events

```sql
CREATE TABLE subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL,  -- initial_purchase, renewal, cancellation,
                                     -- expiration, billing_issue, refund, upgrade, downgrade
  tier VARCHAR(20) NOT NULL,
  revenue_cat_event_id VARCHAR(255),
  platform VARCHAR(10) NOT NULL,     -- ios, android, web
  price_usd DECIMAL(6,2),
  currency VARCHAR(3),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sub_events_user ON subscription_events(user_id, created_at);
```

### ai_cost_tracking

```sql
CREATE TABLE ai_cost_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES game_sessions(id) ON DELETE SET NULL,
  service VARCHAR(20) NOT NULL,      -- llm, tts, stt, image
  model VARCHAR(50) NOT NULL,        -- gpt-4o-mini, whisper-1, tts-1, gpt-image-1-mini
  tokens_input INT DEFAULT 0,
  tokens_output INT DEFAULT 0,
  audio_seconds DECIMAL(8,2),        -- for TTS/STT
  estimated_cost_usd DECIMAL(8,6) NOT NULL,
  cached BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cost_user ON ai_cost_tracking(user_id, created_at);
CREATE INDEX idx_cost_session ON ai_cost_tracking(session_id);
CREATE INDEX idx_cost_service ON ai_cost_tracking(service, created_at);
-- For daily/monthly aggregation queries
CREATE INDEX idx_cost_date ON ai_cost_tracking(created_at, service);
```

## 3.3 Indexing Strategy

**Primary indexes** (created above with tables):
- All foreign keys indexed
- Composite indexes for common query patterns (user_id + status, user_id + created_at)
- Partial indexes where appropriate (active sessions only, non-deleted users)

**Analytical indexes** (add in Phase 2 when we have data):
```sql
-- For dashboard queries
CREATE INDEX CONCURRENTLY idx_sessions_daily_stats
  ON game_sessions(DATE(created_at), user_id);

-- For cost analysis
CREATE INDEX CONCURRENTLY idx_cost_daily_service
  ON ai_cost_tracking(DATE(created_at), service);
```

## 3.4 Migration Strategy

**Tool:** Prisma Migrate (since we use Prisma ORM on the backend)

**Workflow:**
1. Define schema in `prisma/schema.prisma`
2. `npx prisma migrate dev --name description` in development
3. Migrations auto-generated as SQL files in `prisma/migrations/`
4. `npx prisma migrate deploy` in CI/CD pipeline for staging/production
5. Never edit generated migration files manually
6. Breaking changes require multi-step migrations (add column -> backfill -> drop old column)

```
prisma/
  schema.prisma          # Source of truth
  migrations/
    20260401_init/
      migration.sql
    20260415_add_genres/
      migration.sql
```

---

# 4. API Design

## 4.1 REST API Endpoints

**Base URL:** `https://api.questcast.app/v1`

**Authentication:** All endpoints except `/auth/*` require `Authorization: Bearer <jwt>` header.

### Auth Endpoints

```
POST   /auth/register
  Body: { email: string, password: string, username: string, displayName: string }
  Response: 201 { user: User, accessToken: string, refreshToken: string }

POST   /auth/login
  Body: { email: string, password: string }
  Response: 200 { user: User, accessToken: string, refreshToken: string }

POST   /auth/login/google
  Body: { idToken: string }   -- Google OAuth token from client
  Response: 200 { user: User, accessToken: string, refreshToken: string }

POST   /auth/login/apple
  Body: { identityToken: string, authorizationCode: string }
  Response: 200 { user: User, accessToken: string, refreshToken: string }

POST   /auth/refresh
  Body: { refreshToken: string }
  Response: 200 { accessToken: string, refreshToken: string }

POST   /auth/forgot-password
  Body: { email: string }
  Response: 200 { message: "Reset link sent" }

POST   /auth/logout
  Response: 200 { message: "Logged out" }

DELETE /auth/account
  Response: 200 { message: "Account scheduled for deletion" }
```

### User Endpoints

```
GET    /users/me
  Response: 200 { user: User }

PATCH  /users/me
  Body: { displayName?: string, language?: string, contentRating?: string }
  Response: 200 { user: User }

GET    /users/me/preferences
  Response: 200 { preferences: UserPreferences }

PUT    /users/me/preferences
  Body: { theme?: string, ttsVoice?: string, autoPlayAudio?: boolean, ... }
  Response: 200 { preferences: UserPreferences }

GET    /users/me/stats
  Response: 200 { totalSessions: number, totalPlaytime: number, ... }
```

### Character Endpoints

```
GET    /characters
  Response: 200 { characters: Character[] }

POST   /characters
  Body: { name: string, class: string, race: string, backstory?: string }
  Response: 201 { character: Character }

GET    /characters/:id
  Response: 200 { character: Character }

PATCH  /characters/:id
  Body: { name?: string, backstory?: string }
  Response: 200 { character: Character }

DELETE /characters/:id
  Response: 200 { message: "Character deleted" }
```

### Game Session Endpoints

```
POST   /sessions
  Body: {
    characterId: string,
    genre: "fantasy" | "scifi" | "horror" | "mystery",
    difficulty: "beginner" | "standard" | "advanced" | "hardcore",
    narratorStyle: "epic" | "humorous" | "dark" | "serious"
  }
  Response: 201 {
    session: GameSession,
    introNarration: string,        -- LLM-generated session intro
    introAudioUrl: string          -- TTS audio URL for intro
  }

GET    /sessions
  Query: ?status=active&limit=10&offset=0
  Response: 200 { sessions: GameSession[], total: number }

GET    /sessions/:id
  Response: 200 { session: GameSession, events: GameEvent[] }

POST   /sessions/:id/turn
  Body: {
    audioBlob: binary (multipart)   -- recorded voice
    OR
    textInput: string               -- typed fallback
  }
  Response: 200 (STREAMING - chunked transfer encoding)
  Stream format: Server-Sent Events (SSE)
    event: transcription
    data: { text: "I attack the goblin with my sword" }

    event: narration_start
    data: { }

    event: narration_chunk
    data: { text: "You swing your sword..." }  // repeats

    event: narration_complete
    data: { text: "full narration text", turnNumber: 26 }

    event: audio_url
    data: { url: "https://cdn.questcast.app/tts/abc123.mp3" }

    event: state_update
    data: { healthDelta: -5, goldDelta: 0, inventoryAdd: [], inventoryRemove: [] }

    event: dice_roll
    data: { type: "d20", value: 17, modifier: 3, dc: 15, success: true }

    event: image_generating
    data: { }  // only if scene change triggers image

    event: image_ready
    data: { url: "https://cdn.questcast.app/images/xyz789.webp" }

    event: turn_complete
    data: { turnNumber: 26, tokensUsed: 245, sessionTimeRemaining: 1200 }

POST   /sessions/:id/save
  Response: 200 { message: "Game saved", savedAt: string }

POST   /sessions/:id/end
  Response: 200 {
    summary: { turnsPlayed: number, duration: number, ... },
    cliffhanger: string,           -- LLM-generated cliffhanger
    cliffhangerAudioUrl: string
  }

POST   /sessions/:id/dice-roll
  Body: { diceType: "d20" | "d12" | "d10" | "d8" | "d6" | "d4", modifier?: number }
  Response: 200 { roll: DiceRoll }
```

### Subscription Endpoints

```
GET    /subscriptions/status
  Response: 200 {
    tier: "free" | "adventurer" | "legend",
    expiresAt: string | null,
    entitlements: Entitlements,
    usage: { sessionsToday: number, maxSessionsToday: number }
  }

POST   /subscriptions/webhook    (RevenueCat webhook - no auth, signature verified)
  Body: RevenueCat webhook payload
  Response: 200

GET    /subscriptions/offerings
  Response: 200 { offerings: RevenueCatOffering[] }
```

### Misc Endpoints

```
GET    /health
  Response: 200 { status: "ok", version: "1.0.0", uptime: number }

GET    /voices
  Response: 200 { voices: Voice[] }  -- available TTS voices with samples
```

## 4.2 WebSocket Events (Phase 3 -- Multiplayer)

```
NAMESPACE: /multiplayer

CLIENT -> SERVER:
  join_room      { roomCode: string }
  leave_room     { }
  player_action  { audioBlob: binary | textInput: string }
  dice_roll      { diceType: string }
  send_message   { text: string }  -- chat

SERVER -> CLIENT:
  room_joined       { room: Room, players: Player[] }
  player_joined     { player: Player }
  player_left       { playerId: string }
  turn_start        { playerId: string }
  narration_stream  { chunk: string }
  audio_ready       { url: string }
  state_update      { delta: StateDelta }
  image_ready       { url: string }
  turn_complete     { nextPlayerId: string }
  error             { code: string, message: string }
```

## 4.3 Authentication Middleware

```typescript
// src/middleware/auth.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const token = request.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return reply.status(401).send({
      error: 'UNAUTHORIZED',
      message: 'Missing authorization token',
    });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return reply.status(401).send({
        error: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
      });
    }

    // Attach user to request for downstream handlers
    request.user = {
      supabaseUid: user.id,
      email: user.email!,
    };

    // Load full user profile (cached in Redis for 5 min)
    const cacheKey = `user:${user.id}`;
    let profile = await redis.get(cacheKey);
    if (!profile) {
      profile = await db.users.findUnique({
        where: { supabaseUid: user.id },
      });
      await redis.set(cacheKey, JSON.stringify(profile), 'EX', 300);
    } else {
      profile = JSON.parse(profile);
    }

    request.userProfile = profile;
  } catch (err) {
    return reply.status(500).send({
      error: 'INTERNAL_ERROR',
      message: 'Authentication service unavailable',
    });
  }
}
```

## 4.4 Rate Limiting Strategy

```typescript
// Using @fastify/rate-limit + Redis (Upstash)

// Global rate limit
fastify.register(rateLimit, {
  max: 100,            // requests per window
  timeWindow: '1 minute',
  redis: redisClient,
  keyGenerator: (req) => req.user?.supabaseUid || req.ip,
});

// Per-endpoint rate limits
const RATE_LIMITS = {
  // AI-heavy endpoints -- stricter limits
  'POST /sessions/:id/turn': {
    free:       { max: 30, timeWindow: '1 hour' },   // ~1 turn every 2 min
    adventurer: { max: 150, timeWindow: '1 hour' },
    legend:     { max: 300, timeWindow: '1 hour' },
  },
  'POST /sessions': {
    free:       { max: 3, timeWindow: '1 day' },     // 1 session + retries
    adventurer: { max: 15, timeWindow: '1 day' },
    legend:     { max: 50, timeWindow: '1 day' },
  },
  // Auth endpoints -- prevent brute force
  'POST /auth/login': { max: 10, timeWindow: '15 minutes' },
  'POST /auth/register': { max: 5, timeWindow: '1 hour' },
};
```

## 4.5 Error Response Format

```typescript
// All errors follow this shape
interface ErrorResponse {
  error: string;        // Machine-readable code: "UNAUTHORIZED", "RATE_LIMITED", "SESSION_EXPIRED", etc.
  message: string;      // Human-readable message
  details?: unknown;    // Optional additional info (validation errors, etc.)
  requestId: string;    // For support/debugging
}

// Example responses:
// 400 Bad Request
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid request body",
  "details": [
    { "field": "genre", "message": "Must be one of: fantasy, scifi, horror, mystery" }
  ],
  "requestId": "req_abc123"
}

// 401 Unauthorized
{
  "error": "UNAUTHORIZED",
  "message": "Invalid or expired token",
  "requestId": "req_def456"
}

// 402 Payment Required
{
  "error": "SUBSCRIPTION_REQUIRED",
  "message": "This feature requires an Adventurer subscription",
  "details": { "requiredTier": "adventurer", "currentTier": "free" },
  "requestId": "req_ghi789"
}

// 429 Too Many Requests
{
  "error": "RATE_LIMITED",
  "message": "Too many requests. Please try again in 45 seconds.",
  "details": { "retryAfter": 45 },
  "requestId": "req_jkl012"
}

// 500 Internal Server Error
{
  "error": "INTERNAL_ERROR",
  "message": "Something went wrong. Please try again.",
  "requestId": "req_mno345"
}

// 503 Service Unavailable
{
  "error": "AI_SERVICE_UNAVAILABLE",
  "message": "AI service is temporarily unavailable. Using fallback.",
  "requestId": "req_pqr678"
}
```

---

# 5. AI Pipeline Architecture

## 5.1 Detailed Flow: User Voice to Response Audio

```
DETAILED AI PIPELINE
=====================

STEP 1: AUDIO CAPTURE (Client)
  - Expo AV records audio in opus/webm format
  - Voice Activity Detection (VAD) on client detects speech end
  - Audio chunk uploaded as multipart form data
  - Typical audio: 3-15 seconds, 20-100KB

STEP 2: SPEECH-TO-TEXT (Server)
  POST https://api.openai.com/v1/audio/transcriptions
  Model: whisper-1
  Config:
    language: user.language (e.g., "cs" for Czech)
    response_format: "json"
    temperature: 0
  Cost: ~$0.006/minute of audio
  Latency: ~400-600ms for typical input

STEP 3: CONTEXT ASSEMBLY (Server)
  Build LLM prompt:
    system_prompt = loadPromptTemplate('dungeon_master', {
      narrator_style: session.narratorStyle,
      difficulty_level: session.difficulty,
      content_rating: user.contentRating,
      language: user.language,
    })

    game_state = session.gameState  // from Redis

    conversation_history = session.conversationContext  // last 15 turns

    messages = [
      { role: "system", content: system_prompt },
      { role: "system", content: `Current game state:\n${JSON.stringify(game_state)}` },
      ...conversation_history,
      { role: "user", content: transcribedText },
    ]

  Token budget check:
    total_tokens = countTokens(messages)
    if total_tokens > 3500:
      // Trim oldest conversation turns
      trimConversationHistory(conversation_history, targetTokens=3000)

STEP 4: LLM GENERATION (Server -> OpenAI, STREAMING)
  POST https://api.openai.com/v1/chat/completions
  Model: gpt-4o-mini
  Config:
    messages: assembled_messages
    max_tokens: 200
    temperature: 0.8
    stream: true
    response_format: { type: "json_object" }  // structured output

  Expected JSON response:
    {
      "narration": "You swing your sword at the goblin...",
      "stateUpdates": {
        "healthDelta": 0,
        "enemyHealthDelta": -15,
        "inventoryAdd": [],
        "inventoryRemove": []
      },
      "shouldGenerateImage": false,
      "imagePrompt": null,
      "diceRollRequired": false,
      "diceRollType": null,
      "diceRollDC": null
    }

  Cost: ~$0.00015/1K input tokens, ~$0.0006/1K output tokens
  Typical cost per turn: ~$0.001-0.003

STEP 5: SENTENCE BUFFERING (Server)
  As LLM tokens stream in:
    buffer += token
    if (isSentenceComplete(buffer)):
      // Send sentence to TTS immediately
      enqueueTTSSentence(buffer)
      // Send text chunk to client via SSE
      sendSSE('narration_chunk', { text: buffer })
      buffer = ""

STEP 6: TEXT-TO-SPEECH (Server -> OpenAI, per sentence)
  POST https://api.openai.com/v1/audio/speech
  Model: tts-1 (or tts-1-hd for premium)
  Config:
    voice: user.preferences.ttsVoice (default: "onyx")
    input: sentence_text
    response_format: "opus"  // smaller than mp3
    speed: 1.0

  Cost: ~$0.015/1K characters
  Typical cost per turn: ~$0.002-0.005

  OPTIMIZATION: Check TTS cache first
    cacheKey = hash(sentence_text + voice + speed)
    cached = await redis.get(`tts:${cacheKey}`)
    if (cached):
      return cached.audioUrl  // skip API call entirely

  If not cached:
    audio = await openai.audio.speech.create(...)
    audioUrl = await uploadToR2(`tts/${cacheKey}.opus`, audio)
    await redis.set(`tts:${cacheKey}`, audioUrl, 'EX', 86400)  // cache 24h
    return audioUrl

STEP 7: AUDIO DELIVERY (Server -> Client)
  SSE event: audio_url { url: audioUrl }
  Client receives URL and starts playback immediately
  Multiple sentences = multiple audio URLs = gapless queue playback

STEP 8: STATE UPDATE (Server)
  Apply stateUpdates from LLM response:
    - Update game_state in Redis
    - Append to conversation_context (trim if >15 turns)
    - Every 5 turns: flush to PostgreSQL
    - Send state_update SSE to client

STEP 9: IMAGE GENERATION (Async, if triggered)
  If shouldGenerateImage:
    // Fire and forget -- don't block the voice loop
    backgroundJob.enqueue('generateImage', {
      sessionId: session.id,
      imagePrompt: response.imagePrompt,
      artStyle: session.genre === 'horror' ? 'dark_atmospheric' : 'epic_fantasy',
    })

  Background job:
    POST https://api.openai.com/v1/images/generations
    Model: gpt-image-1-mini
    Config:
      prompt: imagePrompt
      size: "1024x1024"
      quality: "low"  // faster, cheaper for MVP

    Cost: ~$0.02/image (mini quality)
    Latency: ~5-8 seconds

    Upload to R2, send image_ready SSE to client
```

## 5.2 Prompt Management System

```
src/
  ai/
    prompts/
      index.ts                  -- prompt loader & renderer
      templates/
        dungeon-master.hbs      -- main DM system prompt (Handlebars)
        scene-description.hbs   -- scene generation
        combat.hbs              -- combat narration
        cliffhanger.hbs         -- session end
        character-creation.hbs  -- character creation guidance
        image-scene.hbs         -- image generation prompt
        image-portrait.hbs      -- character portrait prompt
      locales/
        cs.json                 -- Czech-specific prompt additions
        en.json                 -- English-specific prompt additions
        de.json                 -- German-specific prompt additions
      fallbacks/
        generic.json            -- pre-written fallback responses by genre
    config.ts                   -- model configs, token limits, costs
    cost-tracker.ts             -- per-request cost calculation
    cache.ts                    -- TTS/LLM cache layer
```

```typescript
// src/ai/prompts/index.ts
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { join } from 'path';

const templateCache = new Map<string, HandlebarsTemplateDelegate>();

export function renderPrompt(
  templateName: string,
  variables: Record<string, unknown>
): string {
  if (!templateCache.has(templateName)) {
    const path = join(__dirname, 'templates', `${templateName}.hbs`);
    const source = readFileSync(path, 'utf-8');
    templateCache.set(templateName, Handlebars.compile(source));
  }

  const template = templateCache.get(templateName)!;
  return template(variables);
}

// Usage:
const systemPrompt = renderPrompt('dungeon-master', {
  narrator_style: session.narratorStyle,
  difficulty_level: session.difficulty,
  content_rating: user.contentRating,
  language: locale.language_instruction,  // "Odpovídej vždy v češtině..."
  game_state_json: JSON.stringify(session.gameState),
});
```

## 5.3 Token Budget Management

```typescript
// src/ai/config.ts
export const AI_CONFIG = {
  models: {
    primary: 'gpt-4o-mini',
    fallback: 'gpt-3.5-turbo',
    image: 'gpt-image-1-mini',
    stt: 'whisper-1',
    tts: 'tts-1',
  },
  tokenLimits: {
    systemPrompt: 800,        // ~800 tokens for system prompt
    gameState: 500,           // ~500 tokens for game state JSON
    conversationHistory: 2000, // ~2000 tokens for last 15 turns
    playerInput: 200,         // ~200 tokens for current input
    maxResponse: 200,         // ~200 tokens for LLM response
    // Total context: ~3700 tokens (well within 128K window)
  },
  costs: {
    // Per 1K tokens (USD)
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    'whisper-1': { perMinute: 0.006 },
    'tts-1': { per1KChars: 0.015 },
    'gpt-image-1-mini': { perImage: 0.02 },
  },
  budgets: {
    // Max cost per session before warning/limiting
    freeSessionMaxCost: 0.15,      // ~$0.15 for a 45-min free session
    paidSessionMaxCost: 0.50,      // ~$0.50 for a 2-hour premium session
    dailyUserMaxCost: 2.00,        // hard cap per user per day
    monthlyBudgetAlert: 5000,      // alert if monthly AI costs exceed $5K
  },
};
```

```typescript
// src/ai/cost-tracker.ts
export class CostTracker {
  private sessionCost: number = 0;

  trackLLM(tokensInput: number, tokensOutput: number, model: string) {
    const costs = AI_CONFIG.costs[model];
    const cost = (tokensInput / 1000 * costs.input) +
                 (tokensOutput / 1000 * costs.output);
    this.sessionCost += cost;
    this.checkBudget();
    return cost;
  }

  trackTTS(characterCount: number) {
    const cost = (characterCount / 1000) * AI_CONFIG.costs['tts-1'].per1KChars;
    this.sessionCost += cost;
    return cost;
  }

  trackSTT(durationSeconds: number) {
    const cost = (durationSeconds / 60) * AI_CONFIG.costs['whisper-1'].perMinute;
    this.sessionCost += cost;
    return cost;
  }

  trackImage() {
    const cost = AI_CONFIG.costs['gpt-image-1-mini'].perImage;
    this.sessionCost += cost;
    return cost;
  }

  private checkBudget() {
    if (this.sessionCost > AI_CONFIG.budgets.freeSessionMaxCost) {
      // Emit warning event -- middleware can decide to shorten responses
      // or switch to cheaper model
    }
  }
}
```

## 5.4 Caching Layers

```
CACHE ARCHITECTURE
===================

LAYER 1: TTS AUDIO CACHE (Redis + R2)
  Key: tts:{hash(text + voice + speed)}
  Value: R2 URL of pre-generated audio
  TTL: 24 hours (Redis pointer), audio file permanent in R2
  Expected hit rate: 30-40% (common phrases, repeated scenes)
  Savings: ~$0.003/hit (TTS API call avoided)

  Pre-warm cache with:
  - 100+ common game phrases per language
  - Session intro/outro templates
  - Combat announcements ("Roll for initiative!", "Critical hit!", etc.)
  - UI sounds narration ("Game saved", "Session ending soon", etc.)

LAYER 2: IMAGE CACHE (R2 with Redis index)
  Key: img:{hash(scene_description + art_style)}
  Value: R2 URL of generated image
  TTL: 7 days (Redis index), images permanent in R2
  Expected hit rate: 15-25% (generic scenes reused across sessions)
  Savings: ~$0.02/hit (image generation avoided)

  Strategy:
  - Normalize image prompts (remove player-specific details)
  - Cache by scene TYPE not exact description
  - Pre-generate 50+ generic scene images per genre at startup

LAYER 3: LLM RESPONSE CACHE (Redis)
  Key: llm:{hash(system_prompt_hash + last_3_turns + action_type)}
  Value: Full LLM JSON response
  TTL: 5 minutes
  Expected hit rate: 5-10% (exact same context rare, but happens with retries)
  Note: Low hit rate but prevents double-billing on retries/reconnects

OVERALL SAVINGS PROJECTION:
  Without caching:  $0.20/session average
  With caching:     $0.13/session average
  Savings:          35%
```

## 5.5 Streaming Implementation

```typescript
// src/ai/pipeline.ts -- core voice loop pipeline

import OpenAI from 'openai';
import { FastifyReply } from 'fastify';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function processVoiceTurn(
  audioBuffer: Buffer,
  session: GameSession,
  user: UserProfile,
  reply: FastifyReply
) {
  // Set up SSE
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const sendSSE = (event: string, data: unknown) => {
    reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const costTracker = new CostTracker();

  try {
    // STEP 1: STT
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: new File([audioBuffer], 'audio.webm', { type: 'audio/webm' }),
      language: user.language,
      response_format: 'json',
    });

    costTracker.trackSTT(audioBuffer.length / 16000); // rough estimate
    sendSSE('transcription', { text: transcription.text });

    // STEP 2: Assemble context
    const messages = assembleContext(session, user, transcription.text);

    // STEP 3: Stream LLM response
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 200,
      temperature: 0.8,
      stream: true,
    });

    let fullResponse = '';
    let sentenceBuffer = '';
    let sentenceIndex = 0;
    const ttsPromises: Promise<void>[] = [];

    sendSSE('narration_start', {});

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || '';
      fullResponse += token;
      sentenceBuffer += token;

      // Check if we have a complete sentence
      if (isSentenceEnd(sentenceBuffer)) {
        const sentence = sentenceBuffer.trim();
        sentenceBuffer = '';

        // Send text chunk immediately
        sendSSE('narration_chunk', { text: sentence });

        // Kick off TTS for this sentence (non-blocking)
        const idx = sentenceIndex++;
        ttsPromises.push(
          generateAndSendTTS(sentence, user, costTracker, sendSSE, idx)
        );
      }
    }

    // Handle any remaining text in buffer
    if (sentenceBuffer.trim()) {
      sendSSE('narration_chunk', { text: sentenceBuffer.trim() });
      ttsPromises.push(
        generateAndSendTTS(sentenceBuffer.trim(), user, costTracker, sendSSE, sentenceIndex)
      );
    }

    // Track LLM cost
    costTracker.trackLLM(
      countTokens(messages),
      countTokens(fullResponse),
      'gpt-4o-mini'
    );

    // Parse structured response and apply state updates
    const parsed = parseAIResponse(fullResponse);
    await applyStateUpdates(session, parsed.stateUpdates);

    sendSSE('narration_complete', {
      text: parsed.narration,
      turnNumber: session.turnCount + 1,
    });

    sendSSE('state_update', parsed.stateUpdates);

    // Wait for all TTS to complete
    await Promise.all(ttsPromises);

    // Trigger image generation if needed (async, non-blocking)
    if (parsed.shouldGenerateImage && session.imagesGenerated < getImageLimit(user)) {
      generateImageAsync(session, parsed.imagePrompt, sendSSE, costTracker);
    }

    // Persist cost tracking
    await persistCosts(costTracker, user.id, session.id);

    sendSSE('turn_complete', {
      turnNumber: session.turnCount + 1,
      estimatedCost: costTracker.getSessionCost(),
      sessionTimeRemaining: getRemainingTime(session, user),
    });

  } catch (error) {
    // Fallback chain
    if (error.code === 'rate_limit_exceeded') {
      await handleWithFallbackModel(session, user, reply);
    } else {
      sendSSE('error', { message: 'The magical energies flicker momentarily...' });
      sendSSE('fallback_narration', {
        text: getFallbackResponse(session.genre, session.gameState),
      });
    }
  } finally {
    reply.raw.end();
  }
}

async function generateAndSendTTS(
  text: string,
  user: UserProfile,
  costTracker: CostTracker,
  sendSSE: Function,
  index: number
) {
  const voice = user.preferences?.ttsVoice || 'onyx';
  const cacheKey = `tts:${hashString(text + voice)}`;

  // Check cache
  let audioUrl = await redis.get(cacheKey);

  if (!audioUrl) {
    // Generate TTS
    const audioResponse = await openai.audio.speech.create({
      model: 'tts-1',
      voice,
      input: text,
      response_format: 'opus',
    });

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    audioUrl = await uploadToR2(`tts/${cacheKey}.opus`, audioBuffer);
    await redis.set(cacheKey, audioUrl, 'EX', 86400);
    costTracker.trackTTS(text.length);
  }

  sendSSE('audio_url', { url: audioUrl, index });
}

function isSentenceEnd(text: string): boolean {
  return /[.!?]\s*$/.test(text) || /[.!?]["']\s*$/.test(text);
}
```

---

# 6. Mobile App Architecture

## 6.1 Project Structure

```
questcast-mobile/
|
+-- app/                          # Expo Router (file-based routing)
|   +-- (auth)/                   # Auth group (no tab bar)
|   |   +-- login.tsx
|   |   +-- register.tsx
|   |   +-- forgot-password.tsx
|   |
|   +-- (tabs)/                   # Main tab navigation
|   |   +-- _layout.tsx           # Tab bar layout
|   |   +-- index.tsx             # Home / Active sessions
|   |   +-- characters.tsx        # Character list
|   |   +-- profile.tsx           # Profile & settings
|   |
|   +-- game/                     # Game screens (modal stack)
|   |   +-- [sessionId].tsx       # Active game session
|   |   +-- new.tsx               # New game setup
|   |   +-- summary.tsx           # Session summary
|   |
|   +-- character/
|   |   +-- create.tsx            # Character creation
|   |   +-- [id].tsx              # Character detail
|   |
|   +-- settings/
|   |   +-- index.tsx             # Settings menu
|   |   +-- audio.tsx             # Audio preferences
|   |   +-- subscription.tsx      # Subscription management
|   |   +-- privacy.tsx           # Privacy settings
|   |
|   +-- _layout.tsx               # Root layout (providers, auth gate)
|   +-- +not-found.tsx
|
+-- src/
|   +-- components/
|   |   +-- ui/                   # Generic UI components
|   |   |   +-- Button.tsx
|   |   |   +-- Card.tsx
|   |   |   +-- Text.tsx
|   |   |   +-- LoadingOverlay.tsx
|   |   |
|   |   +-- game/                 # Game-specific components
|   |   |   +-- NarrationDisplay.tsx    # Typewriter text + audio
|   |   |   +-- VoiceButton.tsx         # Push-to-talk button
|   |   |   +-- DiceRoller.tsx          # Animated dice roll
|   |   |   +-- GameImage.tsx           # Scene image with loading
|   |   |   +-- HealthBar.tsx           # Player health display
|   |   |   +-- InventoryPanel.tsx      # Item list
|   |   |   +-- TurnIndicator.tsx       # Whose turn it is
|   |   |
|   |   +-- character/
|   |   |   +-- CharacterCard.tsx
|   |   |   +-- StatBlock.tsx
|   |   |   +-- ClassPicker.tsx
|   |   |   +-- RacePicker.tsx
|   |
|   +-- hooks/
|   |   +-- useAudioRecorder.ts         # Voice recording with VAD
|   |   +-- useAudioPlayer.ts           # Queue-based audio playback
|   |   +-- useGameSession.ts           # Game session state & SSE
|   |   +-- useAuth.ts                  # Authentication state
|   |   +-- useSubscription.ts          # RevenueCat subscription
|   |   +-- useDiceRoll.ts              # Dice roll with animation
|   |
|   +-- stores/
|   |   +-- authStore.ts                # Zustand: auth state
|   |   +-- gameStore.ts                # Zustand: active game state
|   |   +-- settingsStore.ts            # Zustand: persisted settings
|   |   +-- audioStore.ts               # Zustand: audio playback queue
|   |
|   +-- services/
|   |   +-- api.ts                      # API client (fetch + auth headers)
|   |   +-- sse.ts                      # SSE client for game turns
|   |   +-- auth.ts                     # Supabase auth service
|   |   +-- storage.ts                  # SecureStore for tokens
|   |   +-- analytics.ts               # PostHog wrapper
|   |   +-- purchases.ts               # RevenueCat wrapper
|   |
|   +-- utils/
|   |   +-- formatters.ts              # Duration, numbers, etc.
|   |   +-- haptics.ts                 # Haptic feedback wrapper
|   |   +-- sounds.ts                  # Sound effects
|   |
|   +-- constants/
|   |   +-- theme.ts                   # Colors, typography, spacing
|   |   +-- config.ts                  # API URLs, feature flags
|   |   +-- strings.ts                 # i18n string keys
|   |
|   +-- types/
|   |   +-- api.ts                     # API request/response types
|   |   +-- game.ts                    # Game state types
|   |   +-- navigation.ts             # Route parameter types
|
+-- assets/
|   +-- images/                        # App images, icons
|   +-- sounds/                        # Sound effects (dice, ambient)
|   +-- fonts/                         # Custom fonts
|
+-- i18n/
|   +-- cs.json                        # Czech translations
|   +-- en.json                        # English translations
|   +-- de.json                        # German translations
|
+-- app.json                           # Expo config
+-- eas.json                           # EAS Build config
+-- tsconfig.json
+-- package.json
```

## 6.2 Navigation Architecture

```
ROOT LAYOUT (_layout.tsx)
  |
  +-- AuthProvider (Supabase session listener)
  +-- StoreProvider (Zustand hydration)
  +-- ThemeProvider
  |
  +-- IF not authenticated:
  |     (auth)/
  |       +-- login
  |       +-- register
  |       +-- forgot-password
  |
  +-- IF authenticated:
        (tabs)/
          +-- Home (index)
          |     Lists: active sessions, recent sessions
          |     CTA: "New Adventure" button
          |
          +-- Characters
          |     Lists: user's characters
          |     CTA: "Create Character" button
          |
          +-- Profile
                Shows: avatar, username, stats
                Links: settings, subscription, privacy

        MODAL STACK (presented over tabs):
          game/new        -- Genre/difficulty picker
          game/[id]       -- FULL SCREEN game session
          game/summary    -- Post-session summary
          character/create
          character/[id]
          settings/*
```

## 6.3 State Management: Zustand

**Decision: Zustand over Redux Toolkit, Jotai, or MobX**

| Option | Pros | Cons |
|--------|------|------|
| **Zustand** | Minimal boilerplate, TS-native, fast, small bundle (1KB), persist middleware | Less structure (pro and con) |
| Redux Toolkit | Structured, DevTools, large community | Verbose, large bundle, overkill for MVP |
| Jotai | Atomic, minimal | Less suited for complex state like game state |
| MobX | Reactive, OOP-friendly | Decorators, learning curve |

```typescript
// src/stores/gameStore.ts
import { create } from 'zustand';

interface GameState {
  // Session
  activeSessionId: string | null;
  isPlaying: boolean;
  isRecording: boolean;
  isProcessing: boolean;  // waiting for AI response

  // Game data
  narrationText: string;
  narrationChunks: string[];
  currentImageUrl: string | null;
  playerHealth: number;
  playerMaxHealth: number;
  inventory: string[];
  turnNumber: number;
  sessionTimeRemaining: number;

  // Audio queue
  audioQueue: string[];  // URLs of TTS audio chunks
  isAudioPlaying: boolean;

  // Actions
  startSession: (sessionId: string) => void;
  addNarrationChunk: (chunk: string) => void;
  enqueueAudio: (url: string) => void;
  dequeueAudio: () => string | undefined;
  applyStateUpdate: (update: StateUpdate) => void;
  setRecording: (recording: boolean) => void;
  setProcessing: (processing: boolean) => void;
  endSession: () => void;
  reset: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  activeSessionId: null,
  isPlaying: false,
  isRecording: false,
  isProcessing: false,
  narrationText: '',
  narrationChunks: [],
  currentImageUrl: null,
  playerHealth: 50,
  playerMaxHealth: 50,
  inventory: [],
  turnNumber: 0,
  sessionTimeRemaining: 2700,
  audioQueue: [],
  isAudioPlaying: false,

  startSession: (sessionId) => set({
    activeSessionId: sessionId,
    isPlaying: true,
    narrationText: '',
    narrationChunks: [],
    turnNumber: 0,
  }),

  addNarrationChunk: (chunk) => set((state) => ({
    narrationChunks: [...state.narrationChunks, chunk],
    narrationText: state.narrationText + ' ' + chunk,
  })),

  enqueueAudio: (url) => set((state) => ({
    audioQueue: [...state.audioQueue, url],
  })),

  dequeueAudio: () => {
    const queue = get().audioQueue;
    if (queue.length === 0) return undefined;
    const [next, ...rest] = queue;
    set({ audioQueue: rest });
    return next;
  },

  applyStateUpdate: (update) => set((state) => ({
    playerHealth: state.playerHealth + (update.healthDelta || 0),
    inventory: [
      ...state.inventory.filter(i => !update.inventoryRemove?.includes(i)),
      ...(update.inventoryAdd || []),
    ],
    turnNumber: update.turnNumber || state.turnNumber,
    sessionTimeRemaining: update.sessionTimeRemaining ?? state.sessionTimeRemaining,
  })),

  setRecording: (recording) => set({ isRecording: recording }),
  setProcessing: (processing) => set({ isProcessing: processing }),

  endSession: () => set({
    isPlaying: false,
    activeSessionId: null,
  }),

  reset: () => set({
    activeSessionId: null,
    isPlaying: false,
    isRecording: false,
    isProcessing: false,
    narrationText: '',
    narrationChunks: [],
    currentImageUrl: null,
    audioQueue: [],
  }),
}));
```

## 6.4 Audio Recording & Playback Architecture

```typescript
// src/hooks/useAudioRecorder.ts
import { Audio } from 'expo-av';
import { useState, useRef, useCallback } from 'react';

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) throw new Error('Microphone permission denied');

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const { recording } = await Audio.Recording.createAsync(
        {
          android: {
            extension: '.webm',
            outputFormat: Audio.AndroidOutputFormat.WEBM,
            audioEncoder: Audio.AndroidAudioEncoder.OPUS,
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 32000,
          },
          ios: {
            extension: '.m4a',
            outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
            audioQuality: Audio.IOSAudioQuality.MEDIUM,
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 32000,
          },
          web: {},
        }
      );

      recordingRef.current = recording;
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!recordingRef.current) return null;

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setIsRecording(false);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      return uri;
    } catch (error) {
      console.error('Failed to stop recording:', error);
      return null;
    }
  }, []);

  return { isRecording, startRecording, stopRecording };
}
```

```typescript
// src/hooks/useAudioPlayer.ts
import { Audio, AVPlaybackStatus } from 'expo-av';
import { useCallback, useRef } from 'react';
import { useGameStore } from '../stores/gameStore';

export function useAudioPlayer() {
  const soundRef = useRef<Audio.Sound | null>(null);
  const dequeueAudio = useGameStore((s) => s.dequeueAudio);

  const playNext = useCallback(async () => {
    const url = dequeueAudio();
    if (!url) {
      useGameStore.setState({ isAudioPlaying: false });
      return;
    }

    useGameStore.setState({ isAudioPlaying: true });

    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true },
        (status: AVPlaybackStatus) => {
          if (status.isLoaded && status.didJustFinish) {
            // Play next audio in queue (gapless)
            playNext();
          }
        }
      );

      soundRef.current = sound;
    } catch (error) {
      console.error('Audio playback error:', error);
      // Try next audio in queue
      playNext();
    }
  }, [dequeueAudio]);

  const stop = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    useGameStore.setState({ isAudioPlaying: false, audioQueue: [] });
  }, []);

  return { playNext, stop };
}
```

## 6.5 Offline Handling

```
OFFLINE STRATEGY (MVP -- minimal)
===================================

Questcast is an ONLINE-FIRST app. AI APIs require internet.

MVP Offline Handling:
1. DETECT: NetInfo listener monitors connectivity
2. INFORM: Show non-intrusive banner "No internet connection"
3. PROTECT: Queue outgoing requests, disable voice button
4. PRESERVE: Game state is in Zustand (survives brief disconnection)
5. RECONNECT: Auto-retry when connection restored

NOT in MVP (Phase 2+):
- Offline playback of cached audio
- Cached session resume
- Local-first architecture

Implementation:
  - @react-native-community/netinfo for connectivity monitoring
  - Zustand persist middleware saves game state to AsyncStorage
  - On reconnect: attempt to resume session (server checks Redis for hot state)
```

## 6.6 Key React Native Libraries

```json
{
  "dependencies": {
    // Framework
    "expo": "~52.0.0",
    "expo-router": "~4.0.0",
    "react-native": "0.76.x",

    // Audio (CRITICAL)
    "expo-av": "~15.0.0",

    // Auth
    "@supabase/supabase-js": "^2.45.0",
    "expo-secure-store": "~14.0.0",
    "expo-auth-session": "~6.0.0",
    "expo-web-browser": "~14.0.0",

    // State Management
    "zustand": "^5.0.0",

    // Navigation (built into expo-router)
    // (no separate react-navigation needed)

    // Payments
    "react-native-purchases": "^8.0.0",       // RevenueCat

    // UI
    "react-native-reanimated": "~3.16.0",     // Animations
    "react-native-gesture-handler": "~2.20.0",
    "expo-haptics": "~14.0.0",                // Haptic feedback
    "expo-linear-gradient": "~14.0.0",
    "expo-image": "~2.0.0",                   // Fast image loading
    "react-native-safe-area-context": "~4.12.0",

    // Networking
    "@react-native-community/netinfo": "~11.4.0",
    "expo-file-system": "~18.0.0",            // File upload for audio

    // Analytics
    "posthog-react-native": "^3.3.0",
    "@sentry/react-native": "~6.0.0",

    // i18n
    "i18next": "^24.0.0",
    "react-i18next": "^15.0.0",

    // Utilities
    "date-fns": "^4.0.0",
    "zod": "^3.23.0"                          // Validation (shared with backend)
  }
}
```

---

# 7. Infrastructure & DevOps

## 7.1 CI/CD Pipeline Design

```yaml
# .github/workflows/backend-ci.yml
name: Backend CI

on:
  pull_request:
    paths: ['backend/**']
  push:
    branches: [main]
    paths: ['backend/**']

jobs:
  lint-and-type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json
      - run: cd backend && npm ci
      - run: cd backend && npm run lint
      - run: cd backend && npm run type-check

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: questcast_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json
      - run: cd backend && npm ci
      - run: cd backend && npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/questcast_test
      - run: cd backend && npm test
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/questcast_test
          NODE_ENV: test

  deploy:
    needs: [lint-and-type-check, test]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: railwayapp/github-cli@v1
        with:
          railway_token: ${{ secrets.RAILWAY_TOKEN }}
          service: backend
          command: up
```

```yaml
# .github/workflows/mobile-build.yml
name: Mobile Build

on:
  push:
    tags: ['v*']   # Trigger on version tags

jobs:
  build-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: cd mobile && npm ci
      - run: cd mobile && eas build --platform android --profile production --non-interactive

  build-ios:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: cd mobile && npm ci
      - run: cd mobile && eas build --platform ios --profile production --non-interactive
```

## 7.2 Environment Strategy

```
ENVIRONMENTS
=============

+------------------+------------------+------------------+
| Development      | Staging          | Production       |
+------------------+------------------+------------------+
| Local machine    | Railway (preview)| Railway (prod)   |
| Supabase (local) | Supabase (staging| Supabase (prod)  |
| Upstash (dev)    | Upstash (staging)| Upstash (prod)   |
| OpenAI (dev key) | OpenAI (dev key) | OpenAI (prod key)|
+------------------+------------------+------------------+

Branch mapping:
  feature/* -> Development (local)
  develop   -> Staging (auto-deploy)
  main      -> Production (auto-deploy after CI passes)

Mobile:
  Development: Expo Dev Client (local)
  Preview:     EAS Build (internal distribution)
  Production:  EAS Build + Submit to stores
```

## 7.3 Secret Management

```
SECRET STORAGE
===============

Development:
  .env.local (git-ignored)

CI/CD:
  GitHub Actions Secrets:
    - RAILWAY_TOKEN
    - EXPO_TOKEN
    - SUPABASE_URL
    - SUPABASE_SERVICE_ROLE_KEY
    - OPENAI_API_KEY
    - UPSTASH_REDIS_URL
    - UPSTASH_REDIS_TOKEN
    - SENTRY_DSN
    - SENTRY_AUTH_TOKEN
    - POSTHOG_API_KEY
    - REVENUECAT_API_KEY
    - CLOUDFLARE_R2_ACCESS_KEY
    - CLOUDFLARE_R2_SECRET_KEY

Production:
  Railway environment variables (encrypted at rest)

Mobile:
  - API URL in app.json `extra` config (public)
  - Supabase anon key in app config (public, safe -- RLS protects data)
  - NEVER bundle secret keys in mobile app
  - All sensitive operations go through backend
```

## 7.4 Logging & Monitoring

```
OBSERVABILITY STACK
====================

1. ERROR TRACKING: Sentry
   - Backend: @sentry/node
   - Mobile: @sentry/react-native
   - Source maps uploaded on build
   - Alerts: Slack channel #questcast-errors

2. PRODUCT ANALYTICS: PostHog
   - Events: session_started, turn_completed, subscription_purchased, etc.
   - Feature flags: new_onboarding, premium_voices, etc.
   - Session replay: enabled for 10% of sessions (debugging)

3. APPLICATION LOGS: Railway built-in logs
   - Structured JSON logging (pino)
   - Levels: error, warn, info, debug
   - Retention: 7 days (Railway default)
   - Export to BetterStack for long-term storage (Phase 2)

4. UPTIME: BetterStack
   - Health check: GET /health every 60s
   - Status page: status.questcast.app
   - Alerts: Slack + email on downtime

5. AI COST MONITORING: Custom dashboard
   - ai_cost_tracking table aggregated daily
   - Alert if daily cost > 150% of 7-day average
   - Dashboard in PostHog (custom events)

6. INFRASTRUCTURE METRICS: Railway built-in
   - CPU, memory, network
   - Alert on CPU > 80% for 5 min
```

## 7.5 Deployment Strategy

```
DEPLOYMENT FLOW
================

Backend:
  1. PR merged to main
  2. GitHub Actions: lint + type-check + test
  3. On success: Railway auto-deploy
  4. Railway: build Docker image, health check, swap traffic
  5. Zero-downtime (Railway handles rolling deploys)
  6. Rollback: Railway one-click rollback to previous deploy

Mobile:
  1. Tag pushed: v1.2.3
  2. GitHub Actions: EAS Build (Android + iOS)
  3. Builds uploaded to EAS
  4. Manual: EAS Submit to Google Play / App Store
  5. For urgent fixes: EAS Update (OTA, no store review)

Database:
  1. Prisma migration added in PR
  2. Reviewed by team
  3. Applied on deploy: `npx prisma migrate deploy`
  4. Rollback: manual reverse migration script
```

---

# 8. Security Considerations

## 8.1 Authentication & Authorization

```
AUTH SECURITY LAYERS
=====================

1. PASSWORD SECURITY
   - Handled by Supabase Auth (bcrypt, 10 rounds)
   - Minimum password: 8 characters
   - Rate limit: 10 login attempts / 15 min

2. JWT TOKENS
   - Access token: 1 hour expiry
   - Refresh token: 7 days expiry
   - Stored in expo-secure-store (encrypted native keychain)
   - NEVER in AsyncStorage or localStorage

3. AUTHORIZATION
   - Subscription tier checked on every AI-consuming endpoint
   - Usage limits enforced server-side (sessions/day, images/session)
   - Supabase RLS policies as additional safety net
   - Admin endpoints require separate admin role check

4. API KEY SECURITY
   - OpenAI key NEVER exposed to client
   - All AI calls proxied through backend
   - RevenueCat API key (public key) is safe for mobile
   - Supabase anon key is safe (RLS protects data)
```

## 8.2 Data Encryption

```
ENCRYPTION
===========

IN TRANSIT:
  - All API calls over HTTPS (TLS 1.3)
  - Certificate pinning considered for Phase 2 (not MVP)
  - WebSocket connections over WSS

AT REST:
  - PostgreSQL: Supabase provides encryption at rest (AES-256)
  - Redis: Upstash provides encryption at rest
  - R2/S3: Server-side encryption enabled
  - Mobile: expo-secure-store uses iOS Keychain / Android Keystore

VOICE DATA:
  - Audio uploaded over HTTPS
  - Sent directly to Whisper API for transcription
  - NOT stored on our servers
  - NOT stored by OpenAI (data retention opt-out enabled)
  - Transcribed text stored only as part of game events
```

## 8.3 Voice Data Handling (Privacy-First)

```
VOICE DATA LIFECYCLE
=====================

1. RECORD: Audio recorded on device (stays in device memory)
2. UPLOAD: Sent to our backend via HTTPS (multipart, in-memory buffer)
3. TRANSCRIBE: Our backend sends to Whisper API
4. DELETE: Audio buffer released from memory immediately after Whisper response
5. STORE: Only transcribed TEXT stored in game_events table

WHAT WE NEVER DO:
  - Store raw audio files on disk or in object storage
  - Send audio to any service other than OpenAI Whisper
  - Use audio for training or analytics
  - Keep audio in memory longer than the request lifecycle

OpenAI Data Retention:
  - We use the API with data retention opt-out
  - OpenAI confirms: "API inputs are not used to train models"
  - We document this in privacy policy
```

## 8.4 API Security

```
API SECURITY MEASURES
======================

1. RATE LIMITING (detailed in Section 4.4)
   - Global: 100 req/min per user
   - AI endpoints: tiered by subscription
   - Auth endpoints: strict brute-force protection

2. INPUT VALIDATION
   - Zod schemas validate every request body
   - Max audio file size: 10MB
   - Max text input: 500 characters
   - Content type verification for uploads
   - SQL injection: prevented by Prisma (parameterized queries)
   - XSS: not applicable (no HTML rendering from user input)

3. OUTPUT SANITIZATION
   - AI responses sanitized before storage
   - No user input reflected in responses without escaping
   - Image URLs validated (must be from our R2 bucket)

4. CORS
   - Strict origin whitelist (mobile app does not use CORS, but web admin will)

5. HELMET / SECURITY HEADERS
   - fastify-helmet for security headers
   - X-Content-Type-Options: nosniff
   - X-Frame-Options: DENY
   - Content-Security-Policy: strict
```

## 8.5 GDPR Compliance Checklist

```
GDPR COMPLIANCE (MVP)
=======================

[x] DESIGN:
    [x] Privacy-by-design architecture (no raw voice storage)
    [x] Data minimization (collect only what's needed)
    [x] Encryption at rest and in transit

[x] DOCUMENTATION:
    [x] Privacy policy (EN + CZ) -- see 09_Privacy_Policy_Template.md
    [x] Data processing records (which data, where, why, how long)
    [x] DPO contact information

[ ] IMPLEMENTATION (MVP development tasks):
    [ ] Cookie consent (web components only)
    [ ] Data export endpoint (GET /users/me/export)
    [ ] Account deletion endpoint (DELETE /auth/account)
    [ ] Account deletion: 30-day grace period, then hard delete
    [ ] Consent recording: timestamp when user accepts ToS/Privacy
    [ ] Analytics: anonymize after 90 days
    [ ] Payment records: retain 7 years (legal requirement)
    [ ] Data retention automation (cron job for cleanup)

[ ] OPERATIONAL:
    [ ] Breach notification procedure documented
    [ ] DPA with all sub-processors (OpenAI, Supabase, Sentry, etc.)
    [ ] Data subject access request (DSAR) handling process
```

---

# 9. Performance Budget

## 9.1 Voice Loop Latency Target: <2s

```
LATENCY BUDGET (end-to-end, p95)
==================================

Component                    Target    Max Acceptable
---------------------------------------------------------
Audio upload (client->server) 200ms     400ms
STT (Whisper API)            500ms     800ms
LLM first sentence            400ms     700ms
  (streaming, buffer 1 sentence)
TTS first audio chunk         300ms     500ms
Audio delivery to client       50ms     100ms
---------------------------------------------------------
TOTAL TO FIRST AUDIO:        1,450ms   2,500ms

TARGET: p50 < 1.5s, p95 < 2.0s, p99 < 3.0s

OPTIMIZATION LEVERS:
1. Streaming LLM -> TTS pipeline (saves ~500ms vs sequential)
2. TTS cache hits (saves ~300ms, audio served from CDN)
3. Opus audio format (smaller upload/download)
4. Keep-alive connections to OpenAI (saves TLS handshake)
5. Server in EU region (same region as most users)
```

## 9.2 App Performance Targets

```
APP PERFORMANCE BUDGET
========================

Metric                   Target     Max Acceptable
------------------------------------------------------
Cold start (first load)  <2.5s      <4.0s
Warm start (resume)      <1.0s      <2.0s
Screen transitions       <200ms     <400ms
Time to interactive      <3.0s      <5.0s
JS bundle size           <5MB       <8MB
Memory usage (active)    <200MB     <350MB
Battery drain/hour       <10%       <15%
Crash rate               <1%        <2%

OPTIMIZATION STRATEGIES:
1. Lazy loading: Only load game module when entering a session
2. Image optimization: WebP format, progressive loading, blur placeholder
3. Hermes engine: Default in Expo SDK 52, 2x faster JS execution
4. Audio memory: Unload sounds after playback (don't accumulate)
5. List virtualization: FlatList for session/character lists
6. Minimize re-renders: Zustand selectors, React.memo where needed
```

## 9.3 Where to Optimize

```
OPTIMIZATION PRIORITY MATRIX
==============================

HIGH IMPACT, EASY:
  1. TTS caching for common phrases (saves 30% of TTS costs + latency)
  2. Streaming LLM->TTS pipeline (saves 500ms latency)
  3. Opus audio format (50% smaller than MP3)
  4. Keep-alive HTTP connections to OpenAI

HIGH IMPACT, MODERATE:
  5. Sentence-level TTS streaming (play first sentence while LLM still generating)
  6. Pre-warm LLM connection on session start (first turn faster)
  7. Image preloading (generic scene images cached on device)
  8. Redis-based subscription status cache (skip DB query)

MODERATE IMPACT, EASY:
  9. Gzip/Brotli compression on API responses
  10. CDN for all static assets (images, audio)
  11. Database query optimization (proper indexes, select only needed columns)

DEFER TO PHASE 2:
  - Audio speculative pre-generation (predict next narration)
  - LLM response pre-computation for common scenarios
  - Edge function deployment for STT/TTS routing
  - Client-side VAD (reduce silence upload)
```

---

# 10. Technical Risks & Mitigations

## Risk 1: Voice Loop Latency Exceeds 2s Target

**Probability:** Medium
**Impact:** High (core UX degradation)
**Why:** Multiple sequential API calls (STT -> LLM -> TTS) each with variable latency.

**Mitigation:**
1. Streaming pipeline architecture (see Section 5.5) -- process in parallel, not sequential
2. Sentence-level TTS -- start playing audio before LLM finishes
3. Pre-warm OpenAI connections on session start
4. Latency monitoring with Sentry performance traces

**Spike recommendation:**
Build a standalone CLI prototype of the voice loop in Week 1. Measure real latency with Czech language input. If p95 > 3s, evaluate:
- Deepgram for STT (lower latency than Whisper API)
- ElevenLabs for TTS (streaming optimized)

## Risk 2: AI Costs Per Session Exceed Budget ($0.20 target)

**Probability:** Medium
**Impact:** High (negative unit economics)
**Why:** Token usage varies widely based on conversation length, player behavior.

**Mitigation:**
1. Strict token budgets (max 200 output tokens per turn)
2. Conversation history trimming (keep only last 15 turns)
3. TTS caching (30-40% of TTS calls avoided)
4. Cost tracking per session with hard caps
5. Model tiering: GPT-4o-mini for narration, GPT-3.5-turbo for simple acknowledgments

**Spike recommendation:**
Run 50 simulated sessions with different play styles. Measure actual costs. Adjust token limits and caching strategy based on real data.

## Risk 3: Expo Audio Limitations

**Probability:** Low-Medium
**Impact:** High (core feature broken)
**Why:** Expo AV may have edge cases with audio recording formats, background audio, or specific Android devices.

**Mitigation:**
1. Test on 5+ physical Android devices (Samsung, Pixel, Xiaomi, OnePlus) in Week 2
2. Audio format fallbacks: try opus, fallback to m4a, fallback to wav
3. Document device-specific issues early
4. If Expo AV is insufficient, can use `react-native-audio-recorder-player` (bare workflow needed)

**Spike recommendation:**
Build a simple "record -> upload -> play response" prototype in Expo in Week 1. Test on 3+ devices.

## Risk 4: OpenAI API Downtime / Rate Limiting

**Probability:** Low
**Impact:** High (app completely non-functional)
**Why:** Single provider dependency for 4 critical services (LLM, STT, TTS, Images).

**Mitigation:**
1. Circuit breaker pattern (trip after 50% failure rate)
2. Fallback responses for LLM (pre-written genre templates)
3. Text display fallback for TTS failures
4. Text input fallback for STT failures
5. Placeholder images for image generation failures

**Long-term mitigation (Phase 2):**
- Add Anthropic Claude as LLM fallback
- Add Deepgram as STT fallback
- Add ElevenLabs as TTS fallback
- Self-hosted Whisper for STT (reduces dependency AND cost)

## Risk 5: React Native Performance on Low-End Android Devices

**Probability:** Medium
**Impact:** Medium (excludes part of target market)
**Why:** Czech market includes many mid-range Android devices. Audio processing + UI + network can be heavy.

**Mitigation:**
1. Hermes JS engine (default in Expo SDK 52) -- 2x faster than JSC
2. Minimize re-renders with Zustand selectors
3. Offload audio processing to native modules
4. Test on budget Android device (e.g., Samsung Galaxy A14) throughout development
5. Performance budget enforced in CI (bundle size check)

**Spike recommendation:**
Test Expo AV audio recording + playback on a ~$150 Android device. If performance is unacceptable, evaluate Flutter as an alternative before committing to the full mobile build.

---

# Appendix A: Monorepo Structure

```
questcast/
|
+-- backend/                      # Fastify backend
|   +-- src/
|   |   +-- modules/
|   |   |   +-- auth/
|   |   |   +-- game/
|   |   |   +-- ai/
|   |   |   +-- subscription/
|   |   |   +-- user/
|   |   +-- middleware/
|   |   +-- database/
|   |   |   +-- prisma/
|   |   |   |   +-- schema.prisma
|   |   |   |   +-- migrations/
|   |   +-- lib/                  # Shared utilities
|   |   +-- app.ts                # Fastify app setup
|   |   +-- server.ts             # Entry point
|   +-- tests/
|   +-- Dockerfile
|   +-- package.json
|   +-- tsconfig.json
|
+-- mobile/                       # Expo React Native app
|   +-- app/                      # Expo Router
|   +-- src/
|   +-- assets/
|   +-- i18n/
|   +-- app.json
|   +-- eas.json
|   +-- package.json
|   +-- tsconfig.json
|
+-- packages/                     # Shared code
|   +-- shared/
|   |   +-- types/                # Shared TypeScript types
|   |   |   +-- game.ts
|   |   |   +-- api.ts
|   |   |   +-- user.ts
|   |   +-- validation/           # Shared Zod schemas
|   |   |   +-- auth.ts
|   |   |   +-- game.ts
|   |   +-- constants/
|   |   |   +-- entitlements.ts
|   |   |   +-- limits.ts
|   |   +-- package.json
|
+-- docs/                         # Documentation
|   +-- api/                      # API documentation
|   +-- architecture/             # Architecture Decision Records
|   +-- runbooks/                 # Operational runbooks
|
+-- .github/
|   +-- workflows/
|   |   +-- backend-ci.yml
|   |   +-- mobile-build.yml
|
+-- package.json                  # Workspace root
+-- turbo.json                    # Turborepo config (or nx.json)
+-- .gitignore
+-- .env.example
```

---

# Appendix B: ADRs (Architecture Decision Records)

## ADR-001: Modular Monolith over Microservices

**Status:** Accepted
**Context:** Team of 4, 3-month MVP timeline, need fast iteration.
**Decision:** Single Fastify backend with internal module boundaries.
**Consequences:** Simpler ops, faster development, must enforce module boundaries via code review. Can extract to microservices in Phase 3+ if needed.

## ADR-002: Node.js + Fastify over Python + FastAPI

**Status:** Accepted
**Context:** Core loop is streaming (LLM -> TTS -> audio). Need shared types with React Native.
**Decision:** TypeScript across the stack with Fastify for streaming performance.
**Consequences:** Single language, shared types via monorepo. Team must be proficient in TypeScript. If we need ML/AI processing later (fine-tuning, embeddings), can add a Python microservice.

## ADR-003: Supabase over AWS RDS + Custom Auth

**Status:** Accepted
**Context:** MVP needs database + auth + realtime + storage with minimal ops.
**Decision:** Supabase Pro plan (EU region).
**Consequences:** Fast to set up, affordable, standard PostgreSQL underneath. Risk: must monitor for Supabase-specific limitations at scale. Migration path: pg_dump to any PostgreSQL host.

## ADR-004: Railway over Vercel for Backend

**Status:** Accepted
**Context:** Need long-running process for WebSocket support and streaming pipeline.
**Decision:** Railway for backend hosting.
**Consequences:** Always-on process (no cold starts), native Docker support, WebSocket ready for future multiplayer. Slightly more expensive than Vercel serverless at very low traffic.

## ADR-005: SSE over WebSocket for Game Turns

**Status:** Accepted
**Context:** Game turns are request-response (player speaks -> AI responds). Need streaming response.
**Decision:** Server-Sent Events (SSE) for turn responses. WebSocket reserved for Phase 3 multiplayer.
**Consequences:** Simpler implementation, standard HTTP, works through all proxies/CDNs. One-directional streaming is sufficient for single-player. Audio upload uses standard multipart POST.

## ADR-006: Zustand over Redux Toolkit

**Status:** Accepted
**Context:** Game state is moderately complex but well-scoped. Team prefers minimal boilerplate.
**Decision:** Zustand for all client-side state management.
**Consequences:** Less boilerplate, faster to write, smaller bundle. Less structure than Redux -- rely on store file organization for maintainability. DevTools available via zustand/devtools middleware.

---

# Appendix C: MVP Development Sprint Plan

```
MONTH 1 (Weeks 1-4): Backend + AI
===================================

Week 1: Foundation
  - [ ] Monorepo setup (Turborepo + packages/shared)
  - [ ] Backend: Fastify project scaffold + TypeScript + Prisma
  - [ ] Database: Supabase project setup + initial schema migration
  - [ ] Redis: Upstash setup
  - [ ] CI: GitHub Actions for lint + type-check
  - [ ] SPIKE: Voice loop latency test (CLI prototype)

Week 2: Auth + Core API
  - [ ] Supabase Auth integration (register, login, Google, Apple)
  - [ ] JWT middleware for Fastify
  - [ ] User CRUD endpoints
  - [ ] Character CRUD endpoints
  - [ ] Rate limiting setup
  - [ ] SPIKE: Expo AV audio test on 3 devices

Week 3: AI Pipeline
  - [ ] OpenAI integration (LLM, STT, TTS)
  - [ ] Streaming pipeline (LLM -> sentence buffer -> TTS)
  - [ ] Prompt templates (Handlebars)
  - [ ] Game session endpoints (create, turn, save, end)
  - [ ] SSE implementation for turn streaming
  - [ ] Cost tracking per request

Week 4: AI Polish + Images
  - [ ] Image generation pipeline (async)
  - [ ] TTS caching layer (Redis + R2)
  - [ ] Fallback chain implementation
  - [ ] Game state management (Redis hot / PG cold)
  - [ ] Cost monitoring dashboard (simple SQL queries)
  - [ ] Integration tests for full voice loop

MONTH 2 (Weeks 5-8): Mobile App
===================================

Week 5: App Foundation
  - [ ] Expo project setup (SDK 52)
  - [ ] Expo Router navigation structure
  - [ ] Auth screens (login, register) connected to Supabase
  - [ ] Zustand stores (auth, game, settings)
  - [ ] Theme + base UI components
  - [ ] API client service

Week 6: Game Core
  - [ ] Audio recording hook (useAudioRecorder)
  - [ ] Audio playback hook with queue (useAudioPlayer)
  - [ ] Game session screen (full screen)
  - [ ] SSE client for receiving turn events
  - [ ] Narration display (typewriter effect)
  - [ ] Voice button (push-to-talk)

Week 7: Game Features
  - [ ] Character creation flow
  - [ ] Session setup (genre, difficulty, narrator style)
  - [ ] Dice roller with animation
  - [ ] Scene image display
  - [ ] Health bar + inventory panel
  - [ ] Save/load game functionality

Week 8: Polish
  - [ ] Settings screen (audio preferences, TTS voice picker)
  - [ ] Profile screen (stats, avatar)
  - [ ] i18n (Czech + English)
  - [ ] Offline detection + error handling
  - [ ] Push notifications (basic, via Expo Notifications)
  - [ ] Analytics integration (PostHog + Sentry)

MONTH 3 (Weeks 9-12): Beta + Launch
======================================

Week 9: Testing
  - [ ] Internal testing (team plays 50+ sessions)
  - [ ] Performance testing (latency, memory, battery)
  - [ ] Device testing (5+ Android devices, 2+ iOS)
  - [ ] Bug fixing sprint
  - [ ] Load testing backend (k6, target 100 concurrent)

Week 10: Beta Prep
  - [ ] App Store + Google Play developer accounts
  - [ ] App store assets (screenshots, description, icon)
  - [ ] EAS Build configuration for production
  - [ ] First production build
  - [ ] Internal distribution for final testing

Week 11: Closed Beta
  - [ ] 500 beta users invited (via TestFlight + Google Play Internal)
  - [ ] Feedback collection (in-app + Discord)
  - [ ] Bug fixes based on beta feedback
  - [ ] Latency monitoring in production
  - [ ] Cost monitoring in production

Week 12: Launch
  - [ ] Final bug fixes
  - [ ] App Store submission
  - [ ] Google Play submission
  - [ ] Monitor reviews and crash reports
  - [ ] Hotfix capability verified (EAS Update for OTA)
```

---

*This document is the engineering bible for Questcast MVP development. All architectural decisions are documented with rationale. Developers should consult this document before making technology choices or deviating from established patterns.*

*Last updated: March 2026*
*Author: Planner B (Technical Architect)*
