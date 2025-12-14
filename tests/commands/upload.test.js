import assert from 'node:assert';
import { describe, it } from 'node:test';
import { validateUploadOptions } from '../../src/commands/upload.js';

describe('validateUploadOptions', () => {
  describe('screenshots path validation', () => {
    it('should pass with valid screenshots path', () => {
      let errors = validateUploadOptions('./screenshots', {});
      assert.strictEqual(errors.length, 0);
    });

    it('should fail with missing screenshots path', () => {
      let errors = validateUploadOptions(null, {});
      assert.ok(errors.includes('Screenshots path is required'));
    });

    it('should fail with empty screenshots path', () => {
      let errors = validateUploadOptions('', {});
      assert.ok(errors.includes('Screenshots path is required'));
    });
  });

  describe('metadata validation', () => {
    it('should pass with valid JSON metadata', () => {
      let errors = validateUploadOptions('./screenshots', {
        metadata: '{"version": "1.0.0"}',
      });
      assert.strictEqual(errors.length, 0);
    });

    it('should fail with invalid JSON metadata', () => {
      let errors = validateUploadOptions('./screenshots', {
        metadata: 'invalid-json',
      });
      assert.ok(errors.includes('Invalid JSON in --metadata option'));
    });

    it('should pass when metadata is not provided', () => {
      let errors = validateUploadOptions('./screenshots', {});
      assert.strictEqual(errors.length, 0);
    });
  });

  describe('threshold validation', () => {
    it('should pass with valid threshold', () => {
      let errors = validateUploadOptions('./screenshots', {
        threshold: '0.1',
      });
      assert.strictEqual(errors.length, 0);
    });

    it('should pass with threshold of 0', () => {
      let errors = validateUploadOptions('./screenshots', { threshold: '0' });
      assert.strictEqual(errors.length, 0);
    });

    it('should pass with threshold of 1', () => {
      let errors = validateUploadOptions('./screenshots', { threshold: '1' });
      assert.strictEqual(errors.length, 0);
    });

    it('should fail with invalid threshold', () => {
      let errors = validateUploadOptions('./screenshots', {
        threshold: 'invalid',
      });
      assert.ok(
        errors.includes(
          'Threshold must be a non-negative number (CIEDE2000 Delta E)'
        )
      );
    });

    it('should fail with threshold below 0', () => {
      let errors = validateUploadOptions('./screenshots', {
        threshold: '-0.1',
      });
      assert.ok(
        errors.includes(
          'Threshold must be a non-negative number (CIEDE2000 Delta E)'
        )
      );
    });

    it('should pass with threshold above 1 (CIEDE2000 allows values > 1)', () => {
      let errors = validateUploadOptions('./screenshots', {
        threshold: '2.0',
      });
      assert.strictEqual(errors.length, 0);
    });
  });

  describe('batch size validation', () => {
    it('should pass with valid batch size', () => {
      let errors = validateUploadOptions('./screenshots', {
        batchSize: '10',
      });
      assert.strictEqual(errors.length, 0);
    });

    it('should fail with invalid batch size', () => {
      let errors = validateUploadOptions('./screenshots', {
        batchSize: 'invalid',
      });
      assert.ok(errors.includes('Batch size must be a positive integer'));
    });

    it('should fail with zero batch size', () => {
      let errors = validateUploadOptions('./screenshots', { batchSize: '0' });
      assert.ok(errors.includes('Batch size must be a positive integer'));
    });

    it('should fail with negative batch size', () => {
      let errors = validateUploadOptions('./screenshots', {
        batchSize: '-5',
      });
      assert.ok(errors.includes('Batch size must be a positive integer'));
    });
  });

  describe('upload timeout validation', () => {
    it('should pass with valid upload timeout', () => {
      let errors = validateUploadOptions('./screenshots', {
        uploadTimeout: '30000',
      });
      assert.strictEqual(errors.length, 0);
    });

    it('should fail with invalid upload timeout', () => {
      let errors = validateUploadOptions('./screenshots', {
        uploadTimeout: 'invalid',
      });
      assert.ok(
        errors.includes(
          'Upload timeout must be a positive integer (milliseconds)'
        )
      );
    });

    it('should fail with zero upload timeout', () => {
      let errors = validateUploadOptions('./screenshots', {
        uploadTimeout: '0',
      });
      assert.ok(
        errors.includes(
          'Upload timeout must be a positive integer (milliseconds)'
        )
      );
    });
  });

  describe('multiple validation errors', () => {
    it('should return all validation errors', () => {
      let errors = validateUploadOptions(null, {
        metadata: 'invalid-json',
        threshold: '-1',
        batchSize: '-1',
        uploadTimeout: '0',
      });

      assert.strictEqual(errors.length, 5);
      assert.ok(errors.includes('Screenshots path is required'));
      assert.ok(errors.includes('Invalid JSON in --metadata option'));
      assert.ok(
        errors.includes(
          'Threshold must be a non-negative number (CIEDE2000 Delta E)'
        )
      );
      assert.ok(errors.includes('Batch size must be a positive integer'));
      assert.ok(
        errors.includes(
          'Upload timeout must be a positive integer (milliseconds)'
        )
      );
    });
  });
});
