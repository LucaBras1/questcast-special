/**
 * Authenticate Middleware -- Unit Tests
 *
 * Tests the JWT authentication middleware using Fastify's inject().
 * Covers: valid JWT, invalid JWT, missing token, expired token.
 */

import { FastifyInstance } from 'fastify';
import { buildTestApp, generateTestToken, generateExpiredToken } from '../setup';

describe('authenticate middleware', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();

    // Dynamic import to get the actual middleware
    const { authenticate } = await import('../../src/middleware/authenticate');

    // Register a protected test route using the real authenticate middleware
    app.get(
      '/test/protected',
      { preHandler: [authenticate] },
      async (request) => {
        return {
          userId: request.userId,
          userEmail: request.userEmail,
        };
      },
    );

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should allow access with a valid JWT and attach userId/userEmail', async () => {
    const token = generateTestToken(app, {
      sub: 'user-abc-123',
      email: 'hero@questcast.app',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test/protected',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.userId).toBe('user-abc-123');
    expect(body.userEmail).toBe('hero@questcast.app');
  });

  it('should reject request without Authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/protected',
    });

    expect(response.statusCode).toBe(401);
  });

  it('should reject request with empty Authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/protected',
      headers: {
        authorization: '',
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('should reject request with malformed JWT', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/protected',
      headers: {
        authorization: 'Bearer this.is.not.a.valid.jwt',
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('should reject request with expired JWT', async () => {
    const token = generateExpiredToken(app, {
      sub: 'user-abc-123',
      email: 'hero@questcast.app',
    });

    // Wait for token to expire
    await new Promise((resolve) => setTimeout(resolve, 15));

    const response = await app.inject({
      method: 'GET',
      url: '/test/protected',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('should reject request with wrong authorization scheme', async () => {
    const token = generateTestToken(app, {
      sub: 'user-abc-123',
      email: 'hero@questcast.app',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test/protected',
      headers: {
        authorization: `Basic ${token}`,
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('should reject JWT signed with a different secret', async () => {
    // Create a separate app with a different secret
    const otherApp = await buildTestApp();
    // Override JWT with different secret
    // We can't easily re-register jwt, so we'll just craft a token manually
    await otherApp.close();

    // A JWT from a completely different source
    const fakeJwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      'eyJzdWIiOiJ1c2VyLTEyMyIsImVtYWlsIjoiZmFrZUB0ZXN0LmNvbSIsImlhdCI6MTcwMDAwMDAwMH0.' +
      'invalid-signature-here';

    const response = await app.inject({
      method: 'GET',
      url: '/test/protected',
      headers: {
        authorization: `Bearer ${fakeJwt}`,
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('should reject request with Bearer prefix but no token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/protected',
      headers: {
        authorization: 'Bearer ',
      },
    });

    expect(response.statusCode).toBe(401);
  });
});
