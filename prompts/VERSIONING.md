# Prompt Versioning Strategy -- Phase 2 Preparation

## Status: Strategy documentation for Phase 2. No implementation for MVP.
## MVP Approach: All prompts are v1 and locked after Sprint 4.

---

## 1. Naming Convention

### File Naming

```
{prompt_name}_{language}_v{version}.txt

Examples:
  system_prompt_base_en_v1.txt    -- Current MVP version
  system_prompt_base_en_v2.txt    -- First A/B test variant
  system_prompt_base_cs_v1.txt    -- Current MVP Czech version
  combat_v1.txt                   -- Language-independent sub-prompt v1
  combat_v2.txt                   -- Revised combat prompt
```

### Version Numbering

- `v1` -- MVP / beta launch version (current)
- `v2`, `v3`, etc. -- Subsequent variants for A/B testing
- No semantic versioning for prompts (too granular). Simple incrementing integers.
- Each version is a complete file, not a diff. This allows instant rollback by switching the version reference.

### Metadata Header

Each versioned prompt file includes a header comment (not sent to the model):

```
// PROMPT VERSION: system_prompt_base_en v2
// CREATED: 2026-06-15
// AUTHOR: AI/Prompt Engineer
// CHANGE SUMMARY: Reduced word count target from 100 to 80. Added more Czech idiom guidance.
// A/B TEST: experiment-042
// STATUS: testing | active | retired
```

---

## 2. Backend Version Selection

### Configuration-Based Selection

The backend selects the prompt version using a configuration layer. Three mechanisms, in priority order:

#### Priority 1: User-Level Override (for QA testing)

```typescript
// Feature flag per user (stored in user_preferences or PostHog)
const userOverride = await getUserPromptVersion(userId, 'system_prompt_base');
if (userOverride) return loadPrompt(`system_prompt_base_${lang}_v${userOverride}.txt`);
```

#### Priority 2: Experiment Assignment (A/B test)

```typescript
// PostHog feature flag with percentage rollout
const variant = await posthog.getFeatureFlag('prompt-experiment-042', userId);
// variant returns 'control' or 'test'
const version = variant === 'test' ? 2 : 1;
return loadPrompt(`system_prompt_base_${lang}_v${version}.txt`);
```

#### Priority 3: Global Default

```typescript
// Default version from config
const defaultVersion = config.promptVersions.system_prompt_base || 1;
return loadPrompt(`system_prompt_base_${lang}_v${defaultVersion}.txt`);
```

### Version Registry

A configuration file tracks all active versions:

```json
{
  "prompt_versions": {
    "system_prompt_base": {
      "default": 1,
      "experiment": {
        "id": "prompt-experiment-042",
        "control_version": 1,
        "test_version": 2,
        "rollout_percentage": 20,
        "start_date": "2026-06-15",
        "end_date": "2026-06-29"
      }
    },
    "combat": {
      "default": 1,
      "experiment": null
    },
    "dice_interpretation": {
      "default": 1,
      "experiment": null
    }
  }
}
```

---

## 3. Metrics to Compare

### Primary Metrics (measured per session)

| Metric | Source | Higher is Better | How to Measure |
|---|---|---|---|
| Session completion rate | Backend events | Yes | % of sessions that reach a natural endpoint vs. abandoned |
| Session duration (minutes) | Backend events | Yes (up to 45 min) | Time from first turn to last turn |
| Turns per session | Backend events | Yes | Total turns played |
| User rating | In-app feedback | Yes | Post-session 1-5 star rating |
| Return rate (next 7 days) | Analytics | Yes | % of users who start another session within 7 days |

### Secondary Metrics (measured per turn)

| Metric | Source | Target | How to Measure |
|---|---|---|---|
| Average output tokens | OpenAI usage API | <100 | Track per-turn token count |
| Response latency (p50) | Backend timing | <2.0s | Time from API call to response complete |
| Zod validation pass rate | Backend logs | >99% | % of responses passing schema validation |
| Content safety flag rate | Backend logs | <0.5% | % of responses triggering safety filters |
| Image trigger rate | Backend logs | ~2/session | How often shouldGenerateImage is true |

### Quality Metrics (sampled, LLM-as-judge)

| Metric | Source | Target | How to Measure |
|---|---|---|---|
| Dramatic quality score | LLM evaluation | >7.5 | Sample 5% of turns, run quality_evaluation.txt |
| Coherence score | LLM evaluation | >7.5 | Same sampling |
| TTS readability score | LLM evaluation | >8.0 | Same sampling |
| Language correctness (CZ) | LLM evaluation | >7.0 | Same sampling, Czech turns only |

