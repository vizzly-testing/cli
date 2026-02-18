/**
 * Add a version query param for local image URLs so updated screenshots
 * are re-fetched when report data changes.
 *
 * This is a no-op for non-local URLs.
 */
export let LOCAL_IMAGE_PREFIX = '/images/';

export function withImageVersion(url, version) {
  if (!url || typeof url !== 'string') {
    return url;
  }

  // Only rewrite local TDD image paths.
  if (!url.startsWith(LOCAL_IMAGE_PREFIX)) {
    return url;
  }

  if (version === null || version === undefined) {
    return url;
  }

  let [path, queryString = ''] = url.split('?');
  let params = new URLSearchParams(queryString);
  params.set('v', String(version));
  let query = params.toString();

  return query ? `${path}?${query}` : path;
}
