import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

export function createReporterTestServer(fixtureData, port = 3456) {
  let server = null;

  let handleRequest = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.statusCode = 200;
      res.end();
      return;
    }

    let parsedUrl = new URL(req.url, `http://${req.headers.host}`);

    // Serve main dashboard for all HTML routes (client-side routing)
    if (
      req.method === 'GET' &&
      (parsedUrl.pathname === '/' ||
        parsedUrl.pathname === '/dashboard' ||
        parsedUrl.pathname === '/stats' ||
        parsedUrl.pathname === '/settings' ||
        parsedUrl.pathname === '/projects')
    ) {
      let dashboardHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Vizzly TDD Dashboard</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/reporter-bundle.css">
</head>
<body>
    <div id="vizzly-reporter-root">
        <div class="reporter-loading">
            <div>
                <div class="spinner"></div>
                <p>Loading Vizzly TDD Dashboard...</p>
            </div>
        </div>
    </div>

    <script>
        window.VIZZLY_REPORTER_DATA = ${JSON.stringify(fixtureData)};
    </script>
    <script src="/reporter-bundle.js"></script>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html');
      res.statusCode = 200;
      res.end(dashboardHtml);
      return;
    }

    // Serve reporter bundle
    if (req.method === 'GET' && parsedUrl.pathname === '/reporter-bundle.js') {
      let bundlePath = join(
        PROJECT_ROOT,
        'dist',
        'reporter',
        'reporter-bundle.iife.js'
      );
      let bundle = readFileSync(bundlePath, 'utf8');
      res.setHeader('Content-Type', 'application/javascript');
      res.statusCode = 200;
      res.end(bundle);
      return;
    }

    // Serve reporter CSS
    if (req.method === 'GET' && parsedUrl.pathname === '/reporter-bundle.css') {
      let cssPath = join(
        PROJECT_ROOT,
        'dist',
        'reporter',
        'reporter-bundle.css'
      );
      let css = readFileSync(cssPath, 'utf8');
      res.setHeader('Content-Type', 'text/css');
      res.statusCode = 200;
      res.end(css);
      return;
    }

    // API endpoint for report data
    if (req.method === 'GET' && parsedUrl.pathname === '/api/report-data') {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify(fixtureData));
      return;
    }

    // API endpoint for config
    if (req.method === 'GET' && parsedUrl.pathname === '/api/config') {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          config: {
            comparison: { threshold: 0.1 },
            server: { port: 47392, timeout: 30000 },
            build: { environment: 'test' },
          },
          source: 'vizzly.config.js',
        })
      );
      return;
    }

    // API endpoint for auth status
    if (req.method === 'GET' && parsedUrl.pathname === '/api/auth/status') {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          authenticated: false,
          user: null,
        })
      );
      return;
    }

    // API endpoint for projects
    if (req.method === 'GET' && parsedUrl.pathname === '/api/projects') {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          projects: [],
          mappings: [],
        })
      );
      return;
    }

    // Serve fixture images
    if (req.method === 'GET' && parsedUrl.pathname.startsWith('/images/')) {
      let imagePath = parsedUrl.pathname.replace('/images/', '');
      let fullImagePath = join(
        PROJECT_ROOT,
        'tests',
        'reporter',
        'fixtures',
        'images',
        imagePath
      );

      try {
        let imageData = readFileSync(fullImagePath);
        res.setHeader('Content-Type', 'image/png');
        res.statusCode = 200;
        res.end(imageData);
      } catch {
        res.statusCode = 404;
        res.end('Image not found');
      }
      return;
    }

    res.statusCode = 404;
    res.end('Not found');
  };

  let start = () => {
    return new Promise((resolve, reject) => {
      server = createServer(handleRequest);

      server.listen(port, '127.0.0.1', error => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });

      server.on('error', error => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use`));
        } else {
          reject(error);
        }
      });
    });
  };

  let stop = () => {
    if (server) {
      return new Promise(resolve => {
        server.close(() => {
          server = null;
          resolve();
        });
      });
    }
    return Promise.resolve();
  };

  return { start, stop };
}
