# Sprint 2 Gate Verification Checklist

## Version 1.0 | Sprint 2

This checklist must be fully verified before Sprint 2 is considered complete.
All items are evaluated as pass/fail. Blocking items prevent sprint sign-off.

---

## Gate 1: Voice Loop (BLOCKING)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1.1 | Player speaks -> audio recorded successfully | [ ] | Device test log |
| 1.2 | Audio sent to backend -> Whisper transcribes correctly | [ ] | Integration test: `turn.test.ts` |
| 1.3 | Transcription passed to LLM -> narration generated | [ ] | Integration test: `turn.test.ts` |
| 1.4 | Narration text -> TTS audio generated | [ ] | Integration test: `turn.test.ts` |
| 1.5 | TTS audio -> plays in app | [ ] | Manual test on device |
| 1.6 | **Full loop works end-to-end** (binary pass/fail) | [ ] | Manual test on 3+ devices |

**Decision:** If 1.6 fails, Sprint 2 does NOT pass.

---

## Gate 2: Latency (BLOCKING)

| # | Check | Target | Status | Evidence |
|---|-------|--------|--------|----------|
| 2.1 | Client-side p50 latency (mic release -> first audio) | < 3.0s | [ ] | PostHog telemetry |
| 2.2 | Server-side p50 (request -> first SSE event) | < 500ms | [ ] | Backend logs |
| 2.3 | SSE first event after turn request | < 1.0s (p95) | [ ] | Integration test |
| 2.4 | Latency classification distribution | >50% excellent/good | [ ] | `latency-tracker.test.ts` |

**Decision:** If p50 > 3s, evaluate Deepgram/ElevenLabs alternatives before Sprint 3.

---

## Gate 3: SSE Streaming (BLOCKING)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 3.1 | Events arrive in correct order: turn_start -> transcription -> moderation_pass -> narration_chunk(s) -> narration_complete -> tts_chunk(s) -> tts_complete -> state_update -> turn_end | [ ] | `turn.test.ts` |
| 3.2 | Each event has correct `id:`, `event:`, `data:` fields | [ ] | `sse-stream.test.ts` |
| 3.3 | Event IDs are monotonically increasing | [ ] | `turn.test.ts` |
| 3.4 | Last 50 events buffered per session | [ ] | `sse-stream.test.ts`, `redis.test.ts` |
| 3.5 | `Last-Event-ID` reconnection returns only missed events | [ ] | `sse-stream.test.ts` |

---

## Gate 4: Content Moderation (BLOCKING)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 4.1 | Safe player input passes through normally | [ ] | `content-moderation.test.ts` |
| 4.2 | Unsafe input (violence, sexual, hate) is flagged | [ ] | `content-moderation.test.ts` |
| 4.3 | Flagged input -> in-game redirect response (not error) | [ ] | `turn.test.ts` |
| 4.4 | Fantasy violence ("I attack the goblin") is NOT flagged | [ ] | `content-moderation.test.ts` |
| 4.5 | Moderation API failure -> turn continues (graceful degradation) | [ ] | `content-moderation.test.ts` |
| 4.6 | Czech language unsafe content is also caught | [ ] | `content-moderation.test.ts` |

---

## Gate 5: State Persistence (BLOCKING)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 5.1 | Game state saved to Redis after each turn | [ ] | `redis.test.ts` |
| 5.2 | Game state persisted to PostgreSQL every 5 turns | [ ] | `turn.test.ts` |
| 5.3 | Session load restores full game state (character, inventory, location, quest) | [ ] | `game.test.ts` |
| 5.4 | Game state survives app restart (Redis -> PG -> load) | [ ] | Manual test |
| 5.5 | Location changes persist after turn | [ ] | `turn.test.ts` |
| 5.6 | Turn count increments correctly | [ ] | `turn.test.ts` |

---

