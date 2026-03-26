# QUESTCAST - Risk Management Plan
## Version 1.0 | February 2026

---

# 1. Risk Overview

## Risk Categories
1. **Technical Risks** - AI, infrastructure, performance
2. **Business Risks** - Market, competition, funding
3. **Operational Risks** - Team, legal, compliance
4. **Financial Risks** - Costs, revenue, cash flow

## Risk Scoring Matrix

| Impact ↓ / Probability → | Low (1) | Medium (2) | High (3) |
|--------------------------|---------|------------|----------|
| **High (3)** | 3 | 6 | 9 🔴 |
| **Medium (2)** | 2 | 4 | 6 🟡 |
| **Low (1)** | 1 | 2 | 3 🟢 |

**Legend:**
- 🔴 Critical (7-9): Immediate action required
- 🟡 Significant (4-6): Active monitoring & mitigation
- 🟢 Minor (1-3): Monitor only

---

# 2. Technical Risks

## TR-01: AI API Costs Exceed Projections
| Attribute | Value |
|-----------|-------|
| **Probability** | Medium (2) |
| **Impact** | High (3) |
| **Risk Score** | 6 🟡 |
| **Owner** | CTO |

**Description:**
OpenAI or other AI providers increase prices, or usage patterns result in higher-than-expected costs.

**Triggers:**
- Cost per session >$0.50
- Monthly AI costs >40% of revenue
- Provider announces price increase

**Mitigation Strategies:**
1. Implement aggressive TTS/image caching (35% savings)
2. Optimize prompts for token efficiency
3. Monitor usage in real-time with alerts
4. Negotiate volume discounts at scale

**Contingency Plan:**
1. Switch to alternative providers (Anthropic, open-source)
2. Reduce free tier limits
3. Increase subscription prices
4. Implement quality tiers (faster/cheaper vs slower/better)

---

## TR-02: AI Quality Degradation
| Attribute | Value |
|-----------|-------|
| **Probability** | Low (1) |
| **Impact** | High (3) |
| **Risk Score** | 3 🟢 |
| **Owner** | AI Engineer |

**Description:**
AI model updates result in worse storytelling quality or inconsistent behavior.

**Mitigation Strategies:**
1. Pin specific model versions when possible
2. Comprehensive prompt testing suite
3. A/B test new model versions
4. User feedback monitoring

**Contingency Plan:**
1. Roll back to previous model version
2. Switch to alternative provider
3. Implement fallback prompts

---

## TR-03: Latency Issues
| Attribute | Value |
|-----------|-------|
| **Probability** | Medium (2) |
| **Impact** | Medium (2) |
| **Risk Score** | 4 🟡 |
| **Owner** | Backend Lead |

**Description:**
Voice response time exceeds 2 seconds, degrading user experience.

**Mitigation Strategies:**
1. Streaming responses (TTS starts before LLM finishes)
2. CDN for cached content
3. Regional server deployment
4. Response preloading for common scenarios

**Contingency Plan:**
1. Graceful degradation (show loading animation)
2. Text fallback mode
3. Reduce response length temporarily

---

## TR-04: App Store Rejection
| Attribute | Value |
|-----------|-------|
| **Probability** | Low (1) |
| **Impact** | High (3) |
| **Risk Score** | 3 🟢 |
| **Owner** | Product Lead |

**Description:**
Apple or Google rejects app due to policy violations.

**Mitigation Strategies:**
1. Review guidelines before each submission
2. Clear subscription terms display
3. No misleading marketing claims
4. Proper content moderation

**Contingency Plan:**
1. Rapid fix and resubmission
2. Appeal process
3. Web app fallback (PWA)

---

## TR-05: Data Breach / Security Incident
| Attribute | Value |
|-----------|-------|
| **Probability** | Low (1) |
| **Impact** | High (3) |
| **Risk Score** | 3 🟢 |
| **Owner** | CTO |

**Description:**
User data or voice recordings are compromised.

**Mitigation Strategies:**
1. Encryption at rest and in transit
2. Minimal data collection (privacy-first)
3. Regular security audits
4. No storage of raw voice data
5. GDPR/CCPA compliance from day 1

**Contingency Plan:**
1. Incident response plan
2. User notification within 72 hours
3. Legal counsel on standby
4. PR crisis management

