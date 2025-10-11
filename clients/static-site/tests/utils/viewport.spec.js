/**
 * Tests for viewport utilities
 */

import { describe, it, expect } from 'vitest';
import { parseViewport } from '../../src/utils/viewport.js';

describe('viewport', () => {
  describe('parseViewport', () => {
    it('should parse viewport string', () => {
      let viewport = parseViewport('mobile:375x667');

      expect(viewport).toEqual({
        name: 'mobile',
        width: 375,
        height: 667,
      });
    });

    it('should handle different viewport formats', () => {
      let viewport1 = parseViewport('desktop:1920x1080');
      let viewport2 = parseViewport('tablet:768x1024');

      expect(viewport1.name).toBe('desktop');
      expect(viewport1.width).toBe(1920);
      expect(viewport1.height).toBe(1080);

      expect(viewport2.name).toBe('tablet');
      expect(viewport2.width).toBe(768);
      expect(viewport2.height).toBe(1024);
    });

    it('should return null for invalid format', () => {
      expect(parseViewport('invalid')).toBeNull();
      expect(parseViewport('mobile:375')).toBeNull();
      expect(parseViewport('mobile:375x')).toBeNull();
      expect(parseViewport(':375x667')).toBeNull();
    });

    it('should return null for non-numeric dimensions', () => {
      expect(parseViewport('mobile:abcxdef')).toBeNull();
      expect(parseViewport('mobile:375xabc')).toBeNull();
    });

    it('should handle whitespace', () => {
      let viewport = parseViewport('  mobile:375x667  ');

      expect(viewport).toEqual({
        name: 'mobile',
        width: 375,
        height: 667,
      });
    });
  });
});
