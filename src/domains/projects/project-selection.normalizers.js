/** Normalize GitHub remotes without carrying credentials into discovery. */
export function normalizeRepositoryRemote(remote) {
  let value = remote.trim();
  let scp = value.match(/^(?:[^@/:\s]+@)?github\.com:([^?#\s]+)$/i);
  if (scp) value = `ssh://git@github.com/${scp[1]}`;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    !['https:', 'ssh:'].includes(url.protocol) ||
    url.hostname.toLowerCase() !== 'github.com' ||
    (url.port && !(url.protocol === 'ssh:' && url.port === '22')) ||
    url.search ||
    url.hash
  )
    return null;
  let rawPath = value.match(/^[a-z]+:\/\/[^/]+\/([^?#]*)$/i)?.[1];
  if (!rawPath) return null;
  let path = rawPath.replace(/\/$/, '').replace(/\.git$/i, '');
  if (
    !/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?\/(?!(?:\.|\.\.)$)(?!.*\.git$)[a-z0-9._-]{1,100}$/i.test(
      path
    )
  )
    return null;
  return `github.com/${path.toLowerCase()}`;
}
