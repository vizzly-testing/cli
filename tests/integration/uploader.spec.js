import { describe, it, expect, vi } from 'vitest';
import { createServiceContainer } from '../../src/container/index.js';
import { loadConfig } from '../../src/utils/config-loader.js';

describe('Uploader Service Integration Test', () => {
  it('should be able to instantiate the uploader and call the upload method', async () => {
    const config = await loadConfig();
    const container = await createServiceContainer(config);

    const uploader = await container.get('uploader');

    const uploadSpy = vi.spyOn(uploader, 'upload').mockResolvedValue();

    const flags = {
      path: './screenshots',
      buildName: 'test-build',
    };

    await uploader.upload(flags);

    expect(uploadSpy).toHaveBeenCalledWith(flags);
  });
});
