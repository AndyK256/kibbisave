import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetLinks, writeAssetLinks } from './assetlinks.mjs';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('generates the Android domain association with normalized, unique certificates', () => {
  const first = Array(32).fill('ab').join(':');
  const second = Array(32).fill('cd').join(':');
  const [association] = createAssetLinks([first, first.toUpperCase(), second]);
  assert.deepEqual(association.relation, ['delegate_permission/common.handle_all_urls']);
  assert.equal(association.target.namespace, 'android_app');
  assert.equal(association.target.package_name, 'com.kibbisave.app');
  assert.deepEqual(association.target.sha256_cert_fingerprints, [first.toUpperCase(), second.toUpperCase()]);
});

test('rejects missing, truncated, and malformed certificate fingerprints', () => {
  for (const input of [[], [''], ['AA:BB'], [Array(32).fill('GG').join(':')], [Array(32).fill('AA').join(':') + '\n']]) {
    assert.throws(() => createAssetLinks(input), /SHA-256/);
  }
});

test('associates both independently installable apps with the shared signing certificate', () => {
  const fingerprint = Array(32).fill('ab').join(':');
  const associations = createAssetLinks([fingerprint]);
  assert.deepEqual(associations.map(item => item.target.package_name),
    ['com.kibbisave.app', 'com.kibbisave.app.admin']);
  assert.ok(associations.every(item => item.target.sha256_cert_fingerprints[0] === fingerprint.toUpperCase()));
});

test('writes deployable JSON and leaves the filesystem untouched for invalid certificates', () => {
  const root = mkdtempSync(join(tmpdir(), 'kibbisave-association-'));
  try {
    const output = join(root, 'public', '.well-known', 'assetlinks.json');
    assert.throws(() => writeAssetLinks([], output), /SHA-256/);
    assert.equal(existsSync(output), false);
    const fingerprint = Array(32).fill('12').join(':');
    writeAssetLinks([fingerprint], output);
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), createAssetLinks([fingerprint]));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
