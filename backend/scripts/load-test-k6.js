/**
 * Questcast Load Test -- k6 Script
 *
 * Implements Scenario 1 (Ramp-up) and Scenario 2 (Sustained) from load-test-spec.md.
 *
 * Usage:
 *   k6 run backend/scripts/load-test-k6.js
 *   k6 run --env SCENARIO=rampup backend/scripts/load-test-k6.js
 *   k6 run --env SCENARIO=sustained backend/scripts/load-test-k6.js
 *   k6 run --env BASE_URL=https://api-staging.questcast.app backend/scripts/load-test-k6.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ---- Configuration ----

const BASE_URL = __ENV.BASE_URL || 'https://api-staging.questcast.app';
const SCENARIO = __ENV.SCENARIO || 'both';

// Custom metrics
const turnLatency = new Trend('turn_latency', true);
const sessionCreateLatency = new Trend('session_create_latency', true);
const loginLatency = new Trend('login_latency', true);
const errorRate = new Rate('error_rate');
const turnCounter = new Counter('turns_submitted');
const sessionCounter = new Counter('sessions_created');

// ---- Scenarios ----

const scenarios = {};

if (SCENARIO === 'rampup' || SCENARIO === 'both') {
  scenarios.rampup = {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '5m', target: 100 },  // Ramp up to 100 VUs over 5 min
      { duration: '2m', target: 100 },  // Hold at 100 for 2 min
      { duration: '1m', target: 0 },    // Ramp down
    ],
    gracefulRampDown: '30s',
    tags: { scenario: 'rampup' },
  };
}

if (SCENARIO === 'sustained' || SCENARIO === 'both') {
  scenarios.sustained = {
    executor: 'constant-vus',
    vus: 100,
    duration: '10m',
    startTime: SCENARIO === 'both' ? '9m' : '0s',  // Start after rampup if running both
    tags: { scenario: 'sustained' },
  };
}

export const options = {
  scenarios,
  thresholds: {
    // Pass criteria from load-test-spec.md
    'http_req_duration{url!~".*/turn$"}': ['p(95)<500'],  // Non-AI endpoints: p95 < 500ms
    'turn_latency': ['p(95)<500'],                         // Turn overhead: p95 < 500ms
    'session_create_latency': ['p(95)<500'],               // Session create: p95 < 500ms
    'error_rate': ['rate<0.05'],                           // Error rate < 5%
    'http_req_failed': ['rate<0.05'],                      // HTTP failure rate < 5%
  },
  // Do not follow redirects
  noConnectionReuse: false,
  userAgent: 'Questcast-LoadTest/1.0',
};

// ---- Helper Functions ----

function getHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Generate a unique test user email based on VU ID and iteration.
 */
function getTestUser() {
  return {
    email: `loadtest-vu${__VU}-iter${__ITER}@questcast.app`,
    password: 'LoadTest123!Secure',
    displayName: `Load Tester ${__VU}`,
  };
}

/**
 * Login and return JWT token.
 */
