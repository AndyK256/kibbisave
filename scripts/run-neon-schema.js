const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url || !url.startsWith('postgresql://')) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = neon(url);

async function runFile(relativePath) {
  const text = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  const statements = text
    .split(';')
    .map((s) => s.replace(/--[^\n]*/g, '').trim())
    .filter(Boolean);

  for (const statement of statements) {
    await sql(statement);
    console.log('OK:', statement.split('\n')[0].slice(0, 70));
  }
}

async function main() {
  await runFile('api/schema/google-auth.sql');
  await runFile('api/schema/avatar-custom.sql');
  const rows = await sql`SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_name = 'users'`;
  console.log('users table present:', rows[0]?.n === 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
