import assert from 'node:assert';
import { describe, it } from 'node:test';
import { resolveContextSource } from '../../src/context/provider-resolver.js';

describe('context/provider-resolver', () => {
  it('returns cloud when the source is explicitly cloud', () => {
    let source = resolveContextSource(
      { requestedSource: 'cloud', command: 'build', target: 'build-1' },
      {
        createLocalWorkspaceContextProvider: () => {
          throw new Error('local provider should not be created');
        },
      }
    );

    assert.strictEqual(source, 'cloud');
  });

  it('throws when local source is requested but no workspace context exists', () => {
    assert.throws(
      () =>
        resolveContextSource(
          { requestedSource: 'local', command: 'build', target: 'current' },
          {
            createLocalWorkspaceContextProvider: () => ({
              isAvailable: () => false,
              canHandle: () => false,
            }),
          }
        ),
      error => {
        assert.strictEqual(error.code, 'LOCAL_WORKSPACE_CONTEXT');
        assert.match(error.message, /No local workspace context found/);
        return true;
      }
    );
  });

  it('prefers local context in auto mode when the workspace can answer the query', () => {
    let source = resolveContextSource(
      { requestedSource: 'auto', command: 'screenshot', target: 'Dashboard' },
      {
        createLocalWorkspaceContextProvider: () => ({
          isAvailable: () => true,
          canHandle: (command, target) =>
            command === 'screenshot' && target === 'Dashboard',
        }),
      }
    );

    assert.strictEqual(source, 'local');
  });

  it('falls back to cloud in auto mode when the workspace cannot answer the query', () => {
    let source = resolveContextSource(
      { requestedSource: 'auto', command: 'similar', target: 'fp-dashboard' },
      {
        createLocalWorkspaceContextProvider: () => ({
          isAvailable: () => true,
          canHandle: () => false,
        }),
      }
    );

    assert.strictEqual(source, 'cloud');
  });
});
