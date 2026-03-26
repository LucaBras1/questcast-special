# Questcast MVP -- Test Strategy

## Version 1.0 | Sprint 1

---

## 1. Testing Pyramid

### 1.1 Unit Tests (Backend)

| Property | Value |
|----------|-------|
| **Framework** | Jest 29 + ts-jest |
| **Coverage Target** | 80% statements, 75% branches |
| **Scope** | Services, utilities, schemas, middleware, AI service layer |
| **Execution** | Every PR via GitHub Actions (`npm test`) |
| **Mocking** | All external services mocked (OpenAI, Supabase, Redis) |

**What we unit test:**
- Zod schema validation (register, login, session creation, LLM response parsing)
- Error classes and error handler behavior
- AI cost calculation (`calculateTotalCost`, pricing math)
- Authentication middleware (JWT decode, missing token, expired token)
- Validation middleware (body, query, params)
- Logger output formatting
- Config loading and env validation

### 1.2 Integration Tests (API)

| Property | Value |
|----------|-------|
| **Framework** | Jest + Fastify `inject()` (built-in, no Supertest needed) |
| **Coverage** | All REST endpoints listed in Master Plan |
| **Database** | Test PostgreSQL database (separate from dev/staging) |
| **Execution** | Every PR via GitHub Actions |

**Endpoints under test:**
- `POST /api/auth/register` -- registration flow
- `POST /api/auth/login` -- login flow
- `POST /api/auth/refresh` -- token refresh
- `POST /api/game/session` -- create game session
- `GET /api/game/session/:id` -- load session
- `GET /api/game/sessions` -- list user sessions
- `POST /api/game/session/:id/turn` -- voice loop turn (mocked AI)
- `POST /api/game/session/:id/save` -- manual save
- `POST /api/game/session/:id/dice` -- dice roll
- `GET /api/user/profile` -- user profile
- `GET /health` -- health check

### 1.3 E2E Tests (Mobile)

| Property | Value |
|----------|-------|
| **Framework** | Detox (Android) |
| **Coverage** | Critical flows only (5 scenarios) |
| **Execution** | Nightly CI build; manually before releases |
| **Devices** | Android emulator (API 34) in CI; physical devices for manual |

**Critical flows tested:**
1. Register -> Login -> Home screen
2. Create character -> Start adventure -> See AI narration
3. Voice loop: tap mic -> speak -> transcription -> AI response
4. Save game -> Quit -> Reopen -> Continue
5. Network error -> Fallback UI -> Recovery

### 1.4 Manual Testing

| Area | Frequency | Who |
|------|-----------|-----|
| Game experience (fun factor) | Sprint 3+ | QA + team |
| Voice quality (Czech/English) | Sprint 2+ | QA + native speaker |
| Device compatibility | Sprint 4-5 | QA |
| Adversarial safety (jailbreak attempts) | Sprint 4-5 | QA |
| Exploratory edge cases | Every sprint | QA |

---

## 2. Test Categories

### 2.1 Functional Testing

Does each feature work as specified in the Master Plan?

| Feature | Test Type | Priority |
|---------|-----------|----------|
| User registration/login | Integration | P0 |
| JWT auth + refresh | Integration | P0 |
| Create game session | Integration | P0 |
| Voice-to-voice loop (STT -> LLM -> TTS) | Integration + E2E | P0 |
| Game state save/load | Integration + E2E | P0 |
| Content moderation (input) | Unit + Integration | P0 |
| Content moderation (output) | Unit + Integration | P0 |
| Dice rolling | Integration | P1 |
| Character creation | Integration + E2E | P1 |
| Image generation | Integration | P1 |
| Session listing + pagination | Integration | P1 |

### 2.2 AI Quality Testing

Are AI responses coherent, safe, appropriate length, and in the correct language?

| Metric | Target | Measurement |
|--------|--------|-------------|
| Response length | 50-150 words per narration | Automated (word count) |
| Token usage | <150 output tokens per turn | Automated (API response) |
| Language correctness | Response matches requested language | Automated (language detection) |
| Content safety | No flagged content | Automated (OpenAI Moderation API) |
| JSON validity | LLM JSON responses parse against Zod schema | Automated (schema validation) |
| Game state consistency | Character name/class referenced correctly | Semi-automated (string matching) |
| Narrative quality | Dramatic, immersive, appropriate to context | Manual (native speaker review) |

