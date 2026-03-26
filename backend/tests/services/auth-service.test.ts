/**
 * Auth Service -- Unit Tests
 *
 * Tests the actual auth service functions with mocked Prisma and bcrypt.
 * Covers: registerUser, loginUser, refreshAccessToken
 */

import { createMockUser } from '../setup';

// Mock Prisma before importing auth-service
const mockPrismaUser = {
  findUnique: jest.fn(),
  create: jest.fn(),
};
const mockPrismaUserPreferences = {
  create: jest.fn(),
};

jest.mock('../../src/services/prisma', () => ({
  prisma: {
    user: mockPrismaUser,
    userPreferences: mockPrismaUserPreferences,
  },
}));

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$12$hashed-password-value'),
  compare: jest.fn(),
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('generated-uuid-1234'),
}));

// Mock logger to silence output
jest.mock('../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import bcrypt from 'bcrypt';
import { registerUser, loginUser, refreshAccessToken } from '../../src/services/auth-service';
import { ConflictError, UnauthorizedError } from '../../src/utils/errors';

describe('Auth Service', () => {
  const mockSignJwt = jest.fn().mockReturnValue('mock-jwt-token');

  beforeEach(() => {
    jest.clearAllMocks();
    mockSignJwt.mockReturnValue('mock-jwt-token');
  });

  // ================================================================
  // registerUser
  // ================================================================

  describe('registerUser', () => {
    const validInput = {
      email: 'newuser@questcast.app',
      password: 'SecurePass123!',
      displayName: 'New Adventurer',
      language: 'en' as const,
    };

    it('should register a new user successfully', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null);
      mockPrismaUser.create.mockResolvedValue({
        id: 'generated-uuid-1234',
        email: validInput.email,
        passwordHash: '$2b$12$hashed-password-value',
        displayName: validInput.displayName,
        language: 'en',
      });
      mockPrismaUserPreferences.create.mockResolvedValue({});

      const result = await registerUser(validInput, mockSignJwt);

      expect(result.user.email).toBe(validInput.email);
      expect(result.user.displayName).toBe(validInput.displayName);
      expect(result.user.language).toBe('en');
      expect(result.user.id).toBe('generated-uuid-1234');
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.refreshToken).toBeTruthy();
      expect(typeof result.refreshToken).toBe('string');
    });

    it('should check for existing user by email', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null);
      mockPrismaUser.create.mockResolvedValue({
        id: 'generated-uuid-1234',
        email: validInput.email,
        passwordHash: '$2b$12$hashed',
        displayName: validInput.displayName,
        language: 'en',
      });
      mockPrismaUserPreferences.create.mockResolvedValue({});

      await registerUser(validInput, mockSignJwt);

      expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
        where: { email: validInput.email },
      });
    });

    it('should throw ConflictError if email already exists', async () => {
      const existingUser = createMockUser({ email: validInput.email });
      mockPrismaUser.findUnique.mockResolvedValue(existingUser);

      await expect(registerUser(validInput, mockSignJwt)).rejects.toThrow(ConflictError);
      await expect(registerUser(validInput, mockSignJwt)).rejects.toThrow(/already registered/i);
    });

    it('should not create user when email already exists', async () => {
      const existingUser = createMockUser({ email: validInput.email });
      mockPrismaUser.findUnique.mockResolvedValue(existingUser);

      try {
        await registerUser(validInput, mockSignJwt);
      } catch {
        // expected
      }

      expect(mockPrismaUser.create).not.toHaveBeenCalled();
    });

    it('should hash the password with 12 rounds', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null);
      mockPrismaUser.create.mockResolvedValue({
        id: 'generated-uuid-1234',
        email: validInput.email,
        passwordHash: '$2b$12$hashed',
        displayName: validInput.displayName,
        language: 'en',
      });
      mockPrismaUserPreferences.create.mockResolvedValue({});

      await registerUser(validInput, mockSignJwt);

      expect(bcrypt.hash).toHaveBeenCalledWith(validInput.password, 12);
    });

    it('should create user with hashed password, not plaintext', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null);
      mockPrismaUser.create.mockResolvedValue({
        id: 'generated-uuid-1234',
        email: validInput.email,
        passwordHash: '$2b$12$hashed-password-value',
        displayName: validInput.displayName,
        language: 'en',
      });
      mockPrismaUserPreferences.create.mockResolvedValue({});

      await registerUser(validInput, mockSignJwt);

      expect(mockPrismaUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passwordHash: '$2b$12$hashed-password-value',
            email: validInput.email,
          }),
        }),
      );
      // Ensure plaintext password is not stored
      const createCall = mockPrismaUser.create.mock.calls[0][0];
      expect(createCall.data).not.toHaveProperty('password');
    });

    it('should create default user preferences', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null);
      mockPrismaUser.create.mockResolvedValue({
        id: 'generated-uuid-1234',
        email: validInput.email,
        passwordHash: '$2b$12$hashed',
        displayName: validInput.displayName,
        language: 'en',
      });
      mockPrismaUserPreferences.create.mockResolvedValue({});

      await registerUser(validInput, mockSignJwt);

      expect(mockPrismaUserPreferences.create).toHaveBeenCalledWith({
        data: {
          userId: 'generated-uuid-1234',
          language: 'en',
        },
      });
    });

    it('should sign JWT with user id and email', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null);
      mockPrismaUser.create.mockResolvedValue({
        id: 'generated-uuid-1234',
        email: validInput.email,
        passwordHash: '$2b$12$hashed',
        displayName: validInput.displayName,
        language: 'en',
      });
      mockPrismaUserPreferences.create.mockResolvedValue({});

      await registerUser(validInput, mockSignJwt);

      expect(mockSignJwt).toHaveBeenCalledWith({
        sub: 'generated-uuid-1234',
        email: validInput.email,
      });
    });

    it('should normalize Czech language correctly', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null);
      mockPrismaUser.create.mockResolvedValue({
        id: 'generated-uuid-1234',
        email: validInput.email,
        passwordHash: '$2b$12$hashed',
        displayName: validInput.displayName,
        language: 'cs',
      });
      mockPrismaUserPreferences.create.mockResolvedValue({});

      await registerUser({ ...validInput, language: 'cs' }, mockSignJwt);

      expect(mockPrismaUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            language: 'cs',
          }),
        }),
      );
    });

    it('should not expose passwordHash in the returned user object', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null);
      mockPrismaUser.create.mockResolvedValue({
        id: 'generated-uuid-1234',
        email: validInput.email,
        passwordHash: '$2b$12$hashed',
        displayName: validInput.displayName,
        language: 'en',
      });
      mockPrismaUserPreferences.create.mockResolvedValue({});

      const result = await registerUser(validInput, mockSignJwt);

      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user).not.toHaveProperty('password');
    });

    it('should generate a unique refresh token', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null);
      mockPrismaUser.create.mockResolvedValue({
        id: 'generated-uuid-1234',
        email: validInput.email,
        passwordHash: '$2b$12$hashed',
        displayName: validInput.displayName,
        language: 'en',
      });
      mockPrismaUserPreferences.create.mockResolvedValue({});

      const result1 = await registerUser(validInput, mockSignJwt);

      mockPrismaUser.findUnique.mockResolvedValue(null);
      mockPrismaUser.create.mockResolvedValue({
        id: 'generated-uuid-5678',
        email: 'another@questcast.app',
        passwordHash: '$2b$12$hashed',
        displayName: 'Another',
        language: 'en',
      });

      const result2 = await registerUser(
        { ...validInput, email: 'another@questcast.app' },
        mockSignJwt,
      );

      // Refresh tokens should be different (cryptographically random)
      expect(result1.refreshToken).not.toBe(result2.refreshToken);
    });
  });

  // ================================================================
  // loginUser
  // ================================================================

  describe('loginUser', () => {
    const validInput = {
      email: 'existing@questcast.app',
      password: 'correctpassword',
    };

    const existingUser = {
      id: 'user-id-123',
      email: 'existing@questcast.app',
      passwordHash: '$2b$12$stored-hash',
      displayName: 'Existing User',
      language: 'en',
    };

    it('should login successfully with correct credentials', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(existingUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await loginUser(validInput, mockSignJwt);

      expect(result.user.email).toBe(existingUser.email);
      expect(result.user.displayName).toBe(existingUser.displayName);
      expect(result.user.id).toBe(existingUser.id);
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.refreshToken).toBeTruthy();
    });

    it('should look up user by email', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(existingUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await loginUser(validInput, mockSignJwt);

      expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
        where: { email: validInput.email },
      });
    });

    it('should throw UnauthorizedError for non-existent user', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null);

      await expect(loginUser(validInput, mockSignJwt)).rejects.toThrow(UnauthorizedError);
      await expect(
        loginUser({ email: 'nobody@questcast.app', password: 'anything' }, mockSignJwt),
      ).rejects.toThrow(/invalid email or password/i);
    });

    it('should not reveal whether email exists in error message', async () => {
      // Non-existent user
      mockPrismaUser.findUnique.mockResolvedValue(null);
      let error1: Error | undefined;
      try {
        await loginUser({ email: 'nobody@questcast.app', password: 'x' }, mockSignJwt);
      } catch (e) {
        error1 = e as Error;
      }

      // Existing user, wrong password
      mockPrismaUser.findUnique.mockResolvedValue(existingUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      let error2: Error | undefined;
      try {
        await loginUser({ email: existingUser.email, password: 'wrong' }, mockSignJwt);
      } catch (e) {
        error2 = e as Error;
      }

      // Both should have the same error message (prevents email enumeration)
      expect(error1?.message).toBe(error2?.message);
    });

    it('should throw UnauthorizedError for wrong password', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(existingUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        loginUser({ ...validInput, password: 'wrongpassword' }, mockSignJwt),
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should compare password against stored hash', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(existingUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await loginUser(validInput, mockSignJwt);

      expect(bcrypt.compare).toHaveBeenCalledWith(validInput.password, existingUser.passwordHash);
    });

    it('should sign JWT with user id and email on success', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(existingUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await loginUser(validInput, mockSignJwt);

      expect(mockSignJwt).toHaveBeenCalledWith({
        sub: existingUser.id,
        email: existingUser.email,
      });
    });

    it('should not expose passwordHash in the returned user', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(existingUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await loginUser(validInput, mockSignJwt);

      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('should not call signJwt when authentication fails', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null);

      try {
        await loginUser(validInput, mockSignJwt);
      } catch {
        // expected
      }

      expect(mockSignJwt).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // refreshAccessToken
  // ================================================================

  describe('refreshAccessToken', () => {
    const existingUser = {
      id: 'user-id-456',
      email: 'refresh@questcast.app',
      passwordHash: '$2b$12$hash',
      displayName: 'Refresh User',
      language: 'en',
    };

    it('should generate new tokens for existing user', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(existingUser);

      const result = await refreshAccessToken(existingUser.id, mockSignJwt);

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.refreshToken).toBeTruthy();
      expect(typeof result.refreshToken).toBe('string');
    });

    it('should look up user by id', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(existingUser);

      await refreshAccessToken(existingUser.id, mockSignJwt);

      expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
        where: { id: existingUser.id },
      });
    });

    it('should throw UnauthorizedError if user not found', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null);

      await expect(refreshAccessToken('non-existent-id', mockSignJwt)).rejects.toThrow(
        UnauthorizedError,
      );
      await expect(refreshAccessToken('non-existent-id', mockSignJwt)).rejects.toThrow(
        /user not found/i,
      );
    });

    it('should sign JWT with correct payload', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(existingUser);

      await refreshAccessToken(existingUser.id, mockSignJwt);

      expect(mockSignJwt).toHaveBeenCalledWith({
        sub: existingUser.id,
        email: existingUser.email,
      });
    });

    it('should not call signJwt when user is not found', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null);

      try {
        await refreshAccessToken('non-existent', mockSignJwt);
      } catch {
        // expected
      }

      expect(mockSignJwt).not.toHaveBeenCalled();
    });

    it('should return a new refresh token each time', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(existingUser);

      const result1 = await refreshAccessToken(existingUser.id, mockSignJwt);
      const result2 = await refreshAccessToken(existingUser.id, mockSignJwt);

      expect(result1.refreshToken).not.toBe(result2.refreshToken);
    });
  });
});
