// Tiny static server for the app (no dependencies). Also accepts test uploads at POST /__upload/<name>.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.onnx': 'application/octet-stream', '.bin': 'application/octet-stream', '.txt': 'text/plain',
};

export function startServer({ root, port, uploadDir, cors = false, extraRoots = {} }) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    for (const [prefix, dir] of Object.entries(extraRoots)) {
      if (url.pathname.startsWith(prefix)) {
        const f = path.join(dir, path.basename(url.pathname));
        if (!fs.existsSync(f)) return res.writeHead(404).end();
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        return fs.createReadStream(f).pipe(res);
      }
    }
    if (cors) res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'POST' && url.pathname.startsWith('/__upload/') && uploadDir) {
      const name = path.basename(decodeURIComponent(url.pathname.slice('/__upload/'.length)));
      fs.mkdirSync(uploadDir, { recursive: true });
      const out = fs.createWriteStream(path.join(uploadDir, name));
      req.pipe(out);
      out.on('finish', () => res.end('ok'));
      return;
    }
    let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (p.includes('..')) {
      res.writeHead(400).end();
      return;
    }
    let file = path.join(root, p || 'index.html');
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'app'));
  const port = Number(process.argv[3] || 8080);
  startServer({ root, port }).then(() => console.log(`Faceless Studio running at http://localhost:${port}/`));
}
