# Sprint 3 Gate Verification Checklist

## Version 1.0 | Sprint 3

This checklist must be fully verified before Sprint 3 is considered complete.
All items are evaluated as pass/fail. Blocking items prevent sprint sign-off.

---

## Gate 1: AI Prompt System (BLOCKING)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1.1 | System prompt (CS) produces valid JSON narration responses | [ ] | Manual test + `prompt-service.test.ts` |
| 1.2 | System prompt (EN) produces valid JSON narration responses | [ ] | Manual test + `prompt-service.test.ts` |
| 1.3 | Class openings exist and are non-empty for all 4 classes (CS + EN) | [ ] | File inspection |
| 1.4 | Class openings are 80-100 words, TTS-friendly prose | [ ] | Word count check |
| 1.5 | Story arc templates exist with quest_progress milestones | [ ] | `prompts/story_arcs.txt` |
| 1.6 | NPC interaction guidelines with 4 archetypes (CS + EN examples) | [ ] | `prompts/npc_interaction.txt` |
| 1.7 | Death save mechanic prompt with CS + EN versions | [ ] | `prompts/death_save.txt` |
| 1.8 | Atmosphere transitions with CS + EN versions | [ ] | `prompts/atmosphere.txt` |
| 1.9 | Difficulty modifiers produce noticeably different AI behavior | [ ] | Manual A/B test (beginner vs hardcore) |
| 1.10 | Content safety rules prevent inappropriate output | [ ] | `content-moderation.test.ts` |

**Decision:** If 1.1 or 1.2 fail, Sprint 3 does NOT pass.

---

## Gate 2: Character System (BLOCKING)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 2.1 | Character creation works for all 4 classes | [ ] | `character-service.test.ts` |
| 2.2 | Each class has correct starting HP, inventory, abilities, gold | [ ] | `character-service.test.ts` |
| 2.3 | HP damage clamps to 0 (no negative health) | [ ] | `character-service.test.ts` |
| 2.4 | HP heal clamps to maxHealth (no overheal) | [ ] | `character-service.test.ts` |
| 2.5 | Death save triggers when HP reaches 0 from above 0 | [ ] | `character-service.test.ts` |
| 2.6 | Death save does NOT trigger when HP is already 0 | [ ] | `character-service.test.ts` |
| 2.7 | Inventory add works, enforces max 20 items | [ ] | `character-service.test.ts` |
| 2.8 | Inventory remove works, errors on missing item | [ ] | `character-service.test.ts` |
| 2.9 | Gold add/subtract works, floors at 0 | [ ] | `character-service.test.ts` |
| 2.10 | Level up: level+1, maxHP+5, health restored to max | [ ] | `character-service.test.ts` |

---

## Gate 3: Combat System (BLOCKING)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 3.1 | Enemy generation for all 5 types (goblin, skeleton, bandit, wolf, troll) | [ ] | `combat-service.test.ts` |
| 3.2 | Enemy stats scale with player level (15% per level) | [ ] | `combat-service.test.ts` |
| 3.3 | Unknown enemy type falls back to goblin | [ ] | `combat-service.test.ts` |
| 3.4 | Combat initiation sets threat level to critical | [ ] | `combat-service.test.ts` |
| 3.5 | Attack action: damage on success, miss on fail, crit on nat 20 | [ ] | `combat-service.test.ts` |
| 3.6 | Defend action: reduces incoming damage | [ ] | `combat-service.test.ts` |
| 3.7 | Spell action: 1.5x damage on success, fizzle on fail | [ ] | `combat-service.test.ts` |
| 3.8 | Flee action: end combat on success, free hit on fail | [ ] | `combat-service.test.ts` |
| 3.9 | Victory: XP + gold rewards, threat level restored | [ ] | `combat-service.test.ts` |
| 3.10 | Defeat: death save triggered, player revived | [ ] | `combat-service.test.ts` + manual |
| 3.11 | Combat state cleared from Redis after end | [ ] | `combat-service.test.ts` |

