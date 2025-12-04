function fetchWithTimeout(url, opts = {}, ms = 300000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() =>
    clearTimeout(id)
  );
}

export { fetchWithTimeout };
