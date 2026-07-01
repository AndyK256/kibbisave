const { neon } = require('@neondatabase/serverless');

let sql;

function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }
  if (!sql) {
    sql = neon(process.env.DATABASE_URL);
  }
  return sql;
}

function isDbConfigured() {
  const url = process.env.DATABASE_URL || '';
  return url.startsWith('postgresql://') && !url.includes('ep-xxx');
}

module.exports = { getDb, isDbConfigured };
