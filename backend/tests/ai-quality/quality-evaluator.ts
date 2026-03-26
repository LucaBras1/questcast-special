/**
 * AI Quality Evaluator
 *
 * Framework for evaluating AI response quality against defined metrics.
 * Used for automated quality gates in CI and batch evaluation of prompt changes.
 *
 * Metrics evaluated:
 * - Response length (words + tokens estimate)
 * - Language correctness
 * - Content safety
 * - JSON validity
 * - Game state consistency
 */

// ---- Types ----

export interface TestScenario {
  id: string;
  name: string;
  description: string;
  language: 'cs' | 'en';
  playerInput: string;
  gameState: {
    characterName: string;
    characterClass: string;
    currentLocation: string;
    activeQuest: string;
    turnsPlayed: number;
  };
  expectedBehavior: {
    shouldMentionCharacter: boolean;
    shouldMentionLocation: boolean;
    minWords: number;
    maxWords: number;
    expectedLanguage: 'cs' | 'en';
    shouldRequireDice?: boolean;
    shouldBeNarrative: boolean;
  };
}

export interface QualityMetric {
  name: string;
  passed: boolean;
  value: string | number | boolean;
  threshold: string;
  details?: string;
}

export interface QualityReport {
  scenarioId: string;
  scenarioName: string;
  timestamp: string;
  metrics: QualityMetric[];
  overallPass: boolean;
  responseText: string;
  responseWordCount: number;
  estimatedTokens: number;
}

export interface BatchReport {
  timestamp: string;
  totalScenarios: number;
  passed: number;
  failed: number;
  passRate: number;
  reports: QualityReport[];
  failedScenarios: string[];
}

// ---- Quality Evaluator ----

export class QualityEvaluator {
  private moderationApiKey: string | null;

  constructor(options?: { moderationApiKey?: string }) {
    this.moderationApiKey = options?.moderationApiKey ?? null;
  }

