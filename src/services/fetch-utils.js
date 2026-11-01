let defaultTimers = { setTimeout, clearTimeout };

function fetchWithTimeout(url, opts = {}, ms = 300000, deps = {}) {
  let fetchFn = deps.fetch || fetch;
  let AbortControllerClass = deps.AbortController || AbortController;
  let timers = deps.timers || defaultTimers;
  let ctrl = new AbortControllerClass();
  let timeoutId = timers.setTimeout(() => ctrl.abort(), ms);

  return fetchFn(url, { ...opts, signal: ctrl.signal }).finally(() =>
    timers.clearTimeout(timeoutId)
  );
}

export { fetchWithTimeout };
