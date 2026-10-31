export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createWildcardMatcher(pattern, options = {}) {
  let { anchored = false } = options;
  let regexPattern = String(pattern).split('*').map(escapeRegExp).join('.*');
  if (anchored) {
    regexPattern = `^${regexPattern}$`;
  }
  let regex = new RegExp(regexPattern, 'i');
  return value => regex.test(String(value));
}