  /**
   * Evaluate a single AI response against a test scenario.
   */
  async evaluateResponse(
    scenario: TestScenario,
    aiResponse: string,
    parsedJson?: Record<string, unknown> | null,
  ): Promise<QualityReport> {
    const metrics: QualityMetric[] = [];

    // 1. Response length (word count)
    const wordCount = this.countWords(aiResponse);
    const estimatedTokens = this.estimateTokens(aiResponse);

    metrics.push(this.evaluateWordCount(wordCount, scenario));
    metrics.push(this.evaluateTokenCount(estimatedTokens));

    // 2. Language correctness
    metrics.push(this.evaluateLanguage(aiResponse, scenario.expectedBehavior.expectedLanguage));

    // 3. Content safety (synchronous check -- basic patterns)
    metrics.push(this.evaluateContentSafety(aiResponse));

    // 4. JSON validity
    if (parsedJson !== undefined) {
      metrics.push(this.evaluateJsonValidity(parsedJson));
    }

    // 5. Game state consistency
    if (scenario.expectedBehavior.shouldMentionCharacter) {
      metrics.push(
        this.evaluateCharacterMention(
          aiResponse,
          scenario.gameState.characterName,
          scenario.gameState.characterClass,
        ),
      );
    }

    if (scenario.expectedBehavior.shouldMentionLocation) {
      metrics.push(
        this.evaluateLocationMention(aiResponse, scenario.gameState.currentLocation),
      );
    }

    // 6. Narrative quality (basic heuristic)
    if (scenario.expectedBehavior.shouldBeNarrative) {
      metrics.push(this.evaluateNarrativeQuality(aiResponse));
    }

    // 7. Sprint 2: Structured output validity
    if (parsedJson !== undefined) {
      metrics.push(this.evaluateStructuredOutputValidity(parsedJson));
    }

    // 8. Sprint 2: Suggested actions quality
    if (parsedJson !== undefined) {
      metrics.push(this.evaluateSuggestedActionsQuality(parsedJson));
    }

    // 9. Sprint 2: State update consistency
    if (parsedJson !== undefined) {
      metrics.push(this.evaluateStateUpdateConsistency(parsedJson));
    }

    const overallPass = metrics.every((m) => m.passed);

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      timestamp: new Date().toISOString(),
      metrics,
      overallPass,
      responseText: aiResponse,
      responseWordCount: wordCount,
      estimatedTokens,
    };
  }

  /**
   * Run evaluation against a batch of scenarios.
   */
  async evaluateBatch(
    scenarios: TestScenario[],
    responseGenerator: (scenario: TestScenario) => Promise<{ text: string; json?: Record<string, unknown> | null }>,
  ): Promise<BatchReport> {
    const reports: QualityReport[] = [];

    for (const scenario of scenarios) {
      try {
        const response = await responseGenerator(scenario);
        const report = await this.evaluateResponse(scenario, response.text, response.json);
        reports.push(report);
      } catch (error) {
        // If response generation fails, create a failing report
        reports.push({
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          timestamp: new Date().toISOString(),
          metrics: [
            {
              name: 'response_generation',
              passed: false,
              value: false,
              threshold: 'Response must be generated',
              details: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          overallPass: false,
          responseText: '',
          responseWordCount: 0,
          estimatedTokens: 0,
        });
      }
    }

    const passed = reports.filter((r) => r.overallPass).length;
    const failed = reports.filter((r) => !r.overallPass).length;
    const failedScenarios = reports
      .filter((r) => !r.overallPass)
      .map((r) => `${r.scenarioId}: ${r.scenarioName}`);

    return {
      timestamp: new Date().toISOString(),
      totalScenarios: scenarios.length,
      passed,
      failed,
      passRate: scenarios.length > 0 ? passed / scenarios.length : 0,
      reports,
      failedScenarios,
    };
  }

  // ---- Metric Evaluators ----

  private evaluateWordCount(wordCount: number, scenario: TestScenario): QualityMetric {
    const min = scenario.expectedBehavior.minWords;
    const max = scenario.expectedBehavior.maxWords;
    const passed = wordCount >= min && wordCount <= max;

    return {
      name: 'word_count',
      passed,
      value: wordCount,
      threshold: `${min}-${max} words`,
      details: passed
        ? undefined
        : `Response has ${wordCount} words, expected ${min}-${max}`,
    };
  }

  private evaluateTokenCount(tokenCount: number): QualityMetric {
    const maxTokens = 200; // Target: <150, hard limit: 200
    const passed = tokenCount <= maxTokens;

    return {
      name: 'token_count',
      passed,
      value: tokenCount,
      threshold: `<= ${maxTokens} tokens`,
      details: passed
        ? undefined
        : `Estimated ${tokenCount} tokens, exceeds limit of ${maxTokens}`,
    };
  }

  private evaluateLanguage(text: string, expectedLanguage: 'cs' | 'en'): QualityMetric {
    // Simple heuristic: check for Czech-specific characters
    const czechChars = /[ěščřžýáíéůúďťňó]/i;
    const hasCzechChars = czechChars.test(text);

    let detectedLanguage: 'cs' | 'en' | 'unknown';

    if (hasCzechChars) {
      detectedLanguage = 'cs';
    } else {
      // Check for common Czech words without diacritics (less reliable)
      const czechWords = /\b(je|jsou|ale|nebo|jako|pro|jeho|jejich|bude|bylo|mohl|kdyz|protoze|takze)\b/i;
      detectedLanguage = czechWords.test(text) ? 'cs' : 'en';
    }

    const passed = detectedLanguage === expectedLanguage;

    return {
      name: 'language_match',
      passed,
      value: detectedLanguage,
      threshold: `Expected: ${expectedLanguage}`,
      details: passed
        ? undefined
        : `Detected '${detectedLanguage}', expected '${expectedLanguage}'`,
    };
  }

  private evaluateContentSafety(text: string): QualityMetric {
    // Basic content safety patterns (supplement with OpenAI Moderation API in production)
    const unsafePatterns = [
      /\b(kill yourself|kys)\b/i,
      /\b(real.?world|in real life|irl)\b.*\b(violence|weapon|bomb|attack)\b/i,
      /\b(make|build|create)\b.*\b(bomb|weapon|explosive)\b/i,
      /\b(child|minor|underage)\b.*\b(sexual|naked|nude)\b/i,
    ];

    const flagged = unsafePatterns.some((pattern) => pattern.test(text));

    return {
      name: 'content_safety',
      passed: !flagged,
      value: !flagged,
      threshold: 'No flagged content patterns',
      details: flagged ? 'Response contains potentially unsafe content pattern' : undefined,
    };
  }

  private evaluateJsonValidity(parsedJson: Record<string, unknown> | null): QualityMetric {
    const passed = parsedJson !== null && typeof parsedJson === 'object';

    return {
      name: 'json_validity',
      passed,
      value: passed,
      threshold: 'Valid JSON object',
      details: passed ? undefined : 'Response did not parse as valid JSON',
    };
  }

  private evaluateCharacterMention(
    text: string,
    characterName: string,
    characterClass: string,
  ): QualityMetric {
    const textLower = text.toLowerCase();
    const nameFound = textLower.includes(characterName.toLowerCase());
    const classFound = textLower.includes(characterClass.toLowerCase());
    const passed = nameFound || classFound;

    return {
      name: 'character_consistency',
      passed,
      value: passed,
      threshold: `Mentions character name ("${characterName}") or class ("${characterClass}")`,
      details: passed
        ? undefined
        : `Neither "${characterName}" nor "${characterClass}" found in response`,
    };
  }

  private evaluateLocationMention(text: string, location: string): QualityMetric {
    const textLower = text.toLowerCase();
    // Check for the location name or keywords from it
    const locationWords = location.toLowerCase().split(/\s+/);
    const found = locationWords.some((word) => word.length > 3 && textLower.includes(word));

    return {
      name: 'location_consistency',
      passed: found,
      value: found,
      threshold: `References location: "${location}"`,
      details: found
        ? undefined
        : `No reference to "${location}" found in response`,
    };
  }

  private evaluateNarrativeQuality(text: string): QualityMetric {
    // Basic heuristic checks for narrative quality
    const checks = {
      hasMultipleSentences: (text.match(/[.!?]/g) || []).length >= 2,
      notAllCaps: text !== text.toUpperCase(),
      hasDescriptiveLanguage: /\b(you |your |the |a |an )\b/i.test(text),
      noCodeArtifacts: !/```|function\s*\(|=>|import\s+/.test(text),
      noMetaText: !/as an ai|i'm an ai|language model|i cannot/i.test(text),
    };

    const failedChecks = Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);

    const passed = failedChecks.length === 0;

    return {
      name: 'narrative_quality',
      passed,
      value: passed,
      threshold: 'Reads as game narration, not code or meta-text',
      details: passed
        ? undefined
        : `Failed checks: ${failedChecks.join(', ')}`,
    };
  }

  // ---- Sprint 2 New Metrics ----

  /**
   * Evaluate structured output validity: does the response match
   * the narration_response JSON schema?
   */
  evaluateStructuredOutputValidity(
    parsedJson: Record<string, unknown> | null,
  ): QualityMetric {
    if (!parsedJson) {
      return {
        name: 'structured_output_validity',
        passed: false,
        value: false,
        threshold: 'Must be valid JSON matching narration_response schema',
        details: 'Response did not parse as valid JSON',
      };
    }

    const checks: string[] = [];

    // Must have 'narration' as non-empty string
    if (typeof parsedJson.narration !== 'string' || (parsedJson.narration as string).length === 0) {
      checks.push('missing or empty narration field');
    }

    // If stateUpdates present, should be an object
    if (parsedJson.stateUpdates !== undefined && typeof parsedJson.stateUpdates !== 'object') {
      checks.push('stateUpdates must be an object');
    }

    // If suggestedActions present, should be an array of max 3 strings
    if (parsedJson.suggestedActions !== undefined) {
      if (!Array.isArray(parsedJson.suggestedActions)) {
        checks.push('suggestedActions must be an array');
      } else if ((parsedJson.suggestedActions as unknown[]).length > 3) {
        checks.push('suggestedActions must have at most 3 items');
      }
    }

    // requiresDiceRoll should be boolean if present
    if (
      parsedJson.requiresDiceRoll !== undefined &&
      typeof parsedJson.requiresDiceRoll !== 'boolean'
    ) {
      checks.push('requiresDiceRoll must be boolean');
    }

    const passed = checks.length === 0;

    return {
      name: 'structured_output_validity',
      passed,
      value: passed,
      threshold: 'Matches narration_response JSON schema',
      details: passed ? undefined : `Schema violations: ${checks.join('; ')}`,
    };
  }

  /**
   * Evaluate suggested actions quality: are 2-3 meaningful actions present?
   */
  evaluateSuggestedActionsQuality(
    parsedJson: Record<string, unknown> | null,
  ): QualityMetric {
    if (!parsedJson || !Array.isArray(parsedJson.suggestedActions)) {
      return {
        name: 'suggested_actions_quality',
        passed: false,
        value: 0,
        threshold: '2-3 non-empty suggested actions',
        details: 'No suggestedActions array found',
      };
    }

    const actions = parsedJson.suggestedActions as string[];
    const nonEmptyActions = actions.filter((a) => typeof a === 'string' && a.trim().length > 3);
    const count = nonEmptyActions.length;

    const passed = count >= 2 && count <= 3;

    return {
      name: 'suggested_actions_quality',
      passed,
      value: count,
      threshold: '2-3 meaningful actions (>3 chars each)',
      details: passed
        ? undefined
        : `Found ${count} meaningful actions, expected 2-3`,
    };
  }

  /**
   * Evaluate state update consistency: do stateUpdates make logical sense?
   * Catches absurd values like gaining 1000 HP or losing more gold than exists.
   */
  evaluateStateUpdateConsistency(
    parsedJson: Record<string, unknown> | null,
  ): QualityMetric {
    if (!parsedJson || !parsedJson.stateUpdates) {
      return {
        name: 'state_update_consistency',
        passed: true,
        value: true,
        threshold: 'State updates are logically consistent',
        details: 'No state updates to validate',
      };
    }

    const updates = parsedJson.stateUpdates as Record<string, unknown>;
    const issues: string[] = [];

    // Health change should be reasonable (-50 to +50)
    if (typeof updates.healthChange === 'number') {
      const hc = updates.healthChange as number;
      if (hc > 50 || hc < -100) {
        issues.push(`healthChange=${hc} is unreasonably large (expected -100 to +50)`);
      }
    }

    // Gold change should be reasonable (-100 to +100)
    if (typeof updates.goldChange === 'number') {
      const gc = updates.goldChange as number;
      if (gc > 100 || gc < -100) {
        issues.push(`goldChange=${gc} is unreasonably large (expected -100 to +100)`);
      }
    }

    // Quest progress should be 0-100
    if (typeof updates.questProgress === 'number') {
      const qp = updates.questProgress as number;
      if (qp < 0 || qp > 100) {
        issues.push(`questProgress=${qp} is out of range (expected 0-100)`);
      }
    }

    // Threat level should be valid enum
    if (updates.threatLevel !== undefined) {
      const validLevels = ['low', 'moderate', 'high', 'critical'];
      if (!validLevels.includes(updates.threatLevel as string)) {
        issues.push(`threatLevel="${updates.threatLevel}" is not a valid level`);
      }
    }

    // Time of day should be valid enum
    if (updates.timeOfDay !== undefined) {
      const validTimes = ['morning', 'afternoon', 'evening', 'night'];
      if (!validTimes.includes(updates.timeOfDay as string)) {
        issues.push(`timeOfDay="${updates.timeOfDay}" is not valid`);
      }
    }

    const passed = issues.length === 0;

    return {
      name: 'state_update_consistency',
      passed,
      value: passed,
      threshold: 'All state updates within reasonable ranges',
      details: passed ? undefined : issues.join('; '),
    };
  }

  // ---- Utilities ----

  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
  }

  /**
   * Rough token estimate: ~0.75 words per token for English,
   * ~0.6 words per token for Czech (more characters per token).
   */
  private estimateTokens(text: string): number {
    const words = this.countWords(text);
    // Conservative estimate: 1 token per 0.7 words
    return Math.ceil(words / 0.7);
  }
}

// ---- CLI Runner (for batch evaluation) ----

export function formatBatchReport(report: BatchReport): string {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('AI QUALITY EVALUATION REPORT');
  lines.push(`Timestamp: ${report.timestamp}`);
  lines.push(`Scenarios: ${report.totalScenarios} | Passed: ${report.passed} | Failed: ${report.failed}`);
  lines.push(`Pass Rate: ${(report.passRate * 100).toFixed(1)}%`);
  lines.push('='.repeat(60));

  for (const scenarioReport of report.reports) {
    const status = scenarioReport.overallPass ? 'PASS' : 'FAIL';
    lines.push('');
    lines.push(`[${status}] ${scenarioReport.scenarioId}: ${scenarioReport.scenarioName}`);
    lines.push(`  Words: ${scenarioReport.responseWordCount} | Tokens (est): ${scenarioReport.estimatedTokens}`);

    for (const metric of scenarioReport.metrics) {
      const icon = metric.passed ? '[OK]' : '[!!]';
      lines.push(`  ${icon} ${metric.name}: ${metric.value} (${metric.threshold})`);
      if (metric.details) {
        lines.push(`      -> ${metric.details}`);
      }
    }
  }

  if (report.failedScenarios.length > 0) {
    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('FAILED SCENARIOS:');
    for (const name of report.failedScenarios) {
      lines.push(`  - ${name}`);
    }
  }

  lines.push('');
  lines.push('='.repeat(60));

  return lines.join('\n');
}
