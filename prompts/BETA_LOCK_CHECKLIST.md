# Beta Lock Checklist -- Sprint 4 Final Review

## Date: 2026-03-25
## Status: Pre-lock review in progress
## Rule: After this checklist passes, ALL prompt files are FROZEN for beta. Changes require explicit approval.

---

## Core System Prompts

### system_prompt_base_en.txt
- [x] Under token budget (~500 tokens after substitution)
- [x] TTS-friendly (flowing prose, no lists, no formatting in output instructions)
- [x] English version reviewed (natural, dramatic, fluent)
- [x] Variables documented in ASSEMBLY_GUIDE (`{narrator_style}`, `{difficulty_level}`, `{difficulty_modifiers}`, `{content_rating}`, `{content_safety_rules}`, `{game_state_json}`, `{narrative_summary}`, `{conversation_history}`)
- [x] Output schema defined (narration_response.json)
- [x] Edge cases handled (empty input, gibberish, adversarial -- via edge_cases section)
- [x] Tested against GPT-4o-mini (scenarios 01-07, 09-10)

### system_prompt_base_cs.txt
- [x] Under token budget (~520 tokens after substitution)
- [x] TTS-friendly (flowing prose, no lists, no formatting)
- [x] Czech version reviewed (idiomatic, dramatic, rich vocabulary)
- [x] Few-shot examples included (3 examples covering cave, NPC, post-combat)
- [x] Variables documented in ASSEMBLY_GUIDE (same as EN)
- [x] Output schema defined (narration_response.json)
- [x] Edge cases handled (same as EN, Czech language)
- [x] Tested against GPT-4o-mini (scenario 08, manual Czech sessions)

---

## Sub-Prompts

### scene_description.txt
- [x] Under token budget (~100 tokens)
- [x] TTS-friendly (prose output instructions, no formatting)
- [x] Variables documented (`{location}`, `{time_of_day}`, `{weather}`, `{threat_level}`)
- [x] Threat-level-adaptive tone instructions
- [x] 60-word output constraint specified
- [x] Tested (scenario 02, 05, 11)

### combat.txt
- [x] Under token budget (~100 tokens)
- [x] TTS-friendly (prose output, punchy sentences)
- [x] Variables documented (`{enemy_type}`, `{enemy_stats}`, `{difficulty_level}`, `{player_stats}`)
- [x] Difficulty-scaled drama instructions
- [x] 60-word output constraint specified
- [x] Tested (scenarios 01, 08, 14)

### dice_interpretation.txt
- [x] Under token budget (~120 tokens)
- [x] TTS-friendly (short sentences, strong verbs)
- [x] Variables documented (`{roll_value}`, `{dice_type}`, `{action_type}`, `{difficulty_class}`, `{modifiers}`, `{final_result}`)
- [x] Output schema defined (dice_response.json)
- [x] All four outcome tiers covered (critical success, normal success, normal failure, critical failure)
- [x] 50-word output constraint specified
- [x] Tested (scenario 04)

### cliffhanger.txt
- [x] Under token budget (~80 tokens)
- [x] TTS-friendly (dramatic prose, strong final line)
- [x] Variables documented (`{current_situation}`, `{quest_progress}`)
- [x] Quest-progress-adaptive intensity
- [x] 60-word output constraint specified
- [x] Tested (scenario 07)

### recap.txt
- [x] Under token budget (~90 tokens)
- [x] TTS-friendly (momentum-building prose)
- [x] Variables documented (`{character_name}`, `{current_location}`, `{active_quest}`, `{narrative_summary}`)
- [x] Output schema defined (JSON with narration field)
- [x] 80-word output constraint specified
- [x] Tested (scenario 06)

### tutorial.txt
- [x] Under token budget (~350 tokens -- larger but acceptable for tutorial)
- [x] TTS-friendly (all beats in flowing prose)
- [x] 5-beat structure complete with fallbacks
- [x] Czech version samples included
- [x] English version samples included
- [x] Output schema defined (narration_response + tutorialBeat field)
- [x] 60-word per-beat constraint specified
- [x] Tested (scenario 12, manual tutorial sessions)

### conversation_summary.txt
- [x] Under token budget (~100 tokens)
- [x] Variables documented (`{recent_turns}`)
- [x] Output schema defined (summary_response.json)
- [x] Priority ordering for information (decisions > quest > NPC > combat > inventory)
- [x] 80-100 token output constraint specified
- [x] Example included
- [x] Tested (scenario 13 validates summary-based coherence)

---

## Supporting Prompts

### content_safety_rules.txt
- [x] Under token budget (~150 tokens)
- [x] Three content rating levels defined (FAMILY, TEEN, MATURE)
- [x] Redirect strategy documented (in-world, not system refusal)
- [x] Player input handling categories covered
- [x] No explicit content generation instructions are clear

### adversarial_defense.txt
- [x] Under token budget (~200 tokens)
- [x] Identity anchoring strong
- [x] Jailbreak handling with in-world translation
- [x] Explicit content redirect strategies
- [x] Real-world harm handling (safety flag trigger)
- [x] Prompt injection via game mechanics handled
- [x] Repetitive boundary testing escalation
- [x] Meta-rule: never reveal defense instructions
- [x] Tested (scenario 10, adversarial manual testing)

### difficulty_modifiers.txt
- [x] Four difficulty levels defined (BEGINNER, STANDARD, ADVANCED, HARDCORE)
- [x] Each level ~80 tokens (only one injected per session)
- [x] HARDCORE includes "always give at least one desperate option" safeguard