## Gate 6: Conversation Memory (IMPORTANT, non-blocking)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 6.1 | Conversation history grows by 2 entries per turn (player + AI) | [ ] | `turn.test.ts` |
| 6.2 | History window limited to 15 turns (30 messages) | [ ] | `redis.test.ts` |
| 6.3 | Summary generated at turn 10, 20, 30 | [ ] | `summary-service.test.ts` |
| 6.4 | Summary NOT generated at non-milestone turns | [ ] | `summary-service.test.ts` |
| 6.5 | Summary captures key decisions, NPCs, items | [ ] | `summary-service.test.ts` |
| 6.6 | Summary failure preserves old summary | [ ] | `summary-service.test.ts` |
| 6.7 | After 15+ turns, AI still references earlier decisions (via summary) | [ ] | Manual test with native speaker |

---

## Gate 7: Czech Quality (DECISION POINT)

| # | Check | Target | Status | Evidence |
|---|-------|--------|--------|----------|
| 7.1 | Native Czech speaker plays 5 sessions | Completed | [ ] | Session logs |
| 7.2 | Native speaker rates Czech quality | >= 7/10 | [ ] | Rating form |
| 7.3 | Czech prompts loaded correctly for `language: 'cs'` | Pass | [ ] | `prompt-service.test.ts` |
| 7.4 | Czech TTS pronunciation acceptable | >= 6/10 | [ ] | Native speaker rating |

**Decision at end of Sprint 2:**
- Rating >= 7/10 -> Czech-first launch
- Rating < 7/10 -> Pivot to English-first launch

---

## Gate 8: Error Recovery (BLOCKING)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 8.1 | STT failure -> error event with helpful message | [ ] | `turn.test.ts` |
| 8.2 | LLM failure -> fallback response from `fallback_responses.json` | [ ] | `turn.test.ts` |
| 8.3 | LLM invalid JSON -> Zod catches it, fallback sent | [ ] | `turn.test.ts` |
| 8.4 | TTS failure -> narration_complete with text only (no tts_chunk) | [ ] | `turn.test.ts` |
| 8.5 | Moderation API failure -> turn continues | [ ] | `content-moderation.test.ts` |
| 8.6 | No unhandled promise rejections in any failure path | [ ] | All test suites |

---

## Gate 9: Cost Tracking (IMPORTANT, non-blocking)

| # | Check | Target | Status | Evidence |
|---|-------|--------|--------|----------|
| 9.1 | Per-turn cost logged with breakdown | All 5 categories | [ ] | `cost-tracker.test.ts` |
| 9.2 | Cost per turn within budget | $0.15-$0.25 per session (30 turns) | [ ] | `cost-tracker.test.ts` |
| 9.3 | Daily cost alerting threshold configurable | Alert at $10/day | [ ] | `cost-tracker.test.ts` |
| 9.4 | turn_end event includes cost breakdown | All fields present | [ ] | `turn.test.ts` |

---

## Test Coverage Summary

| Test Suite | File | Tests | Status |
|------------|------|-------|--------|
| Turn endpoint | `tests/routes/turn.test.ts` | ~20 | [ ] |
| SSE stream | `tests/routes/sse-stream.test.ts` | ~15 | [ ] |
| Prompt service | `tests/services/prompt-service.test.ts` | ~15 | [ ] |
| Redis service | `tests/services/redis.test.ts` | ~20 | [ ] |
| Cost tracker | `tests/services/cost-tracker.test.ts` | ~15 | [ ] |
| Summary service | `tests/services/summary-service.test.ts` | ~15 | [ ] |
| Content moderation | `tests/middleware/content-moderation.test.ts` | ~15 | [ ] |
| Latency tracker | `tests/performance/latency-tracker.test.ts` | ~15 | [ ] |
| AI quality evaluator | `tests/ai-quality/quality-evaluator.ts` | Updated | [ ] |

**Total estimated tests: ~130+**

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Lead | | | |
| Backend Developer | | | |
| Project Orchestrator | | | |

**Sprint 2 Status:** [ ] PASS / [ ] FAIL / [ ] CONDITIONAL PASS

**Notes:**
