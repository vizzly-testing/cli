import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default async function setupBrowser(config) {
  if (
    process.platform !== 'darwin' ||
    !config.projects.some(project => project.use.browserName === 'firefox')
  ) {
    return;
  }

  // Firefox also needs app data outside the macOS-protected personal directory.
  // https://bugzilla.mozilla.org/show_bug.cgi?id=2060476#c7
  let appData = await mkdtemp(join(tmpdir(), 'vizzly-firefox-app-data-'));
  let previousAppData = process.env.MOZ_APP_DATA;
  process.env.MOZ_APP_DATA = appData;

  return async () => {
    if (previousAppData === undefined) delete process.env.MOZ_APP_DATA;
    else process.env.MOZ_APP_DATA = previousAppData;
    await rm(appData, { recursive: true, force: true });
  };
}
