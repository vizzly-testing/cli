import assert from 'node:assert';
import { describe, it } from 'node:test';
import { validateTddOptions } from '../../src/commands/tdd.js';

describe('validateTddOptions', () => {
  describe('test command validation', () => {
    it('should pass with valid test command', () => {
      let errors = validateTddOptions('npm test', {});
      assert.strictEqual(errors.length, 0);
    });

    it('should fail with empty test command', () => {
      let errors = validateTddOptions('', {});
      assert.ok(errors.includes('Test command is required'));
    });

    it('should fail with null test command', () => {
      let errors = validateTddOptions(null, {});
      assert.ok(errors.includes('Test command is required'));
    });

    it('should fail with whitespace-only test command', () => {
      let errors = validateTddOptions('   ', {});
      assert.ok(errors.includes('Test command is required'));
    });
  });

  describe('port validation', () => {
    it('should pass with valid port', () => {
      let errors = validateTddOptions('npm test', { port: '3000' });
      assert.strictEqual(errors.length, 0);
    });

    it('should fail with invalid port number', () => {
      let errors = validateTddOptions('npm test', { port: 'invalid' });
      assert.ok(
        errors.includes('Port must be a valid number between 1 and 65535')
      );
    });

    it('should fail with port out of range (too low)', () => {
      let errors = validateTddOptions('npm test', { port: '0' });
      assert.ok(
        errors.includes('Port must be a valid number between 1 and 65535')
      );
    });

    it('should fail with port out of range (too high)', () => {
      let errors = validateTddOptions('npm test', { port: '65536' });
      assert.ok(
        errors.includes('Port must be a valid number between 1 and 65535')
      );
    });
  });

  describe('timeout validation', () => {
    it('should pass with valid timeout', () => {
      let errors = validateTddOptions('npm test', { timeout: '5000' });
      assert.strictEqual(errors.length, 0);
    });

    it('should fail with invalid timeout', () => {
      let errors = validateTddOptions('npm test', { timeout: 'invalid' });
      assert.ok(errors.includes('Timeout must be at least 1000 milliseconds'));
    });

    it('should fail with timeout too low', () => {
      let errors = validateTddOptions('npm test', { timeout: '500' });
      assert.ok(errors.includes('Timeout must be at least 1000 milliseconds'));
    });
  });

  describe('threshold validation', () => {
    it('should pass with valid threshold', () => {
      let errors = validateTddOptions('npm test', { threshold: '0.1' });
      assert.strictEqual(errors.length, 0);
    });

    it('should pass with threshold of 0', () => {
      let errors = validateTddOptions('npm test', { threshold: '0' });
      assert.strictEqual(errors.length, 0);
    });

    it('should pass with threshold of 1', () => {
      let errors = validateTddOptions('npm test', { threshold: '1' });
      assert.strictEqual(errors.length, 0);
    });

    it('should fail with invalid threshold', () => {
      let errors = validateTddOptions('npm test', { threshold: 'invalid' });
      assert.ok(
        errors.includes(
          'Threshold must be a non-negative number (CIEDE2000 Delta E)'
        )
      );
    });

    it('should fail with threshold below 0', () => {
      let errors = validateTddOptions('npm test', { threshold: '-0.1' });
      assert.ok(
        errors.includes(
          'Threshold must be a non-negative number (CIEDE2000 Delta E)'
        )
      );
    });

    it('should pass with threshold above 1 (CIEDE2000 allows values > 1)', () => {
      let errors = validateTddOptions('npm test', { threshold: '2.0' });
      assert.strictEqual(errors.length, 0);
    });
  });

  describe('multiple validation errors', () => {
    it('should return all validation errors', () => {
      let errors = validateTddOptions('', {
        port: 'invalid',
        timeout: '500',
        threshold: '-1',
      });

      assert.strictEqual(errors.length, 4);
      assert.ok(errors.includes('Test command is required'));
      assert.ok(
        errors.includes('Port must be a valid number between 1 and 65535')
      );
      assert.ok(errors.includes('Timeout must be at least 1000 milliseconds'));
      assert.ok(
        errors.includes(
          'Threshold must be a non-negative number (CIEDE2000 Delta E)'
        )
      );
    });
  });
});
