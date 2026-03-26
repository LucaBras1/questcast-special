import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

let _prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient({
      log:
        process.env.NODE_ENV === 'development'
          ? [
              { level: 'query', emit: 'event' },
              { level: 'error', emit: 'stdout' },
            ]
          : [{ level: 'error', emit: 'stdout' }],
    });

    logger.info('Prisma client initialized');
  }

  return _prisma;
}

/**
 * Singleton Prisma client instance.
 * Lazy-loaded to avoid build-time database connection attempts.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (prop === 'then' || prop === 'catch' || typeof prop === 'symbol') {
      return undefined;
    }
    const client = getPrisma();
    const value = client[prop as keyof PrismaClient];
    return typeof value === 'function' ? (value as Function).bind(client) : value;
  },
});

/**
 * Gracefully disconnect Prisma client.
 */
export async function disconnectPrisma() {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
    logger.info('Prisma client disconnected');
  }
}
