import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function createAssetLinks(fingerprints) {
  if (!fingerprints.length || fingerprints.some(value => !/^(?:[0-9a-f]{2}:){31}[0-9a-f]{2}$/i.test(value))) {
    throw new Error('Supply one or more SHA-256 certificate fingerprints (32 colon-separated hex bytes).');
  }
  return ['com.kibbisave.app', 'com.kibbisave.app.admin'].map(packageName => ({
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: packageName,
      sha256_cert_fingerprints: [...new Set(fingerprints.map(value => value.toUpperCase()))],
    },
  }));
}

export function writeAssetLinks(fingerprints, output) {
  const links = createAssetLinks(fingerprints);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(links, null, 2) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const output = fileURLToPath(new URL('../../public/.well-known/assetlinks.json', import.meta.url));
    writeAssetLinks(process.argv.slice(2), output);
    console.log(`Wrote ${output}. Deploy this file to your website to enable verified fullscreen mode.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
