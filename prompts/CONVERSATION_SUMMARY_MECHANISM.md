# Conversation Summary Mechanism -- Implementation Guide

## Version 1.0.0 | Sprint 2
## Status: Ready for Backend Integration

---

## 1. Overview

Questcast uses a sliding window approach to manage conversation context within the LLM's token budget. Short-term memory (recent turns) provides immediate context. Long-term memory (narrative summaries) preserves critical story beats from earlier in the session.

This mechanism keeps total conversation context bounded at approximately 1,200 tokens regardless of session length.

---

## 2. Architecture

```
Session Start (Turn 1)
  |
  v
Turns 1-10:  history = [turns 1-10], summary = ""
  |
  v
Turn 10:     TRIGGER SUMMARY GENERATION (async)
             Input:  turns 1-10
             Output: summary_v1 (~80 tokens)
             Action: Remove turns 1-10 from history
  |
  v
Turns 11-15: history = [turns 11-15], summary = summary_v1
  |
  v
Turn 20:     TRIGGER SUMMARY GENERATION (async)
             Input:  summary_v1 + turns 11-20
             Output: summary_v2 (~100 tokens, merged)
             Action: Remove turns 11-20 from history
  |
  v
Turns 21-25: history = [turns 21-25], summary = summary_v2
  |
  v
...continues for the duration of the session
```

### Key Invariants

1. **History window:** Maximum 15 turns of verbatim conversation are kept in `{conversation_history}`.
2. **Summary trigger:** Every 10 turns, a summary generation call is made.
3. **Summary merges:** Each new summary incorporates the previous summary + the 10 new turns into one paragraph.
4. **Maximum summary size:** 120 tokens. Truncate if exceeded.
5. **Summary location:** Stored in `story.narrative_summary` in the game state.

---

## 3. Summary Generation Flow (Backend)

### Trigger Condition

```typescript
if (session.turns_played > 0 && session.turns_played % 10 === 0) {
  await generateConversationSummary(sessionId);
}
```

### Step-by-Step

```typescript
async function generateConversationSummary(sessionId: string): Promise<void> {
  // 1. Load current state
  const gameState = await getGameState(sessionId);
  const recentTurns = await getConversationHistory(sessionId, { limit: 10 });
  const existingSummary = gameState.story.narrative_summary || '';

  // 2. Format turns for the summary prompt
  const formattedTurns = recentTurns.map(turn =>
    `Player: "${turn.playerInput}"\nQuestmaster: "${turn.narration}"`
  ).join('\n\n');

  // 3. Build the input for summary generation
  // If there's an existing summary, prepend it so the new summary merges both
  const contextForSummary = existingSummary
    ? `Previous summary: ${existingSummary}\n\nNew turns:\n${formattedTurns}`
    : formattedTurns;

  // 4. Load the summary prompt
  const summaryPrompt = loadFile('conversation_summary.txt')
    .replace('{recent_turns}', contextForSummary);

  // 5. Call GPT-4o-mini
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: summaryPrompt }
    ],
    max_tokens: 150,
    temperature: 0.3,  // Low temperature for factual accuracy
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'summary_response',
        schema: summaryResponseSchema,
        strict: true
      }
    }
  });

  // 6. Validate with Zod
  const parsed = SummaryResponseSchema.parse(JSON.parse(response.choices[0].message.content));

  // 7. Store the new summary
  await updateGameState(sessionId, {
    'story.narrative_summary': parsed.summary
  });

  // 8. Prune old turns from history
  // Keep only turns AFTER the summarized batch
  await pruneConversationHistory(sessionId, { keepAfterTurn: session.turns_played - 10 });
}
```

### Error Handling

If the summary generation call fails:
- **Do not block the player.** Summary generation is async and non-critical.
- Retry once after 2 seconds.
- If retry fails, skip this summary cycle. The next trigger at turn 20 will cover turns 1-20.
- Log the failure for monitoring.
- The conversation history will be slightly larger than ideal (up to 25 turns) but well within the 128K context limit.

---

## 4. Context Injection Format

### How the Summary Appears in the System Prompt

The summary is injected into the base system prompt via the `{narrative_summary}` variable:

```xml
<narrative_summary>
Thorin descended into the goblin caves and dispatched two sentries. Rather than
fighting the chief, he persuaded the creature to surrender. The chief yielded
an iron key, which opened an ancient chest containing a glowing map fragment.
Thorin now stands in the cave depths, map in hand, with the defeated tribe behind him.
</narrative_summary>
```

