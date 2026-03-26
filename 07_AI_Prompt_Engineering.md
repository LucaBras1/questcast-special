# QUESTCAST - AI & Prompt Engineering Guide
## Version 1.0 | February 2026

---

# 1. AI Architecture Overview

## System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                      QUESTCAST AI PIPELINE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐     │
│  │  Voice  │───▶│   STT   │───▶│   LLM   │───▶│   TTS   │     │
│  │  Input  │    │ Whisper │    │ GPT-4o  │    │ OpenAI  │     │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘     │
│       │                              │              │          │
│       │                              ▼              │          │
│       │                        ┌─────────┐         │          │
│       │                        │  Image  │         │          │
│       │                        │   Gen   │         │          │
│       └────────────────────────┴─────────┴─────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Model Selection

| Component | Model | Reason |
|-----------|-------|--------|
| Storytelling | GPT-4o-mini | Cost-effective, good quality |
| Transcription | Whisper / GPT-4o Mini | Multilingual, accurate |
| Voice | OpenAI TTS | Natural, streaming |
| Images | GPT Image 1 Mini | Fast, consistent style |

---

# 2. Dungeon Master System Prompt

## Base System Prompt

```
You are QUESTMASTER, an expert AI Dungeon Master for the fantasy RPG game Questcast.

## YOUR ROLE
You are a dramatic storyteller who brings adventures to life through vivid narration. 
You manage the game world, NPCs, combat, and story progression while ensuring 
players have agency and their choices matter.

## VOICE & TONE
- Speak in second person ("You see...", "You feel...")
- Use vivid, sensory descriptions
- Vary pacing: quick in combat, slower in exploration
- Match the selected narrator style: {narrator_style}
- Keep responses concise for voice (2-4 sentences per beat)

## GAME RULES
- Players make choices; you narrate consequences
- Combat uses d20 system (player rolls, you interpret)
- Be fair but create tension and drama
- Never kill players without giving them a chance
- Respect the game difficulty: {difficulty_level}

## RESPONSE FORMAT
Always structure your response as:
1. Brief narration of what happened (1-2 sentences)
2. Description of current situation (1-2 sentences)
3. Clear prompt for player action OR automatic story beat

## CONSTRAINTS
- Maximum response: 150 words (for voice pacing)
- No explicit violence, gore, or adult content
- No real-world controversial topics
- Keep content appropriate for: {content_rating}
- Respond in: {language}

## CURRENT GAME STATE
{game_state_json}

## CONVERSATION HISTORY
{conversation_history}
```

## Dynamic Variables

| Variable | Description | Example Values |
|----------|-------------|----------------|
| `{narrator_style}` | Voice personality | serious, humorous, dark, epic |
| `{difficulty_level}` | Game challenge | beginner, standard, advanced, hardcore |
| `{content_rating}` | Age appropriateness | family, teen, mature |
| `{language}` | Response language | Czech, English, German |
| `{game_state_json}` | Current game state | See Game State section |
| `{conversation_history}` | Recent exchanges | Last 10-15 turns |

---

# 3. Game State Management

## Game State JSON Structure

```json
{
  "session_id": "uuid",
  "created_at": "2026-02-01T10:00:00Z",
  "settings": {
    "genre": "fantasy",
    "difficulty": "standard",
    "narrator_style": "epic",
    "language": "cs",
    "max_players": 4,
    "session_length_minutes": 60
  },
  "players": [
    {
      "id": "player_1",
      "name": "Thorin",
      "class": "warrior",
      "race": "dwarf",
      "level": 3,
      "health": 45,
      "max_health": 50,
      "inventory": ["sword", "shield", "health_potion"],
      "gold": 150,
      "abilities": ["power_strike", "defensive_stance"]
    }
  ],
  "story": {
    "current_chapter": 2,
    "current_location": "Dark Forest",
    "active_quest": "Find the lost artifact",
    "quest_progress": 0.4,
    "npcs_met": ["Old Wizard", "Tavern Keeper"],
    "enemies_defeated": 5,
    "key_decisions": [
      "Spared the goblin scout",
      "Took the hidden path"
    ]
  },
  "world": {
    "time_of_day": "evening",
    "weather": "light_rain",
    "threat_level": "moderate"
  },
  "session": {
    "turns_played": 25,
    "images_generated": 1,
    "time_elapsed_minutes": 18
  }
}
```

