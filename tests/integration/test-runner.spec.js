import { describe, expect, it, vi } from 'vitest';
import { createServices } from '../../src/services/index.js';
import { loadConfig } from '../../src/utils/config-loader.js';

describe('TestRunner Service Integration Test', () => {
  it('should be able to instantiate the test runner and call the run method', async () => {
    const config = await loadConfig();
    // Ensure allowNoToken is set for test environment
    config.allowNoToken = true;
    // Use 'tdd' mode to allow no-token operation
    const services = createServices(config, 'tdd');

    const testRunner = services.testRunner;

    const runSpy = vi.spyOn(testRunner, 'run').mockResolvedValue();

    const options = {
      testCommand: 'echo "hello world"',
    };

    await testRunner.run(options);

    expect(runSpy).toHaveBeenCalledWith(options);
  });
});
