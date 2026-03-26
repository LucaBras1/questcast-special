# Prompt Test Runner -- Automated Quality Evaluation

## Overview

This document describes the full automated test process for evaluating Questcast prompt quality. The test suite validates that all prompts produce outputs meeting quality, safety, length, and schema requirements before prompts are locked for beta.

## Prerequisites

- Node.js 18+
- OpenAI API key with access to GPT-4o-mini
- Backend project dependencies installed (`npm install` in `backend/`)
- Test scenarios file: `backend/tests/ai-quality/test-scenarios.json`
- Quality evaluator: `backend/tests/ai-quality/quality-evaluator.ts`
- Expected outputs: `prompts/tests/expected_outputs.json`

## Test Pipeline

### Step 1: Load Test Scenarios

Load all test scenarios from `backend/tests/ai-quality/test-scenarios.json`. Each scenario defines:

- `id` -- unique scenario identifier
- `language` -- `cs` or `en`
- `playerInput` -- simulated player voice input (STT transcription)
- `gameState` -- current game state context
- `expectedBehavior` -- assertions to validate against the response

### Step 2: Assemble Prompt

For each scenario, assemble the full prompt following `ASSEMBLY_GUIDE.md`:

1. Select the base system prompt based on `language` (`system_prompt_base_cs.txt` or `system_prompt_base_en.txt`).
2. Perform variable substitution:
   - `{narrator_style}` = `"epic"` (MVP hardcoded)
   - `{difficulty_level}` = `"standard"` (MVP hardcoded)
   - `{difficulty_modifiers}` = STANDARD block from `difficulty_modifiers.txt`
   - `{content_rating}` = `"teen"` (MVP hardcoded)
   - `{content_safety_rules}` = full contents of `content_safety_rules.txt` + `adversarial_defense.txt`
   - `{game_state_json}` = serialized game state from the scenario
   - `{narrative_summary}` = scenario's `narrativeSummary` or empty string
   - `{conversation_history}` = empty for test scenarios (isolated turn evaluation)
3. If the scenario specifies a sub-prompt trigger (e.g., `isTutorial`, `combatRound`), inject the appropriate sub-prompt file as an additional system message.
4. Build the messages array:
   ```
   messages = [
     { role: "system", content: <assembled system prompt> },
     { role: "system", content: <sub-prompt if applicable> },
     { role: "user", content: <playerInput from scenario> }
   ]
   ```

### Step 3: Send to GPT-4o-mini

Call the OpenAI API with structured output:

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
      schema: narrationResponseSchema,
      strict: true
    }
  }
});
```

Parse the response JSON. If parsing fails, the scenario automatically fails with a `json_validity` error.

### Step 4: Validate Against Zod Schema

Validate every parsed response using the Zod schemas defined in the quality evaluator:

- Standard narration: `NarrationResponseSchema`
- Dice rolls: `DiceResponseSchema`
- Summaries: `SummaryResponseSchema`

Schema validation failures are logged and the scenario is marked as failed.

### Step 5: Score with LLM-as-Judge

For each validated response, run the quality evaluation:

1. Load `quality_evaluation.txt` as the evaluation prompt.
2. Substitute variables:
   - `{response_text}` = the AI's narration text
   - `{language}` = scenario language
   - `{player_input}` = scenario's playerInput
   - `{game_state_summary}` = brief summary of game state
   - `{previous_narration}` = empty for test scenarios
3. Send to GPT-4o-mini (separate call, temperature 0.3 for consistency).
4. Parse the evaluation JSON response.
5. Extract scores: dramatic_quality, coherence, appropriate_length, language_correctness, player_agency, tts_readability, overall_score.

### Step 6: Generate Report

Compile all results into a batch report using `formatBatchReport()` from `quality-evaluator.ts`.

Report includes:
- Pass/fail status per scenario
- Individual metric scores
- Overall pass rate
- Failed scenarios with details
- Aggregate statistics (average scores by category)

### Passing Criteria

| Metric | Threshold | Action on Fail |
|--------|-----------|----------------|
| JSON validity | Must parse | Hard fail |
| Zod schema validation | Must pass | Hard fail |
| Word count | Within scenario min/max | Soft fail (flag) |
| Token count | Under 200 | Hard fail |
| Language match | Correct language | Hard fail |
| Content safety | No flagged patterns | Hard fail |
| Narrative quality | No code/meta artifacts | Hard fail |
| LLM-judge overall_score | 6.0 or above | Soft fail (flag for review) |
| LLM-judge overall_score | 8.0 or above | Production ready |

### Running the Suite

```bash
# Full suite
cd backend
npx ts-node tests/ai-quality/run-test-suite.ts

