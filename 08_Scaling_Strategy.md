# QUESTCAST - Scaling Strategy
## Version 1.0 | February 2026

---

# 1. Scaling Philosophy

## Core Principles
1. **Scale Horizontally** - Add more instances, not bigger servers
2. **Cache Aggressively** - Reduce AI API calls wherever possible
3. **Degrade Gracefully** - Never let the whole system fail
4. **Monitor Everything** - Data-driven scaling decisions
5. **Cost-Aware Growth** - Revenue must outpace infrastructure costs

---

# 2. Infrastructure Scaling Tiers

## Tier 1: MVP (0-1K DAU)
**Monthly Cost: ~$500-1,000**

```
┌─────────────────────────────────────────┐
│           TIER 1 ARCHITECTURE           │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────┐    ┌─────────────┐    │
│  │   Vercel    │    │  Supabase   │    │
│  │   (API)     │────│  (DB+Auth)  │    │
│  └─────────────┘    └─────────────┘    │
│         │                              │
│         ▼                              │
│  ┌─────────────┐    ┌─────────────┐    │
│  │  OpenAI     │    │ Cloudflare  │    │
│  │   APIs      │    │   R2/CDN    │    │
│  └─────────────┘    └─────────────┘    │
│                                         │
└─────────────────────────────────────────┘
```

**Components:**
| Service | Purpose | Cost |
|---------|---------|------|
| Vercel Pro | API hosting | $20/mo |
| Supabase Pro | Database + Auth | $25/mo |
| Cloudflare | CDN + R2 storage | $20/mo |
| Redis (Upstash) | Caching | $10/mo |
| Monitoring (Sentry) | Error tracking | $26/mo |

**Scaling Triggers to Tier 2:**
- API response time >500ms
- Database CPU >60%
- Monthly costs >$1,000
- DAU >1,000

---

## Tier 2: Growth (1K-10K DAU)
**Monthly Cost: ~$2,000-5,000**

```
┌─────────────────────────────────────────────────┐
│              TIER 2 ARCHITECTURE                │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │           Load Balancer (Cloudflare)    │   │
│  └─────────────────────────────────────────┘   │
│              │                                  │
│    ┌─────────┼─────────┐                       │
│    ▼         ▼         ▼                       │
│  ┌─────┐  ┌─────┐  ┌─────┐                    │
│  │API 1│  │API 2│  │API 3│   (Auto-scaling)   │
│  └─────┘  └─────┘  └─────┘                    │
│              │                                  │
│    ┌─────────┴─────────┐                       │
│    ▼                   ▼                       │
│  ┌─────────┐    ┌───────────┐                 │
│  │ Redis   │    │ PostgreSQL│                 │
│  │ Cluster │    │  (RDS)    │                 │
│  └─────────┘    └───────────┘                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Components:**
| Service | Purpose | Cost |
|---------|---------|------|
| AWS ECS/Fargate | Auto-scaling API | $500-1,000/mo |
| AWS RDS | Managed PostgreSQL | $200-400/mo |
| Redis (ElastiCache) | Session + cache | $150-300/mo |
| CloudFront | CDN | $100-200/mo |
| S3 | Asset storage | $50-100/mo |

**Key Optimizations:**
- Connection pooling (PgBouncer)
- Read replicas for analytics
- Aggressive Redis caching
- CDN for all static assets

**Scaling Triggers to Tier 3:**
- API instances >5 constantly
- Database connections >80%
- Monthly costs >$5,000
- DAU >10,000

---

## Tier 3: Scale (10K-100K DAU)
**Monthly Cost: ~$10,000-30,000**

```
┌─────────────────────────────────────────────────────────────┐
│                    TIER 3 ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │               Global Load Balancer                     │ │
│  └───────────────────────────────────────────────────────┘ │
│              │                    │                         │
│    ┌─────────┘                    └─────────┐              │
│    ▼                                        ▼              │
│  ┌──────────────┐                  ┌──────────────┐       │
│  │  EU Region   │                  │  US Region   │       │
│  │  (Primary)   │                  │  (Secondary) │       │
│  └──────────────┘                  └──────────────┘       │
│         │                                   │              │
│    ┌────┴────┐                        ┌────┴────┐         │
│    ▼         ▼                        ▼         ▼         │
│ ┌─────┐  ┌─────┐                   ┌─────┐  ┌─────┐      │
│ │API  │  │API  │                   │API  │  │API  │      │
│ │Pool │  │Pool │                   │Pool │  │Pool │      │
│ └─────┘  └─────┘                   └─────┘  └─────┘      │
│         │                                   │              │
│    ┌────┴────┐                        ┌────┴────┐         │
│    ▼         ▼                        ▼         ▼         │
│ ┌─────┐  ┌─────┐                   ┌─────┐  ┌─────┐      │
│ │Redis│  │ DB  │◄─── Replication ──►│Redis│  │ DB  │      │
│ └─────┘  └─────┘                   └─────┘  └─────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Components:**
| Service | Purpose | Cost |
|---------|---------|------|
| Multi-region ECS | Global API | $3,000-6,000/mo |
| Aurora PostgreSQL | Multi-AZ DB | $2,000-4,000/mo |
| ElastiCache Cluster | Distributed cache | $1,000-2,000/mo |
| Global Accelerator | Low latency | $500-1,000/mo |
| CloudFront Premium | Edge caching | $500-1,000/mo |

