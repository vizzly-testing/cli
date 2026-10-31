/**
 * Build server listen options
 * @param {Object} config - Server configuration
 * @returns {{ port: number, host: string }}
 */
export function buildServerListenOptions(config) {
  return {
    port: config?.server?.port || 3000,
    host: '127.0.0.1',
  };
}

/**
 * Build server started message
 * @param {number} port - Server port
 * @returns {string}
 */
export function buildServerStartedMessage(port) {
  return `Screenshot server listening on http://127.0.0.1:${port}`;
}

/**
 * Build server stopped message
 * @returns {string}
 */
export function buildServerStoppedMessage() {
  return 'Screenshot server stopped';
}
