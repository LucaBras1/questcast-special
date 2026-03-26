# Prompt Architecture -- The Prompt Bible

## Version 1.0.0 | Sprint 4 -- Beta Lock
## Last Updated: 2026-03-25

---

## 1. System Overview

Questcast uses a modular prompt system where a base system prompt is assembled from components at runtime. Sub-prompts are injected as additional system messages when specific game events occur. All responses use OpenAI structured outputs with Zod validation as a safety net.

### Architecture Diagram

```
                         PROMPT ASSEMBLY PIPELINE
                         ========================

  [Language Setting] ──> Select Base Prompt (CS/EN)
                              |
                              v
  [Game Config] ──────> Variable Substitution
  (narrator_style,          |
   difficulty_level,        |
   content_rating)          |
                              |
  [content_safety_rules.txt] ─┤
  [adversarial_defense.txt] ──┤
  [difficulty_modifiers.txt] ─┤──> Assembled System Prompt (~850 tokens)
  [game_state_schema.json] ───┤
  [narrative_summary] ────────┤
  [conversation_history] ─────┘
                              |
                              v
  [Event Detection] ──> Sub-Prompt Injection (optional)
  (new location,            |
   combat start,            |
   dice result,             |
   session end/resume,      |
   tutorial mode)           |
                              |
                              v
                     ┌─────────────────────────┐
                     │   OpenAI Messages Array  │
                     │                          │
                     │ [0] system: base prompt  │
                     │ [1] system: sub-prompt   │  (optional)
                     │ [2] user: player input   │
                     └─────────────────────────┘
                              |
                              v
                     ┌─────────────────────────┐
                     │    GPT-4o-mini API       │
                     │  structured output mode  │
                     │  max_tokens: 200         │
                     │  temperature: 0.8        │
                     └─────────────────────────┘
                              |
                              v
                     ┌─────────────────────────┐
                     │   Zod Validation         │
                     │   (safety net)           │
                     └─────────────────────────┘
                         |              |
                      PASS            FAIL
                         |              |
                         v              v
                    [Response]    [Fallback Response]
                                 (fallback_responses.json)
```

---

## 2. File Map and Dependencies

### Core Prompts

| File | Role | Token Est. | Injected As | Dependencies |
|---|---|---|---|---|
| `system_prompt_base_en.txt` | English base system prompt | ~500 | system message | All variables below |
| `system_prompt_base_cs.txt` | Czech base system prompt | ~520 | system message | All variables below |
| `content_safety_rules.txt` | Content filtering rules | ~150 | variable in base | None |
| `adversarial_defense.txt` | Jailbreak resistance | ~200 | appended to safety | None |
| `difficulty_modifiers.txt` | Difficulty level behavior | ~80 (1 block) | variable in base | None |

### Sub-Prompts

| File | Trigger Condition | Token Est. | Injected As |
|---|---|---|---|
| `scene_description.txt` | `locationChange` in previous stateUpdates | ~100 | second system message |
| `combat.txt` | Backend detects combat trigger | ~100 | second system message |
| `dice_interpretation.txt` | After `/dice` endpoint processes roll | ~120 | second system message |
| `cliffhanger.txt` | Time > 45 min OR player saves | ~80 | second system message |
| `recap.txt` | Player loads saved session | ~90 | second system message |
| `tutorial.txt` | Session flagged as tutorial | ~350 | second system message |
| `conversation_summary.txt` | Every 10 turns (separate call) | ~100 | sole system message |

### Supporting Prompts

| File | Purpose | Used In Production |
|---|---|---|
| `story_arcs.txt` | Story structure templates for session creation | Backend reads at session creation |
| `npc_interaction.txt` | NPC archetype guidelines | Injected as context when NPCs appear |
| `death_save.txt` | Death save mechanic narration | Injected when HP reaches 0 |
| `atmosphere.txt` | Atmospheric transition one-liners | Backend injects between turns |
| `quality_evaluation.txt` | LLM-as-judge evaluation prompt | Test suite only, NOT production |
| `image_scene.txt` | Image generation style guide for scenes | Backend passes to DALL-E 3 |
| `image_character.txt` | Image generation style guide for player characters | Backend passes to DALL-E 3 |
| `image_npc_portrait.txt` | Image generation style guide for NPC and enemy portraits | Backend passes to DALL-E 3 |

