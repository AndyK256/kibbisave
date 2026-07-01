import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function parseEnv(content) {
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

const local = parseEnv(readFileSync(join(root, '.env'), 'utf8'));

const production = {
  APP_URL: 'https://kibbisave.com',
  GOOGLE_CALLBACK_URL: 'https://kibbisave.com/api/auth/google/callback',
  GOOGLE_CLIENT_ID: local.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: local.GOOGLE_CLIENT_SECRET,
  JWT_SECRET: local.JWT_SECRET,
  RESEND_API_KEY: local.RESEND_API_KEY,
  RESEND_FROM_EMAIL: local.RESEND_FROM_EMAIL,
  DATABASE_URL: local.DATABASE_URL,
  NODE_ENV: 'production',
};

for (const [name, value] of Object.entries(production)) {
  if (!value) {
    console.log(`skip ${name} (empty)`);
    continue;
  }

  const tmp = join(tmpdir(), `vercel-env-${name}.txt`);
  writeFileSync(tmp, value, 'utf8');

  const result = spawnSync(
    'cmd.exe',
    ['/c', `type "${tmp}" | npx.cmd vercel env add ${name} production --yes --force`],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );

  try {
    unlinkSync(tmp);
  } catch {
    /* ignore */
  }

  const out = (result.stderr || result.stdout || '').trim();
  if (result.status === 0 || /Added|Overwrote|already exists/i.test(out)) {
    console.log(`ok ${name}`);
  } else {
    console.error(`fail ${name}: ${out || `exit ${result.status}`}`);
    process.exitCode = 1;
  }
}
