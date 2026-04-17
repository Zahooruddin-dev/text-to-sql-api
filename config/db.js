const { Pool } = require('pg');
require('dotenv').config();

const readPool = new Pool({
  connectionString: process.env.DATABASE_URL_READONLY || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const writePool = new Pool({
  connectionString: process.env.DATABASE_URL_WRITER || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function query(text, params) {
  return readPool.query(text, params);
}

function writeQuery(text, params) {
  return writePool.query(text, params);
}

module.exports = {
  query,
  writeQuery,
  readPool,
  writePool
};