# Single scenario
npx ts-node tests/ai-quality/run-test-suite.ts --scenario scenario-01

# Czech scenarios only
npx ts-node tests/ai-quality/run-test-suite.ts --language cs

# With verbose output
npx ts-node tests/ai-quality/run-test-suite.ts --verbose

# Compare against expected outputs
npx ts-node tests/ai-quality/run-test-suite.ts --compare-expected
```

### Expected Output Comparison

When `--compare-expected` is enabled, the runner loads `prompts/tests/expected_outputs.json` and performs additional checks:

1. **Structural alignment**: Does the AI response have the same stateUpdate keys as the expected output?
2. **Action overlap**: Do at least 1 of 3 suggestedActions match the expected actions thematically?
3. **Image trigger match**: Does shouldGenerateImage match the expected value?
4. **Narration tone**: LLM-as-judge compares the narration tone against the expected output's tone.

These are informational comparisons, not hard failures. They help identify prompt drift between versions.

### CI Integration

Add to GitHub Actions workflow:

```yaml
- name: AI Quality Gate
  run: |
    cd backend
    npx ts-node tests/ai-quality/run-test-suite.ts --ci
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

The `--ci` flag:
- Outputs results in JSON format for parsing
- Exits with code 1 if any hard failures
- Exits with code 0 if all scenarios pass (soft failures are warnings)
- Limits to 3 retries per scenario (for API transient failures)

### Cost Estimate

Per full test run (25 scenarios: 15 expected_outputs + 10 sample_scenarios):
- 25 prompt calls to GPT-4o-mini: approximately 25 x 2,500 input tokens + 200 output tokens = approximately 67,500 total tokens
- 25 evaluation calls to GPT-4o-mini: approximately 25 x 1,500 input tokens + 300 output tokens = approximately 45,000 total tokens
- Total per run: approximately 112,500 tokens = approximately $0.02 per run
- Safe to run on every PR without cost concerns

---

## Test Scenario Sources

### 1. Expected Outputs (`prompts/tests/expected_outputs.json`)
- 15 scenarios with ideal reference responses
- Used for quality comparison (structural alignment, tone matching)
- Focus: output quality benchmarking

### 2. Sample Scenarios (`prompts/tests/sample_scenarios.json`)
- 10 scenarios with full game state context and behavioral assertions
- Used for automated pass/fail validation
- Focus: functional correctness, safety, schema compliance
- Categories covered: combat (2), exploration (2), NPC dialogue (1), dice roll (1), death save (1), puzzle (1), cliffhanger (1), safety/jailbreak (1)
- Languages: English (8), Czech (2)

### Loading Both Sources

```typescript
// Load both scenario sets
const expectedOutputs = JSON.parse(fs.readFileSync('prompts/tests/expected_outputs.json'));
const sampleScenarios = JSON.parse(fs.readFileSync('prompts/tests/sample_scenarios.json'));

// Sample scenarios include full game state for prompt assembly
// Expected outputs include ideal responses for comparison
```

---

## Quality Scoring Rubric

### Automated Checks (Hard Pass/Fail)

These checks are deterministic and do not require LLM evaluation:

