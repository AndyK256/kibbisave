// Inspect + clean seed leaderboard groups from Neon
const fs = require('fs');
const path = require('path');
const { Pool, neonConfig } = require('@neondatabase/serverless');
try { neonConfig.webSocketConstructor = require('ws'); } catch (_) {}

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
  } catch (_) {}
}
for (const f of ['.env.local', '.env.vercel.production', '.env']) loadEnvFile(f);

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const doClean = process.argv.includes('--clean');

(async () => {
  const pool = new Pool({ connectionString: url });
  try {
    const g = await pool.query(`
      SELECT id, name, code, is_system, is_private, status, period_months,
             leaderboard_rank, current_members, total_saved, created_at
      FROM groups
      ORDER BY leaderboard_rank NULLS LAST, created_at DESC
      LIMIT 40
    `);
    console.log('GROUPS', JSON.stringify(g.rows, null, 2));

    // Seed/demo groups from old foundation: fixed UUID prefix or null period_months + named demos
    const seed = await pool.query(`
      SELECT id, name, code, period_months, leaderboard_rank, status
      FROM groups
      WHERE id::text LIKE 'b1000001%'
         OR (period_months IS NULL AND name IN ('Kampala Hustlers','Makerere Savers','Entebbe Circle','Jinja Builders','Gulu Growers'))
         OR (code LIKE 'KBS-%' AND period_months IS NULL AND is_system IS DISTINCT FROM TRUE)
    `);
    console.log('SEED_CANDIDATES', JSON.stringify(seed.rows, null, 2));

    if (doClean && seed.rows.length) {
      const ids = seed.rows.map((r) => r.id);
      await pool.query(`DELETE FROM group_members WHERE group_id = ANY($1::uuid[])`, [ids]);
      await pool.query(`DELETE FROM transactions WHERE group_id = ANY($1::uuid[])`, [ids]).catch(() => {});
      await pool.query(`DELETE FROM group_messages WHERE group_id = ANY($1::uuid[])`, [ids]).catch(() => {});
      await pool.query(`DELETE FROM groups WHERE id = ANY($1::uuid[])`, [ids]);
      console.log('DELETED', ids.length, 'seed groups');
    }

    // Clear stale ranks on open groups; re-rank closed ones
    await pool.query(`
      UPDATE groups SET leaderboard_rank = NULL, leaderboard_prev_rank = NULL
      WHERE status NOT IN ('active','locked','completed')
         OR (is_private = TRUE)
    `);
    try {
      await pool.query(`SELECT recalc_all_groups()`);
      console.log('recalc_all_groups OK');
    } catch (e) {
      console.warn('recalc skipped:', e.message);
    }

    const lb = await pool.query(`
      SELECT id, name, code, period_months, status, is_private, is_system,
             leaderboard_rank, avg_member_lead, total_saved
      FROM groups
      WHERE status IN ('active','locked','completed') AND leaderboard_rank IS NOT NULL
      ORDER BY leaderboard_rank ASC
    `);
    console.log('LEADERBOARD_NOW', JSON.stringify(lb.rows, null, 2));
  } finally {
    await pool.end();
  }
})().catch((e) => { console.error(e); process.exit(1); });
