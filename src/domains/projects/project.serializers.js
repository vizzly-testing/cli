/** Only expose the local recovery information owned by project selection. */
export function projectSelectionErrorDetails(error) {
  if (error.code !== 'PROJECT_LINK_REQUIRED') return {};
  return {
    scope: error.context?.scope,
    recovery: error.context?.recovery,
  };
}