| Check | Method | Fail Action |
|---|---|---|
| JSON validity | `JSON.parse()` succeeds | Hard fail, skip all other checks |
| Schema compliance | Zod validation passes | Hard fail |
| Language match | Detect language of narration vs expected | Hard fail |
| Word count | Count words in narration, compare to scenario maxWords | Soft fail (flag) |
| Token count | Response under max_tokens (200) | Hard fail (enforced by API) |
| Safety: no harmful content | Pattern match against mustNotContain list | Hard fail |
| Safety: stays in character | No "as an AI", "I cannot", "I'm sorry" patterns | Hard fail |
| State updates: required keys | Check stateUpdatesExpected keys are present | Soft fail (flag) |
| Image trigger | shouldGenerateImage matches expected | Soft fail (flag) |
| Suggested actions count | suggestedActions array length in expected range | Soft fail (flag) |

### LLM-as-Judge Checks (Scored 1-10)

These use `quality_evaluation.txt` with GPT-4o-mini at temperature 0.3:

| Criterion | Weight | Threshold | Description |
|---|---|---|---|
| Dramatic Quality | 20% | >= 6.0 | Vivid, immersive, engaging narration |
| Coherence | 25% | >= 7.0 | Correct game state references, no contradictions |
| Language Correctness | 20% | >= 6.5 | Grammar, diacritics (CZ), idioms, vocabulary |
| Player Agency | 15% | >= 6.0 | Respects player choice, offers options |
| TTS Readability | 20% | >= 7.0 | Sounds natural read aloud, short sentences |

### Overall Score Calculation

```
overall = (dramatic * 0.20) + (coherence * 0.25) + (language * 0.20) + (agency * 0.15) + (tts * 0.20)
```

### Score Thresholds

| Score Range | Rating | Action |
|---|---|---|
| 8.0 - 10.0 | Excellent | Production ready, no changes needed |
| 7.0 - 7.9 | Good | Acceptable for beta, minor improvements optional |
| 6.0 - 6.9 | Acceptable | Review and improve before beta lock |
| 4.0 - 5.9 | Below Standard | Requires prompt revision before merge |
| Below 4.0 | Unacceptable | Block merge, investigate root cause |

### Czech-Specific Scoring Additions

For Czech scenarios, the Language Correctness criterion includes additional sub-checks:

| Sub-check | Method | Weight within Language score |
|---|---|---|
| Diacritics accuracy | Sample 10 words, check diacritics vs dictionary | 30% |
| No anglicisms | Check for common English loanwords that have Czech equivalents | 20% |
| Dramatic vocabulary | Check for Czech dramatic verbs from the system prompt vocabulary list | 25% |
| Natural phrasing | LLM-judge: does it sound like a native speaker or translation? | 25% |

### Report Format

```json
{
  "timestamp": "2026-03-26T12:00:00Z",
  "model": "gpt-4o-mini",
  "totalScenarios": 25,
  "passed": 23,
  "softFailed": 2,
  "hardFailed": 0,
  "overallScore": 8.1,
  "byCategory": {
    "combat": { "avgScore": 8.3, "passed": 4, "total": 4 },
    "exploration": { "avgScore": 8.0, "passed": 3, "total": 3 },
    "npc_dialogue": { "avgScore": 7.8, "passed": 2, "total": 2 },
    "dice_roll": { "avgScore": 8.5, "passed": 2, "total": 2 }
  },
  "byLanguage": {
    "en": { "avgScore": 8.3, "passed": 19, "total": 21 },
    "cs": { "avgScore": 7.7, "passed": 4, "total": 4 }
  },
  "scenarios": [
    {
      "id": "sample-01",
      "name": "Combat: Ambush in the Forest",
      "status": "pass",
      "automatedChecks": { "jsonValid": true, "schemaValid": true, "languageMatch": true, "wordCount": 65, "safetyPass": true },
      "llmScores": { "dramatic": 8.5, "coherence": 8.0, "language": 8.5, "agency": 7.5, "tts": 9.0 },
      "overall": 8.3
    }
  ]
}
```
