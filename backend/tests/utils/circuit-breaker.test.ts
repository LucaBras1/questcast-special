/**
 * Circuit Breaker -- Test Suite
 *
 * Tests for the Circuit Breaker pattern implementation:
 * - Closed state: requests pass through normally
 * - Failure counting: tracks consecutive failures
 * - Threshold reached: circuit opens, rejects immediately
 * - Open state: requests rejected with CircuitBreakerOpenError
 * - Reset timeout: after timeout, moves to half-open
 * - Half-open: first request passes through as test
 * - Half-open success: circuit closes (recovery)
 * - Half-open failure: circuit opens again
 * - Independent circuits per service (STT, LLM, TTS, Image)
 */

import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  getCircuitBreaker,
  circuitBreakers,
} from '../../src/utils/circuit-breaker';

// ---- Helpers ----

function createBreaker(overrides: Partial<ConstructorParameters<typeof CircuitBreaker>[0]> = {}) {
  return new CircuitBreaker({
    name: 'test-service',
    failureThreshold: 3,
    resetTimeoutMs: 1000, // 1 second for fast tests
    failureWindowMs: 5000,
    ...overrides,
  });
}

const successFn = () => Promise.resolve('ok');
const failureFn = () => Promise.reject(new Error('service unavailable'));

// ---- Test Suite ----

