import { createUserSession } from '../auth/auth.service.js';
import { createApiClient } from '../auth/cloud-client.js';
import { createTokenStore } from '../auth/token-store.js';
import { getTddBaselines } from '../baselines/cloud-baselines.js';
import { getBuilds } from '../builds/build.service.js';
import { getApiUrl } from '../config/environment.js';
import { discoverProjects } from './discovery.service.js';

/** Read project, build, and baseline data using the selected user session. */
export function createProjectService(options = {}) {
  let apiUrl = options.apiUrl || getApiUrl();
  let tokenStore = createTokenStore({ apiUrl });

  function createSession() {
    return createUserSession({
      baseUrl: apiUrl,
      command: 'projects',
      tokenStore,
    });
  }

  function createClient(session = createSession()) {
    return createApiClient({
      baseUrl: apiUrl,
      allowNoToken: true,
      command: 'reporter',
      credential: { session },
    });
  }

  async function hasSavedSession() {
    return Boolean((await tokenStore.getTokens())?.accessToken);
  }

  return {
    hasSavedSession,

    async listProjects() {
      if (!(await hasSavedSession())) return [];
      let page = await discoverProjects(createClient(), {
        limit: 250,
        offset: 0,
      });
      return page.projects;
    },

    async getRecentBuilds(projectSlug, organizationSlug, options = {}) {
      if (!(await hasSavedSession())) return [];
      let page = await getBuilds(createClient(), {
        organization: organizationSlug,
        project: projectSlug,
        limit: options.limit ?? 20,
        offset: 0,
        branch: options.branch,
      });
      return page.builds;
    },

    async getTddBaselines(buildId) {
      let session = createSession();
      if (!(await hasSavedSession())) {
        throw session.loginRequired();
      }
      return getTddBaselines(createClient(session), buildId);
    },
  };
}