**Key Optimizations:**
- Multi-region deployment
- Database sharding (by user_id)
- Message queues for async processing
- Dedicated AI API rate limits

---

# 3. AI Cost Scaling

## Cost Reduction Strategies

### Strategy 1: Aggressive Caching (35% savings)

```
┌─────────────────────────────────────────┐
│           CACHING LAYERS                │
├─────────────────────────────────────────┤
│                                         │
│  Layer 1: TTS Cache (CDN)               │
│  ├── Pre-generated common phrases       │
│  ├── ~500MB per language                │
│  └── Hit rate target: 40%               │
│                                         │
│  Layer 2: Image Cache (S3)              │
│  ├── Generic location templates         │
│  ├── Character base portraits           │
│  └── Hit rate target: 30%               │
│                                         │
│  Layer 3: LLM Response Cache (Redis)    │
│  ├── Identical prompt = cached response │
│  ├── TTL: 5 minutes                     │
│  └── Hit rate target: 10%               │
│                                         │
└─────────────────────────────────────────┘
```

### Strategy 2: Smart Batching

```python
# Instead of individual requests
for user in users:
    response = await openai.complete(user.prompt)

# Batch where possible
batch_prompts = [user.prompt for user in users]
responses = await openai.complete_batch(batch_prompts)
```

### Strategy 3: Model Tiering

| Use Case | Model | Cost/1K tokens |
|----------|-------|----------------|
| Story narration | GPT-4o-mini | $0.00015 |
| Quick responses | GPT-4o-mini | $0.00015 |
| Complex decisions | GPT-4o | $0.005 |
| Emergency fallback | GPT-3.5-turbo | $0.0005 |

### Strategy 4: Token Optimization

```
Before optimization: 150 tokens average response
After optimization: 80 tokens average response
Savings: 47%
```

## AI Cost Projections

| DAU | Sessions/Day | Monthly AI Cost | % of Revenue |
|-----|--------------|-----------------|--------------|
| 1K | 2K | $1,200 | 30% |
| 10K | 20K | $10,000 | 25% |
| 50K | 100K | $40,000 | 20% |
| 100K | 200K | $70,000 | 18% |

*Note: Cost per session decreases with scale due to caching efficiency*

---

# 4. Database Scaling

## PostgreSQL Scaling Path

### Stage 1: Vertical Scaling (0-10K users)
- Start with db.t3.medium
- Scale to db.r5.large as needed
- Add read replica for analytics

### Stage 2: Read Scaling (10K-100K users)
```
┌─────────────┐
│   Primary   │
│   (Write)   │
└──────┬──────┘
       │
   ┌───┴───┐
   ▼       ▼
┌─────┐ ┌─────┐
│Read │ │Read │
│Rep 1│ │Rep 2│
└─────┘ └─────┘
```

### Stage 3: Sharding (100K+ users)
```
Shard Key: user_id % num_shards

Shard 0: users 0-999999
Shard 1: users 1000000-1999999
Shard 2: users 2000000-2999999
```

## Data Partitioning Strategy

| Table | Partition By | Retention |
|-------|--------------|-----------|
| game_sessions | created_at (monthly) | 2 years |
| game_events | created_at (daily) | 90 days |
| user_analytics | created_at (daily) | 1 year |
| ai_responses_cache | expires_at | 7 days |

---

# 5. Real-Time Infrastructure

## WebSocket Scaling

### Single Server (0-1K concurrent)
```javascript
const io = require('socket.io')(server);
// Simple in-memory rooms
```

### Redis Adapter (1K-50K concurrent)
```javascript
const { createAdapter } = require('@socket.io/redis-adapter');
const io = require('socket.io')(server);
io.adapter(createAdapter(pubClient, subClient));
```

### Dedicated Real-Time Service (50K+ concurrent)
- Ably or Pusher managed service
- Or self-hosted with Redis Cluster
- Geographic distribution

## Latency Targets

