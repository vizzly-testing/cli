import assert from 'node:assert';
import { describe, it } from 'node:test';
import { validateTddOptions } from '../../src/commands/tdd.js';

describe('commands/tdd', () => {
  describe('validateTddOptions', () => {
    it('accepts valid command, port, timeout, and comparison options', () => {
      let errors = validateTddOptions('pnpm test', {
        port: '3000',
        timeout: '5000',
        threshold: '2',
        minClusterSize: '2',
      });

      assert.deepStrictEqual(errors, []);
    });

    it('reports invalid command, port, and timeout values', () => {
      let errors = validateTddOptions('', {
        port: 'invalid',
        timeout: '500',
      });

      assert.deepStrictEqual(errors, [
        'Test command is required',
        'Port must be a valid number between 1 and 65535',
        'Timeout must be at least 1000 milliseconds',
      ]);
    });

    it('rejects invalid thresholds, including trailing text and negatives', () => {
      let errors = validateTddOptions('pnpm test', {
        threshold: '2abc',
      });

      assert.deepStrictEqual(errors, [
        'Threshold must be a non-negative number (CIEDE2000 Delta E)',
      ]);

      assert.deepStrictEqual(
        validateTddOptions('pnpm test', { threshold: '-0.1' }),
        ['Threshold must be a non-negative number (CIEDE2000 Delta E)']
      );
    });

    it('rejects non-positive or fractional minimum cluster sizes', () => {
      let invalidValues = ['0', '2.5', '-1'];

      for (let value of invalidValues) {
        assert.deepStrictEqual(
          validateTddOptions('pnpm test', { minClusterSize: value }),
          ['Min cluster size must be a positive integer']
        );
      }
    });
  });
});
