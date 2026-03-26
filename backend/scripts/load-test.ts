/**
 * Load Test Script for Questcast Backend.
 *
 * Simulates concurrent game sessions to measure performance under load.
 *
 * Usage:
 *   npx tsx backend/scripts/load-test.ts
 *
 * Configuration (environment variables):
 *   BASE_URL       - Backend URL (default: http://localhost:3000)
 *   TOTAL_SESSIONS - Number of concurrent sessions (default: 100)
 *   TURNS_PER_SESSION - Turns per session (default: 5)
 *   CONCURRENCY    - Max parallel sessions (default: 10)
 *   AUTH_TOKEN      - JWT token for authenticated requests (required)
 */

import { writeFileSync } from 'fs';
import { join } from 'path';

// ---- Configuration ----

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const TOTAL_SESSIONS = parseInt(process.env.TOTAL_SESSIONS ?? '100', 10);
const TURNS_PER_SESSION = parseInt(process.env.TURNS_PER_SESSION ?? '5', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? '10', 10);
const AUTH_TOKEN = process.env.AUTH_TOKEN ?? '';

if (!AUTH_TOKEN) {
  console.error('ERROR: AUTH_TOKEN environment variable is required.');
  console.error('Generate one by calling POST /api/auth/login and set AUTH_TOKEN=<token>');
  process.exit(1);
}

// ---- Types ----

interface SessionResult {
  sessionId: string | null;
  turnsCompleted: number;
  turnLatencies: number[];
  errors: string[];
  totalDurationMs: number;
}

interface LoadTestResults {
  config: {
    baseUrl: string;
    totalSessions: number;
    turnsPerSession: number;
    concurrency: number;
    timestamp: string;
  };
  summary: {
    totalSessions: number;
    successfulSessions: number;
    failedSessions: number;
    totalTurns: number;
    successfulTurns: number;
    errorRate: number;
    latency: {
      p50: number;
      p95: number;
      p99: number;
      min: number;
      max: number;
      mean: number;
    };
    totalDurationMs: number;
    errors: Record<string, number>;
  };
  sessions: SessionResult[];
}

// ---- HTTP Helpers ----

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${AUTH_TOKEN}`,
};

async function createSession(): Promise<string> {
  const classes = ['warrior', 'mage', 'rogue', 'ranger'];
  const randomClass = classes[Math.floor(Math.random() * classes.length)];
  const randomName = `LoadTest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const response = await fetch(`${BASE_URL}/api/game/session`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      characterName: randomName,
      characterClass: randomClass,
      language: 'en',
    }),
  });

  if (!response.ok) {
    throw new Error(`Create session failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { id: string };
  return data.id;
}

async function playTurn(sessionId: string): Promise<number> {
  const startTime = Date.now();

  const actions = [
    'I look around the room carefully',
    'I draw my sword and prepare for combat',
    'I speak to the mysterious stranger',
    'I search for hidden passages',
    'I open the old wooden chest',
    'I cast a spell of protection',
    'I sneak past the guards',
    'I examine the ancient inscription',
  ];

  const randomAction = actions[Math.floor(Math.random() * actions.length)];

  const response = await fetch(`${BASE_URL}/api/game/session/${sessionId}/turn`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      textInput: randomAction,
    }),
  });

  if (!response.ok && response.status !== 200) {
    // SSE responses return 200 with streaming
    throw new Error(`Turn failed: ${response.status}`);
  }

  // For SSE, consume the stream
  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // Just consume the data, no need to parse for load test
        decoder.decode(value);
      }
    } finally {
      reader.releaseLock();
    }
  }

  return Date.now() - startTime;
}

async function completeSession(sessionId: string): Promise<void> {
  await fetch(`${BASE_URL}/api/game/session/${sessionId}/status`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status: 'completed' }),
  });
}

// ---- Session Runner ----

async function runSession(sessionIndex: number): Promise<SessionResult> {
  const result: SessionResult = {
    sessionId: null,
    turnsCompleted: 0,
    turnLatencies: [],
    errors: [],
    totalDurationMs: 0,
  };

  const startTime = Date.now();

  try {
    // Create session
    result.sessionId = await createSession();
    process.stdout.write(`[${sessionIndex + 1}/${TOTAL_SESSIONS}] Session ${result.sessionId.slice(0, 8)} created\n`);

    // Play turns
    for (let turn = 0; turn < TURNS_PER_SESSION; turn++) {
      try {
        const latency = await playTurn(result.sessionId);
        result.turnLatencies.push(latency);
        result.turnsCompleted++;
        process.stdout.write(`  Turn ${turn + 1}: ${latency}ms\n`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        result.errors.push(`Turn ${turn + 1}: ${msg}`);
        process.stdout.write(`  Turn ${turn + 1}: ERROR - ${msg}\n`);
      }
    }

    // Complete session
    await completeSession(result.sessionId);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Session: ${msg}`);
    process.stdout.write(`[${sessionIndex + 1}] Session ERROR: ${msg}\n`);
  }

  result.totalDurationMs = Date.now() - startTime;
  return result;
}