---

## Gate 4: Prompt Quality -- Czech (BLOCKING)

| # | Check | Target | Status | Evidence |
|---|-------|--------|--------|----------|
| 4.1 | Czech narration is idiomatic (not translated-sounding) | >= 7/10 | [ ] | Native speaker review |
| 4.2 | Czech class openings are dramatic and natural | >= 7/10 | [ ] | Native speaker review |
| 4.3 | Czech NPC dialogue uses correct register (formal "vy") | Pass | [ ] | Manual review |
| 4.4 | Czech death save text is dramatic and grammatically correct | Pass | [ ] | Native speaker review |
| 4.5 | Czech atmosphere lines sound natural for TTS | Pass | [ ] | TTS playback test |

**Decision:** If 4.1 < 7/10, evaluate English-first launch.

---

## Gate 5: Prompt Quality -- English (BLOCKING)

| # | Check | Target | Status | Evidence |
|---|-------|--------|--------|----------|
| 5.1 | English narration is vivid and engaging | >= 7/10 | [ ] | Review |
| 5.2 | English class openings are dramatic and hook the player | >= 7/10 | [ ] | Review |
| 5.3 | English NPC dialogue has distinct voices per archetype | Pass | [ ] | Manual review |
| 5.4 | English death save text is dramatic | Pass | [ ] | Review |
| 5.5 | English prompts produce output within word limits | Pass | [ ] | Token count check |

---

## Gate 6: Story Arc Integration (IMPORTANT, non-blocking)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 6.1 | Quest arc template has 5 acts with progress milestones | [ ] | `prompts/story_arcs.txt` |
| 6.2 | Rescue arc template has escalating danger beats | [ ] | `prompts/story_arcs.txt` |
| 6.3 | Mystery arc template has clue-based progression | [ ] | `prompts/story_arcs.txt` |
| 6.4 | AI references quest_progress to pace narration | [ ] | Manual 10-turn test |
| 6.5 | Story arc selection works at game creation | [ ] | Integration test |

---

## Gate 7: Death Save Flow (BLOCKING)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 7.1 | HP 0 triggers dramatic "darkness closes in" narration | [ ] | Manual test |
| 7.2 | Player prompted for d20 roll | [ ] | Manual test |
| 7.3 | Roll 10+: stabilize at 1 HP, dramatic revival | [ ] | Manual test |
| 7.4 | Roll 9-: mysterious force revival at 1 HP | [ ] | Manual test |
| 7.5 | Player NEVER permanently dies in MVP | [ ] | Manual test (10 death saves) |
| 7.6 | Death save produces valid JSON with stateUpdates | [ ] | Manual test |

---

## Gate 8: TTS Compatibility (IMPORTANT, non-blocking)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 8.1 | All prompts produce output with no lists/formatting | [ ] | Spot check 20 responses |
| 8.2 | Output sentences are short and punchy (ear-friendly) | [ ] | TTS playback |
| 8.3 | No parenthetical notes or dashes in output | [ ] | Spot check |
| 8.4 | Czech diacritics are correctly handled in TTS | [ ] | Czech TTS playback |
| 8.5 | Atmospheric transitions are single sentences | [ ] | `prompts/atmosphere.txt` |

---

## Gate 9: Test Coverage (BLOCKING)

| # | Check | Target | Status | Evidence |
|---|-------|--------|--------|----------|
| 9.1 | Character service test suite | >= 20 tests | [ ] | `character-service.test.ts` |
| 9.2 | Combat service test suite | >= 20 tests | [ ] | `combat-service.test.ts` |
| 9.3 | All existing Sprint 2 tests still pass | 100% | [ ] | `npm test` output |
| 9.4 | E2E gameplay test specs created | Exists | [ ] | `mobile/e2e/gameplay.test.ts` |
| 9.5 | No failing tests in full suite | 0 failures | [ ] | CI/CD run |

