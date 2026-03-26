#!/usr/bin/env tsx
/**
 * QUESTCAST - Latency Spike Script
 *
 * Measures the end-to-end voice loop latency:
 *   Audio File -> Whisper (STT) -> GPT-4o-mini (LLM) -> TTS -> Audio Buffer
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx backend/scripts/latency-spike.ts
 *
 * Options:
 *   --iterations N   Number of iterations (default: 5)
 *   --language cs|en Language for STT (default: en)
 */

import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

// ---- Configuration ----

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('ERROR: OPENAI_API_KEY environment variable is required');
  process.exit(1);
}

const args = process.argv.slice(2);
const iterationsArg = args.indexOf('--iterations');
const ITERATIONS = iterationsArg !== -1 ? parseInt(args[iterationsArg + 1] ?? '5', 10) : 5;
const langArg = args.indexOf('--language');
const LANGUAGE = langArg !== -1 ? (args[langArg + 1] ?? 'en') : 'en';

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

const DM_SYSTEM_PROMPT = `You are an epic fantasy Dungeon Master. Respond to the player's action with vivid narration in 1-2 sentences. Keep it under 100 words. Respond in ${LANGUAGE === 'cs' ? 'Czech' : 'English'}.`;

// ---- Timing Utilities ----

interface StepTiming {
  step: string;
  durationMs: number;
}

interface IterationResult {
  iteration: number;
  steps: StepTiming[];
  totalMs: number;
  sttText: string;
  llmText: string;
  ttsBytes: number;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

// ---- Create Sample Audio ----

/**
 * Generate a short sample audio using TTS (since we may not have a real recording).
 * This simulates what a player's voice input would look like.
 */
async function createSampleAudio(): Promise<Buffer> {
  const sampleText =
    LANGUAGE === 'cs'
      ? 'Vstupuji do temne jeskyne a tasim svuj mec.'
      : 'I enter the dark cave and draw my sword.';

  console.info(`Generating sample audio for: "${sampleText}"`);

  const response = await client.audio.speech.create({
    model: 'tts-1',
    voice: 'onyx',
    input: sampleText,
    response_format: 'mp3',
  });

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ---- Pipeline Steps ----

async function stepSTT(audioBuffer: Buffer): Promise<{ text: string; durationMs: number }> {
  const start = performance.now();

  const file = new File([audioBuffer], 'audio.mp3', { type: 'audio/mpeg' });

  const response = await client.audio.transcriptions.create({
    model: 'whisper-1',
    file,
    language: LANGUAGE === 'cs' ? 'cs' : 'en',
  });

  return {
    text: response.text,
    durationMs: Math.round(performance.now() - start),
  };
}

async function stepLLM(playerInput: string): Promise<{ text: string; durationMs: number }> {
  const start = performance.now();

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: DM_SYSTEM_PROMPT },
      { role: 'user', content: playerInput },
    ],
    max_tokens: 150,
    temperature: 0.8,
  });

  const text = response.choices[0]?.message?.content ?? '';

  return {
    text,
    durationMs: Math.round(performance.now() - start),
  };
}

async function stepTTS(text: string): Promise<{ audioBuffer: Buffer; durationMs: number }> {
  const start = performance.now();

  const response = await client.audio.speech.create({
    model: 'tts-1',
    voice: 'alloy',
    input: text,
    response_format: 'opus',
    speed: 1.0,
  });

  const arrayBuffer = await response.arrayBuffer();

  return {
    audioBuffer: Buffer.from(arrayBuffer),
    durationMs: Math.round(performance.now() - start),
  };
}

// ---- Main ----

async function runIteration(
  iteration: number,
  audioBuffer: Buffer,
): Promise<IterationResult> {
  const totalStart = performance.now();
  const steps: StepTiming[] = [];

  // Step 1: STT
  const stt = await stepSTT(audioBuffer);
  steps.push({ step: 'STT (Whisper)', durationMs: stt.durationMs });

  // Step 2: LLM
  const llm = await stepLLM(stt.text);
  steps.push({ step: 'LLM (GPT-4o-mini)', durationMs: llm.durationMs });

  // Step 3: TTS
  const tts = await stepTTS(llm.text);
  steps.push({ step: 'TTS (OpenAI)', durationMs: tts.durationMs });

  const totalMs = Math.round(performance.now() - totalStart);

  return {
    iteration,
    steps,
    totalMs,
    sttText: stt.text,
    llmText: llm.text,
    ttsBytes: tts.audioBuffer.length,
  };
}

