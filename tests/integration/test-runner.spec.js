import { describe, it, expect, vi } from 'vitest';
import { createServiceContainer } from '../../src/container/index.js';
import { loadConfig } from '../../src/utils/config-loader.js';

describe('TestRunner Service Integration Test', () => {
  it('should be able to instantiate the test runner and call the run method', async () => {
    const config = await loadConfig();
    const container = await createServiceContainer(config);

    const testRunner = await container.get('testRunner');

    const runSpy = vi.spyOn(testRunner, 'run').mockResolvedValue();

    const options = {
      testCommand: 'echo "hello world"',
    };

    await testRunner.run(options);

    expect(runSpy).toHaveBeenCalledWith(options);
  });
});
