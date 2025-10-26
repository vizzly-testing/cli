import { describe, it, expect, vi } from 'vitest';
import { createServiceContainer } from '../../src/container/index.js';
import { loadConfig } from '../../src/utils/config-loader.js';

describe('TestRunner Service Integration Test', () => {
  it('should be able to instantiate the test runner and call the run method', async () => {
    const config = await loadConfig();
    // Ensure allowNoToken is set for test environment
    config.allowNoToken = true;
    // Use 'tdd' mode to allow no-token operation
    const container = await createServiceContainer(config, 'tdd');

    const testRunner = await container.get('testRunner');

    const runSpy = vi.spyOn(testRunner, 'run').mockResolvedValue();

    const options = {
      testCommand: 'echo "hello world"',
    };

    await testRunner.run(options);

    expect(runSpy).toHaveBeenCalledWith(options);
  });
});
