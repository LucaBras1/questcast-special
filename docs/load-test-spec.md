# Questcast Load Test Specification

## Version 1.0 | Sprint 4

---

## 1. Overview

Load testing validates that Questcast backend can handle the expected beta user load (500 users) without degradation. We test the most critical API paths under sustained and burst conditions.

---

## 2. Tool

**k6** (Grafana k6) -- open-source load testing tool.

- Scripting in JavaScript/TypeScript
- Built-in metrics and thresholds
- CLI-based, integrates with CI/CD
- Supports HTTP, WebSocket, SSE
- Output to JSON, CSV, or Grafana Cloud

**Installation:**
```bash
# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Docker
docker run --rm -i grafana/k6 run -
```

---

## 3. Scenarios

### Scenario 1: Ramp-Up

**Purpose:** Validate the system handles a gradual increase in concurrent users.

| Parameter | Value |
|-----------|-------|
| Start VUs | 0 |
| End VUs | 100 |
| Ramp duration | 5 minutes |
| Hold duration | 2 minutes at 100 VUs |
| Ramp down | 1 minute |
| Total duration | ~8 minutes |

**User behavior per VU:**
1. POST /auth/login (authenticate)
2. POST /game/session (create session)
3. POST /game/session/:id/turn (submit 2-3 turns)
4. POST /game/session/:id/save (save session)

### Scenario 2: Sustained Load

**Purpose:** Validate sustained operation under expected peak load.

| Parameter | Value |
|-----------|-------|
| Constant VUs | 100 |
| Duration | 10 minutes |
| Turn rate | 1 turn per 30 seconds per VU |
| Total turns | ~20,000 |

**User behavior per VU:**
1. Login once
2. Create or resume session
3. Loop: submit turn every 30 seconds
4. Every 5th turn: roll dice
5. Save at end

### Scenario 3: Burst

**Purpose:** Validate the system handles sudden spikes (e.g., viral moment, notification trigger).

| Parameter | Value |
|-----------|-------|
| VUs | 200 |
| Ramp | 0 -> 200 in 5 seconds |
| Duration | 30 seconds |
| Action | Create session |

**User behavior per VU:**
1. POST /auth/login
2. POST /game/session (create session)

---

## 4. Endpoints Under Test

| Endpoint | Method | Scenario | Expected Load |
|----------|--------|----------|---------------|
| `/api/auth/login` | POST | All | 1 per VU at start |
| `/api/game/session` | POST | Ramp-up, Burst | 1 per VU |
| `/api/game/session/:id/turn` | POST | Sustained | 2/min per VU |
| `/api/game/session/:id/dice` | POST | Sustained | 0.4/min per VU |
| `/api/game/session/:id/save` | POST | Ramp-up | 1 per VU at end |

---

## 5. Pass Criteria

| Metric | Target | Failure Threshold |
|--------|--------|-------------------|
| p95 latency (non-AI endpoints) | < 500ms | > 1000ms |
| p95 latency (turn endpoint, excluding AI) | < 500ms overhead | > 1000ms overhead |
| Error rate (HTTP 5xx) | < 1% | > 5% |
| Error rate (total non-200) | < 5% | > 10% |
| Session creation success | > 99% | < 95% |
| No OOM crashes | 0 | > 0 |
| No connection pool exhaustion | 0 | > 0 |

**Note:** AI service calls (OpenAI) are mocked in load tests. We measure infrastructure overhead only.

---

## 6. Monitoring During Tests

### Infrastructure Metrics

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| Redis connections | Upstash dashboard | > 80% of max |
| PostgreSQL connections | Supabase dashboard | > 80% pool size |
| Memory usage | Railway metrics | > 80% |
| CPU usage | Railway metrics | > 80% sustained |
| Network I/O | Railway metrics | Anomalous spikes |

### Application Metrics

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| Request queue depth | Fastify metrics | > 100 pending |
| Average response time | k6 output | > 500ms (non-AI) |
| Error rate | k6 output | > 5% |
| Circuit breaker opens | Application logs | Any opening |

### Database Metrics

| Metric | Source | Check |
|--------|--------|-------|
| Connection pool utilization | Supabase | < 80% |
| Query duration p95 | Supabase logs | < 100ms |
| Deadlocks | Supabase logs | 0 |
| Slow queries | Supabase logs | 0 over 1s |

---

## 7. Test Environment

| Component | Configuration |
|-----------|---------------|
| Backend | Railway staging (2 vCPU, 2GB RAM) |
| Database | Supabase staging (separate from production) |
| Redis | Upstash staging instance |
| AI Services | **MOCKED** -- return canned responses with 200ms delay |
| Network | Same region (EU-West) |

**IMPORTANT:** Load tests MUST run against staging, NEVER against production.

---

## 8. Pre-Test Checklist

- [ ] Staging environment deployed with latest code
- [ ] AI services mocked (no real OpenAI calls)
- [ ] Database seeded with 200 test users
- [ ] Redis cache cleared
- [ ] Monitoring dashboards open
- [ ] k6 script verified with 1 VU dry run
- [ ] Team notified of load test window

---

## 9. Post-Test Analysis

After each load test run:

1. **Export k6 results** to JSON for archival
2. **Screenshot monitoring dashboards** at peak load
3. **Check for errors** in application logs (Sentry)
4. **Analyze slow queries** in Supabase query logs
5. **Document findings** in sprint retrospective
6. **Create GitHub Issues** for any performance bugs found

---

## 10. k6 Script Location

- **Scenario 1 + 2:** `backend/scripts/load-test-k6.js`
- **Run command:**
  ```bash
  # Scenario 1: Ramp-up
  k6 run --env SCENARIO=rampup backend/scripts/load-test-k6.js

  # Scenario 2: Sustained
  k6 run --env SCENARIO=sustained backend/scripts/load-test-k6.js

  # Both scenarios
  k6 run backend/scripts/load-test-k6.js
  ```

---

## 11. Failure Response Plan

If load test fails:

| Failure Type | Action |
|--------------|--------|
| High latency (p95 > 500ms) | Profile endpoints, optimize DB queries, add caching |
| High error rate (> 5%) | Check error logs, identify bottleneck, increase resources |
| OOM crash | Increase memory, check for memory leaks, optimize |
| Connection pool exhaustion | Increase pool size, add connection pooling (PgBouncer) |
| Redis connection limit | Increase Upstash plan, optimize Redis usage |

**Escalation:** If 2+ failure types occur simultaneously, escalate to full team review before proceeding to Sprint 5.
