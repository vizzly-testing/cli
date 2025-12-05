import { describe, expect, it } from 'vitest';
import { validateTddOptions } from '../../src/commands/tdd.js';

describe('validateTddOptions', () => {
  describe('test command validation', () => {
    it('should pass with valid test command', () => {
      const errors = validateTddOptions('npm test', {});
      expect(errors).toHaveLength(0);
    });

    it('should fail with empty test command', () => {
      const errors = validateTddOptions('', {});
      expect(errors).toContain('Test command is required');
    });

    it('should fail with null test command', () => {
      const errors = validateTddOptions(null, {});
      expect(errors).toContain('Test command is required');
    });

    it('should fail with whitespace-only test command', () => {
      const errors = validateTddOptions('   ', {});
      expect(errors).toContain('Test command is required');
    });
  });

  describe('port validation', () => {
    it('should pass with valid port', () => {
      const errors = validateTddOptions('npm test', { port: '3000' });
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid port number', () => {
      const errors = validateTddOptions('npm test', { port: 'invalid' });
      expect(errors).toContain(
        'Port must be a valid number between 1 and 65535'
      );
    });

    it('should fail with port out of range (too low)', () => {
      const errors = validateTddOptions('npm test', { port: '0' });
      expect(errors).toContain(
        'Port must be a valid number between 1 and 65535'
      );
    });

    it('should fail with port out of range (too high)', () => {
      const errors = validateTddOptions('npm test', { port: '65536' });
      expect(errors).toContain(
        'Port must be a valid number between 1 and 65535'
      );
    });
  });

  describe('timeout validation', () => {
    it('should pass with valid timeout', () => {
      const errors = validateTddOptions('npm test', { timeout: '5000' });
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid timeout', () => {
      const errors = validateTddOptions('npm test', { timeout: 'invalid' });
      expect(errors).toContain('Timeout must be at least 1000 milliseconds');
    });

    it('should fail with timeout too low', () => {
      const errors = validateTddOptions('npm test', { timeout: '500' });
      expect(errors).toContain('Timeout must be at least 1000 milliseconds');
    });
  });

  describe('threshold validation', () => {
    it('should pass with valid threshold', () => {
      const errors = validateTddOptions('npm test', { threshold: '0.1' });
      expect(errors).toHaveLength(0);
    });

    it('should pass with threshold of 0', () => {
      const errors = validateTddOptions('npm test', { threshold: '0' });
      expect(errors).toHaveLength(0);
    });

    it('should pass with threshold of 1', () => {
      const errors = validateTddOptions('npm test', { threshold: '1' });
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid threshold', () => {
      const errors = validateTddOptions('npm test', { threshold: 'invalid' });
      expect(errors).toContain(
        'Threshold must be a non-negative number (CIEDE2000 Delta E)'
      );
    });

    it('should fail with threshold below 0', () => {
      const errors = validateTddOptions('npm test', { threshold: '-0.1' });
      expect(errors).toContain(
        'Threshold must be a non-negative number (CIEDE2000 Delta E)'
      );
    });

    it('should pass with threshold above 1 (CIEDE2000 allows values > 1)', () => {
      const errors = validateTddOptions('npm test', { threshold: '2.0' });
      expect(errors).toHaveLength(0);
    });
  });

  describe('multiple validation errors', () => {
    it('should return all validation errors', () => {
      const errors = validateTddOptions('', {
        port: 'invalid',
        timeout: '500',
        threshold: '-1', // negative threshold is invalid
      });

      expect(errors).toHaveLength(4);
      expect(errors).toContain('Test command is required');
      expect(errors).toContain(
        'Port must be a valid number between 1 and 65535'
      );
      expect(errors).toContain('Timeout must be at least 1000 milliseconds');
      expect(errors).toContain(
        'Threshold must be a non-negative number (CIEDE2000 Delta E)'
      );
    });
  });
});
