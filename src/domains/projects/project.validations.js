export function parseProjectSelector(selector, options = {}) {
  let organizationSlug = options.org || null;
  let projectSlug = options.project || null;

  if (selector) {
    let parts = selector.split('/');
    if (parts.length === 2) {
      organizationSlug = organizationSlug || parts[0];
      projectSlug = projectSlug || parts[1];
    } else if (parts.length === 1) {
      projectSlug = projectSlug || parts[0];
    }
  }

  return { organizationSlug, projectSlug };
}

export function validateProjectLinkOptions(selector, options = {}) {
  let errors = [];
  let { organizationSlug, projectSlug } = parseProjectSelector(
    selector,
    options
  );

  if (!organizationSlug) {
    errors.push(
      'Organization is required. Use <org>/<project> or --org <slug>.'
    );
  }
  if (!projectSlug) {
    errors.push(
      'Project is required. Use <org>/<project> or --project <slug>.'
    );
  }

  return errors;
}
