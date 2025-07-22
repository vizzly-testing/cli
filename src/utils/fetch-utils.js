function fetchWithTimeout(url, opts = {}, ms = 300000) {
  let ctrl = new AbortController();
  let id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() =>
    clearTimeout(id)
  );
}

export { fetchWithTimeout };