---

## Gate 10: Integration Sanity (BLOCKING)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 10.1 | New game -> class opening plays via TTS | [ ] | Manual test all 4 classes |
| 10.2 | Combat encounter -> combat prompt -> dice roll -> resolution | [ ] | Manual test |
| 10.3 | NPC encounter -> archetype-appropriate dialogue | [ ] | Manual test |
| 10.4 | Session save preserves combat state | [ ] | Manual test |
| 10.5 | Session load restores mid-combat state | [ ] | Manual test |
| 10.6 | Fallback responses work when AI is unavailable | [ ] | Kill API key + test |

---

## Test Coverage Summary

| Test Suite | File | Expected Tests | Status |
|------------|------|----------------|--------|
| Character service | `tests/services/character-service.test.ts` | ~25 | [ ] |
| Combat service | `tests/services/combat-service.test.ts` | ~25 | [ ] |
| Prompt service | `tests/services/prompt-service.test.ts` | ~15 | [ ] |
| Cost tracker | `tests/services/cost-tracker.test.ts` | ~15 | [ ] |
| Summary service | `tests/services/summary-service.test.ts` | ~15 | [ ] |
| Content moderation | `tests/middleware/content-moderation.test.ts` | ~15 | [ ] |
| SSE stream | `tests/routes/sse-stream.test.ts` | ~15 | [ ] |
| Turn endpoint | `tests/routes/turn.test.ts` | ~20 | [ ] |
| Auth | `tests/routes/auth.test.ts` | ~10 | [ ] |
| Game routes | `tests/routes/game.test.ts` | ~10 | [ ] |
| Redis service | `tests/services/redis.test.ts` | ~20 | [ ] |
| Latency tracker | `tests/performance/latency-tracker.test.ts` | ~15 | [ ] |
| E2E gameplay | `mobile/e2e/gameplay.test.ts` | ~5 specs | [ ] |

**Total estimated tests: ~205+**

---

## Prompt File Inventory

| File | Language | Status |
|------|----------|--------|
| `system_prompt_base_cs.txt` | CS | [ ] |
| `system_prompt_base_en.txt` | EN | [ ] |
| `class_openings/warrior_opening_cs.txt` | CS | [ ] |
| `class_openings/warrior_opening_en.txt` | EN | [ ] |
| `class_openings/mage_opening_cs.txt` | CS | [ ] |
| `class_openings/mage_opening_en.txt` | EN | [ ] |
| `class_openings/rogue_opening_cs.txt` | CS | [ ] |
| `class_openings/rogue_opening_en.txt` | EN | [ ] |
| `class_openings/ranger_opening_cs.txt` | CS | [ ] |
| `class_openings/ranger_opening_en.txt` | EN | [ ] |
| `story_arcs.txt` | Both | [ ] |
| `npc_interaction.txt` | Both | [ ] |
| `death_save.txt` | Both | [ ] |
| `atmosphere.txt` | Both | [ ] |
| `combat.txt` | EN | [ ] |
| `scene_description.txt` | EN | [ ] |
| `dice_interpretation.txt` | EN | [ ] |
| `cliffhanger.txt` | EN | [ ] |
| `recap.txt` | EN | [ ] |
| `conversation_summary.txt` | EN | [ ] |
| `tutorial.txt` | EN | [ ] |
| `difficulty_modifiers.txt` | EN | [ ] |
| `content_safety_rules.txt` | EN | [ ] |
| `adversarial_defense.txt` | EN | [ ] |
| `quality_evaluation.txt` | EN | [ ] |
| `fallback_responses.json` | Both | [ ] |
| `game_state_schema.json` | -- | [ ] |

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Lead | | | |
| Backend Developer | | | |
| Prompt Engineer | | | |
| Project Orchestrator | | | |

**Sprint 3 Status:** [ ] PASS / [ ] FAIL / [ ] CONDITIONAL PASS

**Notes:**