| Action | Target | Max Acceptable |
|--------|--------|----------------|
| Voice input → text | 500ms | 1s |
| LLM response start | 500ms | 1.5s |
| TTS audio start | 300ms | 800ms |
| Image display | 3s | 8s |
| Total voice loop | 2s | 4s |

---

# 6. Content Delivery

## CDN Strategy

### Static Assets
```
Origin (S3) → CloudFront → Edge Locations
├── App assets (JS, CSS, images)
├── Pre-generated TTS audio
├── Image templates
└── Game assets (sounds, music)
```

### Dynamic Content
```
API → CloudFront → Edge Cache (short TTL)
├── User profiles (TTL: 60s)
├── Leaderboards (TTL: 30s)
└── Feature flags (TTL: 300s)
```

### Cache Invalidation
- Instant purge for critical updates
- Soft purge for non-critical
- Versioned URLs for immutable assets

---

# 7. Monitoring & Alerting

## Key Metrics Dashboard

### Infrastructure Metrics
| Metric | Warning | Critical |
|--------|---------|----------|
| API Response Time (p95) | >500ms | >1000ms |
| API Error Rate | >1% | >5% |
| Database CPU | >60% | >80% |
| Redis Memory | >70% | >90% |
| Disk Usage | >70% | >85% |

### Business Metrics
| Metric | Warning | Critical |
|--------|---------|----------|
| Session Completion Rate | <70% | <50% |
| Payment Failure Rate | >5% | >10% |
| AI API Error Rate | >2% | >5% |
| New User Activation | <60% | <40% |

### Alerting Rules
```yaml
alerts:
  - name: high_api_latency
    condition: api_p95_latency > 1000ms for 5m
    severity: critical
    notify: [slack, pagerduty]
    
  - name: ai_cost_spike
    condition: ai_daily_cost > 150% of average
    severity: warning
    notify: [slack]
    
  - name: low_conversion
    condition: daily_conversion < 3%
    severity: warning
    notify: [email]
```

---

# 8. Disaster Recovery

## Backup Strategy

| Data Type | Backup Frequency | Retention | RTO | RPO |
|-----------|------------------|-----------|-----|-----|
| Database | Continuous + Daily | 30 days | 1h | 5min |
| User uploads | Daily | 90 days | 4h | 24h |
| Configurations | On change | Forever | 30min | 0 |
| Logs | Streaming | 7 days | N/A | N/A |

## Failover Procedures

### Database Failover
1. Automatic failover to standby (RDS Multi-AZ)
2. Read replicas promoted if primary region fails
3. Manual intervention for cross-region failover

### API Failover
1. Health checks detect failure
2. Load balancer routes to healthy instances
3. Auto-scaling launches replacements
4. Alert team for investigation

### Complete Region Failure
1. DNS failover to secondary region (Route 53)
2. Database replica promoted to primary
3. Cache warming in new region
4. Gradual traffic shift

---

# 9. Cost Optimization

## Monthly Cost Targets

| DAU | Infra Cost | AI Cost | Total | Cost/User |
|-----|------------|---------|-------|-----------|
| 1K | $500 | $1,200 | $1,700 | $1.70 |
| 10K | $2,000 | $10,000 | $12,000 | $1.20 |
| 50K | $8,000 | $40,000 | $48,000 | $0.96 |
| 100K | $15,000 | $70,000 | $85,000 | $0.85 |

## Cost Reduction Checklist

- [ ] Reserved instances for predictable workloads (30-40% savings)
- [ ] Spot instances for batch processing (60-90% savings)
- [ ] Right-sizing instances quarterly
- [ ] Storage lifecycle policies (move to cheaper tiers)
- [ ] Unused resource cleanup (weekly audit)
- [ ] AI caching optimization (ongoing)
- [ ] CDN cache hit ratio >90%

---

# 10. Scaling Checklist by Stage

## Pre-Launch
- [ ] Load testing completed (2x expected traffic)
- [ ] Database indexes optimized
- [ ] CDN configured
- [ ] Monitoring dashboards ready
- [ ] Alerting rules configured
- [ ] Runbooks documented

## 1K DAU
- [ ] Auto-scaling configured
- [ ] Read replica added
- [ ] TTS caching implemented
- [ ] Cost monitoring active

## 10K DAU
- [ ] Multi-AZ deployment
- [ ] Redis cluster
- [ ] Database connection pooling
- [ ] Image caching layer

## 50K DAU
- [ ] Multi-region evaluation
- [ ] Database sharding plan
- [ ] Dedicated AI rate limits
- [ ] 24/7 on-call rotation

## 100K DAU
- [ ] Multi-region active
- [ ] Sharded database
- [ ] Custom CDN rules
- [ ] Dedicated infrastructure team

---

*This scaling strategy should be reviewed quarterly and updated based on actual growth patterns.*
