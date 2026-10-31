/**
 * JSON Body Parser Middleware
 * Parses JSON request bodies for POST requests
 */

/**
 * Parse JSON body from request
 * @param {http.IncomingMessage} req
 * @returns {Promise<Object|null>} Parsed JSON body or null for non-POST
 */
export function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (
      req.method !== 'POST' &&
      req.method !== 'PUT' &&
      req.method !== 'PATCH'
    ) {
      resolve(null);
      return;
    }

    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        const data = JSON.parse(body);
        resolve(data);
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });

    req.on('error', reject);
  });
}
