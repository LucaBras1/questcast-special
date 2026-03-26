import type { FastifyInstance } from 'fastify';

/**
 * API Documentation routes using @fastify/swagger and @fastify/swagger-ui.
 *
 * Registers OpenAPI/Swagger spec auto-generation from Fastify route schemas
 * and serves the Swagger UI at /api/docs.
 */
export async function registerDocs(app: FastifyInstance): Promise<void> {
  // Dynamic imports to keep these as optional dependencies
  const swagger = await import('@fastify/swagger');
  const swaggerUi = await import('@fastify/swagger-ui');

  await app.register(swagger.default, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Questcast API',
        description:
          'AI-powered voice adventure game backend. Handles game sessions, turn processing (STT -> LLM -> TTS pipeline), dice rolling, image generation, and user management.',
        version: '0.1.0',
        contact: {
          name: 'Questcast Team',
        },
      },
      servers: [
        {
          url: 'http://localhost:3000',
          description: 'Development server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT access token from POST /api/auth/login',
          },
        },
      },
      security: [{ bearerAuth: [] }],
      tags: [
        { name: 'Auth', description: 'Authentication and registration' },
        { name: 'Game', description: 'Game session management' },
        { name: 'Turn', description: 'Turn processing (SSE streaming)' },
        { name: 'Dice', description: 'Dice rolling mechanics' },
        { name: 'Image', description: 'AI scene image generation' },
        { name: 'User', description: 'User profile and preferences' },
        { name: 'Health', description: 'Server health checks' },
      ],
    },
  });

  await app.register(swaggerUi.default, {
    routePrefix: '/api/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true,
    },
    staticCSP: true,
  });
}
