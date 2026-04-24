import { ValidationError } from '../errors/vizzly-error.js';

export let MISSING_TARGET_MESSAGE =
  'This command needs a target project. Pass --org and --project, use --project-id, or add target to vizzly.config.js.';

function cleanString(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  let trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function extractExplicitTarget(options = {}) {
  let projectId = cleanString(options.projectId);
  let organizationSlug = cleanString(options.org);
  let projectSlug = cleanString(options.project);

  if (projectId) {
    return { projectId };
  }

  if (organizationSlug && projectSlug) {
    return { organizationSlug, projectSlug };
  }

  return null;
}

export function isProjectToken(apiKey) {
  return typeof apiKey === 'string' && apiKey.startsWith('vzt_');
}

export function validateTargetOptions(options = {}) {
  let errors = [];
  let projectId = cleanString(options.projectId);
  let organizationSlug = cleanString(options.org);
  let projectSlug = cleanString(options.project);

  if (projectId) {
    return errors;
  }

  if (projectSlug && !organizationSlug) {
    errors.push(
      '--project requires --org. Pass both --org and --project, or use --project-id.'
    );
  }

  if (organizationSlug && !projectSlug) {
    errors.push(
      '--org requires --project. Pass both --org and --project, or use --project-id.'
    );
  }

  return errors;
}

export function normalizeTarget(target = {}) {
  if (!target || typeof target !== 'object') {
    return null;
  }

  let projectId = cleanString(target.projectId || target.id);
  let organizationSlug = cleanString(
    target.organizationSlug || target.organization?.slug || target.organization
  );
  let projectSlug = cleanString(
    target.projectSlug || target.project?.slug || target.project
  );

  if (projectId) {
    return { projectId };
  }

  if (organizationSlug && projectSlug) {
    return { organizationSlug, projectSlug };
  }

  return null;
}

export function resolveTargetFromSources({
  options = {},
  configTarget = null,
  tokenContext = null,
} = {}) {
  let explicitTarget = extractExplicitTarget(options);
  if (explicitTarget) {
    return {
      source: explicitTarget.projectId ? 'flag:project-id' : 'flag:slug',
      target: explicitTarget,
    };
  }

  let normalizedConfigTarget = normalizeTarget(configTarget);
  if (normalizedConfigTarget) {
    return { source: 'config', target: normalizedConfigTarget };
  }

  let normalizedTokenTarget = normalizeTarget(tokenContext);
  if (normalizedTokenTarget) {
    return { source: 'token-context', target: normalizedTokenTarget };
  }

  return null;
}

export async function resolveProjectTarget({
  command = 'command',
  options = {},
  config = {},
  requireTarget = true,
} = {}) {
  let validationErrors = validateTargetOptions(options);
  if (validationErrors.length > 0) {
    throw new ValidationError('Invalid target options', validationErrors, {
      command,
    });
  }

  let resolvedTarget = resolveTargetFromSources({
    options,
    configTarget: config.target,
  });

  if (resolvedTarget) {
    return resolvedTarget;
  }

  if (isProjectToken(config.apiKey)) {
    return {
      source: 'project-token',
      target: null,
    };
  }

  if (!requireTarget) {
    return null;
  }

  throw new ValidationError(MISSING_TARGET_MESSAGE, [], {
    command,
  });
}
