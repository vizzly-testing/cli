import { describe, expect, it } from 'vitest';
import { validateRunOptions } from '../../src/commands/run.js';

describe('validateRunOptions', () => {
  describe('test command validation', () => {
    it('should pass with valid test command', () => {
      const errors = validateRunOptions('npm test', {});
      expect(errors).toHaveLength(0);
    });

    it('should fail with empty test command', () => {
      const errors = validateRunOptions('', {});
      expect(errors).toContain('Test command is required');
    });

    it('should fail with null test command', () => {
      const errors = validateRunOptions(null, {});
      expect(errors).toContain('Test command is required');
    });

    it('should fail with whitespace-only test command', () => {
      const errors = validateRunOptions('   ', {});
      expect(errors).toContain('Test command is required');
    });
  });

  describe('port validation', () => {
    it('should pass with valid port', () => {
      const errors = validateRunOptions('npm test', { port: '3000' });
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid port number', () => {
      const errors = validateRunOptions('npm test', { port: 'invalid' });
      expect(errors).toContain(
        'Port must be a valid number between 1 and 65535'
      );
    });

    it('should fail with port out of range (too low)', () => {
      const errors = validateRunOptions('npm test', { port: '0' });
      expect(errors).toContain(
        'Port must be a valid number between 1 and 65535'
      );
    });

    it('should fail with port out of range (too high)', () => {
      const errors = validateRunOptions('npm test', { port: '65536' });
      expect(errors).toContain(
        'Port must be a valid number between 1 and 65535'
      );
    });
  });

  describe('timeout validation', () => {
    it('should pass with valid timeout', () => {
      const errors = validateRunOptions('npm test', { timeout: '5000' });
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid timeout', () => {
      const errors = validateRunOptions('npm test', { timeout: 'invalid' });
      expect(errors).toContain('Timeout must be at least 1000 milliseconds');
    });

    it('should fail with timeout too low', () => {
      const errors = validateRunOptions('npm test', { timeout: '500' });
      expect(errors).toContain('Timeout must be at least 1000 milliseconds');
    });
  });

  describe('batch size validation', () => {
    it('should pass with valid batch size', () => {
      const errors = validateRunOptions('npm test', { batchSize: '10' });
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid batch size', () => {
      const errors = validateRunOptions('npm test', { batchSize: 'invalid' });
      expect(errors).toContain('Batch size must be a positive integer');
    });

    it('should fail with zero batch size', () => {
      const errors = validateRunOptions('npm test', { batchSize: '0' });
      expect(errors).toContain('Batch size must be a positive integer');
    });

    it('should fail with negative batch size', () => {
      const errors = validateRunOptions('npm test', { batchSize: '-5' });
      expect(errors).toContain('Batch size must be a positive integer');
    });
  });

  describe('upload timeout validation', () => {
    it('should pass with valid upload timeout', () => {
      const errors = validateRunOptions('npm test', { uploadTimeout: '30000' });
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid upload timeout', () => {
      const errors = validateRunOptions('npm test', {
        uploadTimeout: 'invalid',
      });
      expect(errors).toContain(
        'Upload timeout must be a positive integer (milliseconds)'
      );
    });

    it('should fail with zero upload timeout', () => {
      const errors = validateRunOptions('npm test', { uploadTimeout: '0' });
      expect(errors).toContain(
        'Upload timeout must be a positive integer (milliseconds)'
      );
    });
  });

  describe('multiple validation errors', () => {
    it('should return all validation errors', () => {
      const errors = validateRunOptions('', {
        port: 'invalid',
        timeout: '500',
        batchSize: '-1',
      });

      expect(errors).toHaveLength(4);
      expect(errors).toContain('Test command is required');
      expect(errors).toContain(
        'Port must be a valid number between 1 and 65535'
      );
      expect(errors).toContain('Timeout must be at least 1000 milliseconds');
      expect(errors).toContain('Batch size must be a positive integer');
    });
  });
});