---

# 3. Business Risks

## BR-01: Low Conversion Rate
| Attribute | Value |
|-----------|-------|
| **Probability** | Medium (2) |
| **Impact** | High (3) |
| **Risk Score** | 6 🟡 |
| **Owner** | Product Lead |

**Description:**
Free-to-paid conversion rate stays below 5%.

**Triggers:**
- Conversion <5% after Month 3
- High churn among trial users
- Negative reviews about pricing

**Mitigation Strategies:**
1. Optimize cliffhanger timing via A/B testing
2. Improve first session WOW factor
3. Test different pricing points
4. Add more value to paid tiers

**Contingency Plan:**
1. Lower subscription prices
2. Add ad-supported tier
3. Focus on IAP over subscriptions
4. Pivot to B2B earlier

---

## BR-02: Strong Competitor Enters Market
| Attribute | Value |
|-----------|-------|
| **Probability** | Medium (2) |
| **Impact** | Medium (2) |
| **Risk Score** | 4 🟡 |
| **Owner** | CEO |

**Description:**
Large player (Wizards of the Coast, gaming studio) launches similar product.

**Mitigation Strategies:**
1. First-mover advantage in Czech market
2. Build community moat
3. Focus on UGC and creator economy
4. Privacy-first differentiation

**Contingency Plan:**
1. Accelerate feature development
2. Consider acquisition/partnership
3. Niche down (education, Czech market)
4. Emphasize unique selling points

---

## BR-03: Insufficient Funding
| Attribute | Value |
|-----------|-------|
| **Probability** | Medium (2) |
| **Impact** | High (3) |
| **Risk Score** | 6 🟡 |
| **Owner** | CEO |

**Description:**
Unable to raise seed round or runway runs out.

**Mitigation Strategies:**
1. Bootstrap initial development
2. Multiple investor pipeline
3. Government grants (EU, Czech)
4. Revenue-first mindset

**Contingency Plan:**
1. Reduce team size
2. Cut marketing spend
3. Focus on profitability over growth
4. Consider acqui-hire

---

## BR-04: Market Timing Wrong
| Attribute | Value |
|-----------|-------|
| **Probability** | Low (1) |
| **Impact** | Medium (2) |
| **Risk Score** | 2 🟢 |
| **Owner** | CEO |

**Description:**
Voice gaming doesn't gain mainstream adoption.

**Mitigation Strategies:**
1. Text fallback always available
2. Monitor market trends closely
3. Pivot capability in architecture

**Contingency Plan:**
1. Pivot to text-first with voice as feature
2. Focus on education market (less trend-dependent)
3. White-label technology to other apps

---

# 4. Operational Risks

## OR-01: Key Person Dependency
| Attribute | Value |
|-----------|-------|
| **Probability** | Medium (2) |
| **Impact** | Medium (2) |
| **Risk Score** | 4 🟡 |
| **Owner** | CEO |

**Description:**
Critical team member leaves or is unavailable.

**Mitigation Strategies:**
1. Document all processes
2. Cross-training on key systems
3. Competitive compensation
4. Equity incentives with vesting

**Contingency Plan:**
1. Emergency contractor network
2. Recruiting pipeline maintained
3. Knowledge transfer protocols

---

## OR-02: Legal/Compliance Issues
| Attribute | Value |
|-----------|-------|
| **Probability** | Low (1) |
| **Impact** | High (3) |
| **Risk Score** | 3 🟢 |
| **Owner** | CEO |

**Description:**
GDPR violations, IP issues, or other legal problems.

**Mitigation Strategies:**
1. Legal counsel from start
2. Privacy-first architecture
3. Clear terms of service
4. Content moderation

**Contingency Plan:**
1. Legal insurance
2. Rapid compliance fixes
3. Geographic restrictions if needed

---

## OR-03: AI Content Moderation Failure
| Attribute | Value |
|-----------|-------|
| **Probability** | Medium (2) |
| **Impact** | Medium (2) |
| **Risk Score** | 4 🟡 |
| **Owner** | Product Lead |

**Description:**
AI generates inappropriate content (violence, adult themes, harmful content).

**Mitigation Strategies:**
1. Content filtering in prompts
2. Output moderation layer
3. User reporting system
4. Age-appropriate defaults

