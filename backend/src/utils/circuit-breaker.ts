/**
 * Circuit Breaker pattern for external service calls.
 *
 * States:
 *   - CLOSED: Normal operation, requests pass through.
 *   - OPEN: Service is failing, requests are rejected immediately.
 *   - HALF_OPEN: Testing if service has recovered, allows one request through.
 *
 * One instance per AI service (STT, LLM, TTS, Image).
 */

import { logger } from './logger.js';

export type CircuitBreakerState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  /** Name for logging (e.g. 'openai-llm', 'openai-tts') */
  name: string;
  /** Number of failures before opening the circuit (default: 3) */
  failureThreshold: number;
  /** Time in ms to wait before transitioning from open to half-open (default: 120000 = 2 min) */
  resetTimeoutMs: number;
  /** Time window in ms for counting failures (default: 300000 = 5 min) */
  failureWindowMs: number;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  name: 'unknown',
  failureThreshold: 3,
  resetTimeoutMs: 120_000,
  failureWindowMs: 300_000,
};

export class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private failures: number[] = []; // timestamps of recent failures
  private openedAt: number = 0;
  private readonly options: CircuitBreakerOptions;

  // Stats
  private totalRequests = 0;
  private totalFailures = 0;
  private totalRejected = 0;

  constructor(options: Partial<CircuitBreakerOptions> & { name: string }) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Execute a function through the circuit breaker.
   * Throws CircuitBreakerOpenError if the circuit is open.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    if (this.state === 'open') {
      // Check if enough time has passed to try half-open
      if (Date.now() - this.openedAt >= this.options.resetTimeoutMs) {
        this.transitionTo('half_open');
      } else {
        this.totalRejected++;
        throw new CircuitBreakerOpenError(this.options.name, this.getRemainingResetMs());
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'half_open') {
      // Service recovered
      logger.info(`Circuit breaker [${this.options.name}] recovered, closing circuit`, {
        totalFailures: this.totalFailures,
      });
      this.transitionTo('closed');
    }
    // In closed state, nothing to do on success
  }

  private onFailure(): void {
    this.totalFailures++;
    const now = Date.now();

    if (this.state === 'half_open') {
      // Failed during recovery test -- re-open
      logger.warn(`Circuit breaker [${this.options.name}] half-open test failed, re-opening`, {
        totalFailures: this.totalFailures,
      });
      this.transitionTo('open');
      return;
    }

    // Closed state: track failures within the window
    this.failures.push(now);

    // Remove failures outside the window
    const windowStart = now - this.options.failureWindowMs;
    this.failures = this.failures.filter((t) => t >= windowStart);

    if (this.failures.length >= this.options.failureThreshold) {
      logger.error(`Circuit breaker [${this.options.name}] opened after ${this.failures.length} failures in window`, {
        failureThreshold: this.options.failureThreshold,
        failureWindowMs: this.options.failureWindowMs,
        resetTimeoutMs: this.options.resetTimeoutMs,
      });
      this.transitionTo('open');
    }
  }

  private transitionTo(newState: CircuitBreakerState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === 'open') {
      this.openedAt = Date.now();
    }

    if (newState === 'closed') {
      this.failures = [];
    }

    logger.info(`Circuit breaker [${this.options.name}] state: ${oldState} -> ${newState}`);
  }

  private getRemainingResetMs(): number {
    return Math.max(0, this.options.resetTimeoutMs - (Date.now() - this.openedAt));
  }

  // ---- Public getters for inspection / testing ----

  getState(): CircuitBreakerState {
    // Check if open should auto-transition to half-open
    if (this.state === 'open' && Date.now() - this.openedAt >= this.options.resetTimeoutMs) {
      return 'half_open';
    }
    return this.state;
  }

  getStats(): { state: CircuitBreakerState; totalRequests: number; totalFailures: number; totalRejected: number; recentFailures: number } {
    return {
      state: this.getState(),
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalRejected: this.totalRejected,
      recentFailures: this.failures.length,
    };
  }

  /**
   * Force reset the circuit breaker (for testing or manual recovery).
   */
  reset(): void {
    this.state = 'closed';
    this.failures = [];
    this.openedAt = 0;
    logger.info(`Circuit breaker [${this.options.name}] manually reset`);
  }
}

/**
 * Error thrown when the circuit breaker is in the open state.
 */
export class CircuitBreakerOpenError extends Error {
  public readonly serviceName: string;
  public readonly retryAfterMs: number;

  constructor(serviceName: string, retryAfterMs: number) {
    super(`Circuit breaker open for service '${serviceName}'. Retry after ${Math.ceil(retryAfterMs / 1000)}s.`);
    this.name = 'CircuitBreakerOpenError';
    this.serviceName = serviceName;
    this.retryAfterMs = retryAfterMs;
  }
}

// ---- Singleton Circuit Breakers (one per AI service) ----

const breakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(serviceName: string): CircuitBreaker {
  let breaker = breakers.get(serviceName);
  if (!breaker) {
    breaker = new CircuitBreaker({
      name: serviceName,
      failureThreshold: 3,
      resetTimeoutMs: 120_000, // 2 minutes
      failureWindowMs: 300_000, // 5 minutes
    });
    breakers.set(serviceName, breaker);
  }
  return breaker;
}

/**
 * Pre-configured circuit breakers for each AI service.
 */
export const circuitBreakers = {
  stt: () => getCircuitBreaker('openai-stt'),
  llm: () => getCircuitBreaker('openai-llm'),
  tts: () => getCircuitBreaker('openai-tts'),
  image: () => getCircuitBreaker('openai-image'),
} as const;

/**
 * Get stats for all active circuit breakers.
 */
export function getAllCircuitBreakerStats(): Record<string, ReturnType<CircuitBreaker['getStats']>> {
  const stats: Record<string, ReturnType<CircuitBreaker['getStats']>> = {};
  for (const [name, breaker] of breakers) {
    stats[name] = breaker.getStats();
  }
  return stats;
}
