function buildSourceErrorMessage() {
  return '--source must be one of: auto, cloud, local';
}

function buildIncludeErrorMessage() {
  return '--include must contain only: diffs';
}

function validateLimitRange(value, flagName, { min = 1, max }) {
  if (value == null) {
    return [];
  }

  if (!Number.isInteger(value) || value < min || value > max) {
    return [`${flagName} must be an integer between ${min} and ${max}`];
  }

  return [];
}

function validateCursor(value) {
  if (value == null) {
    return [];
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return ['--cursor must be a non-empty opaque cursor'];
  }

  return [];
}

function validateOffset(value) {
  if (value == null) return [];
  if (!Number.isInteger(value) || value < 0) {
    return ['--offset must be a non-negative integer'];
  }
  return [];
}

function validateSourceOption(value) {
  if (value == null) {
    return [];
  }

  if (!['auto', 'cloud', 'local'].includes(value)) {
    return [buildSourceErrorMessage()];
  }

  return [];
}

export function parseIncludeOption(value) {
  if (!value) {
    return [];
  }

  let rawItems = Array.isArray(value) ? value : String(value).split(',');
  return rawItems.map(item => item.trim()).filter(Boolean);
}

function validateIncludeOption(value) {
  let allowed = new Set(['diffs']);
  let invalid = parseIncludeOption(value).filter(item => !allowed.has(item));

  return invalid.length > 0 ? [buildIncludeErrorMessage()] : [];
}

function validateScopedProjectOptions(options = {}) {
  let errors = [];

  if (options.org && !options.project) {
    errors.push('--org requires --project');
  }

  return errors;
}

export function validateContextBuildOptions(_options = {}) {
  let errors = validateSourceOption(_options.source);
  errors.push(...validateIncludeOption(_options.include));
  errors.push(...validateCursor(_options.cursor));
  return errors;
}

export function validateContextComparisonOptions(options = {}) {
  let errors = [];
  errors.push(...validateSourceOption(options.source));
  errors.push(...validateIncludeOption(options.include));
  errors.push(...validateCursor(options.cursor));
  return errors;
}

export function validateContextScreenshotOptions(options = {}) {
  let errors = validateScopedProjectOptions(options);
  errors.push(...validateSourceOption(options.source));
  errors.push(
    ...validateLimitRange(options.recentLimit, '--recent-limit', {
      max: 50,
    })
  );
  return errors;
}

export function validateContextSimilarOptions(options = {}) {
  let errors = validateScopedProjectOptions(options);
  errors.push(...validateSourceOption(options.source));
  errors.push(...validateLimitRange(options.limit, '--limit', { max: 50 }));
  return errors;
}

export function validateContextReviewQueueOptions(options = {}) {
  let errors = validateScopedProjectOptions(options);
  errors.push(...validateSourceOption(options.source));
  errors.push(...validateLimitRange(options.limit, '--limit', { max: 100 }));
  errors.push(...validateOffset(options.offset));
  return errors;
}
