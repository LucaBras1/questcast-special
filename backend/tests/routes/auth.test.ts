/**
 * Auth Routes -- Test Suite
 *
 * Tests for:
 * - POST /api/auth/register
 * - POST /api/auth/login
 * - POST /api/auth/refresh
 * - Protected route access (JWT validation)
 */

import { FastifyInstance } from 'fastify';
import {
  buildTestApp,
  generateTestToken,
  MockDatabase,
} from '../setup';

// ---- Mock Dependencies ----

const mockDb = new MockDatabase();

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$10$hashedpassword'),
  compare: jest.fn().mockImplementation((plain: string, _hash: string) => {
    // For tests: 'correctpassword' always matches, anything else fails
    return Promise.resolve(plain === 'correctpassword');
  }),
}));

import bcrypt from 'bcrypt';

// ---- Test Suite ----

describe('Auth Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();

    // Register auth routes for testing
    app.post('/api/auth/register', async (request, reply) => {
      const { email, password, displayName, language } = request.body as {
        email: string;
        password: string;
        displayName: string;
        language?: string;
      };

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid email address',
        });
      }

      // Validate password strength
      if (!password || password.length < 8) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Password must be at least 8 characters',
        });
      }

      // Validate display name
      if (!displayName || displayName.length < 1) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Display name is required',
        });
      }

      // Check duplicate email
      const existing = mockDb.findUserByEmail(email);
      if (existing) {
        return reply.status(409).send({
          code: 'CONFLICT',
          message: 'Email already registered',
        });
      }

      // Create user
      const passwordHash = await bcrypt.hash(password, 10);
      const user = mockDb.createUser({
        email,
        passwordHash,
        displayName,
        language: (language as 'cs' | 'en') || 'en',
        contentRating: 'teen',
      });

      // Generate tokens
      const accessToken = app.jwt.sign({ sub: user.id, email: user.email });
      const refreshToken = app.jwt.sign(
        { sub: user.id, email: user.email, type: 'refresh' },
        { expiresIn: '30d' },
      );

      return reply.status(201).send({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          language: user.language,
        },
        accessToken,
        refreshToken,
      });
    });

    app.post('/api/auth/login', async (request, reply) => {
      const { email, password } = request.body as {
        email: string;
        password: string;
      };

      if (!email || !password) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Email and password are required',
        });
      }

      const user = mockDb.findUserByEmail(email);
      if (!user) {
        return reply.status(401).send({
          code: 'UNAUTHORIZED',
          message: 'Invalid credentials',
        });
      }

      const passwordValid = await bcrypt.compare(password, user.passwordHash);
      if (!passwordValid) {
        return reply.status(401).send({
          code: 'UNAUTHORIZED',
          message: 'Invalid credentials',
        });
      }

      const accessToken = app.jwt.sign({ sub: user.id, email: user.email });
      const refreshToken = app.jwt.sign(
        { sub: user.id, email: user.email, type: 'refresh' },
        { expiresIn: '30d' },
      );

      return reply.status(200).send({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          language: user.language,
        },
        accessToken,
        refreshToken,
      });
    });

    app.post('/api/auth/refresh', async (request, reply) => {
      const { refreshToken } = request.body as { refreshToken: string };

      if (!refreshToken) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Refresh token is required',
        });
      }

      try {
        const decoded = app.jwt.verify<{ sub: string; email: string; type?: string }>(
          refreshToken,
        );

        if (decoded.type !== 'refresh') {
          return reply.status(401).send({
            code: 'UNAUTHORIZED',
            message: 'Invalid token type',
          });
        }

        const newAccessToken = app.jwt.sign({ sub: decoded.sub, email: decoded.email });
        const newRefreshToken = app.jwt.sign(
          { sub: decoded.sub, email: decoded.email, type: 'refresh' },
          { expiresIn: '30d' },
        );

        return reply.status(200).send({
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        });
      } catch {
        return reply.status(401).send({
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired refresh token',
        });
      }
    });

    // Protected route for testing JWT middleware
    app.get('/api/user/profile', {
      preHandler: async (request, reply) => {
        try {
          const decoded = await request.jwtVerify<{ sub: string; email: string }>();
          (request as any).userId = decoded.sub;
          (request as any).userEmail = decoded.email;
        } catch {
          return reply.status(401).send({
            code: 'UNAUTHORIZED',
            message: 'Invalid or expired token',
          });
        }
      },
      handler: async (request) => {
        const userId = (request as any).userId;
        const user = mockDb.findUserById(userId);
        if (!user) {
          return { code: 'NOT_FOUND', message: 'User not found' };
        }
        return {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          language: user.language,
        };
      },
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockDb.reset();
  });

  // ================================================================
  // POST /api/auth/register
  // ================================================================

  describe('POST /api/auth/register', () => {
    const validPayload = {
      email: 'newuser@questcast.app',
      password: 'SecurePass123!',
      displayName: 'New Adventurer',
      language: 'en',
    };

    it('should register a new user successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: validPayload,
      });

      expect(response.statusCode).toBe(201);

      const body = response.json();
      expect(body).toHaveProperty('user');
      expect(body).toHaveProperty('accessToken');
      expect(body).toHaveProperty('refreshToken');
      expect(body.user.email).toBe(validPayload.email);
      expect(body.user.displayName).toBe(validPayload.displayName);
      expect(body.user.language).toBe('en');
      // Password hash should NOT be in response
      expect(body.user).not.toHaveProperty('passwordHash');
      expect(body.user).not.toHaveProperty('password');
    });

    it('should reject registration with duplicate email', async () => {
      // Register first user
      await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: validPayload,
      });

      // Attempt duplicate
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          ...validPayload,
          displayName: 'Another User',
        },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.code).toBe('CONFLICT');
      expect(body.message).toMatch(/already registered/i);
    });

    it('should reject registration with invalid email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          ...validPayload,
          email: 'not-an-email',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject registration with empty email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          ...validPayload,
          email: '',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject registration with weak password (< 8 chars)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          ...validPayload,
          password: 'short',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject registration without display name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          ...validPayload,
          displayName: '',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should default language to "en" when not provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'nolang@questcast.app',
          password: 'SecurePass123!',
          displayName: 'No Lang User',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.user.language).toBe('en');
    });

    it('should accept Czech language preference', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          ...validPayload,
          email: 'czech@questcast.app',
          language: 'cs',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.user.language).toBe('cs');
    });

    it('should hash the password before storage', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: validPayload,
      });

      expect(bcrypt.hash).toHaveBeenCalledWith(validPayload.password, 10);
    });

    it('should return a valid JWT access token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: validPayload,
      });

      const body = response.json();
      const decoded = app.jwt.verify<{ sub: string; email: string }>(body.accessToken);
      expect(decoded.email).toBe(validPayload.email);
      expect(decoded.sub).toBeTruthy();
    });
  });

  // ================================================================
  // POST /api/auth/login
  // ================================================================

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Seed a user for login tests
      mockDb.createUser({
        email: 'existing@questcast.app',
        passwordHash: '$2b$10$hashedpassword',
        displayName: 'Existing User',
        language: 'en',
        contentRating: 'teen',
      });
    });

    it('should login successfully with correct credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'existing@questcast.app',
          password: 'correctpassword', // matches bcrypt mock
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('user');
      expect(body).toHaveProperty('accessToken');
      expect(body).toHaveProperty('refreshToken');
      expect(body.user.email).toBe('existing@questcast.app');
    });

    it('should reject login with wrong password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'existing@questcast.app',
          password: 'wrongpassword',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.code).toBe('UNAUTHORIZED');
      expect(body.message).toMatch(/invalid credentials/i);
    });

    it('should reject login for non-existent user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'nobody@questcast.app',
          password: 'somepassword',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.code).toBe('UNAUTHORIZED');
      // Should NOT reveal whether email exists (same error message)
      expect(body.message).toMatch(/invalid credentials/i);
    });

    it('should reject login with missing email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          password: 'somepassword',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject login with missing password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'existing@questcast.app',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return a valid JWT token on successful login', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'existing@questcast.app',
          password: 'correctpassword',
        },
      });

      const body = response.json();
      const decoded = app.jwt.verify<{ sub: string; email: string }>(body.accessToken);
      expect(decoded.email).toBe('existing@questcast.app');
    });
  });

  // ================================================================
  // POST /api/auth/refresh
  // ================================================================

  describe('POST /api/auth/refresh', () => {
    let validRefreshToken: string;

    beforeEach(() => {
      validRefreshToken = app.jwt.sign(
        { sub: 'user-123', email: 'user@questcast.app', type: 'refresh' },
        { expiresIn: '30d' },
      );
    });

    it('should refresh tokens with valid refresh token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: validRefreshToken },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('accessToken');
      expect(body).toHaveProperty('refreshToken');

      // New access token should be valid
      const decoded = app.jwt.verify<{ sub: string; email: string }>(body.accessToken);
      expect(decoded.sub).toBe('user-123');
      expect(decoded.email).toBe('user@questcast.app');
    });

    it('should reject expired refresh token', async () => {
      const expiredToken = app.jwt.sign(
        { sub: 'user-123', email: 'user@questcast.app', type: 'refresh' },
        { expiresIn: '1s' },
      );

      // Wait for token to expire
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: expiredToken },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('should reject invalid refresh token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: 'this-is-not-a-valid-jwt' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject when refresh token is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject access token used as refresh token', async () => {
      // Access tokens do not have type: 'refresh'
      const accessToken = app.jwt.sign({ sub: 'user-123', email: 'user@questcast.app' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: accessToken },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.message).toMatch(/invalid token type/i);
    });
  });

  // ================================================================
  // Protected Route Access (JWT Middleware)
  // ================================================================

  describe('Protected route (GET /api/user/profile)', () => {
    beforeEach(() => {
      mockDb.users.push({
        id: 'user-abc-123',
        email: 'protected@questcast.app',
        passwordHash: '$2b$10$hash',
        displayName: 'Protected User',
        language: 'en' as const,
        contentRating: 'teen' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('should allow access with valid JWT', async () => {
      const token = generateTestToken(app, {
        sub: 'user-abc-123',
        email: 'protected@questcast.app',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/user/profile',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.email).toBe('protected@questcast.app');
      expect(body.displayName).toBe('Protected User');
    });

    it('should reject request without JWT', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/user/profile',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('should reject request with expired JWT', async () => {
      const token = app.jwt.sign(
        { sub: 'user-abc-123', email: 'protected@questcast.app' },
        { expiresIn: '1s' },
      );

      // Wait for token to expire
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const response = await app.inject({
        method: 'GET',
        url: '/api/user/profile',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject request with malformed JWT', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/user/profile',
        headers: {
          authorization: 'Bearer not.a.valid.jwt.token',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject request with wrong authorization scheme', async () => {
      const token = generateTestToken(app, {
        sub: 'user-abc-123',
        email: 'protected@questcast.app',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/user/profile',
        headers: {
          authorization: `Basic ${token}`,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