async function main() {
  console.info('========================================');
  console.info('  QUESTCAST - Latency Spike Test');
  console.info('========================================');
  console.info(`Iterations: ${ITERATIONS}`);
  console.info(`Language: ${LANGUAGE}`);
  console.info('');

  // Prepare sample audio
  console.info('Preparing sample audio...');
  const audioBuffer = await createSampleAudio();
  console.info(`Sample audio ready: ${audioBuffer.length} bytes`);
  console.info('');

  // Save sample audio for reference
  const outputDir = path.resolve(process.cwd(), 'backend/scripts/output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(path.join(outputDir, 'sample-input.mp3'), audioBuffer);

  // Run iterations
  const results: IterationResult[] = [];

  for (let i = 1; i <= ITERATIONS; i++) {
    console.info(`--- Iteration ${i}/${ITERATIONS} ---`);

    const result = await runIteration(i, audioBuffer);
    results.push(result);

    for (const step of result.steps) {
      console.info(`  ${step.step}: ${step.durationMs}ms`);
    }
    console.info(`  TOTAL: ${result.totalMs}ms`);
    console.info(`  STT: "${result.sttText}"`);
    console.info(`  LLM: "${result.llmText.substring(0, 80)}..."`);
    console.info(`  TTS: ${result.ttsBytes} bytes`);
    console.info('');
  }

  // ---- Summary ----
  console.info('========================================');
  console.info('  RESULTS SUMMARY');
  console.info('========================================');

  const totals = results.map((r) => r.totalMs);
  const sttTimes = results.map((r) => r.steps[0]?.durationMs ?? 0);
  const llmTimes = results.map((r) => r.steps[1]?.durationMs ?? 0);
  const ttsTimes = results.map((r) => r.steps[2]?.durationMs ?? 0);

  const avg = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

  console.info('');
  console.info('Step Breakdown (avg / p50 / p95):');
  console.info(
    `  STT:   ${avg(sttTimes)}ms / ${percentile(sttTimes, 50)}ms / ${percentile(sttTimes, 95)}ms`,
  );
  console.info(
    `  LLM:   ${avg(llmTimes)}ms / ${percentile(llmTimes, 50)}ms / ${percentile(llmTimes, 95)}ms`,
  );
  console.info(
    `  TTS:   ${avg(ttsTimes)}ms / ${percentile(ttsTimes, 50)}ms / ${percentile(ttsTimes, 95)}ms`,
  );
  console.info('');
  console.info('Total End-to-End:');
  console.info(`  Average: ${avg(totals)}ms`);
  console.info(`  p50:     ${percentile(totals, 50)}ms`);
  console.info(`  p95:     ${percentile(totals, 95)}ms`);
  console.info(`  Min:     ${Math.min(...totals)}ms`);
  console.info(`  Max:     ${Math.max(...totals)}ms`);
  console.info('');

  // Evaluate against targets
  const p50 = percentile(totals, 50);
  const p95 = percentile(totals, 95);

  console.info('Target Evaluation:');
  console.info(`  p50 target: <2000ms -> ${p50}ms ${p50 < 2000 ? 'PASS' : p50 < 3000 ? 'YELLOW' : 'FAIL'}`);
  console.info(`  p95 target: <3000ms -> ${p95}ms ${p95 < 3000 ? 'PASS' : p95 < 3500 ? 'YELLOW' : 'FAIL'}`);
  console.info(`  Hard fail:  >5000ms -> ${Math.max(...totals)}ms ${Math.max(...totals) < 5000 ? 'PASS' : 'FAIL'}`);
  console.info('');

  if (p95 > 5000) {
    console.error('RESULT: FAIL - Latency exceeds hard fail threshold. Re-evaluate architecture.');
  } else if (p95 > 3500) {
    console.warn('RESULT: YELLOW - Consider Deepgram (STT) + ElevenLabs (TTS) alternatives.');
  } else {
    console.info('RESULT: PASS - Latency within acceptable range.');
  }

  // Save results to JSON
  const report = {
    timestamp: new Date().toISOString(),
    language: LANGUAGE,
    iterations: ITERATIONS,
    results: results.map((r) => ({
      iteration: r.iteration,
      steps: r.steps,
      totalMs: r.totalMs,
    })),
    summary: {
      stt: { avg: avg(sttTimes), p50: percentile(sttTimes, 50), p95: percentile(sttTimes, 95) },
      llm: { avg: avg(llmTimes), p50: percentile(llmTimes, 50), p95: percentile(llmTimes, 95) },
      tts: { avg: avg(ttsTimes), p50: percentile(ttsTimes, 50), p95: percentile(ttsTimes, 95) },
      total: { avg: avg(totals), p50, p95, min: Math.min(...totals), max: Math.max(...totals) },
    },
    evaluation: {
      p50Pass: p50 < 2000,
      p95Pass: p95 < 3000,
      hardFailPass: Math.max(...totals) < 5000,
    },
  };

  fs.writeFileSync(
    path.join(outputDir, 'latency-report.json'),
    JSON.stringify(report, null, 2),
  );
  console.info(`Report saved to: ${path.join(outputDir, 'latency-report.json')}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
