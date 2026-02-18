/**
 * Add a version query param for local image URLs so updated screenshots
 * are re-fetched when report data changes.
 */
export function withImageVersion(url, version) {
  if (!url || typeof url !== 'string') {
    return url;
  }

  // Only rewrite local TDD image paths.
  if (!url.startsWith('/images/')) {
    return url;
  }

  if (version === null || version === undefined) {
    return url;
  }

  let separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(String(version))}`;
}
