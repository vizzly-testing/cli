import { describe, it, expect } from 'vitest';
import { validateUploadOptions } from '../../src/commands/upload.js';

describe('validateUploadOptions', () => {
  describe('screenshots path validation', () => {
    it('should pass with valid screenshots path', () => {
      const errors = validateUploadOptions('./screenshots', {});
      expect(errors).toHaveLength(0);
    });

    it('should fail with missing screenshots path', () => {
      const errors = validateUploadOptions(null, {});
      expect(errors).toContain('Screenshots path is required');
    });

    it('should fail with empty screenshots path', () => {
      const errors = validateUploadOptions('', {});
      expect(errors).toContain('Screenshots path is required');
    });
  });

  describe('metadata validation', () => {
    it('should pass with valid JSON metadata', () => {
      const errors = validateUploadOptions('./screenshots', {
        metadata: '{"version": "1.0.0"}',
      });
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid JSON metadata', () => {
      const errors = validateUploadOptions('./screenshots', {
        metadata: 'invalid-json',
      });
      expect(errors).toContain('Invalid JSON in --metadata option');
    });

    it('should pass when metadata is not provided', () => {
      const errors = validateUploadOptions('./screenshots', {});
      expect(errors).toHaveLength(0);
    });
  });

  describe('threshold validation', () => {
    it('should pass with valid threshold', () => {
      const errors = validateUploadOptions('./screenshots', {
        threshold: '0.1',
      });
      expect(errors).toHaveLength(0);
    });

    it('should pass with threshold of 0', () => {
      const errors = validateUploadOptions('./screenshots', { threshold: '0' });
      expect(errors).toHaveLength(0);
    });

    it('should pass with threshold of 1', () => {
      const errors = validateUploadOptions('./screenshots', { threshold: '1' });
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid threshold', () => {
      const errors = validateUploadOptions('./screenshots', {
        threshold: 'invalid',
      });
      expect(errors).toContain('Threshold must be a number between 0 and 1');
    });

    it('should fail with threshold below 0', () => {
      const errors = validateUploadOptions('./screenshots', {
        threshold: '-0.1',
      });
      expect(errors).toContain('Threshold must be a number between 0 and 1');
    });

    it('should fail with threshold above 1', () => {
      const errors = validateUploadOptions('./screenshots', {
        threshold: '1.1',
      });
      expect(errors).toContain('Threshold must be a number between 0 and 1');
    });
  });

  describe('batch size validation', () => {
    it('should pass with valid batch size', () => {
      const errors = validateUploadOptions('./screenshots', {
        batchSize: '10',
      });
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid batch size', () => {
      const errors = validateUploadOptions('./screenshots', {
        batchSize: 'invalid',
      });
      expect(errors).toContain('Batch size must be a positive integer');
    });

    it('should fail with zero batch size', () => {
      const errors = validateUploadOptions('./screenshots', { batchSize: '0' });
      expect(errors).toContain('Batch size must be a positive integer');
    });

    it('should fail with negative batch size', () => {
      const errors = validateUploadOptions('./screenshots', {
        batchSize: '-5',
      });
      expect(errors).toContain('Batch size must be a positive integer');
    });
  });

  describe('upload timeout validation', () => {
    it('should pass with valid upload timeout', () => {
      const errors = validateUploadOptions('./screenshots', {
        uploadTimeout: '30000',
      });
      expect(errors).toHaveLength(0);
    });

    it('should fail with invalid upload timeout', () => {
      const errors = validateUploadOptions('./screenshots', {
        uploadTimeout: 'invalid',
      });
      expect(errors).toContain(
        'Upload timeout must be a positive integer (milliseconds)'
      );
    });

    it('should fail with zero upload timeout', () => {
      const errors = validateUploadOptions('./screenshots', {
        uploadTimeout: '0',
      });
      expect(errors).toContain(
        'Upload timeout must be a positive integer (milliseconds)'
      );
    });
  });

  describe('multiple validation errors', () => {
    it('should return all validation errors', () => {
      const errors = validateUploadOptions(null, {
        metadata: 'invalid-json',
        threshold: '2',
        batchSize: '-1',
        uploadTimeout: '0',
      });

      expect(errors).toHaveLength(5);
      expect(errors).toContain('Screenshots path is required');
      expect(errors).toContain('Invalid JSON in --metadata option');
      expect(errors).toContain('Threshold must be a number between 0 and 1');
      expect(errors).toContain('Batch size must be a positive integer');
      expect(errors).toContain(
        'Upload timeout must be a positive integer (milliseconds)'
      );
    });
  });
});
