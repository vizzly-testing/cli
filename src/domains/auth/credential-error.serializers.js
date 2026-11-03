/** Permission metadata is safe to include alongside a command's JSON error. */
export function scopeErrorDetails(error) {
  if (error.code !== 'INSUFFICIENT_SCOPE') return {};
  let names = value =>
    Array.isArray(value)
      ? value.filter(scope => typeof scope === 'string')
      : [];
  return {
    requiredScopes: names(error.context?.requiredScopes),
    grantedScopes: names(error.context?.grantedScopes),
  };
}
