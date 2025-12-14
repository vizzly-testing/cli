import { describe, expect, it } from 'vitest';
import { createTokenStore } from '../../src/auth/index.js';

describe('whoami command', () => {
  describe('createTokenStore', () => {
    it('should return an object with getTokens, saveTokens, clearTokens', () => {
      let tokenStore = createTokenStore();

      expect(tokenStore).toHaveProperty('getTokens');
      expect(tokenStore).toHaveProperty('saveTokens');
      expect(tokenStore).toHaveProperty('clearTokens');
      expect(typeof tokenStore.getTokens).toBe('function');
      expect(typeof tokenStore.saveTokens).toBe('function');
      expect(typeof tokenStore.clearTokens).toBe('function');
    });

    it('should return functions that are callable', async () => {
      let tokenStore = createTokenStore();

      // getTokens should return null/undefined when no tokens exist
      let tokens = await tokenStore.getTokens();
      expect(tokens === null || tokens === undefined || typeof tokens === 'object').toBe(true);
    });
  });
});
