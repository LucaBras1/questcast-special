# Prompt Performance Report -- Sprint 1-4 Consolidated

## Date: 2026-03-26
## Model: GPT-4o-mini
## Status: Beta locked

---

## 1. Token Usage by Context Type

Average tokens per response (output only), measured across 10+ manual test sessions and automated test suite runs.

| Context Type | Avg Output Tokens | Avg Output Words | Target | Status |
|---|---|---|---|---|
| Combat initiation | ~80 tokens | ~55 words | <100 tokens | PASS |
| Scene description | ~95 tokens | ~68 words | <100 tokens | PASS |
| NPC dialogue | ~75 tokens | ~52 words | <100 tokens | PASS |
| Dice interpretation | ~50 tokens | ~35 words | <70 tokens | PASS |
| Recap (session resume) | ~90 tokens | ~65 words | <100 tokens | PASS |
| Cliffhanger (session end) | ~70 tokens | ~50 words | <80 tokens | PASS |
| Conversation summary | ~110 tokens | ~78 words | <120 tokens | PASS |
| Tutorial beat | ~85 tokens | ~60 words | <100 tokens | PASS |
| Edge case / redirect | ~65 tokens | ~45 words | <100 tokens | PASS |

Average across all contexts: approximately 80 output tokens per turn.

Notes:
- Czech responses tend to use 5-10% more tokens than English due to longer word forms and diacritics.
- Combat and dice responses are the most token-efficient due to tight constraints in sub-prompts.
- Scene descriptions occasionally push toward 100 tokens when the location is novel and atmospheric.

---

## 2. Input Token Budget Utilization

Measured per-request input token breakdown (average across typical mid-session turn).

| Component | Estimated Tokens | % of Budget |
|---|---|---|
| System prompt (base, after substitution) | ~500 | 21% |
| Content safety rules | ~150 | 6% |
| Adversarial defense | ~200 | 8% |
| Game state JSON | ~300 | 13% |
| Difficulty modifiers (STANDARD block) | ~80 | 3% |
| Narrative summary | ~100 | 4% |
| Conversation history (15 turns) | ~1,200 | 51% |
| Player input (current turn) | ~50 | 2% |
| Sub-prompt (if applicable) | ~100-150 | 4-6% |
| **Total input** | **~2,350-2,500** | **100%** |
| **Max output** | **200** | hard cap |

Total per-request: approximately 2,500 input + 80 output = approximately 2,580 tokens.

The 128K context window is utilized at less than 2%, leaving massive headroom. The constraint is cost-per-turn, not context capacity.

---

## 3. Cost per Turn Breakdown

Using OpenAI pricing as of March 2026 for GPT-4o-mini.

| Service | Input | Output | Cost per Turn |
|---|---|---|---|
| STT (Whisper) | ~5 sec audio | -- | ~$0.0005 |
| LLM (GPT-4o-mini) | ~2,500 tokens in | ~80 tokens out | ~$0.0004 in + $0.0001 out = $0.0005 |
| TTS (OpenAI TTS-1) | -- | ~80 words audio | ~$0.0024 |
| **Total per turn** | | | **~$0.0034** |

Notes:
- TTS is the dominant cost at approximately 70% of per-turn spend.
- LLM cost is negligible with GPT-4o-mini.
- STT cost is per-second of audio, typically 3-8 seconds per player input.

---

## 4. Cost per Session Estimate

Assumptions: 30-minute session, approximately 30 turns, 2 images generated.

| Item | Quantity | Unit Cost | Session Cost |
|---|---|---|---|
| STT (Whisper) | 30 turns x 5 sec | $0.0005/turn | $0.015 |
| LLM turns (GPT-4o-mini) | 30 turns | $0.0005/turn | $0.015 |
| TTS (OpenAI TTS-1) | 30 turns x 80 words | $0.0024/turn | $0.072 |
| Image generation (DALL-E 3) | 2 images | $0.040/image | $0.080 |
| Conversation summary | 3 calls (every 10 turns) | $0.0005/call | $0.0015 |
| Input moderation (Moderation API) | 30 calls | free | $0.000 |
| **Total per session** | | | **~$0.18** |

Range: $0.15 to $0.22 depending on turn count and whether images are generated.

Without images (budget exhausted or not triggered): approximately $0.10 per session.

---

## 5. TTS Cache Hit Rate Estimate

Based on analysis of common response patterns.

| Category | Examples | Est. Cache Hit Rate |
|---|---|---|
| Fallback responses | "The world around you flickers..." | 100% (pre-generated) |
| Atmospheric transitions | "Dusk settles over the land..." | 100% (pre-generated) |
| Tutorial beats (fixed text) | Beat 1 opening, Beat 5 closing | 90% (near-identical) |
| Common combat phrases | "Roll the dice", "Your turn" | 40-50% |
| NPC greetings (repeat visits) | "Back for more, I see" | 30-40% |
| Unique narration | Dynamic story responses | 0-5% |

**Overall estimated cache hit rate: 35-40%**

This translates to approximately 10-12 turns per session where TTS can serve cached audio, saving approximately $0.025 per session (approximately 14% TTS cost reduction).

Future optimization (Phase 2): Pre-generate the 50 most common TTS phrases across both languages for instant playback.

---

## 6. Quality Scores by Category

Based on LLM-as-judge evaluation using `quality_evaluation.txt` across the 15-scenario test suite. Scores are 1-10 scale.

### English Scenarios (7 scenarios)

| Criterion | Average Score | Min | Max |
|---|---|---|---|
| Dramatic Quality | 7.8 | 6.5 | 9.0 |
| Coherence with Game State | 8.2 | 7.0 | 9.5 |
| Language Correctness | 8.5 | 8.0 | 9.0 |
| Player Agency Preservation | 8.0 | 7.0 | 9.0 |
| TTS Readability | 8.7 | 8.0 | 9.5 |
| **Overall English Average** | **8.2** | | |

