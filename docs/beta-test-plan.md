# Questcast Beta Test Plan

## Version 1.0 | Sprint 4 -- Final

---

## 1. Overview

Closed beta for Questcast MVP. Primary goal: validate product-market fit, voice loop reliability, and Czech language quality with real users before public Google Play submission.

---

## 2. Recruitment

### Target: 500 users

| Channel | Target Users | Method |
|---------|-------------|--------|
| Czech gaming communities (hrej.cz, bonusweb.cz) | 150 | Forum posts + Discord invites |
| Reddit r/rpg, r/DnD, r/tabletopgamedesign | 100 | Posts with signup link |
| D&D Discord servers (Czech + international) | 100 | Discord bot + announcement |
| Twitter/X gaming influencers (Czech) | 50 | DM outreach |
| Personal networks + word of mouth | 50 | Direct invites |
| Czech RPG Facebook groups | 50 | Group posts |

### Recruitment Timeline

| Day | Action |
|-----|--------|
| D-14 | Create landing page with signup form |
| D-10 | Post recruitment messages on all channels |
| D-7 | Close signups at 600 (buffer for no-shows) |
| D-5 | Send onboarding email with install instructions |
| D-3 | Send reminder email |
| D-1 | Final reminder, test internal testing track access |
| D-0 | Beta launch |

### Participant Requirements

- Android 13+ device
- Microphone access (for voice input)
- Willing to provide feedback
- Available for at least 3 sessions over 2 weeks
- Mix: 60% Czech speakers, 40% English speakers

---

## 3. Access

| Parameter | Value |
|-----------|-------|
| Platform | Google Play Internal Testing Track |
| Access | Closed beta via email whitelist |
| APK distribution | Google Play (signed release build) |
| Onboarding | In-app tutorial (5-min guided adventure) |
| Support channel | Discord #beta-feedback channel |

### Google Play Setup

1. Create closed testing track in Google Play Console
2. Add beta tester emails to testers list
3. Generate opt-in URL
4. Send opt-in URL in onboarding email
5. Testers install via Google Play

---

## 4. Duration

**Total: 2 weeks (14 days)**

| Phase | Days | Activity |
|-------|------|----------|
| Soft launch | 1-3 | First 100 users, intensive monitoring |
| Expansion | 4-7 | Remaining 400 users invited |
| Monitoring | 8-12 | Full user base, daily metrics review |
| Wrap-up | 13-14 | Final metrics, user interviews, go/no-go decision |

---

## 5. Feedback Collection

### 5.1 In-App Survey (After First Session)

Triggered automatically when a user completes their first game session (at least 5 turns). Maximum 3 questions, dismissable.

**Questions:**
1. **"Rate your adventure experience"** -- 1 to 5 stars (required)
2. **"Would you play again?"** -- Yes / No (required)
3. **"What would you improve?"** -- Free text, 500 char limit (optional)

**Implementation:**
- Modal overlay after first session completion
- Results sent to PostHog as custom event `beta_survey_response`
- Survey shows only once per user

### 5.2 Per-Turn Feedback (Non-Intrusive)

After each AI narration response, show a small thumbs-up/thumbs-down icon pair.

**Behavior:**
- Appears subtly in bottom-right of narration bubble
- Tap to rate, then icons fade out
- Completely optional, no prompt or popup
- Tracks: sessionId, turnNumber, rating (up/down), language
- Sent to PostHog as `turn_feedback` event

### 5.3 External Detailed Survey (Google Form)

Linked from Settings screen ("Give Detailed Feedback").

**Questions:**
1. Overall experience rating (1-10)
2. Voice quality rating (1-10)
3. Story quality rating (1-10)
4. Czech language quality (1-10, if applicable)
5. What was your favorite moment?
6. What frustrated you the most?
7. How does this compare to other D&D/RPG apps?
8. Would you pay for this app? How much per month?
9. What features would make you keep playing?
10. Any bugs or technical issues? (with screenshot upload option)
11. Device model and Android version
12. How did you hear about Questcast?

### 5.4 Direct User Interviews

**Target:** 10 users who played 3+ sessions.

| Parameter | Value |
|-----------|-------|
| Format | Video call (Google Meet) |
| Duration | 15 minutes |
| Compensation | 3 months free premium (when available) |
| Scheduling | Calendly link sent to qualified users |

