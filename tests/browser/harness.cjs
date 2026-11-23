const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { rollup } = require('rollup');
const { nodeResolve } = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');

// A terminating test server. No dev server or watcher is started.
async function createHarness(source, css = 'carousel.css', markup = '') {
  const entry = path.resolve('tests/browser/entry.js').replaceAll('\\', '/');
  const bundle = await rollup({
    input: entry,
    plugins: [
      { name: 'fixture', resolveId: id => id === entry ? entry : null, load: id => id === entry ? source : null },
      nodeResolve({ browser: true }),
      commonjs(),
      { name: 'production-react', transform: code => ({ code: code.replaceAll('process.env.NODE_ENV', '"production"'), map: null }) },
    ],
  });
  const { output } = await bundle.generate({ format: 'iife' });
  await bundle.close();
  const styles = fs.readFileSync(css, 'utf8').replace(/@import[^;]+;/g, () => fs.readFileSync('core.css', 'utf8'));
  const server = http.createServer((req, res) => {
    const initialMarkup = req.url.includes('hydrate') ? (typeof markup === 'function' ? markup(req.url) : markup) : '';
    res.setHeader('Content-Type', req.url === '/bundle.js' ? 'text/javascript' : 'text/html');
    res.end(req.url === '/bundle.js' ? output[0].code : `<!doctype html><html><head><meta charset="utf-8"><style>${styles} body { margin: 0; } .fixture { width: 600.5px; } img { max-width: 100%; } </style></head><body><div id="app">${initialMarkup}</div><script src="/bundle.js"></script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}

module.exports = { createHarness };