// ---- Throttled Execution ----

async function runWithThrottling(
  total: number,
  concurrency: number,
  fn: (index: number) => Promise<SessionResult>,
): Promise<SessionResult[]> {
  const results: SessionResult[] = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < total) {
      const index = nextIndex++;
      const result = await fn(index);
      results.push(result);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, total); i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}

// ---- Statistics ----

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function computeResults(sessions: SessionResult[]): LoadTestResults {
  const allLatencies = sessions.flatMap((s) => s.turnLatencies).sort((a, b) => a - b);
  const totalTurns = sessions.reduce((sum, s) => sum + s.turnsCompleted + s.errors.length, 0);
  const successfulTurns = sessions.reduce((sum, s) => sum + s.turnsCompleted, 0);

  // Count errors by type
  const errorCounts: Record<string, number> = {};
  for (const session of sessions) {
    for (const error of session.errors) {
      const key = error.split(':')[0].trim();
      errorCounts[key] = (errorCounts[key] ?? 0) + 1;
    }
  }

  const totalDurationMs = Math.max(...sessions.map((s) => s.totalDurationMs), 0);

  return {
    config: {
      baseUrl: BASE_URL,
      totalSessions: TOTAL_SESSIONS,
      turnsPerSession: TURNS_PER_SESSION,
      concurrency: CONCURRENCY,
      timestamp: new Date().toISOString(),
    },
    summary: {
      totalSessions: sessions.length,
      successfulSessions: sessions.filter((s) => s.errors.length === 0).length,
      failedSessions: sessions.filter((s) => s.errors.length > 0).length,
      totalTurns,
      successfulTurns,
      errorRate: totalTurns > 0 ? (totalTurns - successfulTurns) / totalTurns : 0,
      latency: {
        p50: percentile(allLatencies, 50),
        p95: percentile(allLatencies, 95),
        p99: percentile(allLatencies, 99),
        min: allLatencies[0] ?? 0,
        max: allLatencies[allLatencies.length - 1] ?? 0,
        mean: allLatencies.length > 0 ? Math.round(allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length) : 0,
      },
      totalDurationMs,
      errors: errorCounts,
    },
    sessions,
  };
}

// ---- Main ----

async function main() {
  console.log('=== Questcast Load Test ===');
  console.log(`Target:      ${BASE_URL}`);
  console.log(`Sessions:    ${TOTAL_SESSIONS}`);
  console.log(`Turns/sess:  ${TURNS_PER_SESSION}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log('');

  const startTime = Date.now();

  // Verify connectivity
  try {
    const healthResp = await fetch(`${BASE_URL}/health`);
    if (!healthResp.ok) {
      console.error(`Health check failed: ${healthResp.status}`);
      process.exit(1);
    }
    console.log('Health check: OK');
  } catch (error) {
    console.error(`Cannot reach ${BASE_URL}: ${error}`);
    process.exit(1);
  }

  console.log('\nStarting load test...\n');

  const sessions = await runWithThrottling(TOTAL_SESSIONS, CONCURRENCY, runSession);

  const results = computeResults(sessions);

  // Print summary
  console.log('\n=== RESULTS ===');
  console.log(`Total duration:    ${(results.summary.totalDurationMs / 1000).toFixed(1)}s`);
  console.log(`Sessions:          ${results.summary.successfulSessions}/${results.summary.totalSessions} successful`);
  console.log(`Turns:             ${results.summary.successfulTurns}/${results.summary.totalTurns} successful`);
  console.log(`Error rate:        ${(results.summary.errorRate * 100).toFixed(1)}%`);
  console.log('');
  console.log('Latency (ms):');
  console.log(`  p50:  ${results.summary.latency.p50}`);
  console.log(`  p95:  ${results.summary.latency.p95}`);
  console.log(`  p99:  ${results.summary.latency.p99}`);
  console.log(`  min:  ${results.summary.latency.min}`);
  console.log(`  max:  ${results.summary.latency.max}`);
  console.log(`  mean: ${results.summary.latency.mean}`);

  if (Object.keys(results.summary.errors).length > 0) {
    console.log('\nError breakdown:');
    for (const [type, count] of Object.entries(results.summary.errors)) {
      console.log(`  ${type}: ${count}`);
    }
  }

  // Write results to JSON
  const outputPath = join(process.cwd(), 'load-test-results.json');
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nFull results saved to: ${outputPath}`);
}

main().catch((error) => {
  console.error('Load test crashed:', error);
  process.exit(1);
});