describe('CircuitBreaker', () => {
  // ================================================================
  // Closed State (Normal Operation)
  // ================================================================

  describe('closed state', () => {
    it('should start in closed state', () => {
      const breaker = createBreaker();
      expect(breaker.getState()).toBe('closed');
    });

    it('should pass requests through normally', async () => {
      const breaker = createBreaker();
      const result = await breaker.execute(successFn);
      expect(result).toBe('ok');
    });

    it('should return the value from the executed function', async () => {
      const breaker = createBreaker();
      const result = await breaker.execute(() => Promise.resolve({ data: 42 }));
      expect(result).toEqual({ data: 42 });
    });

    it('should remain closed after successful requests', async () => {
      const breaker = createBreaker();

      await breaker.execute(successFn);
      await breaker.execute(successFn);
      await breaker.execute(successFn);

      expect(breaker.getState()).toBe('closed');
    });

    it('should track total requests', async () => {
      const breaker = createBreaker();

      await breaker.execute(successFn);
      await breaker.execute(successFn);

      const stats = breaker.getStats();
      expect(stats.totalRequests).toBe(2);
      expect(stats.totalFailures).toBe(0);
    });
  });

  // ================================================================
  // Failure Counting
  // ================================================================

  describe('failure counting', () => {
    it('should track failures within the window', async () => {
      const breaker = createBreaker();

      // 1 failure -- below threshold
      try { await breaker.execute(failureFn); } catch { /* expected */ }

      const stats = breaker.getStats();
      expect(stats.totalFailures).toBe(1);
      expect(stats.recentFailures).toBe(1);
      expect(breaker.getState()).toBe('closed'); // still closed
    });

    it('should remain closed below failure threshold', async () => {
      const breaker = createBreaker({ failureThreshold: 3 });

      // 2 failures -- below threshold of 3
      try { await breaker.execute(failureFn); } catch { /* expected */ }
      try { await breaker.execute(failureFn); } catch { /* expected */ }

      expect(breaker.getState()).toBe('closed');
      expect(breaker.getStats().recentFailures).toBe(2);
    });

    it('should propagate the original error on failure', async () => {
      const breaker = createBreaker();
      const specificError = new Error('specific error message');

      await expect(breaker.execute(() => Promise.reject(specificError))).rejects.toThrow(
        'specific error message',
      );
    });
  });

  // ================================================================
  // Threshold Reached: Circuit Opens
  // ================================================================

  describe('threshold reached', () => {
    it('should open circuit after reaching failure threshold', async () => {
      const breaker = createBreaker({ failureThreshold: 3 });

      // 3 failures = threshold
      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(failureFn); } catch { /* expected */ }
      }

      expect(breaker.getState()).toBe('open');
    });

    it('should count only failures within the time window', async () => {
      const breaker = createBreaker({
        failureThreshold: 3,
        failureWindowMs: 100, // very short window
      });

      // 2 failures
      try { await breaker.execute(failureFn); } catch { /* expected */ }
      try { await breaker.execute(failureFn); } catch { /* expected */ }

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // 1 more failure -- only this one is in the window now
      try { await breaker.execute(failureFn); } catch { /* expected */ }

      // Should still be closed because only 1 failure in window
      expect(breaker.getState()).toBe('closed');
    });
  });

  // ================================================================
  // Open State
  // ================================================================

  describe('open state', () => {
    async function openBreaker(): Promise<CircuitBreaker> {
      const breaker = createBreaker({ failureThreshold: 3, resetTimeoutMs: 5000 });
      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(failureFn); } catch { /* expected */ }
      }
      return breaker;
    }

    it('should reject requests immediately when open', async () => {
      const breaker = await openBreaker();

      await expect(breaker.execute(successFn)).rejects.toThrow(CircuitBreakerOpenError);
    });

    it('should throw CircuitBreakerOpenError with service name', async () => {
      const breaker = await openBreaker();

      try {
        await breaker.execute(successFn);
        fail('Expected CircuitBreakerOpenError');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerOpenError);
        expect((error as CircuitBreakerOpenError).serviceName).toBe('test-service');
      }
    });

    it('should include retryAfterMs in the error', async () => {
      const breaker = await openBreaker();

      try {
        await breaker.execute(successFn);
        fail('Expected CircuitBreakerOpenError');
      } catch (error) {
        expect((error as CircuitBreakerOpenError).retryAfterMs).toBeGreaterThan(0);
      }
    });

    it('should increment totalRejected counter', async () => {
      const breaker = await openBreaker();

      try { await breaker.execute(successFn); } catch { /* expected */ }
      try { await breaker.execute(successFn); } catch { /* expected */ }

      expect(breaker.getStats().totalRejected).toBe(2);
    });

    it('should not call the wrapped function when open', async () => {
      const breaker = await openBreaker();
      const spy = jest.fn().mockResolvedValue('should not be called');

      try { await breaker.execute(spy); } catch { /* expected */ }

      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // Reset Timeout: Open -> Half-Open
  // ================================================================

  describe('reset timeout', () => {
    it('should transition to half-open after reset timeout', async () => {
      const breaker = createBreaker({ failureThreshold: 3, resetTimeoutMs: 100 });

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(failureFn); } catch { /* expected */ }
      }
      expect(breaker.getState()).toBe('open');

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // getState() should report half_open
      expect(breaker.getState()).toBe('half_open');
    });
  });

  // ================================================================
  // Half-Open State
  // ================================================================

  describe('half-open state', () => {
    async function halfOpenBreaker(): Promise<CircuitBreaker> {
      const breaker = createBreaker({ failureThreshold: 3, resetTimeoutMs: 50 });
      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(failureFn); } catch { /* expected */ }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      return breaker;
    }

    it('should allow one test request through in half-open state', async () => {
      const breaker = await halfOpenBreaker();

      const result = await breaker.execute(successFn);
      expect(result).toBe('ok');
    });

    it('should close circuit on successful half-open test', async () => {
      const breaker = await halfOpenBreaker();

      await breaker.execute(successFn);

      expect(breaker.getState()).toBe('closed');
    });

    it('should re-open circuit on failed half-open test', async () => {
      const breaker = await halfOpenBreaker();

      try {
        await breaker.execute(failureFn);
      } catch {
        // expected
      }

      expect(breaker.getState()).toBe('open');
    });

    it('should reset failure count after successful recovery', async () => {
      const breaker = await halfOpenBreaker();

      // Recover
      await breaker.execute(successFn);
      expect(breaker.getState()).toBe('closed');

      // Now failures should count from scratch
      try { await breaker.execute(failureFn); } catch { /* expected */ }
      expect(breaker.getStats().recentFailures).toBe(1);
      expect(breaker.getState()).toBe('closed'); // still closed, only 1 failure
    });
  });

  // ================================================================
  // Independent Circuits Per Service
  // ================================================================

  describe('independent circuits per service', () => {
    it('should create independent circuit breakers for each AI service', () => {
      const stt = circuitBreakers.stt();
      const llm = circuitBreakers.llm();
      const tts = circuitBreakers.tts();
      const image = circuitBreakers.image();

      expect(stt).not.toBe(llm);
      expect(llm).not.toBe(tts);
      expect(tts).not.toBe(image);
    });

    it('should return the same instance for the same service name', () => {
      const stt1 = getCircuitBreaker('openai-stt');
      const stt2 = getCircuitBreaker('openai-stt');

      expect(stt1).toBe(stt2);
    });

    it('should not affect other services when one opens', async () => {
      const stt = new CircuitBreaker({ name: 'stt-isolated', failureThreshold: 2, resetTimeoutMs: 5000, failureWindowMs: 5000 });
      const llm = new CircuitBreaker({ name: 'llm-isolated', failureThreshold: 2, resetTimeoutMs: 5000, failureWindowMs: 5000 });

      // Open STT circuit
      try { await stt.execute(failureFn); } catch { /* expected */ }
      try { await stt.execute(failureFn); } catch { /* expected */ }
      expect(stt.getState()).toBe('open');

      // LLM should still be closed
      expect(llm.getState()).toBe('closed');
      const result = await llm.execute(successFn);
      expect(result).toBe('ok');
    });
  });

  // ================================================================
  // Force Reset
  // ================================================================

  describe('force reset', () => {
    it('should reset circuit breaker to closed state', async () => {
      const breaker = createBreaker({ failureThreshold: 3 });

      // Open it
      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(failureFn); } catch { /* expected */ }
      }
      expect(breaker.getState()).toBe('open');

      // Force reset
      breaker.reset();
      expect(breaker.getState()).toBe('closed');
    });

    it('should clear failure history on reset', async () => {
      const breaker = createBreaker({ failureThreshold: 3 });

      try { await breaker.execute(failureFn); } catch { /* expected */ }
      try { await breaker.execute(failureFn); } catch { /* expected */ }

      breaker.reset();
      expect(breaker.getStats().recentFailures).toBe(0);
    });
  });

  // ================================================================
  // Stats
  // ================================================================

  describe('stats', () => {
    it('should report comprehensive stats', async () => {
      const breaker = createBreaker({ failureThreshold: 5, resetTimeoutMs: 5000 });

      await breaker.execute(successFn);
      await breaker.execute(successFn);
      try { await breaker.execute(failureFn); } catch { /* expected */ }

      const stats = breaker.getStats();
      expect(stats.state).toBe('closed');
      expect(stats.totalRequests).toBe(3);
      expect(stats.totalFailures).toBe(1);
      expect(stats.totalRejected).toBe(0);
      expect(stats.recentFailures).toBe(1);
    });
  });

  // ================================================================
  // CircuitBreakerOpenError
  // ================================================================

  describe('CircuitBreakerOpenError', () => {
    it('should have correct error properties', () => {
      const error = new CircuitBreakerOpenError('openai-stt', 5000);

      expect(error.name).toBe('CircuitBreakerOpenError');
      expect(error.serviceName).toBe('openai-stt');
      expect(error.retryAfterMs).toBe(5000);
      expect(error.message).toContain('openai-stt');
      expect(error.message).toContain('5s');
    });

    it('should be an instance of Error', () => {
      const error = new CircuitBreakerOpenError('test', 1000);
      expect(error).toBeInstanceOf(Error);
    });
  });
});