## State Update Rules

1. **Health Changes**: Track damage/healing, trigger death saves at 0
2. **Inventory**: Add/remove items, enforce weight limits
3. **Story Progress**: Update quest_progress on milestones
4. **Location Changes**: Update current_location, trigger descriptions
5. **NPC Interactions**: Remember NPCs met, their dispositions

---

# 4. Prompt Templates

## Scene Description Prompt

```
Based on the current game state, describe the scene when the player enters {location}.

Include:
- Visual details (what they see)
- Ambient sounds
- Any notable features or NPCs present
- Subtle hints about available actions

Keep it to 3-4 sentences, vivid but concise.
```

## Combat Initiation Prompt

```
The player has encountered {enemy_type}. Start a combat encounter.

Include:
- Dramatic entrance of the enemy
- Brief description of the threat
- Initiative prompt ("Roll for initiative!" or similar)

Combat difficulty should match {difficulty_level}.
Enemy stats: {enemy_stats}
```

## Dice Roll Interpretation

```
The player rolled {roll_value} on a d{dice_type} for {action_type}.

Difficulty class (DC): {difficulty_class}
Player modifiers: {modifiers}
Final result: {final_result}

Narrate the outcome:
- If success: Describe the successful action dramatically
- If failure: Describe the failure but leave room for recovery
- If critical success (nat 20): Make it epic
- If critical failure (nat 1): Make it memorable but not devastating

Keep response to 2-3 sentences.
```

## Cliffhanger Prompt (Session End)

```
The session is ending. Create a dramatic cliffhanger moment.

Current situation: {current_situation}
Story progress: {quest_progress}%

Create a moment of tension or revelation that:
1. Makes the player want to continue
2. Is memorable and dramatic
3. Provides a natural stopping point
4. Hints at what's to come

End with something like "To be continued..." or "What will you do next time?"
```

---

# 5. Response Optimization

## Token Efficiency

### Before (wasteful):
```
"You carefully push open the ancient wooden door, its hinges creaking loudly 
in protest after centuries of disuse. The sound echoes through the dark 
corridor beyond, and you can feel a cold draft emanating from within. 
Dust motes dance in the beam of light that spills in from behind you. 
The smell of old stone and something else—perhaps decay—fills your nostrils. 
You take a moment to let your eyes adjust to the darkness."
```

### After (optimized):
```
"The ancient door creaks open, releasing a cold draft and the smell of 
old stone. Darkness awaits beyond. What do you do?"
```

## Guidelines for Concise Responses

1. **One idea per sentence**
2. **Active voice always**
3. **Cut adjectives by 50%**
4. **No redundant descriptions**
5. **End with action prompt**

## Response Length by Context

| Context | Max Words | Max Tokens |
|---------|-----------|------------|
| Combat turn | 50 | 75 |
| Scene description | 80 | 120 |
| NPC dialogue | 60 | 90 |
| Story beat | 100 | 150 |
| Session intro | 120 | 180 |
| Cliffhanger | 80 | 120 |

---

# 6. Image Generation Prompts

## Scene Image Template

```
Fantasy RPG scene illustration:
{scene_description}

Style: Digital painting, dramatic lighting, {art_style}
Mood: {mood}
Color palette: {colors}
Perspective: {perspective}

Do not include: text, watermarks, modern elements, realistic faces
```

## Character Portrait Template

```
Fantasy character portrait:
Race: {race}
Class: {class}
Gender: {gender}
Notable features: {features}

Style: Digital art, heroic fantasy, detailed
Background: Simple gradient or abstract
Pose: {pose}

Do not include: text, watermarks, weapons pointing at viewer
```

## Art Style Options

| Style | Description | Use Case |
|-------|-------------|----------|
| `epic_fantasy` | Dramatic, detailed, colorful | Boss fights, key scenes |
| `dark_atmospheric` | Moody, shadows, muted colors | Horror, dungeons |
| `storybook` | Softer, illustrated feel | Family-friendly |
| `painterly` | Brushstroke texture | General scenes |

---

# 7. Multilingual Support

## Language-Specific Prompts

### Czech (Primary)
```
Odpovídej vždy v češtině.
Používej dramatický, vypravěčský styl.
Vykej hráči (formální "vy").
Při popisu boje používej dynamická slovesa.
```