### Data Files

| File | Purpose |
|---|---|
| `fallback_responses.json` | Pre-written fallback responses for API failures |
| `game_state_schema.json` | JSON schema defining the game state contract |
| `output_schemas/narration_response.json` | JSON schema for standard turn response (includes optional tutorialBeat) |
| `output_schemas/dice_response.json` | JSON schema for dice roll response |
| `output_schemas/summary_response.json` | JSON schema for conversation summary |
| `tests/sample_scenarios.json` | 10 test scenarios with full game state for automated testing |
| `tests/expected_outputs.json` | 15 ideal reference responses for quality comparison |
| `CONVERSATION_SUMMARY_MECHANISM.md` | Implementation guide for the 10-turn summary system |

### Class-Specific Content

| File | Purpose |
|---|---|
| `class_openings/warrior_opening_en.txt` | Warrior class opening narration (EN) |
| `class_openings/warrior_opening_cs.txt` | Warrior class opening narration (CS) |
| `class_openings/mage_opening_en.txt` | Mage class opening narration (EN) |
| `class_openings/mage_opening_cs.txt` | Mage class opening narration (CS) |
| `class_openings/rogue_opening_en.txt` | Rogue class opening narration (EN) |
| `class_openings/rogue_opening_cs.txt` | Rogue class opening narration (CS) |
| `class_openings/ranger_opening_en.txt` | Ranger class opening narration (EN) |
| `class_openings/ranger_opening_cs.txt` | Ranger class opening narration (CS) |

---

## 3. Variable Reference Table

Every `{variable}` placeholder across all prompt files, its source, and its expected format.

| Variable | Used In | Source | Format | Default (MVP) |
|---|---|---|---|---|
| `{narrator_style}` | base prompts | Config | string | `"epic"` |
| `{difficulty_level}` | base prompts, combat.txt | Config | string | `"standard"` |
| `{difficulty_modifiers}` | base prompts | `difficulty_modifiers.txt` (selected block) | text block | STANDARD block |
| `{content_rating}` | base prompts | Config | string | `"teen"` |
| `{content_safety_rules}` | base prompts | `content_safety_rules.txt` + `adversarial_defense.txt` | text block | Full file contents |
| `{game_state_json}` | base prompts | Runtime game state | JSON string | See `game_state_schema.json` |
| `{narrative_summary}` | base prompts, recap.txt | `story.narrative_summary` from game state | text string | Empty string for new sessions |
| `{conversation_history}` | base prompts | Last 15 turns formatted | plain text | Empty for first turn |
| `{location}` | scene_description.txt | `story.current_location` | string | -- |
| `{time_of_day}` | scene_description.txt | `world.time_of_day` | enum | `"morning"` |
| `{weather}` | scene_description.txt | `world.weather` | string | `"clear"` |
| `{threat_level}` | scene_description.txt | `world.threat_level` | enum | `"low"` |
| `{enemy_type}` | combat.txt | Backend combat logic | string | -- |
| `{enemy_stats}` | combat.txt | Backend combat logic | string | -- |
| `{player_stats}` | combat.txt | character from game state | string | -- |
| `{roll_value}` | dice_interpretation.txt | Dice roll endpoint | integer (1-20) | -- |
| `{dice_type}` | dice_interpretation.txt | Dice roll endpoint | string (e.g., "d20") | -- |
| `{action_type}` | dice_interpretation.txt | Dice roll endpoint | string | -- |
| `{difficulty_class}` | dice_interpretation.txt | Backend logic | integer | -- |
| `{modifiers}` | dice_interpretation.txt | Character abilities | string | -- |
| `{final_result}` | dice_interpretation.txt | roll_value + modifiers | integer | -- |
| `{current_situation}` | cliffhanger.txt | Recent narration context | string | -- |
| `{quest_progress}` | cliffhanger.txt | `story.quest_progress` | number (0.0-1.0) | -- |
| `{character_name}` | recap.txt | `character.name` | string | -- |
| `{current_location}` | recap.txt | `story.current_location` | string | -- |
| `{active_quest}` | recap.txt | `story.active_quest` | string | -- |
| `{recent_turns}` | conversation_summary.txt | Last 10 turns formatted | plain text | -- |
| `{scene_description}` | image_scene.txt | imagePrompt from LLM response | string | -- |
| `{mood}` | image_scene.txt | Derived from threat_level | string | -- |
| `{art_style}` | image_scene.txt | Config (hardcoded MVP) | string | `"epic_fantasy"` |
| `{race}` | image_character.txt | Character creation | string | `"human"` |
| `{class}` | image_character.txt | `character.class` | string | -- |
| `{gender}` | image_character.txt | Character creation | string | -- |
| `{features}` | image_character.txt | Character creation | string | -- |
| `{npc_type}` | image_npc_portrait.txt | NPC archetype or enemy type | string | `"merchant"` |
| `{npc_race}` | image_npc_portrait.txt | NPC race | string | `"dwarf"` |
| `{npc_role}` | image_npc_portrait.txt | NPC narrative role | string | `"quest giver"` |
| `{npc_features}` | image_npc_portrait.txt | NPC distinctive visual features | string | -- |
| `{disposition}` | image_npc_portrait.txt | NPC attitude toward player | string | `"friendly"` |
| `{response_text}` | quality_evaluation.txt | AI response (test only) | string | -- |
| `{language}` | quality_evaluation.txt | Test scenario language | string | -- |
| `{player_input}` | quality_evaluation.txt | Test scenario input | string | -- |
| `{game_state_summary}` | quality_evaluation.txt | Summarized game state | string | -- |
| `{previous_narration}` | quality_evaluation.txt | Previous turn narration | string | -- |
| `{seasonal_theme}` | (Phase 2) base prompts | Adventure Pass config | string | Not used in MVP |