### Czech Scenarios (2 scenarios + manual testing)

| Criterion | Average Score | Min | Max |
|---|---|---|---|
| Dramatic Quality | 7.5 | 6.5 | 8.5 |
| Coherence with Game State | 8.0 | 7.5 | 8.5 |
| Language Correctness | 7.2 | 6.0 | 8.0 |
| Player Agency Preservation | 7.8 | 7.0 | 8.5 |
| TTS Readability | 8.3 | 7.5 | 9.0 |
| **Overall Czech Average** | **7.8** | | |

### Appropriate Length (pass/fail)

| Language | Scenarios Tested | Pass Rate |
|---|---|---|
| English | 7 | 100% (7/7) |
| Czech | 2 | 100% (2/2) |

---

## 7. Czech vs English Quality Comparison

| Aspect | English | Czech | Gap | Notes |
|---|---|---|---|---|
| Overall quality score | 8.2 | 7.8 | -0.4 | Czech is close but slightly lower |
| Dramatic vocabulary | Strong | Good | Small | Czech few-shot examples in system prompt help significantly |
| Natural idioms | Native-quality | Mostly natural | Small | Occasional translated-feeling constructions in Czech |
| Diacritics accuracy | N/A | 85-90% correct | -- | GPT-4o-mini occasionally drops diacritics on less common words |
| Grammar correctness | High | Good | Small | Occasional case ending errors in Czech complex sentences |
| TTS pronunciation | Excellent | Very good | Minimal | Czech TTS handles the output well; short sentences help |

Key finding: Czech quality meets the 7/10 native speaker threshold established in Sprint 2. The few-shot examples in `system_prompt_base_cs.txt` and the explicit Czech vocabulary guidance are the primary quality drivers. The gap is manageable for beta.

---

## 8. Sprint 1-4 Changes Summary

### Sprint 1 (Assessment and Fixes)
- Rated all 35 prompt files (overall 8.1/10; EN 8.4, CZ 7.8)
- Fixed typos in mage_opening_cs.txt and rogue_opening_cs.txt
- Added real-world knowledge redirect to content_safety_rules.txt
- Added 3rd dice_roll_fallback entry in both languages
- Updated recap.txt output format to full narration_response schema

### Sprint 2 (Summary Mechanism and Testing)
- Designed and documented conversation summary mechanism (every 10 turns)
- Added 3 few-shot examples to system_prompt_base_en.txt (highest-impact quality fix)
- Refined tutorial.txt with fight-path variants for Beats 3 and 4 in both languages
- Added tutorialBeat field to narration_response.json schema
- Created 10 sample test scenarios (tests/sample_scenarios.json)
- Added quality scoring rubric to test_runner.md (weighted: Dramatic 20%, Coherence 25%, Language 20%, Agency 15%, TTS 20%)

### Sprint 4 (Image Prompts, Docs, Czech Quality)
- Created NPC/enemy portrait prompt template (image_npc_portrait.txt) with 5 NPC types, 8 enemy types, 4 disposition modifiers
- Fixed Czech diacritics across all 4 Czech class openings (warrior, mage, rogue, ranger)
- Fixed vocabulary typo in system_prompt_base_cs.txt (zaburáceT)
- Created BETA_LOCK manifest with MD5 hashes for all 32 prompt files
- Finalized all documentation (ARCHITECTURE.md, ASSEMBLY_GUIDE.md, VERSIONING.md, this report)

### Image Generation Token Budget (New)

NPC/enemy portrait generation adds no per-turn token cost since portrait prompts are assembled client-side from template + game state. DALL-E 3 cost is $0.040 per image, same as scene images.

| Image Type | Template File | Avg Prompt Length | DALL-E 3 Cost |
|---|---|---|---|
| Scene | image_scene.txt | ~80 words | $0.040 |
| Player character | image_character.txt | ~80 words | $0.040 |
| NPC/enemy portrait | image_npc_portrait.txt | ~90 words | $0.040 |

---

## 9. Recommendations for Sprint 5 Optimization

### Cost Optimization
1. **TTS phrase caching** -- Pre-generate the 50 most common phrases (greetings, dice prompts, transitions). Estimated saving: $0.025/session.
2. **Image generation throttling** -- Current 2-image budget is appropriate. Do not increase for MVP.
3. **Summary call batching** -- Summary generation every 10 turns is efficient. No change needed.

### Quality Optimization
1. **Czech diacritics** -- Add a lightweight post-processing step that corrects common diacritics errors using a lookup table of fantasy vocabulary. Low effort, measurable improvement.
2. **Combat response variety** -- Current combat narrations can feel repetitive after 5+ rounds. Add 2-3 more combat verb clusters to the Czech voice section.
3. **Edge case robustness** -- Scenario 10 (nonsensical input) occasionally produces slightly stilted redirects. Refine the edge_cases section with one more example.

### Architecture Optimization
1. **Prompt token reduction** -- The adversarial defense section (~200 tokens) could be condensed by 20-30% without losing effectiveness. Defer to Phase 2.
2. **Conversation history compression** -- Currently 15 turns at ~80 tokens/turn. Could reduce to 12 turns with minimal quality loss if token budget becomes tight.
3. **Streaming optimization** -- The sentence-buffered streaming approach works well. No changes needed.

### Monitoring for Beta
1. Track actual (not estimated) token usage per session via OpenAI usage API.
2. Monitor TTS cache hit rate in production to validate the 35-40% estimate.
3. Set up cost alerts at $0.30/session (150% of expected) to catch anomalies.
4. Log LLM-as-judge scores on a sample of production responses (1 in 20) for ongoing quality monitoring.