### English
```
Respond in English.
Use dramatic, narrative style.
Address the player as "you" (informal).
Use vivid action verbs in combat.
```

### German
```
Antworte auf Deutsch.
Verwende einen dramatischen, erzählerischen Stil.
Sieze den Spieler (formelles "Sie").
Nutze lebhafte Aktionsverben im Kampf.
```

## Translation Considerations

| Element | Keep Consistent |
|---------|-----------------|
| Game terms | HP, XP, Level (use local terms) |
| Dice | d20, d6 (keep as-is) |
| NPC names | Translate or keep original |
| Place names | Translate descriptive ones |
| Item names | Translate common items |

---

# 8. Safety & Content Moderation

## Content Filters

### Prompt-Level Filters
```
## STRICT CONTENT RULES
Never generate content that:
- Depicts graphic violence or gore
- Contains sexual content or innuendo
- Includes real-world hate speech or discrimination
- References real violent events or tragedies
- Promotes self-harm or dangerous activities
- Contains inappropriate content for the {content_rating} setting

If a player requests inappropriate content, redirect the story 
naturally without breaking immersion.
```

### Output Moderation
1. Check for flagged keywords
2. Sentiment analysis for toxic content
3. Image safety classifier before display
4. User reporting mechanism

## Age-Appropriate Settings

| Rating | Violence | Themes | Language |
|--------|----------|--------|----------|
| Family | Cartoon, no blood | Light adventure | Clean |
| Teen | Moderate, implied | Darker themes OK | Mild |
| Mature | More intense | Complex moral | Some profanity |

---

# 9. Performance Optimization

## Caching Strategy

### TTS Cache (Pre-generated)
```
Common phrases to cache:
- "Roll for initiative"
- "Your turn"
- "Roll a d20"
- "Excellent!"
- "You succeed"
- "Unfortunately, you fail"
- "The battle begins"
- "You found..."
- "Game saved"
- Session intros/outros
```

### LLM Response Caching
```
Cache key: hash(system_prompt + last_3_turns + game_state_hash)
TTL: 5 minutes
Invalidate on: player action, dice roll, state change
```

## Streaming Implementation

```python
async def stream_response(prompt):
    async for chunk in openai.chat.completions.create(
        model="gpt-4o-mini",
        messages=prompt,
        stream=True
    ):
        yield chunk.choices[0].delta.content
        
        # Start TTS as soon as we have a sentence
        if sentence_complete(buffer):
            await start_tts_streaming(buffer)
            buffer = ""
```

---

# 10. Testing & Quality Assurance

## Prompt Testing Checklist

- [ ] Response stays within word limit
- [ ] Appropriate for content rating
- [ ] No hallucinated game mechanics
- [ ] Maintains consistent world state
- [ ] Player agency preserved
- [ ] Natural language flow
- [ ] Correct language/locale

## Test Scenarios

| Scenario | Expected Behavior |
|----------|-------------------|
| Player attacks NPC | Combat initiated, fair resolution |
| Player tries inappropriate action | Redirected gracefully |
| Dice roll critical success | Epic narration |
| Dice roll critical failure | Memorable but recoverable |
| Session time limit reached | Natural cliffhanger |
| Player asks meta question | Stays in character or brief OOC |

## A/B Testing Framework

```javascript
const promptVariants = {
  control: basePrompt,
  variant_a: basePrompt + moreEmotionalCues,
  variant_b: basePrompt + shorterResponses,
};

// Track metrics
metrics.track({
  variant: selectedVariant,
  session_completion: boolean,
  user_rating: 1-5,
  engagement_time: seconds,
});
```

---

# 11. Error Handling

## Graceful Degradation

| Error | Fallback |
|-------|----------|
| LLM timeout | Retry once, then generic response |
| LLM error | Pre-written continuation prompt |
| TTS failure | Text display with retry button |
| STT failure | Text input fallback |
| Image gen failure | Placeholder image + retry |

## Example Fallback Responses

```json
{
  "generic_continue": "The adventure continues... What would you like to do?",
  "combat_continue": "The battle rages on. Make your move!",
  "exploration_continue": "You press forward into the unknown.",
  "error_acknowledgment": "The magical energies flicker momentarily... Let's continue."
}
```

---

*This document should be updated as we learn from user interactions and improve our AI systems.*
