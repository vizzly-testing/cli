export let queryKeys = {
  // Auth
  auth: ['auth'],
  authStatus: () => [...queryKeys.auth, 'status'],

  // Config
  config: ['config'],
  projectConfig: () => [...queryKeys.config, 'project'],
  globalConfig: () => [...queryKeys.config, 'global'],

  // TDD (local)
  tdd: ['tdd'],
  reportData: () => [...queryKeys.tdd, 'report'],
  status: () => [...queryKeys.tdd, 'status'],

  // Cloud
  cloud: ['cloud'],
  projects: () => [...queryKeys.cloud, 'projects'],
  builds: (orgSlug, projectSlug) => [
    ...queryKeys.cloud,
    'builds',
    orgSlug,
    projectSlug,
  ],
};
