# Prompt Assembly Guide for Backend Developer

## Overview

This document explains how to assemble the full prompt sent to GPT-4o-mini for each game turn. The prompts are modular: a base system prompt is assembled from components, and sub-prompts are injected as additional messages when specific game events occur.

## Prompt Assembly Order

The system prompt is assembled by replacing template variables in the base prompt file. The order of sections within the system prompt matters for model attention.

### Step 1: Select Base System Prompt

Choose the base file based on the player's language setting:

- Czech: `system_prompt_base_cs.txt`
- English: `system_prompt_base_en.txt`

### Step 2: Variable Substitution

Replace all template variables in the base prompt. Every `{variable}` must be replaced before sending.

| Variable | Source | Example |
|---|---|---|
| `{narrator_style}` | Hardcoded for MVP: `"epic"` | `epic` |
| `{difficulty_level}` | Hardcoded for MVP: `"standard"` | `standard` |
| `{difficulty_modifiers}` | Load from `difficulty_modifiers.txt`, select the block matching difficulty level | The STANDARD block text |
| `{content_rating}` | Hardcoded for MVP: `"teen"` | `teen` |
| `{content_safety_rules}` | Full contents of `content_safety_rules.txt` | The entire file |
| `{game_state_json}` | Serialized JSON from current game state, following `game_state_schema.json` | `{"session_id": "...", "character": {...}, ...}` |
| `{narrative_summary}` | The rolling narrative summary from the last summary generation. Empty string if no summary yet. | `"Thorin entered the cave and..."` |
| `{conversation_history}` | The last 15 conversation turns formatted as alternating user/assistant messages. See format below. | See conversation history format |

### Step 3: Inject Adversarial Defense

Append the contents of `adversarial_defense.txt` after the content safety rules block, inside the same `<content_safety>` tag. This adds jailbreak resistance without a separate injection point.

### Step 4: Build the Messages Array

The OpenAI API call uses a messages array. Assemble it as follows:

```
messages = [
  { role: "system", content: <assembled system prompt from steps 1-3> },
  { role: "user", content: <player's transcribed voice input> }
]
```

The conversation history is embedded WITHIN the system prompt (inside the `<conversation_history>` tag), not as separate messages. This keeps the conversation context visible to the model while using a single user message for the current turn.

### Step 5: Add Sub-Prompts When Needed

For specific game events, inject a sub-prompt as an additional system message BEFORE the user message:

```
messages = [
  { role: "system", content: <assembled base system prompt> },
  { role: "system", content: <sub-prompt for the specific event> },
  { role: "user", content: <player input or event description> }
]
```

Sub-prompt selection rules:

| Event | Sub-Prompt File | Trigger |
|---|---|---|
| New location entered | `scene_description.txt` | `locationChange` detected in previous turn's stateUpdates |
| Combat initiated | `combat.txt` | Backend detects combat trigger from game logic |
| Dice roll result | `dice_interpretation.txt` | After `/api/game/session/:id/dice` endpoint processes a roll |
| Session ending | `cliffhanger.txt` | Time elapsed > 45 min OR player requests save |
| Session resuming | `recap.txt` | Player loads a saved session |
| Tutorial mode | `tutorial.txt` | Session is flagged as tutorial, replaces base prompt behavior |
| Conversation summary | `conversation_summary.txt` | Every 10 turns, called separately (not during a player turn) |

Sub-prompts also need variable substitution. Replace all `{variable}` placeholders with current game state values.

## Conversation History Format

Format the last 15 turns as a readable block inside the system prompt:

```
Player: "I want to explore the cave."
Questmaster: "You step into the darkness. The air grows cold..."
Player: "I light my torch."
Questmaster: "Warm light fills the tunnel..."
```

Each turn is one player message and one Questmaster response. Keep the format simple and readable. Do not use JSON for conversation history inside the prompt; plain text is more token-efficient and easier for the model to parse.

If fewer than 15 turns exist, include all available turns. If zero turns exist (first turn of a new session), omit the conversation history section entirely or leave it empty.

## Token Budget Breakdown

Target total context per request: approximately 2,350 tokens input.

| Component | Estimated Tokens | Notes |
|---|---|---|
| System prompt (base) | ~500 | After variable substitution |
| Content safety rules | ~150 | Includes adversarial defense: ~200 additional |
| Adversarial defense | ~200 | Appended to content safety |
| Game state JSON | ~300 | With optimization: omit empty fields |
| Difficulty modifiers | ~80 | One block only |
| Narrative summary | ~100 | Rolling summary, ~80 words |
| Conversation history (15 turns) | ~1,200 | ~80 tokens per turn pair |
| Player input (current turn) | ~50 | STT transcription of voice |
| Sub-prompt (if applicable) | ~150 | Scene, combat, dice, etc. |
| **Total input** | **~2,350-2,500** | Well within 128K context window |
| **Max output** | **200** | Enforced by max_tokens parameter |

### Token Optimization Rules

