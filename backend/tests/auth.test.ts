import { registerSchema, loginSchema, refreshTokenSchema } from '../src/models/schemas';

describe('Auth Schemas', () => {
  describe('registerSchema', () => {
    it('should validate a correct registration input', () => {
      const input = {
        email: 'player@questcast.app',
        password: 'securepass123',
        displayName: 'Dragon Slayer',
        language: 'en',
      };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should default language to en', () => {
      const input = {
        email: 'player@questcast.app',
        password: 'securepass123',
        displayName: 'Dragon Slayer',
      };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language).toBe('en');
      }
    });

    it('should reject invalid email', () => {
      const input = {
        email: 'not-an-email',
        password: 'securepass123',
        displayName: 'Dragon Slayer',
      };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject password shorter than 8 characters', () => {
      const input = {
        email: 'player@questcast.app',
        password: 'short',
        displayName: 'Dragon Slayer',
      };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject empty display name', () => {
      const input = {
        email: 'player@questcast.app',
        password: 'securepass123',
        displayName: '',
      };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should accept Czech language', () => {
      const input = {
        email: 'hrac@questcast.app',
        password: 'bezpecneheslo1',
        displayName: 'Drak Zabijak',
        language: 'cs',
      };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language).toBe('cs');
      }
    });

    it('should reject unsupported language', () => {
      const input = {
        email: 'player@questcast.app',
        password: 'securepass123',
        displayName: 'Dragon Slayer',
        language: 'de',
      };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('loginSchema', () => {
    it('should validate correct login input', () => {
      const input = {
        email: 'player@questcast.app',
        password: 'securepass123',
      };
      const result = loginSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject missing password', () => {
      const input = {
        email: 'player@questcast.app',
      };
      const result = loginSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('refreshTokenSchema', () => {
    it('should validate a refresh token', () => {
      const input = { refreshToken: 'some-refresh-token-value' };
      const result = refreshTokenSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject empty refresh token', () => {
      const input = { refreshToken: '' };
      const result = refreshTokenSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});