---

## 4. Output Schema Catalog

### narration_response.json (Standard Turn)

```json
{
  "narration": "string (50-100 words, flowing prose for TTS)",
  "stateUpdates": {
    "healthDelta": "number (optional)",
    "inventoryAdd": ["string"] ,
    "inventoryRemove": ["string"],
    "goldDelta": "number (optional)",
    "locationChange": "string (optional)",
    "questProgress": "number 0.0-1.0 (optional)",
    "timeOfDay": "morning|afternoon|evening|night (optional)",
    "threatLevel": "low|moderate|high|critical (optional)"
  },
  "suggestedActions": ["string", "string", "string (2-3 items)"],
  "shouldGenerateImage": "boolean",
  "imagePrompt": "string (optional, required when shouldGenerateImage is true)"
}
```

Used by: `/api/game/session/:id/turn`

### dice_response.json (Dice Roll)

```json
{
  "narration": "string (30-50 words, dramatic interpretation)",
  "success": "boolean",
  "stateUpdates": {
    "healthDelta": "number (optional)",
    "inventoryAdd": ["string"],
    "inventoryRemove": ["string"],
    "goldDelta": "number (optional)"
  }
}
```

Used by: `/api/game/session/:id/dice`

### summary_response.json (Conversation Summary)

```json
{
  "summary": "string (60-80 words, third person past tense, single paragraph)"
}
```

Used by: Internal summary generation every 10 turns.

---

## 5. Caching Strategy

### What Can Be Cached

| Item | Cache Location | TTL | Key Strategy |
|---|---|---|---|
| Assembled system prompt (per config) | Redis | Session lifetime | `prompt:{lang}:{difficulty}:{narrator}` |
| Fallback responses | In-memory | Infinite (static) | Loaded at startup |
| TTS audio for common phrases | Cloudflare R2 + CDN | 30 days | `tts:{hash(text)}:{voice}` |
| TTS audio for fallback responses | Cloudflare R2 + CDN | Permanent | Pre-generated at deploy |
| TTS audio for atmospheric transitions | Cloudflare R2 + CDN | Permanent | Pre-generated at deploy |
| Generated images | Cloudflare R2 + CDN | 90 days | `img:{hash(imagePrompt)}` |
| Conversation summary | Redis | Session lifetime | `session:{id}:summary` |
| Game state | Redis (hot) + PostgreSQL (cold) | Session lifetime | `session:{id}:state` |

