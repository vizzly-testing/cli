import assert from 'node:assert';
import { describe, it } from 'node:test';
import { validateRunOptions } from '../../src/commands/run.js';

describe('validateRunOptions', () => {
  describe('test command validation', () => {
    it('should pass with valid test command', () => {
      let errors = validateRunOptions('npm test', {});
      assert.strictEqual(errors.length, 0);
    });

    it('should fail with empty test command', () => {
      let errors = validateRunOptions('', {});
      assert.ok(errors.includes('Test command is required'));
    });

    it('should fail with null test command', () => {
      let errors = validateRunOptions(null, {});
      assert.ok(errors.includes('Test command is required'));
    });

    it('should fail with whitespace-only test command', () => {
      let errors = validateRunOptions('   ', {});
      assert.ok(errors.includes('Test command is required'));
    });
  });

  describe('port validation', () => {
    it('should pass with valid port', () => {
      let errors = validateRunOptions('npm test', { port: '3000' });
      assert.strictEqual(errors.length, 0);
    });

    it('should fail with invalid port number', () => {
      let errors = validateRunOptions('npm test', { port: 'invalid' });
      assert.ok(
        errors.includes('Port must be a valid number between 1 and 65535')
      );
    });

    it('should fail with port out of range (too low)', () => {
      let errors = validateRunOptions('npm test', { port: '0' });
      assert.ok(
        errors.includes('Port must be a valid number between 1 and 65535')
      );
    });

    it('should fail with port out of range (too high)', () => {
      let errors = validateRunOptions('npm test', { port: '65536' });
      assert.ok(
        errors.includes('Port must be a valid number between 1 and 65535')
      );
    });
  });

  describe('timeout validation', () => {
    it('should pass with valid timeout', () => {
      let errors = validateRunOptions('npm test', { timeout: '5000' });
      assert.strictEqual(errors.length, 0);
    });

    it('should fail with invalid timeout', () => {
      let errors = validateRunOptions('npm test', { timeout: 'invalid' });
      assert.ok(errors.includes('Timeout must be at least 1000 milliseconds'));
    });

    it('should fail with timeout too low', () => {
      let errors = validateRunOptions('npm test', { timeout: '500' });
      assert.ok(errors.includes('Timeout must be at least 1000 milliseconds'));
    });
  });

  describe('batch size validation', () => {
    it('should pass with valid batch size', () => {
      let errors = validateRunOptions('npm test', { batchSize: '10' });
      assert.strictEqual(errors.length, 0);
    });

    it('should fail with invalid batch size', () => {
      let errors = validateRunOptions('npm test', { batchSize: 'invalid' });
      assert.ok(errors.includes('Batch size must be a positive integer'));
    });

    it('should fail with zero batch size', () => {
      let errors = validateRunOptions('npm test', { batchSize: '0' });
      assert.ok(errors.includes('Batch size must be a positive integer'));
    });

    it('should fail with negative batch size', () => {
      let errors = validateRunOptions('npm test', { batchSize: '-5' });
      assert.ok(errors.includes('Batch size must be a positive integer'));
    });
  });

  describe('upload timeout validation', () => {
    it('should pass with valid upload timeout', () => {
      let errors = validateRunOptions('npm test', { uploadTimeout: '30000' });
      assert.strictEqual(errors.length, 0);
    });

    it('should fail with invalid upload timeout', () => {
      let errors = validateRunOptions('npm test', {
        uploadTimeout: 'invalid',
      });
      assert.ok(
        errors.includes(
          'Upload timeout must be a positive integer (milliseconds)'
        )
      );
    });

    it('should fail with zero upload timeout', () => {
      let errors = validateRunOptions('npm test', { uploadTimeout: '0' });
      assert.ok(
        errors.includes(
          'Upload timeout must be a positive integer (milliseconds)'
        )
      );
    });
  });

  describe('multiple validation errors', () => {
    it('should return all validation errors', () => {
      let errors = validateRunOptions('', {
        port: 'invalid',
        timeout: '500',
        batchSize: '-1',
      });

      assert.strictEqual(errors.length, 4);
      assert.ok(errors.includes('Test command is required'));
      assert.ok(
        errors.includes('Port must be a valid number between 1 and 65535')
      );
      assert.ok(errors.includes('Timeout must be at least 1000 milliseconds'));
      assert.ok(errors.includes('Batch size must be a positive integer'));
    });
  });
});
