const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Exercise the workflow's actual script without making GitHub requests.
const workflow = fs.readFileSync(path.join(__dirname, '../../workflows/github-release.yml'), 'utf8');
const scriptBlock = workflow.match(/^\s+script: \|\r?\n([\s\S]*)$/m);
assert.ok(scriptBlock, 'Release workflow must include its API script.');
const lines = scriptBlock[1].trimEnd().split(/\r?\n/);
const indentation = lines.find(line => line.trim()).match(/^ */)[0].length;
const script = lines.map(line => line.slice(indentation)).join('\n');
const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
const run = new AsyncFunction('github', 'context', 'core', script);

function fixture() {
  const calls = { lookup: [], tag: [], notes: [], create: [], notices: [] };
  let release;
  const github = {
    rest: {
      repos: {
        getContent: async input => {
          calls.notes.push(input);
          return { data: { type: 'file', encoding: 'base64', content: Buffer.from('## Changes\n\n- Custom release notes.\n').toString('base64') } };
        },
        getReleaseByTag: async input => {
          calls.lookup.push(input);
          if (!release) throw Object.assign(new Error('Not found'), { status: 404 });
          return { data: release };
        },
        createRelease: async input => {
          calls.create.push(input);
          release = { html_url: 'https://github.com/obinesto/react-carousel/releases/tag/v1.2.3', body: input.body };
          return { data: release };
        },
      },
      git: {
        getRef: async input => {
          calls.tag.push(input);
          return { data: { ref: input.ref } };
        },
      },
    },
  };
  const context = {
    repo: { owner: 'obinesto', repo: 'react-carousel' },
    ref: 'refs/tags/v1.2.3',
    sha: 'published-commit',
    payload: { deleted: false },
  };
  const core = { notice: message => calls.notices.push(message) };
  return { github, context, core, calls, run: () => run(github, context, core) };
}

test('publishes local Markdown from the exact tagged commit without generated notes', async () => {
  const f = fixture();
  await f.run();
  assert.deepEqual(f.calls.tag, [{ owner: 'obinesto', repo: 'react-carousel', ref: 'tags/v1.2.3' }]);
  assert.deepEqual(f.calls.notes, [{ owner: 'obinesto', repo: 'react-carousel', path: '.github/releases/v1.2.3.md', ref: 'published-commit' }]);
  assert.deepEqual(f.calls.create, [{
    owner: 'obinesto', repo: 'react-carousel', tag_name: 'v1.2.3',
    target_commitish: 'published-commit', name: 'v1.2.3',
    body: '## Changes\n\n- Custom release notes.\n',
    generate_release_notes: false, draft: false, prerelease: false, make_latest: 'legacy',
  }]);
});

test('rerunning a tag event preserves its existing release and notes', async () => {
  const f = fixture();
  await f.run();
  await f.run();
  assert.equal(f.calls.lookup.length, 2);
  assert.equal(f.calls.create.length, 1);
  assert.equal(f.calls.tag.length, 1);
  assert.equal(f.calls.notes.length, 1);
  assert.match(f.calls.notices.at(-1), /Release already exists/);
});

test('preserves a manually authored draft release', async () => {
  const f = fixture();
  const existing = { draft: true, body: 'Maintainer notes', html_url: 'https://example.com/release' };
  f.github.rest.repos.getReleaseByTag = async () => ({ data: existing });
  await f.run();
  assert.equal(f.calls.create.length, 0);
  assert.equal(f.calls.tag.length, 0);
  assert.equal(f.calls.notes.length, 0);
  assert.equal(existing.body, 'Maintainer notes');
  assert.equal(existing.draft, true);
});

for (const ref of ['refs/heads/publish', 'refs/tags/vnext', 'refs/tags/v1.2', 'refs/tags/v01.2.3', 'refs/tags/v1.2.3-beta.1']) {
  test(`ignores unsupported release ref ${ref}`, async () => {
    const f = fixture();
    f.context.ref = ref;
    await f.run();
    assert.equal(f.calls.lookup.length, 0);
    assert.equal(f.calls.create.length, 0);
  });
}

test('ignores tag deletion events', async () => {
  const f = fixture();
  f.context.payload.deleted = true;
  await f.run();
  assert.equal(f.calls.lookup.length, 0);
  assert.equal(f.calls.create.length, 0);
});

for (const status of [401, 403, 500]) {
  test(`propagates release lookup HTTP ${status} without attempting creation`, async () => {
    const f = fixture();
    f.github.rest.repos.getReleaseByTag = async () => { throw Object.assign(new Error('Lookup failed'), { status }); };
    await assert.rejects(f.run, /Lookup failed/);
    assert.equal(f.calls.create.length, 0);
    assert.equal(f.calls.tag.length, 0);
  });
}

test('does not create a release when the tag is no longer available', async () => {
  const f = fixture();
  f.github.rest.git.getRef = async () => { throw Object.assign(new Error('Missing tag'), { status: 404 }); };
  await assert.rejects(f.run, /Missing tag/);
  assert.equal(f.calls.create.length, 0);
});

test('reports release creation failures', async () => {
  const f = fixture();
  f.github.rest.repos.createRelease = async () => { throw new Error('Creation failed'); };
  await assert.rejects(f.run, /Creation failed/);
});

test('stops release creation when the tagged commit has no notes file', async () => {
  const f = fixture();
  f.github.rest.repos.getContent = async () => { throw Object.assign(new Error('Not found'), { status: 404 }); };
  await assert.rejects(f.run, /Missing \.github\/releases\/v1\.2\.3\.md in the tagged commit/);
  assert.equal(f.calls.create.length, 0);
});

for (const status of [403, 500]) {
  test(`propagates notes lookup HTTP ${status} without creating a release`, async () => {
    const f = fixture();
    f.github.rest.repos.getContent = async () => { throw Object.assign(new Error('Notes lookup failed'), { status }); };
    await assert.rejects(f.run, /Notes lookup failed/);
    assert.equal(f.calls.create.length, 0);
  });
}

for (const content of ['', ' \n\t']) {
  test(`rejects empty notes ${JSON.stringify(content)}`, async () => {
    const f = fixture();
    f.github.rest.repos.getContent = async () => ({ data: { type: 'file', encoding: 'base64', content: Buffer.from(content).toString('base64') } });
    await assert.rejects(f.run, /Release notes .* are empty/);
    assert.equal(f.calls.create.length, 0);
  });
}

for (const data of [[], { type: 'dir' }, { type: 'file', encoding: 'none', content: '' }, { type: 'file', encoding: 'base64' }]) {
  test(`rejects unreadable notes ${JSON.stringify(data)}`, async () => {
    const f = fixture();
    f.github.rest.repos.getContent = async () => ({ data });
    await assert.rejects(f.run, /Cannot read .*Release notes must be a Markdown file/);
    assert.equal(f.calls.create.length, 0);
  });
}

test('preserves Markdown, Unicode, and trailing newlines without interpretation', async () => {
  const f = fixture();
  const body = '## Changes\n\n- RTL: مرحبا\n- `$(example)` and ${{ example }} remain text.\n';
  f.github.rest.repos.getContent = async () => ({ data: { type: 'file', encoding: 'base64', content: Buffer.from(body).toString('base64') } });
  await f.run();
  assert.equal(f.calls.create[0].body, body);
  assert.equal(f.calls.create[0].generate_release_notes, false);
});
