const { neon } = require('@neondatabase/serverless');

let sql;

/**
 * Resolve the Neon connection string from Vercel Neon integration vars.
 * Prefer pooled URLs for serverless (Neon HTTP driver).
 * Order matches what the Vercel Neon integration typically injects.
 */
function resolveDatabaseUrl() {
  const candidates = [
    process.env.DATABASE_URL,           // often set by Neon integration
    process.env.POSTGRES_URL,           // Vercel Neon pooled (preferred alias)
    process.env.POSTGRES_PRISMA_URL,    // pooled + pgbouncer
    process.env.DATABASE_URL_UNPOOLED,  // direct
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.POSTGRES_URL_NO_SSL,
  ];
  for (const url of candidates) {
    if (url && typeof url === 'string' && url.startsWith('postgresql://') && !url.includes('ep-xxx')) {
      return url;
    }
  }
  return '';
}

function getDb() {
  const url = resolveDatabaseUrl();
  if (!url) {
    throw new Error(
      'No Neon database URL set. Expected DATABASE_URL or POSTGRES_URL from the Vercel Neon integration.'
    );
  }
  if (!sql) {
    sql = neon(url);
  }
  return sql;
}

function isDbConfigured() {
  return Boolean(resolveDatabaseUrl());
}

module.exports = { getDb, isDbConfigured, resolveDatabaseUrl };
