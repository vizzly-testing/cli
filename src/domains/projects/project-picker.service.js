import * as output from '../../shared/output.js';
import { createPrompts } from '../../shared/terminal-prompts.js';
import { credentialInfo } from '../auth/credential.rules.js';
import { showCredential } from '../auth/credential-presentation.js';
import { discoverProjects } from './discovery.service.js';
import { createProjectSelectionClient } from './link-target.service.js';

/** A paged selection; selecting a project does not link or issue credentials. */
export async function pickProject(config, options = {}, prompts = null) {
  let { client, credential } = createProjectSelectionClient(config, options);
  showCredential(output, credential);
  let reader = prompts || createPrompts();
  let org = options.org;
  let offset = 0;
  try {
    while (true) {
      let page = await discoverProjects(client, { org, offset, limit: 10 });
      output.labelValue(
        'Upload projects',
        `${page.projects.length} of ${page.pagination.total}`
      );
      if (page.projects.length === 0)
        output.hint('No accessible projects in this view.');
      page.projects.forEach((project, index) => {
        output.print(
          `  ${index + 1}. ${project.organizationSlug}/${project.slug} (${project.name})`
        );
      });
      let actions = [
        page.pagination.nextOffset !== null ? 'n: next page' : null,
        offset > 0 ? 'b: first page' : null,
        'o: filter organization',
        'q: cancel',
      ].filter(Boolean);
      output.hint(actions.join(' · '));
      let answer = await reader.ask('Choose project number or action');
      if (answer === 'q') return null;
      if (answer === 'o') {
        org = await reader.ask('Organization slug (empty for all)');
        offset = 0;
        continue;
      }
      if (answer === 'b') {
        offset = 0;
        continue;
      }
      if (answer === 'n' && page.pagination.nextOffset !== null) {
        offset = page.pagination.nextOffset;
        continue;
      }
      let selected = /^\d+$/.test(answer)
        ? page.projects[Number(answer) - 1]
        : null;
      if (selected) {
        return {
          projectId: selected.id,
          auth: credentialInfo(credential),
          organizationSlug: selected.organizationSlug,
          projectSlug: selected.slug,
        };
      }
      output.hint('Enter a project number or one of the listed actions.');
    }
  } finally {
    if (!prompts) reader.close();
  }
}
