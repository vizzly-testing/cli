import assert from 'node:assert';
import { describe, it } from 'node:test';
import { VizzlyError, AuthError } from '../../src/errors/vizzly-error.js';

describe('errors/vizzly-error', () => {
  describe('VizzlyError', () => {
    it('creates error with message', () => {
      let error = new VizzlyError('Something went wrong');

      assert.strictEqual(error.message, 'Something went wrong');
      assert.strictEqual(error.name, 'VizzlyError');
      assert.strictEqual(error.code, 'VIZZLY_ERROR');
      assert.ok(error instanceof Error);
    });

    it('creates error with custom code', () => {
      let error = new VizzlyError('Error', 'CUSTOM_CODE');

      assert.strictEqual(error.code, 'CUSTOM_CODE');
    });

    it('creates error with context', () => {
      let error = new VizzlyError('Error', 'CODE', { key: 'value' });

      assert.strictEqual(error.context.key, 'value');
    });

    it('has timestamp', () => {
      let error = new VizzlyError('Error');

      assert.ok(error.timestamp);
      assert.ok(new Date(error.timestamp).getTime() > 0);
    });

    it('getUserMessage returns message', () => {
      let error = new VizzlyError('Test message');

      assert.strictEqual(error.getUserMessage(), 'Test message');
    });

    it('toJSON returns error details', () => {
      let error = new VizzlyError('Test', 'TEST_CODE', { foo: 'bar' });
      let json = error.toJSON();

      assert.strictEqual(json.name, 'VizzlyError');
      assert.strictEqual(json.code, 'TEST_CODE');
      assert.strictEqual(json.message, 'Test');
      assert.strictEqual(json.context.foo, 'bar');
      assert.ok(json.timestamp);
      assert.ok(json.stack);
    });
  });

  describe('AuthError', () => {
    it('creates auth error', () => {
      let error = new AuthError('Invalid token');

      assert.strictEqual(error.name, 'AuthError');
      assert.strictEqual(error.code, 'AUTH_ERROR');
      assert.ok(error instanceof VizzlyError);
    });

    it('getUserMessage includes auth instructions', () => {
      let error = new AuthError('Token expired');

      assert.ok(error.getUserMessage().includes('Authentication error'));
      assert.ok(error.getUserMessage().includes('Token expired'));
      assert.ok(error.getUserMessage().includes('VIZZLY_TOKEN'));
    });
  });
});