**Contingency Plan:**
1. Manual review queue
2. Temporary feature restrictions
3. Model fine-tuning

---

# 5. Financial Risks

## FR-01: Negative Unit Economics
| Attribute | Value |
|-----------|-------|
| **Probability** | Medium (2) |
| **Impact** | High (3) |
| **Risk Score** | 6 🟡 |
| **Owner** | CFO/CEO |

**Description:**
Cost to serve user exceeds revenue generated.

**Triggers:**
- LTV:CAC ratio <2:1
- Gross margin <30%
- Free user cost >$5/month

**Mitigation Strategies:**
1. Real-time cost monitoring
2. Usage caps enforcement
3. Pricing optimization
4. Caching and efficiency improvements

**Contingency Plan:**
1. Reduce free tier benefits
2. Increase prices
3. Cut non-essential features
4. Focus on highest-value users only

---

## FR-02: Payment Processing Issues
| Attribute | Value |
|-----------|-------|
| **Probability** | Low (1) |
| **Impact** | Medium (2) |
| **Risk Score** | 2 🟢 |
| **Owner** | Backend Lead |

**Description:**
Stripe/RevenueCat issues, high chargeback rates, or payment fraud.

**Mitigation Strategies:**
1. PCI compliance
2. Fraud detection
3. Multiple payment backup
4. Clear refund policy

**Contingency Plan:**
1. Alternative payment processor
2. Manual payment handling
3. Legal action for fraud

---

# 6. Risk Monitoring Dashboard

## Weekly Review Checklist
- [ ] AI costs vs budget
- [ ] Conversion funnel metrics
- [ ] User complaints/support tickets
- [ ] App store ratings trend
- [ ] Competitor activity
- [ ] Team health/morale
- [ ] Cash runway calculation

## Monthly Risk Review
- [ ] All risks re-scored
- [ ] New risks identified
- [ ] Mitigation effectiveness reviewed
- [ ] Contingency plans updated
- [ ] Stakeholder communication

## Escalation Procedures

| Risk Level | Response Time | Escalation To |
|------------|---------------|---------------|
| 🔴 Critical | Immediate | CEO + Board |
| 🟡 Significant | 24 hours | CEO |
| 🟢 Minor | Weekly review | Risk Owner |

---

# 7. Risk Response Summary

| Risk ID | Risk | Score | Primary Mitigation |
|---------|------|-------|-------------------|
| TR-01 | AI Costs | 6 🟡 | Caching, monitoring |
| TR-02 | AI Quality | 3 🟢 | Testing, versioning |
| TR-03 | Latency | 4 🟡 | Streaming, CDN |
| TR-04 | App Rejection | 3 🟢 | Compliance review |
| TR-05 | Security | 3 🟢 | Encryption, audits |
| BR-01 | Low Conversion | 6 🟡 | A/B testing, pricing |
| BR-02 | Competition | 4 🟡 | Differentiation |
| BR-03 | Funding | 6 🟡 | Multiple sources |
| BR-04 | Market Timing | 2 🟢 | Pivot capability |
| OR-01 | Key Person | 4 🟡 | Documentation |
| OR-02 | Legal | 3 🟢 | Counsel, compliance |
| OR-03 | Content Mod | 4 🟡 | Filters, reporting |
| FR-01 | Unit Economics | 6 🟡 | Cost monitoring |
| FR-02 | Payments | 2 🟢 | Backup processors |

---

# 8. Disaster Recovery

## Business Continuity Plan

### Scenario 1: AI Provider Outage
**RTO:** 4 hours
**Plan:**
1. Switch to backup provider (pre-configured)
2. Enable offline mode with cached content
3. Communicate to users via push notification
4. Monitor provider status

### Scenario 2: Data Loss
**RTO:** 24 hours
**RPO:** 1 hour
**Plan:**
1. Restore from automated backups
2. Verify data integrity
3. Communicate impact to affected users
4. Post-mortem and prevention

### Scenario 3: Complete Service Outage
**RTO:** 8 hours
**Plan:**
1. Activate backup infrastructure
2. Status page communication
3. Social media updates
4. Customer support surge

---

*Review this document monthly and after any significant incident.*
*Last updated: February 2026*
