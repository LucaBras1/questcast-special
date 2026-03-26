# ============================================
# Questcast Backend - Dockerfile
# ============================================
# Multi-stage build: builder for deps, runner for execution
# Build context: repo root (to access shared/)

# --- Stage 1: Builder ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for dependency caching
COPY backend/package.json backend/package-lock.json* ./backend/

# Install all dependencies (including devDependencies for build)
RUN cd backend && npm ci

# Copy Prisma schema and generate client
COPY backend/prisma/ ./backend/prisma/
RUN cd backend && npx prisma generate

# Copy source code and shared types
COPY backend/tsconfig.json ./backend/
COPY backend/src/ ./backend/src/
COPY shared/ ./shared/

# Build TypeScript (rootDir is ".." so output is dist/backend/src/ and dist/shared/)
RUN cd backend && npm run build

# --- Stage 2: Runner ---
FROM node:20-alpine AS runner

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copy package files and install production deps only
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev

# Copy Prisma schema and generated client from builder
COPY --from=builder /app/backend/prisma/ ./prisma/
COPY --from=builder /app/backend/node_modules/.prisma/ ./node_modules/.prisma/
COPY --from=builder /app/backend/node_modules/@prisma/ ./node_modules/@prisma/

# Copy compiled output from builder
COPY --from=builder /app/backend/dist/ ./dist/

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "dist/backend/src/index.js"]
