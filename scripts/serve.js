// Zero-dep static file server for local auditing of site/
// Usage: node scripts/serve.js [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = fileURLToPath(new URL('..', import.meta.url));
const siteDir = join(here, 'site');
const port = Number(process.argv[2] || 8125);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = normalize(join(siteDir, urlPath));
    if (!filePath.startsWith(siteDir)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const raw = await readFile(filePath);
    const accepts = String(req.headers['accept-encoding'] || '');
    const compressible = /\.(html|css|js|svg|txt|xml|json|md)$/.test(filePath);
    const gz = compressible && accepts.includes('gzip') ? gzipSync(raw) : null;
    const headers = {
      'content-type': MIME[extname(filePath)] || 'application/octet-stream',
      'cache-control': 'public, max-age=600',
      vary: 'accept-encoding'
    };
    if (gz) headers['content-encoding'] = 'gzip';
    res.writeHead(200, headers);
    res.end(gz || raw);
  } catch {
    try {
      const notFound = await readFile(join(siteDir, '404.html'));
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }).end(notFound);
    } catch {
      res.writeHead(404).end('Not found');
    }
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`ContextPack site server on http://127.0.0.1:${port}/ — Ctrl+C to stop`);
});