function login(user) {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email: user.email,
      password: user.password,
    }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'login' } }
  );

  loginLatency.add(res.timings.duration);

  const success = check(res, {
    'login: status 200': (r) => r.status === 200,
    'login: has token': (r) => {
      try {
        return JSON.parse(r.body).token !== undefined;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!success);

  if (res.status !== 200) {
    // Try registering first, then login again
    const regRes = http.post(
      `${BASE_URL}/api/auth/register`,
      JSON.stringify({
        email: user.email,
        password: user.password,
        displayName: user.displayName,
        language: 'en',
      }),
      { headers: { 'Content-Type': 'application/json' }, tags: { name: 'register' } }
    );

    if (regRes.status === 201) {
      const loginRetry = http.post(
        `${BASE_URL}/api/auth/login`,
        JSON.stringify({ email: user.email, password: user.password }),
        { headers: { 'Content-Type': 'application/json' }, tags: { name: 'login_retry' } }
      );

      if (loginRetry.status === 200) {
        try {
          return JSON.parse(loginRetry.body).token;
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  try {
    return JSON.parse(res.body).token;
  } catch {
    return null;
  }
}

/**
 * Create a new game session.
 */
function createSession(token) {
  const characterClasses = ['warrior', 'mage', 'rogue', 'ranger'];
  const randomClass = characterClasses[Math.floor(Math.random() * characterClasses.length)];

  const res = http.post(
    `${BASE_URL}/api/game/session`,
    JSON.stringify({
      characterName: `Hero-VU${__VU}`,
      characterClass: randomClass,
      language: 'en',
    }),
    { headers: getHeaders(token), tags: { name: 'create_session' } }
  );

  sessionCreateLatency.add(res.timings.duration);
  sessionCounter.add(1);

  const success = check(res, {
    'create session: status 201': (r) => r.status === 201,
    'create session: has id': (r) => {
      try {
        return JSON.parse(r.body).id !== undefined;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!success);

  if (res.status !== 201) return null;

  try {
    return JSON.parse(res.body).id;
  } catch {
    return null;
  }
}

/**
 * Submit a game turn (text input).
 */
function submitTurn(token, sessionId, turnNumber) {
  const actions = [
    'I look around the room carefully.',
    'I open the door and peek through.',
    'I ask the innkeeper about the quest.',
    'I draw my sword and prepare for battle.',
    'I search the area for hidden passages.',
    'I approach the mysterious stranger.',
    'I examine the ancient runes on the wall.',
    'I follow the trail deeper into the forest.',
    'I try to negotiate with the guards.',
    'I cast a light spell to illuminate the darkness.',
  ];

  const action = actions[turnNumber % actions.length];

  const res = http.post(
    `${BASE_URL}/api/game/session/${sessionId}/turn`,
    JSON.stringify({ textInput: action }),
    {
      headers: getHeaders(token),
      tags: { name: 'turn' },
      timeout: '30s',  // Turns may take longer due to AI processing
    }
  );

  turnLatency.add(res.timings.duration);
  turnCounter.add(1);

  const success = check(res, {
    'turn: status 200': (r) => r.status === 200,
  });

  errorRate.add(!success);
  return success;
}

/**
 * Roll dice.
 */
function rollDice(token, sessionId) {
  const diceTypes = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
  const randomDice = diceTypes[Math.floor(Math.random() * diceTypes.length)];

  const res = http.post(
    `${BASE_URL}/api/game/session/${sessionId}/dice`,
    JSON.stringify({
      diceType: randomDice,
      actionType: 'attack',
      modifiers: 0,
    }),
    { headers: getHeaders(token), tags: { name: 'dice_roll' } }
  );

  check(res, {
    'dice: status 200': (r) => r.status === 200,
  });
}

/**
 * Save session.
 */
function saveSession(token, sessionId) {
  const res = http.post(
    `${BASE_URL}/api/game/session/${sessionId}/save`,
    null,
    { headers: getHeaders(token), tags: { name: 'save_session' } }
  );

  check(res, {
    'save: status 200': (r) => r.status === 200,
  });
}

// ---- Main Test Function ----

export default function () {
  const user = getTestUser();

  // Step 1: Login
  const token = group('authentication', () => {
    return login(user);
  });

  if (!token) {
    console.warn(`VU ${__VU}: Login failed, skipping iteration`);
    sleep(5);
    return;
  }

  // Step 2: Create session
  const sessionId = group('session_creation', () => {
    return createSession(token);
  });

  if (!sessionId) {
    console.warn(`VU ${__VU}: Session creation failed, skipping iteration`);
    sleep(5);
    return;
  }

  // Step 3: Submit turns
  group('gameplay', () => {
    const currentScenario = __ENV.SCENARIO || 'both';

    if (currentScenario === 'sustained' || currentScenario === 'both') {
      // Sustained: submit turns every 30 seconds for the duration
      for (let turn = 1; turn <= 20; turn++) {
        submitTurn(token, sessionId, turn);

        // Every 5th turn, roll dice
        if (turn % 5 === 0) {
          rollDice(token, sessionId);
        }

        sleep(30); // 1 turn per 30 seconds
      }
    } else {
      // Ramp-up: submit 2-3 turns
      const turnCount = Math.floor(Math.random() * 2) + 2; // 2 or 3
      for (let turn = 1; turn <= turnCount; turn++) {
        submitTurn(token, sessionId, turn);
        sleep(5);
      }
    }
  });

  // Step 4: Save session
  group('session_save', () => {
    saveSession(token, sessionId);
  });

  sleep(1);
}

// ---- Lifecycle Hooks ----

export function handleSummary(data) {
  // Output summary as JSON for CI/CD integration
  const summary = {
    timestamp: new Date().toISOString(),
    scenarios: SCENARIO,
    metrics: {
      http_req_duration_p95: data.metrics.http_req_duration?.values?.['p(95)'] || 'N/A',
      turn_latency_p95: data.metrics.turn_latency?.values?.['p(95)'] || 'N/A',
      session_create_latency_p95: data.metrics.session_create_latency?.values?.['p(95)'] || 'N/A',
      error_rate: data.metrics.error_rate?.values?.rate || 'N/A',
      total_requests: data.metrics.http_reqs?.values?.count || 0,
      turns_submitted: data.metrics.turns_submitted?.values?.count || 0,
      sessions_created: data.metrics.sessions_created?.values?.count || 0,
    },
    thresholds: data.root_group?.checks || {},
  };

  return {
    'stdout': JSON.stringify(summary, null, 2) + '\n',
    'load-test-results.json': JSON.stringify(summary, null, 2),
  };
}