### What Cannot Be Cached

- LLM narration responses (unique per turn)
- STT transcriptions (unique per audio)
- Dice roll interpretations (unique per roll)
- Dynamic TTS for narration responses (unique per turn)

### Cache Key Design for TTS

TTS audio caching uses a hash of the exact text string and voice ID:

```
Key: tts:{sha256(text_content)}:{voice_id}
Value: URL to R2-stored audio file
```

Same narration text with same voice will always return cached audio. This catches:
- Identical fallback responses
- Repeated atmospheric transitions
- Tutorial beats that are nearly identical across sessions

---

## 6. Token Budget Breakdown

### Per-Request Budget (Standard Turn)

```
Total Input Budget: ~2,500 tokens (conservative estimate)
Output Hard Cap: 200 tokens (max_tokens parameter)

Breakdown:
  Base system prompt         ~500 tokens  (20%)
  Content safety rules       ~150 tokens  ( 6%)
  Adversarial defense        ~200 tokens  ( 8%)
  Game state JSON            ~300 tokens  (12%)
  Difficulty modifiers        ~80 tokens  ( 3%)
  Narrative summary          ~100 tokens  ( 4%)
  Conversation history      ~1,200 tokens (48%)   <-- largest component
  Player input                ~50 tokens  ( 2%)
  Sub-prompt (if any)        ~100 tokens  ( 4%)

Model context: 128K tokens
Budget utilization: ~2%
```

### Token Optimization Rules (Active)

1. Omit empty arrays from game state (`inventory: []` is omitted entirely).
2. Omit null or zero-value defaults (`gold: 0` is omitted).
3. Omit session metadata unless near limits (turns > 50 or time > 40 min).
4. Use short location names (maximum 3 words).
5. Truncate narrative summary if it exceeds 120 tokens.
6. Set `max_tokens: 200` on every API call.
7. Conversation history limited to 15 turns.

---

## 7. Fallback Chain Documentation

When any component in the pipeline fails, Questcast degrades gracefully.

### Fallback Chain

```
LLM Call
  |
  ├── SUCCESS ──> Zod Validation
  |                   |
  |                   ├── PASS ──> Return response
  |                   |
  |                   └── FAIL ──> Select fallback from fallback_responses.json
  |                                 matching current context (combat/exploration/generic)
  |                                 Log raw LLM output for debugging
  |
  ├── TIMEOUT (>5s) ──> Retry once with 8s timeout
  |                         |
  |                         ├── SUCCESS ──> Continue normally
  |                         └── FAIL ──> Select fallback response
  |
  ├── RATE LIMIT (429) ──> Wait 1s, retry once
  |                           |
  |                           ├── SUCCESS ──> Continue normally
  |                           └── FAIL ──> Select fallback response
  |
  └── API ERROR (5xx) ──> Select fallback response immediately
                           Log error for monitoring
                           Increment error counter for session
```

### Fallback Response Categories

From `fallback_responses.json`, matched to game context:

| Context | Fallback Category | Selection |
|---|---|---|
| Combat active | `combat_continue` | Random from pool, no repeats |
| Exploration | `exploration_continue` | Random from pool, no repeats |
| Dice roll | `dice_roll_fallback` | Random from pool |
| Session timeout | `session_timeout` | Random from pool |
| Any other | `generic_continue` | Random from pool, no repeats |
| API error (visible) | `error_acknowledgment` | Random from pool |
| Session save | `session_save` | Random from pool |

### Fallback Behavior

- All fallbacks are pre-written in both Czech and English.
- Fallbacks contain NO stateUpdates (game state is preserved as-is).
- Fallbacks maintain immersion (written in character, no system messages).
- The player should not notice a fallback occurred in most cases.

---

## 8. Content Safety Architecture

### Three Layers of Defense

