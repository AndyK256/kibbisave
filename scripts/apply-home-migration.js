// Apply api/schema/migrate-home-from-v1.sql to Neon (idempotent).
const fs = require('fs');
const path = require('path');
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = (() => {
  try { return require('ws'); } catch (_) { return null; }
})();
if (ws) neonConfig.webSocketConstructor = ws;

function loadEnvFile(file) {
  try {
    const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  } catch (_) { /* missing file ok */ }
}

for (const f of ['.env.local', '.env.vercel.production', '.env']) loadEnvFile(f);

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED;
if (!url || /ep-xxx/.test(url)) {
  console.error('Need a real DATABASE_URL (not placeholder)');
  process.exit(1);
}

function splitSql(sql) {
  const stmts = [];
  let cur = '';
  let i = 0;
  let inDollar = null; // tag like $$ or $tag$
  while (i < sql.length) {
    if (!inDollar && sql[i] === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (!inDollar && sql[i] === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (!inDollar && sql[i] === "'") {
      cur += sql[i++];
      while (i < sql.length) {
        cur += sql[i];
        if (sql[i] === "'" && sql[i + 1] === "'") { cur += sql[++i]; i++; continue; }
        if (sql[i] === "'") { i++; break; }
        i++;
      }
      continue;
    }
    if (!inDollar && sql[i] === '$') {
      const m = sql.slice(i).match(/^\$([A-Za-z0-9_]*)\$/);
      if (m) {
        inDollar = m[0];
        cur += m[0];
        i += m[0].length;
        continue;
      }
    }
    if (inDollar) {
      if (sql.startsWith(inDollar, i)) {
        cur += inDollar;
        i += inDollar.length;
        inDollar = null;
        continue;
      }
      cur += sql[i++];
      continue;
    }
    if (sql[i] === ';') {
      const s = cur.trim();
      if (s) stmts.push(s);
      cur = '';
      i++;
      continue;
    }
    cur += sql[i++];
  }
  const tail = cur.trim();
  if (tail) stmts.push(tail);
  return stmts;
}

(async () => {
  const sqlPath = path.join(__dirname, '..', 'api', 'schema', 'migrate-home-from-v1.sql');
  const raw = fs.readFileSync(sqlPath, 'utf8');
  const stmts = splitSql(raw);
  console.log('Statements:', stmts.length);

  const pool = new Pool({ connectionString: url });
  try {
    for (let n = 0; n < stmts.length; n++) {
      const s = stmts[n];
      const preview = s.replace(/\s+/g, ' ').slice(0, 90);
      try {
        await pool.query(s);
        console.log('OK', n + 1, preview);
      } catch (e) {
        console.error('FAIL', n + 1, preview);
        console.error(e.message);
        process.exitCode = 1;
        return;
      }
    }

    const flags = await pool.query(`
      SELECT
        EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'close_due_groups') AS has_close,
        EXISTS(SELECT 1 FROM information_schema.columns
               WHERE table_name = 'groups' AND column_name = 'period_months') AS has_period,
        (SELECT COUNT(*)::int FROM groups WHERE is_system = TRUE AND status = 'open') AS open_n`);
    console.log('VERIFY', JSON.stringify(flags.rows[0]));
  } finally {
    await pool.end();
  }
})().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