1. Omit empty arrays from game state (e.g., `inventory: []` becomes omitted entirely)
2. Omit null or default values (e.g., `gold: 0` is omitted)
3. Omit session metadata unless near limits (turns > 50 or time > 40 min)
4. Use short location names
5. Truncate narrative summary if it exceeds 120 tokens
6. Set `max_tokens: 200` on every API call to hard-cap output length

## Structured Output Configuration

All LLM responses must be valid JSON matching the schemas in `prompts/output_schemas/`:

| Endpoint | Schema | Description |
|---|---|---|
| Standard turn (`/turn`) | `narration_response.json` | Story narration + state updates + suggestions |
| Dice roll (`/dice`) | `dice_response.json` | Roll interpretation + success/fail + state updates |
| Summary generation | `summary_response.json` | Narrative summary of last 10 turns |

### Using OpenAI Structured Outputs

Pass the JSON schema to the OpenAI API using the `response_format` parameter:

```typescript
const response = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: assembledMessages,
  max_tokens: 200,
  temperature: 0.8,
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "narration_response",
      schema: narrationResponseSchema, // loaded from narration_response.json
      strict: true
    }
  }
});
```

### Zod Validation (Backend)

Even with structured outputs, validate every response with Zod as a safety net:

```typescript
import { z } from "zod";

const NarrationResponseSchema = z.object({
  narration: z.string().min(20).max(800),
  stateUpdates: z.object({
    healthDelta: z.number().optional(),
    inventoryAdd: z.array(z.string()).optional(),
    inventoryRemove: z.array(z.string()).optional(),
    goldDelta: z.number().optional(),
    locationChange: z.string().optional(),
    questProgress: z.number().min(0).max(1).optional(),
    timeOfDay: z.enum(["morning", "afternoon", "evening", "night"]).optional(),
    threatLevel: z.enum(["low", "moderate", "high", "critical"]).optional(),
  }),
  suggestedActions: z.array(z.string()).min(2).max(3),
  shouldGenerateImage: z.boolean(),
  imagePrompt: z.string().optional(),
});
```

If Zod validation fails, fall back to `fallback_responses.json` and log the raw LLM output for debugging.

## Conversation Summary Mechanism

Every 10 turns, trigger the conversation summary process:

1. Collect the last 10 turns of conversation
2. Call the LLM with `conversation_summary.txt` as the prompt and the turns as context
3. Validate the response against `summary_response.json`
4. Store the summary in the game state (`story.narrative_summary`)
5. Remove the summarized turns from the conversation history
6. The summary now serves as "long-term memory" for the AI

This keeps the conversation history window at 15 turns maximum while preserving story context indefinitely.

## Tutorial Mode

When a session is flagged as tutorial:

1. Use `tutorial.txt` as an additional system prompt alongside the base prompt
2. Track which beat the player is on (1 through 5) in the session state
3. The tutorial prompt includes expected responses and fallbacks for each beat
4. After beat 5, save the session and mark the tutorial as complete

## Image Generation

When `shouldGenerateImage` is true in a narration response:

1. Check image budget: `session.images_generated < 2`
2. If budget allows, pass `imagePrompt` to the image generation endpoint with `image_scene.txt` as the style guide
3. Increment `session.images_generated`
4. Stream the image URL back to the client via SSE

## Error Handling

If the LLM call fails (timeout, rate limit, invalid response):

1. Select a fallback response from `fallback_responses.json`
2. Match the fallback category to the current game context (combat, exploration, generic)
3. Return the fallback as if it were a normal narration (no stateUpdates)
4. Log the failure for monitoring
5. The player's experience continues uninterrupted

## Quick Reference: File Map

```
prompts/
  system_prompt_base_cs.txt     -- Czech system prompt (primary)
  system_prompt_base_en.txt     -- English system prompt
  content_safety_rules.txt      -- Content filtering rules
  adversarial_defense.txt       -- Jailbreak resistance
  difficulty_modifiers.txt      -- Difficulty level blocks
  scene_description.txt         -- Sub-prompt: new location
  combat.txt                    -- Sub-prompt: combat start
  dice_interpretation.txt       -- Sub-prompt: dice roll
  cliffhanger.txt               -- Sub-prompt: session end
  recap.txt                     -- Sub-prompt: session resume
  tutorial.txt                  -- Tutorial adventure script
  conversation_summary.txt      -- Summary generation prompt
  quality_evaluation.txt        -- QA evaluation prompt (not used in production)
  image_scene.txt               -- Image generation style guide (scenes)
  image_character.txt           -- Image generation style guide (player characters)
  image_npc_portrait.txt        -- Image generation style guide (NPC and enemy portraits)
  fallback_responses.json       -- Pre-written fallback responses
  game_state_schema.json        -- Game state JSON schema
  output_schemas/
    narration_response.json     -- Standard turn output schema
    dice_response.json          -- Dice roll output schema
    summary_response.json       -- Summary output schema
```
