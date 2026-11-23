const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planRelease, readRegistry, verifyRegistry } = require('./npm-release.cjs');

const metadata = {
  'dist-tags': { latest: '1.0.6', next: '2.0.0-beta.1' },
  versions: { '1.0.5': {}, '1.0.6': { gitHead: 'previous' }, '2.0.0-beta.1': {} },
};
const plan = (version, extra = {}) => planRelease({ version, metadata, sha: 'new', ...extra });
const placeholder = {
  'dist-tags': { latest: '0.0.0-stage' },
  versions: { '0.0.0-stage': {} },
};

for (const version of ['0.1.0', '1.0.0', '2.3.4']) {
  test(`stages an initial ${version} without incrementing the configured version`, () => {
    const result = plan(version, { metadata: null });
    assert.equal(result.publish, true);
    assert.equal(result.version, version);
    assert.equal(result.latest, '');
    assert.match(result.reason, /initial release/);
  });
}

test('treats an npm staging placeholder as an initial publication', () => {
  const result = plan('1.0.0', { metadata: placeholder });
  assert.equal(result.version, '1.0.0');
  assert.equal(result.publish, true);
  assert.equal(result.latest, '0.0.0-stage');
});

test('accepts a staging placeholder without a latest tag', () => {
  assert.equal(plan('1.0.0', { metadata: { versions: placeholder.versions } }).version, '1.0.0');
});

test('does not treat a placeholder alongside published versions as an initial publication', () => {
  assert.throws(() => plan('1.0.0', {
    metadata: { ...placeholder, versions: { ...placeholder.versions, '1.0.0': {} } },
  }), /Invalid stable version/);
});

test('keeps normal version increments once an approved version exists alongside the placeholder', () => {
  const result = plan('1.0.0', {
    metadata: { 'dist-tags': { latest: '1.0.0' }, versions: { ...placeholder.versions, '1.0.0': {} } },
  });
  assert.equal(result.version, '1.0.1');
});

test('validates the configured version for a first publication', () => {
  assert.throws(() => plan('1.0.0-beta.1', { metadata: null }), /Invalid stable version/);
});

test('unchanged latest becomes a patch without replacing a published version', () => {
  assert.deepEqual([plan('1.0.6').version, plan('1.0.6').publish], ['1.0.7', true]);
});
for (const version of ['1.0.7', '1.1.0', '2.0.0']) {
  test(`accepts sequential release ${version}`, () => assert.equal(plan(version).version, version));
}
for (const version of ['1.0.8', '1.1.7', '1.2.0', '3.0.0', '0.9.0', '1.0.4']) {
  test(`rejects skipped or older version ${version}`, () => assert.throws(() => plan(version), /skips or reverses/));
}
test('rejects replacement of an older published version', () => assert.throws(() => plan('1.0.5'), /not latest/));
test('requires latest to exist', () => assert.throws(() => plan('1.0.6', { metadata: { versions: {} } }), /latest tag/));
test('rejects a latest tag behind another stable release', () => {
  assert.throws(() => plan('1.0.6', {
    metadata: { ...metadata, versions: { ...metadata.versions, '1.0.7': {} } },
  }), /trails published/);
});
test('rerunning an already published commit is a no-op', () => {
  assert.equal(plan('1.0.6', { sha: 'previous' }).publish, false);
});
for (const version of ['v1.0.7', '01.0.7', '1.0.7-beta.1', '1.0.7+build', '1.0', '']) {
  test(`rejects invalid stable version ${version}`, () => assert.throws(() => plan(version), /Invalid stable version/));
}
test('registry network failures propagate', async () => {
  const original = global.fetch;
  try {
    global.fetch = async () => ({ ok: false, status: 503 });
    await assert.rejects(readRegistry('example'), /HTTP 503/);
    global.fetch = async () => { throw new Error('network unavailable'); };
    await assert.rejects(readRegistry('example'), /network unavailable/);
  } finally { global.fetch = original; }
});

test('registry 404 identifies a package that is not publicly available', async () => {
  const original = global.fetch;
  try {
    global.fetch = async url => {
      assert.equal(url, 'https://registry.npmjs.org/%40obinesto%2Freact-carousel');
      return { ok: false, status: 404, json: async () => { throw new Error('404 body must not be used as metadata'); } };
    };
    assert.equal(await readRegistry('@obinesto/react-carousel'), null);
  } finally { global.fetch = original; }
});

test('registry success retains the published metadata', async () => {
  const original = global.fetch;
  try {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => metadata });
    assert.equal(await readRegistry('example'), metadata);
  } finally { global.fetch = original; }
});

for (const status of [401, 403, 410, 429, 500]) {
  test(`registry HTTP ${status} is not mistaken for a first publication`, async () => {
    const original = global.fetch;
    try {
      global.fetch = async () => ({ ok: false, status });
      await assert.rejects(readRegistry('example'), new RegExp(`HTTP ${status}`));
    } finally { global.fetch = original; }
  });
}

for (const value of [null, [], 'invalid']) {
  test(`rejects invalid successful registry metadata ${JSON.stringify(value)}`, async () => {
    const original = global.fetch;
    try {
      global.fetch = async () => ({ ok: true, status: 200, json: async () => value });
      await assert.rejects(readRegistry('example'), /invalid package metadata/);
    } finally { global.fetch = original; }
  });
}

test('rejects malformed registry JSON without treating the package as new', async () => {
  const original = global.fetch;
  try {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Invalid JSON'); } });
    await assert.rejects(readRegistry('example'), /Invalid JSON/);
  } finally { global.fetch = original; }
});

test('verifies that a first publication still has no published release', () => {
  assert.doesNotThrow(() => verifyRegistry({ version: '1.0.0', metadata: null, expectedLatest: '' }));
  assert.doesNotThrow(() => verifyRegistry({ version: '1.0.0', metadata: placeholder, expectedLatest: '0.0.0-stage' }));
  assert.doesNotThrow(() => verifyRegistry({ version: '1.0.0', metadata: placeholder, expectedLatest: '' }));
});

test('stops first publication if a release appears before staging', () => {
  assert.throws(() => verifyRegistry({ version: '1.0.0', metadata, expectedLatest: '' }), /Registry changed/);
  assert.throws(() => verifyRegistry({ version: '1.0.0', metadata, expectedLatest: '0.0.0-stage' }), /Registry changed/);
});

test('does not accept an empty metadata document as an unpublished package during verification', () => {
  assert.throws(() => verifyRegistry({ version: '1.0.0', metadata: { versions: {} }, expectedLatest: '' }), /Registry changed/);
});

test('verifies an unused next version against the planned latest', () => {
  assert.doesNotThrow(() => verifyRegistry({ version: '1.0.7', metadata, expectedLatest: '1.0.6' }));
});

test('stops verification when an existing package disappears or latest changes', () => {
  assert.throws(() => verifyRegistry({ version: '1.0.7', metadata: null, expectedLatest: '1.0.6' }), /Registry changed/);
  assert.throws(() => verifyRegistry({ version: '1.0.7', metadata, expectedLatest: '1.0.5' }), /Registry changed/);
});

test('stops verification if the target version becomes occupied', () => {
  assert.throws(() => verifyRegistry({
    version: '1.0.7', expectedLatest: '1.0.6',
    metadata: { ...metadata, versions: { ...metadata.versions, '1.0.7': {} } },
  }), /Registry changed/);
});

test('requires a planning result for verification, including an explicit empty latest for an initial release', () => {
  assert.throws(() => verifyRegistry({ version: '1.0.0', metadata: null }), /Missing EXPECTED_LATEST/);
});