### Statistical Significance

- Minimum sample size per variant: 500 sessions (approximately 250 users x 2 sessions).
- Minimum experiment duration: 14 days.
- Statistical test: Two-proportion z-test for completion rate, Mann-Whitney U for continuous metrics.
- Significance threshold: p < 0.05.
- Do not call an experiment before reaching minimum sample size.

---

## 4. A/B Testing Process

### Step 1: Hypothesis

Document before creating the variant:

```
Hypothesis: Reducing the word count target from 100 to 80 words will
improve session completion rate by 5% because shorter responses
maintain better pacing in the voice-first experience.

Metric: Session completion rate
Expected effect: +5%
Minimum detectable effect: +3%
```

### Step 2: Create Variant

1. Copy the current version file.
2. Make the specific change.
3. Add the metadata header.
4. Run the test suite against the new version.
5. Verify all scenarios pass.

### Step 3: Configure Experiment

1. Create PostHog feature flag with percentage rollout.
2. Update the version registry.
3. Start with 10% rollout for 3 days (canary phase).
4. If no regressions, expand to 50% for 14 days.

### Step 4: Monitor

Daily check:
- No increase in Zod validation failures.
- No increase in content safety flags.
- Latency unchanged.
- No user complaints.

### Step 5: Analyze

After minimum duration and sample size:
- Compare primary metrics between control and test.
- Check for statistical significance.
- Review quality metric samples.
- Document findings.

### Step 6: Decision

| Result | Action |
|---|---|
| Test wins significantly | Promote test to new default. Archive old version. |
| No significant difference | Keep current default. Archive test. Insight: this variable does not affect the metric. |
| Control wins significantly | Archive test. Document why the change hurt. |
| Regression detected (canary) | Immediately revert to control. Investigate. |

---

## 5. Rollback Procedure

### Immediate Rollback (emergency)

If a prompt version causes issues in production:

1. Update the version registry to set default back to the previous version.
2. No deployment needed; the backend reads the version at runtime.
3. Active sessions continue with the old prompt on the next turn.
4. Log the rollback with timestamp and reason.

```bash
# Emergency rollback via config
# Set default version back to 1
curl -X PATCH /api/admin/config/prompt-versions \
  -d '{"system_prompt_base": {"default": 1, "experiment": null}}'
```

### Experiment Rollback

If an A/B experiment shows regression during canary:

1. Set experiment rollout to 0%.
2. All users return to control on next turn.
3. PostHog feature flag update propagates within 1 minute.

### Rollback Verification

After any rollback:
1. Monitor Zod validation pass rate for 1 hour.
2. Monitor content safety flags for 1 hour.
3. Spot-check 10 responses from the rolled-back prompt.
4. Confirm rollback in the version registry.

---

## 6. Version History Template

Maintain a changelog for each prompt:

```
# system_prompt_base Version History

## v1 (2026-03-25) -- MVP Launch
- Initial version
- Status: ACTIVE (default)

## v2 (2026-06-15) -- Pacing Experiment
- Change: Reduced word count target from 100 to 80
- Hypothesis: Shorter responses improve session completion
- Experiment: prompt-experiment-042
- Result: PENDING
- Status: TESTING (20% rollout)

## v3 (2026-07-01) -- Czech Vocabulary Expansion
- Change: Added 15 new dramatic Czech verbs to voice section
- Hypothesis: Richer vocabulary improves Czech quality score
- Experiment: prompt-experiment-051
- Result: +0.4 Czech quality score, no impact on EN
- Status: PROMOTED TO DEFAULT
```

---

## 7. Prompt Files to Version

Not all prompt files need versioning. Only files that directly affect the player experience:

| File | Version in Phase 2 | Rationale |
|---|---|---|
| system_prompt_base_en.txt | Yes | Core narration quality |
| system_prompt_base_cs.txt | Yes | Czech quality tuning |
| combat.txt | Yes | Combat pacing and drama |
| dice_interpretation.txt | Possibly | Dice narration variety |
| tutorial.txt | Possibly | First-time user experience |
| scene_description.txt | No (low impact) | Minor atmospheric changes |
| cliffhanger.txt | No (low impact) | Session end only |
| recap.txt | No (low impact) | Session resume only |
| conversation_summary.txt | No (internal) | Not player-facing |
| content_safety_rules.txt | No (safety-critical) | Changes require security review, not A/B test |
| adversarial_defense.txt | No (safety-critical) | Same as above |
