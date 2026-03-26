import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from './prisma.js';
import { ConflictError, UnauthorizedError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { RegisterInput, LoginInput } from '../models/schemas.js';

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_BYTES = 48;

export interface AuthResult {
  user: {
    id: string;
    email: string;
    displayName: string;
    language: string;
  };
  accessToken: string;
  refreshToken: string;
}

/**
 * Generates a cryptographically random refresh token.
 */
function generateRefreshToken(): string {
  const bytes = new Uint8Array(REFRESH_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}

/**
 * Register a new user.
 */
export async function registerUser(
  input: RegisterInput,
  signJwt: (payload: Record<string, unknown>) => string,
): Promise<AuthResult> {
  // Check for existing user
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existing) {
    throw new ConflictError('Email already registered');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  // Create user
  const user = await prisma.user.create({
    data: {
      id: uuidv4(),
      email: input.email,
      passwordHash,
      displayName: input.displayName,
      language: input.language === 'cs' ? 'cs' : 'en',
    },
  });

  // Create default preferences
  await prisma.userPreferences.create({
    data: {
      userId: user.id,
      language: user.language,
    },
  });

  // Generate tokens
  const accessToken = signJwt({ sub: user.id, email: user.email });
  const refreshToken = generateRefreshToken();

  logger.info('User registered', { userId: user.id, email: user.email });

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      language: user.language,
    },
    accessToken,
    refreshToken,
  };
}

/**
 * Authenticate user with email and password.
 */
export async function loginUser(
  input: LoginInput,
  signJwt: (payload: Record<string, unknown>) => string,
): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const isValid = await bcrypt.compare(input.password, user.passwordHash);
  if (!isValid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const accessToken = signJwt({ sub: user.id, email: user.email });
  const refreshToken = generateRefreshToken();

  logger.info('User logged in', { userId: user.id });

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      language: user.language,
    },
    accessToken,
    refreshToken,
  };
}

/**
 * Refresh access token.
 * In a full implementation, this would validate the refresh token against a stored list.
 * For MVP, we re-sign if the user exists.
 */
export async function refreshAccessToken(
  userId: string,
  signJwt: (payload: Record<string, unknown>) => string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  const accessToken = signJwt({ sub: user.id, email: user.email });
  const refreshToken = generateRefreshToken();

  return { accessToken, refreshToken };
}