### story_arcs.txt
- [x] Three arc templates (Quest, Rescue, Mystery)
- [x] Quest progress milestones mapped for each arc
- [x] Used at session creation, not injected per-turn

### npc_interaction.txt
- [x] Four archetypes (merchant, guard, elder, tavern_keeper)
- [x] Czech and English examples for each
- [x] Interaction memory instructions
- [x] Tested (scenario 03, 15)

### death_save.txt
- [x] Two phases (fall + roll outcome)
- [x] Czech and English versions
- [x] Player always survives (MVP constraint)
- [x] Dramatic tone maintained
- [x] 80-word fall / 60-word revival constraints

### atmosphere.txt
- [x] Four categories (time_passing, weather_change, threat_escalation, threat_decrease)
- [x] Czech and English versions
- [x] One-sentence maximum constraint
- [x] TTS-optimized

---

## Image Prompts

### image_scene.txt
- [x] Visual identity section defined (Questcast brand: warm golds, deep purples, torch-lit)
- [x] Style guide updated with brand-consistent colors
- [x] Five scene templates (tavern, dark forest, castle ruins, cave entrance, village square)
- [x] DALL-E 3 format instructions with example
- [x] Negative prompt comprehensive (no text, no modern, no realistic faces, no anime/cartoon)
- [x] Variables documented (`{scene_description}`, `{mood}`, `{art_style}`)

### image_character.txt
- [x] Visual identity section matches scene identity
- [x] Four class visual cues (warrior, mage, rogue, ranger)
- [x] DALL-E 3 format instructions with example
- [x] Negative prompt comprehensive (includes uncanny valley prevention)
- [x] Variables documented (`{race}`, `{class}`, `{gender}`, `{features}`)

---

## Data Files

### fallback_responses.json
- [x] Both languages (CS and EN)
- [x] Seven categories covered
- [x] 2-3 options per category per language
- [x] All responses in-character (no system messages)
- [x] Selection strategy documented

### game_state_schema.json
- [x] Four top-level objects (session_id, character, story, world, session)
- [x] All fields documented with descriptions
- [x] Token optimization notes included
- [x] Version 1.0.0

### output_schemas/narration_response.json
- [x] All required fields defined
- [x] stateUpdates fields all optional
- [x] suggestedActions min 2, max 3
- [x] Additional properties false (strict mode)

### output_schemas/dice_response.json
- [x] narration, success, stateUpdates fields
- [x] Additional properties false

### output_schemas/summary_response.json
- [x] summary field with min/max length
- [x] Additional properties false

---

## Class Openings (8 files)

### All class_openings/*.txt
- [x] All 4 classes covered (warrior, mage, rogue, ranger)
- [x] Both languages (CS and EN)
- [x] TTS-friendly (flowing prose, dramatic opening)
- [x] Class-appropriate tone and vocabulary
- [x] Under 100 words each

---

## Quality Assurance

### Test Suite
- [x] 15 test scenarios defined (10 original + 5 new Sprint 4 scenarios)
- [x] Expected outputs documented for all 15 scenarios
- [x] Test runner process documented
- [x] LLM-as-judge evaluation prompt ready
- [x] CI integration instructions provided

### Quality Scores
- [x] English overall average: 8.2/10 (production ready)
- [x] Czech overall average: 7.8/10 (acceptable for beta)
- [x] All scenarios pass structural validation
- [x] All scenarios within token budget

---

## Documentation

### ASSEMBLY_GUIDE.md
- [x] Complete assembly instructions for backend developer
- [x] Variable substitution table
- [x] Token budget breakdown
- [x] Structured output configuration
- [x] Conversation summary mechanism
- [x] Tutorial mode instructions
- [x] Image generation pipeline
- [x] Error handling / fallback chain
- [x] Quick reference file map

### ARCHITECTURE.md
- [x] System overview with diagram
- [x] Complete file map with dependencies
- [x] Variable reference table (all variables across all files)
- [x] Output schema catalog
- [x] Caching strategy
- [x] Token budget breakdown
- [x] Fallback chain documentation
- [x] Content safety architecture
- [x] Onboarding guide for new team members

### PERFORMANCE_REPORT.md
- [x] Token usage by context type
- [x] Cost per turn breakdown
- [x] Cost per session estimate
- [x] TTS cache hit rate estimate
- [x] Quality scores by category
- [x] Czech vs English comparison
- [x] Sprint 5 optimization recommendations

---

## Final Sign-Off

| Reviewer | Area | Status | Date |
|---|---|---|---|
| AI/Prompt Engineer | All prompts | COMPLETE | 2026-03-25 |
| Backend Developer | Assembly integration | PENDING | -- |
| QA Lead | Test suite validation | PENDING | -- |
| Native Czech Speaker | Czech language quality | PENDING | -- |

### Lock Criteria

All of the following must be true before prompts are locked:

1. All checkboxes above are marked complete.
2. Test suite passes at 100% hard-fail rate (0 hard failures).
3. LLM-as-judge overall score above 6.0 for all scenarios.
4. Backend developer confirms assembly works correctly.
5. At least one native Czech speaker rates Czech output 7/10 or above.

### Post-Lock Rules

After lock, the only permitted changes are:
- Bug fixes (prompt produces incorrect or broken output).
- Safety fixes (content safety bypass discovered).
- Token budget violations (response consistently exceeds limits).

All post-lock changes require:
1. Documented justification.
2. Test suite pass before and after.
3. Approval from AI/Prompt Engineer + QA Lead.
