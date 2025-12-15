import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  AuthError,
  BuildError,
  ConfigError,
  NetworkError,
  ScreenshotError,
  TimeoutError,
  UploadError,
  ValidationError,
  VizzlyError,
} from '../../src/errors/vizzly-error.js';

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

  // Test all error subclasses
  let errorClasses = [
    {
      Class: ConfigError,
      name: 'ConfigError',
      code: 'CONFIG_ERROR',
      messageIncludes: ['Configuration error', 'vizzly.config.js'],
    },
    {
      Class: AuthError,
      name: 'AuthError',
      code: 'AUTH_ERROR',
      messageIncludes: ['Authentication error', 'VIZZLY_TOKEN'],
    },
    {
      Class: NetworkError,
      name: 'NetworkError',
      code: 'NETWORK_ERROR',
      messageIncludes: ['Network error', 'connection'],
    },
    {
      Class: UploadError,
      name: 'UploadError',
      code: 'UPLOAD_ERROR',
      messageIncludes: ['Upload failed'],
    },
    {
      Class: ScreenshotError,
      name: 'ScreenshotError',
      code: 'SCREENSHOT_ERROR',
      messageIncludes: ['Screenshot error'],
    },
    {
      Class: BuildError,
      name: 'BuildError',
      code: 'BUILD_ERROR',
      messageIncludes: ['Build error'],
    },
  ];

  for (let { Class, name, code, messageIncludes } of errorClasses) {
    describe(name, () => {
      it(`creates ${name} with correct properties`, () => {
        let error = new Class('Test message');

        assert.strictEqual(error.name, name);
        assert.strictEqual(error.code, code);
        assert.strictEqual(error.message, 'Test message');
        assert.ok(error instanceof VizzlyError);
        assert.ok(error instanceof Error);
      });

      it(`${name} accepts context`, () => {
        let error = new Class('Test', { extra: 'data' });

        assert.strictEqual(error.context.extra, 'data');
      });

      it(`${name}.getUserMessage includes expected text`, () => {
        let error = new Class('specific issue');
        let userMessage = error.getUserMessage();

        assert.ok(userMessage.includes('specific issue'));
        for (let text of messageIncludes) {
          assert.ok(
            userMessage.includes(text),
            `Expected "${text}" in "${userMessage}"`
          );
        }
      });
    });
  }

  describe('TimeoutError', () => {
    it('creates TimeoutError with duration', () => {
      let error = new TimeoutError('Operation failed', 5000);

      assert.strictEqual(error.name, 'TimeoutError');
      assert.strictEqual(error.code, 'TIMEOUT_ERROR');
      assert.strictEqual(error.duration, 5000);
      assert.strictEqual(error.context.duration, 5000);
      assert.ok(error instanceof VizzlyError);
    });

    it('TimeoutError accepts context', () => {
      let error = new TimeoutError('Failed', 3000, { operation: 'upload' });

      assert.strictEqual(error.context.operation, 'upload');
      assert.strictEqual(error.context.duration, 3000);
    });

    it('TimeoutError.getUserMessage includes duration', () => {
      let error = new TimeoutError('Upload stalled', 10000);
      let message = error.getUserMessage();

      assert.ok(message.includes('10000ms'));
      assert.ok(message.includes('Upload stalled'));
      assert.ok(message.includes('timed out'));
    });
  });

  describe('ValidationError', () => {
    it('creates ValidationError with errors array', () => {
      let error = new ValidationError('Validation failed', [
        'Field required',
        'Invalid format',
      ]);

      assert.strictEqual(error.name, 'ValidationError');
      assert.strictEqual(error.code, 'VALIDATION_ERROR');
      assert.deepStrictEqual(error.errors, [
        'Field required',
        'Invalid format',
      ]);
      assert.ok(error instanceof VizzlyError);
    });

    it('ValidationError defaults to empty errors array', () => {
      let error = new ValidationError('Failed');

      assert.deepStrictEqual(error.errors, []);
    });

    it('ValidationError accepts context', () => {
      let error = new ValidationError('Failed', [], { field: 'email' });

      assert.strictEqual(error.context.field, 'email');
    });

    it('ValidationError.getUserMessage includes errors when present', () => {
      let error = new ValidationError('Invalid input', [
        'name required',
        'email invalid',
      ]);
      let message = error.getUserMessage();

      assert.ok(message.includes('Invalid input'));
      assert.ok(message.includes('name required'));
      assert.ok(message.includes('email invalid'));
    });

    it('ValidationError.getUserMessage returns message only when no errors', () => {
      let error = new ValidationError('Validation failed');
      let message = error.getUserMessage();

      assert.strictEqual(message, 'Validation failed');
    });
  });
});