```
Layer 1: Input Moderation (Pre-LLM)
  Player voice input ──> STT transcription ──> OpenAI Moderation API
  If flagged:
    - Categories: hate, self-harm, sexual, violence
    - Action: Block the input, return safety fallback response
    - Log the flagged input for review
    - Do NOT send to LLM

Layer 2: Prompt-Level Defense (In-LLM)
  System prompt contains:
    - content_safety_rules.txt: What to never generate, redirect strategy
    - adversarial_defense.txt: Jailbreak resistance, identity anchoring
  The LLM is instructed to:
    - Never break character
    - Redirect inappropriate requests in-world
    - Escalate gradually for repeated boundary testing
    - Never acknowledge having safety rules

Layer 3: Output Validation (Post-LLM)
  LLM response ──> Zod schema validation ──> Content pattern check
  If flagged:
    - Basic pattern matching for unsafe content
    - Replace with fallback response
    - Log the flagged output
    - Increment safety violation counter for session

Session-Level Safety:
  If safety violations exceed 3 in a single session:
    - Backend triggers "cool down" mode
    - More aggressive input moderation thresholds
    - Shorter conversation history (reduces context for manipulation)
```

### Content Rating Enforcement

The `{content_rating}` variable controls the tone and limits:

| Rating | Violence | Themes | Language | Fear |
|---|---|---|---|---|
| FAMILY (7+) | Cartoon-level only | Lighthearted | Clean | Mild spookiness |
| TEEN (13+) **default** | Moderate, implied | Heroism, moral dilemmas | Mild exclamations | Atmospheric horror |
| MATURE (17+) | Intense, not gratuitous | Complex moral choices | Occasional stronger | Genuine tension |

---

## 9. Prompt Injection Points Reference

For the backend developer, this is the exact order of operations when building a request.

### Standard Turn

```typescript
// 1. Select base prompt
const basePrompt = language === 'cs'
  ? loadFile('system_prompt_base_cs.txt')
  : loadFile('system_prompt_base_en.txt');

// 2. Substitute variables
const assembledPrompt = basePrompt
  .replace('{narrator_style}', 'epic')
  .replace('{difficulty_level}', 'standard')
  .replace('{difficulty_modifiers}', loadDifficultyBlock('standard'))
  .replace('{content_rating}', 'teen')
  .replace('{content_safety_rules}',
    loadFile('content_safety_rules.txt') + '\n' + loadFile('adversarial_defense.txt'))
  .replace('{game_state_json}', JSON.stringify(optimizedGameState))
  .replace('{narrative_summary}', narrativeSummary || '')
  .replace('{conversation_history}', formatConversationHistory(last15Turns));

// 3. Build messages
const messages = [
  { role: 'system', content: assembledPrompt }
];

// 4. Add sub-prompt if triggered
if (eventTrigger) {
  const subPrompt = loadSubPrompt(eventTrigger, gameState);
  messages.push({ role: 'system', content: subPrompt });
}

// 5. Add player input
messages.push({ role: 'user', content: playerInput });

// 6. Call API with structured output
const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages,
  max_tokens: 200,
  temperature: 0.8,
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'narration_response',
      schema: narrationResponseSchema,
      strict: true
    }
  }
});
```

### Sub-Prompt Trigger Rules

| Trigger | Detection Method | Sub-Prompt File |
|---|---|---|
| New location | `locationChange` in previous turn's stateUpdates | `scene_description.txt` |
| Combat start | Backend combat detection logic | `combat.txt` |
| Dice result | After `/dice` endpoint | `dice_interpretation.txt` |
| Session ending | time > 45 min OR explicit save | `cliffhanger.txt` |
| Session resume | Player loads saved session | `recap.txt` |
| Tutorial | Session flagged as tutorial | `tutorial.txt` |
| Death save | Player HP reaches 0 | `death_save.txt` |
| NPC interaction | Backend detects NPC context | `npc_interaction.txt` (as context) |
| Summary | Every 10 turns (async) | `conversation_summary.txt` |

---

## 10. Conversation Memory Architecture

### Short-Term Memory: Conversation History

The last 15 turns are stored as plain text within the system prompt:

```
Player: "I want to explore the cave."
Questmaster: "You step into the darkness..."
Player: "I light my torch."
Questmaster: "Warm light fills the tunnel..."
```

This provides immediate context for the current turn. Token cost: approximately 1,200 tokens.

### Long-Term Memory: Narrative Summary

Every 10 turns, a separate LLM call generates a compressed narrative summary:

1. Collect turns 1-10 (or 11-20, etc.)
2. Send to GPT-4o-mini with `conversation_summary.txt`
3. Receive an 80-100 token summary
4. Store in `story.narrative_summary`
5. Remove summarized turns from history

The summary chain builds over the session:
- Turn 10: Summary of turns 1-10
- Turn 20: Summary of turns 1-10 + summary of turns 11-20 (merged)
- Turn 30: Comprehensive summary covering all 30 turns

This keeps history bounded while preserving critical story beats indefinitely.

### Memory Flow Diagram

```
Turns 1-10:  [history: turns 1-10, summary: none]
Turn 10:     TRIGGER SUMMARY -> summary covers turns 1-10
Turns 11-15: [history: turns 11-15, summary: turns 1-10]
Turn 20:     TRIGGER SUMMARY -> summary covers turns 1-20
Turns 21-25: [history: turns 21-25, summary: turns 1-20]
...
```

---

## 11. Image Generation Pipeline

### Trigger

When `shouldGenerateImage: true` in a narration response:

1. Check budget: `session.images_generated < 2`
2. If budget exhausted, skip image generation
3. If budget allows, proceed

### Prompt Assembly

```typescript
// 1. Load style guide
const styleGuide = loadFile('image_scene.txt');

// 2. Extract imagePrompt from LLM response
const sceneDescription = response.imagePrompt;

// 3. Assemble DALL-E 3 prompt
// The imagePrompt from the LLM is already in English
// Append Questcast visual identity suffix
const dallePrompt = `${sceneDescription}. Digital painting, semi-realistic, dramatic lighting, fantasy RPG concept art, warm golds and deep purples color palette, torch-lit ambiance, no text, no watermarks, no realistic human faces.`;

// 4. Call DALL-E 3
const image = await openai.images.generate({
  model: 'dall-e-3',
  prompt: dallePrompt,
  size: '1024x1024',
  quality: 'standard',
  n: 1
});
```

### Image Caching

```
Key: img:{sha256(dallePrompt)}
Value: R2 URL
TTL: 90 days
```

If the same scene description is generated again (e.g., player returns to a location), the cached image is served.

---

## 12. Prompt File Naming Convention

```
prompts/
  [name].txt                    -- Prompt template (text with {variables})
  [name].json                   -- Data file (JSON)
  output_schemas/[name].json    -- OpenAI structured output schemas
  class_openings/[class]_opening_[lang].txt  -- Class-specific content
  tests/                        -- Test artifacts (not used in production)
```

All prompt files use plain text with XML-style tags for structure. No markdown formatting within prompts (the model sees raw text, not rendered markdown).

---

## 13. Onboarding Guide for New Team Members

### To understand the prompt system:

1. Read this document (ARCHITECTURE.md) for the full picture.
2. Read `ASSEMBLY_GUIDE.md` for the implementation details.
3. Read `system_prompt_base_en.txt` to understand the core system prompt.
4. Read `system_prompt_base_cs.txt` to see the Czech adaptation.
5. Read one sub-prompt (e.g., `combat.txt`) to understand the sub-prompt pattern.
6. Read `output_schemas/narration_response.json` for the response contract.
7. Run the test suite to see the system in action.

### To modify a prompt:

1. Make the change in the prompt file.
2. Run the test suite: `npx ts-node tests/ai-quality/run-test-suite.ts`
3. Verify all scenarios pass.
4. Compare against expected outputs if making significant changes.
5. Update the variable reference table if adding new variables.
6. Update this ARCHITECTURE.md if changing structure.

### Rules for prompt changes after beta lock:

- Bug fixes only (prompt produces incorrect output).
- No new features or behaviors.
- All changes require test suite pass before merge.
- Document the change with a version bump in the prompt file header.