**Automated quality evaluator** runs against a batch of 10 test scenarios covering combat, exploration, NPC dialogue, dice rolls, session start/resume, cliffhanger endings, both languages, and edge cases.

### 2.3 Performance Testing

| Metric | Target (p50) | Target (p95) | Hard Fail |
|--------|-------------|-------------|-----------|
| Voice loop latency (mic release -> first audio play) | < 2.0s | < 3.0s | > 5.0s |
| App startup (cold) | < 3.0s | < 4.0s | > 6.0s |
| API response (non-AI endpoints) | < 100ms | < 300ms | > 1s |
| SSE first event (after turn request) | < 500ms | < 1.0s | > 2.0s |

**Tools:**
- Client-side latency telemetry via PostHog (Sprint 2+)
- k6 load testing: 100 concurrent sessions on `/session/:id/turn` (Sprint 4)
- Lighthouse for any web-based admin panels (if built)

### 2.4 Security Testing

| Test | Method | Sprint |
|------|--------|--------|
| Input moderation bypass attempts | Manual adversarial testing | Sprint 4-5 |
| JWT tampering (invalid, expired, wrong signature) | Automated (integration tests) | Sprint 1 |
| Rate limiting verification | Automated (integration tests) | Sprint 3 |
| SQL injection on all inputs | Automated (Prisma parameterizes; verify) | Sprint 3 |
| Auth bypass (access other user's session) | Automated (integration tests) | Sprint 1 |
| API key exposure in client | Code review | Every PR |

### 2.5 Device Compatibility Testing

**Target devices (5):**

| Device | OS Version | Screen | Category |
|--------|-----------|--------|----------|
| Samsung Galaxy S24 | Android 14 | 6.2" FHD+ | Flagship |
| Samsung Galaxy A54 | Android 13+ | 6.4" FHD+ | Mid-range |
| Google Pixel 7a | Android 13+ | 6.1" FHD+ | Stock Android |
| Xiaomi Redmi Note 13 | Android 13+ | 6.67" FHD+ | Budget |
| OPPO A58 | Android 13 | 6.72" FHD+ | Budget |

**Per-device checklist:**
- [ ] App installs and launches
- [ ] Audio recording works (push-to-talk)
- [ ] Audio playback works (TTS response)
- [ ] Voice loop completes end-to-end
- [ ] App backgrounding/foregrounding preserves state
- [ ] No UI overflow or layout issues
- [ ] Touch targets >= 48dp
- [ ] Haptic feedback works (dice roll)

### 2.6 Accessibility Testing

| Requirement | Standard | Test Method |
|-------------|----------|-------------|
| Screen reader support | TalkBack compatibility | Manual (device) |
| Touch targets | >= 48dp x 48dp | Automated (layout inspection) |
| Color contrast | WCAG 2.1 AA (4.5:1 text, 3:1 large) | Automated (axe / Accessibility Scanner) |
| Focus order | Logical tab order | Manual (keyboard/switch access) |
| Content labels | All interactive elements labeled | Manual + automated |

---

## 3. Bug Severity Classification

### P0 / Critical
**Definition:** App crash, data loss, security breach, voice loop broken, session data corrupted.

**Response:** Fix immediately. Blocks release. No workaround acceptable.

**Examples:**
- App crashes on game turn submission
- Audio recording fails silently (no error shown)
- JWT authentication bypassed
- Game state lost after save
- Content moderation bypassed (unsafe content shown)
- Voice loop hangs indefinitely

### P1 / High
**Definition:** Feature does not work, but a workaround exists.

**Response:** Fix before next release. Workaround documented.

**Examples:**
- Text fallback not showing when TTS fails
- Session list does not refresh after creating new game
- Dice roll animation broken (but result is correct)
- Language toggle does not persist after restart

### P2 / Medium
**Definition:** Cosmetic issue, minor UX problem, non-blocking performance issue.

**Response:** Fix within current sprint if time permits. Otherwise next sprint.

**Examples:**
- Loading animation stutters briefly
- Text transcript has minor formatting issue
- Character name truncated on small screens
- Mic button animation lag

### P3 / Low
**Definition:** Nice-to-have improvement, suggestion, polish item.

**Response:** Backlog. Fix if easy, otherwise defer post-MVP.

**Examples:**
- "Would be nice if the dice showed the number longer"
- Slightly inconsistent padding between screens
- Haptic feedback could be stronger
- Color of health bar could be more visible

---

## 4. Release Criteria (Beta)

All criteria must be met before opening beta to 500 users.

### Hard Requirements (all must pass)

- [ ] All P0 bugs resolved and verified
- [ ] Crash rate < 5% (measured over 100+ test sessions)
- [ ] Voice loop works on all 5 test devices
- [ ] First session completion rate > 70% (measured in internal testing, 20+ sessions)
- [ ] No content safety bypasses found in adversarial testing (50+ attempts)
- [ ] All P0 features pass full regression suite
- [ ] Backend unit test coverage >= 80% statements
- [ ] All integration tests passing
- [ ] E2E tests passing for 5 critical flows
- [ ] APK size < 50MB
- [ ] App startup < 3s cold start (p50)

### Soft Requirements (should meet, won't block)

- [ ] Voice latency p50 < 2.5s (target: <2.0s)
- [ ] < 3 open P1 bugs
- [ ] Czech quality rating >= 7/10 from native speaker
- [ ] D1 retention > 40% in internal testing

---

## 5. Beta Test Plan

### 5.1 Participant Selection
- 500 users via closed access (Google Play closed testing track)
- Recruitment: Czech gaming communities, Reddit r/rpg, social media
- Mix: 60% Czech speakers, 40% English speakers
- Devices: self-reported, must be Android 13+

### 5.2 Feedback Collection

**In-app survey (triggered after first completed session, max 3 questions):**
1. "How was your adventure? Rate 1-5 stars"
2. "What would make you play again?" (free text, optional)
3. "Any issues? Tell us." (free text, optional)

**Optional interview:**
- Recruit 10-15 power users (played 3+ sessions)
- 15-minute video call
- Focus: what kept them playing, what frustrated them, would they pay

### 5.3 Success Metrics

| Metric | Target | Failure | Data Source |
|--------|--------|---------|-------------|
| First session completion | > 70% | < 50% | PostHog |
| D1 retention | > 40% | < 25% | PostHog |
| Voice latency p50 | < 2.5s | > 4.0s | PostHog telemetry |
| Voice latency p95 | < 3.5s | > 5.0s | PostHog telemetry |
| Crash rate | < 5% | > 10% | Sentry |
| Czech quality (survey) | > 3.5/5 | < 2.5/5 | In-app survey |
| Critical bugs (open) | < 5 | > 15 | GitHub Issues |
| Average session length | > 10 min | < 5 min | PostHog |

### 5.4 Beta Timeline (Sprint 6)

| Week | Activity |
|------|----------|
| Day 1-2 | Deploy to production, invite first 100 users |
| Day 3-5 | Monitor crash rate, latency, first bug triage |
| Day 6-7 | Hotfix any P0 bugs |
| Day 8 | Invite remaining 400 users |
| Day 9-12 | Monitor all metrics, daily bug triage |
| Day 13-14 | Analyze feedback, decide go/no-go for Google Play submission |

---

## 6. Test Environment

| Environment | Purpose | Database | AI Services |
|-------------|---------|----------|-------------|
| `test` | Unit + integration tests (CI) | SQLite in-memory or test PostgreSQL | Fully mocked |
| `development` | Local development | Local PostgreSQL | Real OpenAI (dev key, low limits) |
| `staging` | Pre-release testing | Supabase staging | Real OpenAI (staging key) |
| `production` | Beta + release | Supabase production | Real OpenAI (production key) |

---

## 7. CI Integration

### On every PR:
```
1. Lint (ESLint)
2. Type check (tsc --noEmit)
3. Unit tests (jest --coverage)
4. Integration tests (jest --testPathPattern=routes)
5. Coverage check (fail if < 80% statements)
```

### Nightly:
```
1. Full test suite including slow tests
2. E2E tests (Detox on Android emulator)
3. APK size check
```

### Pre-release:
```
1. Full regression suite
2. Device compatibility (manual, 5 devices)
3. Adversarial safety testing (manual)
4. Performance benchmarking (k6)
```