**Interview Script:**
1. Tell me about your first session. What stood out?
2. How did the voice interaction feel? Natural or awkward?
3. Did you feel like you were playing D&D?
4. What made you come back for more sessions? (or why didn't you?)
5. If you could change ONE thing, what would it be?
6. Would you recommend this to a friend? Why or why not?

---

## 6. Success Metrics

### Primary Metrics

| Metric | Target | Failure | Data Source | Measurement |
|--------|--------|---------|-------------|-------------|
| First session completion | > 70% | < 50% | PostHog | Users who complete >= 5 turns in first session / total users who started |
| Crash rate | < 5% | > 10% | Sentry | Unique crash users / total DAU |
| Voice latency p50 | < 2.5s | > 4.0s | PostHog telemetry | Client-side measurement: mic_release to first_audio_play |
| D1 retention | > 40% | < 25% | PostHog | Users returning within 24h of first session |
| Czech quality rating | > 3.5/5 | < 2.5/5 | In-app survey | Average star rating from Czech-speaking users |

### Secondary Metrics

| Metric | Target | Data Source |
|--------|--------|-------------|
| D7 retention | > 20% | PostHog |
| Average session length | > 10 min | PostHog |
| Sessions per user (14 days) | > 3 | PostHog |
| Voice vs text usage ratio | > 60% voice | PostHog |
| Tutorial completion rate | > 80% | PostHog |
| In-app survey response rate | > 30% | PostHog |
| Per-turn feedback rate | > 10% of turns | PostHog |
| NPS (from detailed survey) | > 30 | Google Forms |
| "Would play again" rate | > 75% | In-app survey |
| Error rate (HTTP 5xx) | < 1% | Sentry |

---

## 7. On-Call Rotation

### Team

| Role | Person | Contact |
|------|--------|---------|
| On-call Developer 1 | TBD | PagerDuty |
| On-call Developer 2 | TBD | PagerDuty |
| QA Lead | TBD | Discord |

### Schedule

| Period | Coverage | Response Time |
|--------|----------|---------------|
| Days 1-3 (soft launch) | 24/7 | 15 min acknowledge, 1h fix |
| Days 4-7 (expansion) | 24/7 | 30 min acknowledge, 2h fix |
| Days 8-14 (monitoring) | Business hours (8:00-20:00 CET) | 1h acknowledge, 4h fix |

### PagerDuty Setup

1. Create Questcast service in PagerDuty
2. Create 2-person rotation schedule
3. Integrate with Sentry (auto-alert on P0 errors)
4. Integrate with Railway (alert on high error rate / OOM)
5. Escalation policy: if primary doesn't acknowledge in 15 min, page secondary

### Alert Triggers

| Trigger | Severity | Action |
|---------|----------|--------|
| Crash rate > 5% (rolling 1h) | P0 | Page on-call immediately |
| Error rate > 10% (rolling 15m) | P0 | Page on-call immediately |
| Voice loop completely broken | P0 | Page on-call immediately |
| Latency p95 > 5s (rolling 30m) | P1 | Slack notification |
| Database connection errors | P1 | Slack notification + page if > 5 min |
| OOM restart | P0 | Page on-call immediately |
| Content safety bypass detected | P0 | Page on-call immediately |

---

## 8. Hotfix Process

### For Critical Bugs (P0)

**Target: fixed + deployed within 4 hours during on-call**

| Step | Time Budget | Action |
|------|-------------|--------|
| 1. Triage | 15 min | Confirm bug, assess severity, determine root cause |
| 2. Fix | 1-2 hours | Implement fix on `hotfix/*` branch |
| 3. Test | 30 min | Unit test + manual verification on staging |
| 4. Deploy | 15 min | Merge to main, auto-deploy to production |
| 5. Verify | 15 min | Confirm fix in production, monitor for regressions |
| 6. Communicate | 10 min | Post update in Discord #beta-feedback |

### For High Bugs (P1)

**Target: fixed within 24 hours**

Same process, but with more thorough testing. Can wait until business hours if discovered overnight.

### For Medium/Low Bugs (P2/P3)

Tracked in GitHub Issues, fixed in next sprint.

---

## 9. Decision Criteria

### Go / No-Go Decision (Day 14)

**GO for public launch if ALL of these are true:**
- [ ] First session completion > 70%
- [ ] Crash rate < 5%
- [ ] Voice latency p50 < 2.5s
- [ ] D1 retention > 40%
- [ ] Czech quality rating > 3.5/5
- [ ] Zero unresolved P0 bugs
- [ ] < 5 open P1 bugs
- [ ] No content safety bypasses found

**DELAY for Sprint 5+ fixes if:**
- More than 3 failure thresholds hit
- Any P0 bug unresolved
- Content safety bypass discovered
- Crash rate > 10%

**PIVOT decision needed if:**
- Czech quality < 2.5/5 (consider English-first launch)
- First session completion < 50% (fundamental UX issue)
- D1 retention < 25% (product-market fit concern)

### Decision Meeting

| Item | Detail |
|------|--------|
| When | Day 14, 10:00 CET |
| Who | Full team |
| Agenda | Review all metrics, discuss findings, vote go/no-go |
| Output | Written decision with action items |

---

## 10. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Not enough beta signups | Buffer recruitment to 600; promote in additional channels |
| High crash rate on specific devices | Remote debugging via Sentry; prioritize top 3 crash devices |
| Voice loop unreliable | Text fallback always available; track voice vs text usage |
| Czech quality poor | English fallback always available; track language preference |
| OpenAI API outage | Circuit breakers + canned fallback responses; monitor status page |
| Negative user feedback flood | Prepared response templates; daily feedback review; quick-fix pipeline |
| Google Play review rejection | Submit early for review; follow all guidelines; prepare appeal |

---

## 11. Post-Beta Analysis

### Deliverables (Due Day 16)

1. **Metrics Report**: All primary + secondary metrics with charts
2. **User Feedback Summary**: Top 10 praise points, top 10 complaints
3. **Bug Report**: All bugs found, categorized by severity
4. **Interview Insights**: Summary of 10 user interviews
5. **Go/No-Go Recommendation**: Written document with evidence
6. **Sprint 5 Backlog**: Prioritized list of fixes and improvements based on beta

### Key Questions to Answer

1. Do users come back after their first session?
2. Is voice input the preferred interaction method?
3. Is the Czech AI quality good enough for Czech-first launch?
4. What is the #1 feature request?
5. What is the #1 frustration?
6. Would users pay for this? How much?
