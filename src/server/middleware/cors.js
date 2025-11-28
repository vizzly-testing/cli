/**
 * CORS Middleware
 * Handles cross-origin requests and preflight OPTIONS
 */

/**
 * Apply CORS headers and handle OPTIONS preflight
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @returns {boolean} True if request was handled (OPTIONS), false to continue
 */
export function corsMiddleware(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return true;
  }

  return false;
}
