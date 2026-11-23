const fs = require('node:fs');
const path = require('node:path');

const project = path.resolve(__dirname, '..');
const output = path.resolve(project, 'carousel');
if (path.dirname(output) !== project || path.basename(output) !== 'carousel') {
  throw new Error('Build output must be the carousel directory inside this project.');
}
fs.rmSync(output, { recursive: true, force: true });
