export function getAppBaseUrl(apiUrl) {
  try {
    let url = new URL(apiUrl);
    let apiPathIndex = url.pathname.indexOf('/api');
    if (apiPathIndex !== -1) {
      url.pathname = url.pathname.slice(0, apiPathIndex) || '/';
      url.search = '';
      url.hash = '';
    }

    return url.toString().replace(/\/$/, '');
  } catch {
    return apiUrl.replace(/\/api(?:\/.*)?$/, '');
  }
}
