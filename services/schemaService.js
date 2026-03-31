const pool = require('../config/db');

const SCHEMA_CACHE_TTL_MS = Number(process.env.SCHEMA_CACHE_TTL_MS || 5 * 60 * 1000);

const fallbackAllowedColumns = {
  users: ['id', 'name', 'email', 'created_at'],
  products: ['id', 'name', 'price', 'stock', 'created_at'],
  orders: ['id', 'user_id', 'product_id', 'quantity', 'total', 'created_at']
};

let cache = {
  expiresAt: 0,
  allowedColumns: fallbackAllowedColumns,
  schemaContext: buildSchemaContext(fallbackAllowedColumns)
};

function buildSchemaContext(allowedColumns) {
  const tableLines = Object.entries(allowedColumns)
    .map(([table, columns]) => `${table}(${columns.join(', ')})`)
    .join('\n');

  return `
You have access to a PostgreSQL database with the following tables and columns:

${tableLines}

Rules:
- Return ONLY the raw SQL query. Nothing else.
- No markdown, no code blocks, no explanations.
- Only SELECT queries are allowed.
- Use only listed tables and columns.
- Use table aliases for joins.
- Include LIMIT in every query.
- LIMIT must be a positive integer and not exceed ${Number(process.env.MAX_QUERY_LIMIT || 200)}.
`.trim();
}

async function loadSchemaFromDb() {
  const configuredTables = (process.env.ALLOWED_TABLES || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const tableFilterClause = configuredTables.length > 0
    ? 'AND table_name = ANY($1::text[])'
    : '';

  const sql = `
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      ${tableFilterClause}
    ORDER BY table_name, ordinal_position;
  `;

  const queryArgs = configuredTables.length > 0 ? [configuredTables] : [];
  const result = await pool.query(sql, queryArgs);

  const allowedColumns = {};
  for (const row of result.rows || []) {
    if (!allowedColumns[row.table_name]) {
      allowedColumns[row.table_name] = [];
    }
    allowedColumns[row.table_name].push(row.column_name);
  }

  if (Object.keys(allowedColumns).length === 0) {
    throw new Error('Schema introspection returned no tables');
  }

  return {
    allowedColumns,
    schemaContext: buildSchemaContext(allowedColumns)
  };
}

async function getSchemaMetadata() {
  const now = Date.now();
  if (cache.expiresAt > now) {
    return cache;
  }

  try {
    const fresh = await loadSchemaFromDb();
    cache = {
      ...fresh,
      expiresAt: now + SCHEMA_CACHE_TTL_MS
    };
  } catch (err) {
    cache = {
      ...cache,
      expiresAt: now + SCHEMA_CACHE_TTL_MS
    };
  }

  return cache;
}

async function getAllowedColumnsMap() {
  const metadata = await getSchemaMetadata();
  return metadata.allowedColumns;
}

async function getSchemaContext() {
  const metadata = await getSchemaMetadata();
  return metadata.schemaContext;
}

async function refreshSchemaCache() {
  cache.expiresAt = 0;
  return getSchemaMetadata();
}

module.exports = {
  getSchemaContext,
  getAllowedColumnsMap,
  refreshSchemaCache
};