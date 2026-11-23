const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const pkg = require('../package.json');
const ts = require('typescript');

async function main() {
  const packed = JSON.parse(execFileSync(process.execPath,
    [process.env.npm_execpath, 'pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8' }))[0];
  const files = new Set(packed.files.map(file => file.path));
  for (const file of [pkg.main, pkg.module, pkg.types, 'carousel/types/carousel.d.ts', 'carousel/carousel.css', 'carousel/core.css']) {
    assert.ok(files.has(file), `Package is missing ${file}`);
  }
  const declarations = fs.readFileSync(pkg.types, 'utf8');
  const program = ts.createProgram([pkg.types], {
    noEmit: true,
    strict: true,
    skipLibCheck: false,
    esModuleInterop: false,
    allowSyntheticDefaultImports: false,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2020,
    types: [],
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, diagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('\n'));
  assert.match(declarations, /Carousel/);
  const carouselTypes = fs.readFileSync('carousel/types/carousel.d.ts', 'utf8');
  for (const name of ['CarouselApi', 'CarouselState', 'CarouselLayout', 'CarouselPlayback', 'CarouselLabels']) {
    assert.match(declarations, new RegExp(name));
    assert.match(carouselTypes, new RegExp(name));
  }
  assert.equal(require.resolve(`${pkg.name}/core.css`), require('node:path').resolve('carousel/core.css'));
  assert.match(fs.readFileSync('carousel/carousel.css', 'utf8'), /core\.css/);
  const bundle = fs.readFileSync(pkg.module, 'utf8');
  assert.ok(!bundle.includes('lucide') && !bundle.includes('react.production'), 'Unexpected bundled dependency');
  assert.equal(typeof require(pkg.name).Carousel, 'function');
  assert.equal(typeof (await import(pkg.name)).Carousel, 'function');
  console.log('Package includes JavaScript, declarations, and CSS. CommonJS and ESM imports pass.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