### How the Conversation History Appears

Only the most recent turns (after the last summary) are included:

```xml
<conversation_history>
Player: "I examine the map fragment closely."
Questmaster: "The fragment glows faintly in your hands. Lines and symbols..."
Player: "Can I read the symbols?"
Questmaster: "Some symbols are familiar. They point toward the Northern Peaks..."
</conversation_history>
```

### Combined Context Window

At any point in the session, the LLM sees:
- **Narrative summary:** Compressed history of everything before the current window (~100 tokens)
- **Conversation history:** Last 5-15 verbatim turns (~400-1,200 tokens)
- **Game state JSON:** Current state including items, location, quest progress (~300 tokens)

This gives the LLM both the "big picture" (summary) and "recent details" (history).

---

## 5. Summary Quality Requirements

### What a Good Summary Contains

1. **Key decisions** and their consequences (highest priority)
2. **Quest progress** changes and new objectives
3. **NPC interactions** -- alliances, conflicts, information gained
4. **Combat outcomes** -- who won, what was at stake
5. **Significant inventory changes** (lowest priority)

### What a Good Summary Omits

- Exact dice roll numbers
- HP values
- Routine movement between rooms
- Repeated information already in the previous summary
- Meta-game discussion or system messages

### Summary Merging Strategy

When generating a summary that covers turns 11-20 while a summary for turns 1-10 already exists:

**Input to the prompt:**
```
Previous summary: [summary of turns 1-10]

New turns:
Player: "..."
Questmaster: "..."
... (turns 11-20)
```

**Expected output:** A single merged paragraph covering turns 1-20 that:
- Preserves the most critical events from the previous summary
- Adds new developments from turns 11-20
- Stays within the 80-100 token target
- Naturally drops less important details from early turns as the story progresses

This means early-game details gradually fade as the story progresses, which mirrors how a human DM would remember a session -- recent events are vivid, early events become "the hero started in a tavern and fought some goblins."

---

## 6. Token Budget Impact

| Turns Played | History Tokens | Summary Tokens | Total Context Memory |
|---|---|---|---|
| 1-10 | ~800 (10 turns) | 0 | ~800 |
| 11-15 | ~400 (5 turns) | ~100 | ~500 |
| 16-20 | ~800 (10 turns) | ~100 | ~900 |
| 21-25 | ~400 (5 turns) | ~100 | ~500 |
| 26-30 | ~800 (10 turns) | ~100 | ~900 |

**Maximum conversation context: ~900 tokens** (just before a summary trigger).
**Average conversation context: ~700 tokens.**

This is well within the 1,200-token budget allocated in the architecture.

---

## 7. Edge Cases

### First Turn of a New Session
- `narrative_summary` is empty string
- `conversation_history` is empty
- The LLM relies entirely on game state and any class opening prompt

### Session Resume (Load Saved Game)
- `narrative_summary` contains the summary from the saved session
- `conversation_history` is empty (fresh start after load)
- The `recap.txt` sub-prompt is injected to generate a "Previously on..." moment
- The recap uses `narrative_summary` to know what happened

### Very Short Sessions (<10 turns)
- No summary is ever generated
- All turns are in the conversation history
- No data loss

### Very Long Sessions (50+ turns)
- Multiple summaries have merged into one dense paragraph
- The summary covers the entire session history in ~100 tokens
- Recent turns provide immediate context
- Quality remains high because the summary prioritizes decisions and plot over mechanics

### Summary Generation Failure
- See error handling in Section 3
- The system degrades gracefully -- slightly larger context window, no data loss
- The next cycle will catch up

---

## 8. Monitoring

Track these metrics in production:

| Metric | Target | Alert Threshold |
|---|---|---|
| Summary generation latency | <1s | >3s |
| Summary Zod validation pass rate | >99% | <95% |
| Summary token count | 80-120 tokens | >150 tokens |
| Summary generation failure rate | <1% | >5% |
| History pruning success rate | 100% | <99% |

---

## 9. Files Involved

| File | Role |
|---|---|
| `prompts/conversation_summary.txt` | The summary generation prompt |
| `prompts/output_schemas/summary_response.json` | JSON schema for summary output |
| `prompts/system_prompt_base_*.txt` | Contains `{narrative_summary}` and `{conversation_history}` injection points |
| `prompts/recap.txt` | Uses `{narrative_summary}` for session resume |

---

*Document created: 2026-03-26*
*For backend implementation details, see ASSEMBLY_GUIDE.md Section: Conversation Summary Mechanism*
