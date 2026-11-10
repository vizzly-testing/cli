import * as defaultOutput from '../../shared/output.js';
import { VizzlyError } from '../../shared/vizzly-error.js';
import { showCredential } from '../auth/credential-presentation.js';
import { loadConfig as defaultLoadConfig } from '../config/config-loader.js';
import { getApiUrl as defaultGetApiUrl } from '../config/environment.js';
import {
  findDirectoryProjectLink,
  writeDirectoryProjectLink,
} from './directory-link.service.js';
import { validateProjectApiOrigin } from './directory-link.validations.js';
import { resolveDirectoryProjectLinkScope } from './directory-link-scope.js';
import { resolveLinkTarget } from './link-target.service.js';
import { parseLinkTarget } from './project.validations.js';
import { pickProject } from './project-picker.service.js';

function linkRecovery(directory) {
  return [
    { argv: ['vizzly', 'projects', '--json'] },
    {
      argv: [
        'vizzly',
        'project',
        'link',
        '<org>/<project>',
        '--directory',
        directory,
      ],
    },
  ];
}

export async function projectLinkCommand(
  selector,
  options = {},
  globalOptions = {},
  deps = {}
) {
  let {
    getApiUrl = defaultGetApiUrl,
    loadConfig = defaultLoadConfig,
    output = defaultOutput,
    exit = code => process.exit(code),
  } = deps;
  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  let scope;
  try {
    if (options.name || options.expiresAt) {
      throw new VizzlyError(
        'Project linking saves an upload destination. Create automation tokens in the project API token settings.',
        'PROJECT_TOKEN_OPTIONS_UNSUPPORTED'
      );
    }
    let target = parseLinkTarget(selector, options);
    scope = await resolveDirectoryProjectLinkScope({
      directory: options.directory,
    });
    if (
      !target &&
      (globalOptions.json ||
        !process.stdin.isTTY ||
        !process.stdout.isTTY ||
        process.env.CI)
    ) {
      throw new VizzlyError(
        'Choose a project: vizzly project link <org>/<project> or a project UUID. Run vizzly projects to discover accessible projects, or run project link interactively.',
        'PROJECT_LINK_REQUIRED',
        { candidates: [] }
      );
    }

    // UUIDs are a local selection. Only an explicitly requested config needs
    // evaluation; saving a known destination never needs login or discovery.
    let config;
    if (!target?.projectId || globalOptions.config) {
      config = await loadConfig(globalOptions.config, {
        ...globalOptions,
        cwd: scope.directory,
        _ignoreProjectBinding: true,
      });
    }
    let apiOrigin = validateProjectApiOrigin(config?.apiUrl || getApiUrl());
    let existing = await findDirectoryProjectLink({
      directory: scope.directory,
    });
    let verified = false;
    if (!target) {
      target = await pickProject(config, {
        ...globalOptions,
        ...options,
      });
      if (!target) {
        output.hint('Project selection cancelled; no files changed.');
        output.cleanup();
        return { linked: false, reason: 'cancelled' };
      }
      verified = true;
    } else if (!target.projectId) {
      target = await resolveLinkTarget(config, target, {
        ...globalOptions,
        ...options,
      });
      if (!globalOptions.json) showCredential(output, target.auth);
      verified = true;
    }
    let written = await writeDirectoryProjectLink({
      directory: scope.directory,
      binding: { version: 1, apiOrigin, projectId: target.projectId },
      expectedBefore: existing.source,
    });
    let result = {
      linked: true,
      changed: written.status === 'written',
      projectId: written.binding.projectId,
      apiOrigin,
      directory: scope.directory,
      scope: { directory: scope.directory, root: scope.root },
      path: written.path,
      previous: written.previous,
      verification: verified ? 'verified' : 'unverified',
      ...(target.organizationSlug
        ? {
            organizationSlug: target.organizationSlug,
            projectSlug: target.projectSlug,
          }
        : {}),
      ...(target.auth ? { auth: target.auth } : {}),
    };
    if (globalOptions.json) output.data(result);
    else {
      let label = target.organizationSlug
        ? `${target.organizationSlug}/${target.projectSlug}`
        : result.projectId;
      output.complete(
        result.changed ? `Linked ${label}` : `Already linked to ${label}`
      );
      output.labelValue('Directory', scope.directory);
      output.labelValue('Project file', written.path);
      if (written.previous && result.changed) {
        output.labelValue('Previous project', written.previous.projectId);
      }
      output.hint('Commit vizzly.project.json to share this destination.');
      if (!verified) {
        output.hint(
          'Saved locally. Vizzly checks project access when you run a cloud command.'
        );
      }
    }
    output.cleanup();
    return result;
  } catch (error) {
    if (error.code === 'PROMPT_CANCELLED') {
      output.hint('Project selection cancelled; no files changed.');
      output.cleanup();
      exit(130);
      return { linked: false, reason: 'cancelled' };
    }
    let context = Object.fromEntries(
      [
        'candidates',
        'path',
        'directory',
        'root',
        'apiOrigin',
        'linkedApiOrigin',
      ]
        .filter(key => error.context?.[key] !== undefined)
        .map(key => [key, error.context[key]])
    );
    let recovery = scope ? linkRecovery(scope.directory) : [];
    if (error.code === 'PROJECT_LINK_DIRECTORY_REQUIRED') {
      recovery = [
        {
          argv: [
            'vizzly',
            'project',
            'link',
            selector || '<org>/<project>',
            '--directory',
            '<package-directory>',
          ],
        },
      ];
    }
    output.error('Failed to link project', error, {
      ...context,
      ...(scope ? { directory: scope.directory, scope } : {}),
      recovery,
    });
    output.cleanup();
    exit(1);
    return {
      linked: false,
      reason: error.code === 'LOGIN_REQUIRED' ? 'auth_required' : 'link_failed',
    };
  }
}
