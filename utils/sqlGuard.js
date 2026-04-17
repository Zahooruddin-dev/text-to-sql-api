const { Parser } = require('node-sql-parser');

const parser = new Parser();
const MAX_QUERY_LIMIT = Number(process.env.MAX_QUERY_LIMIT || 200);

const DEFAULT_ALLOWED_COLUMNS = {
  users: ['id', 'name', 'email', 'created_at'],
  products: ['id', 'name', 'price', 'stock', 'created_at'],
  orders: ['id', 'user_id', 'product_id', 'quantity', 'total', 'created_at']
};

function getColumnName(columnNode) {
  if (!columnNode) {
    return null;
  }

  if (typeof columnNode === 'string') {
    return columnNode;
  }

  if (columnNode.expr && columnNode.expr.value) {
    return columnNode.expr.value;
  }

  return null;
}

function hasSqlComments(sql) {
  return /--|\/\*/.test(sql);
}

function hasMultipleStatements(sql) {
  const normalized = sql.trim();
  if (!normalized) {
    return false;
  }

  const stripped = normalized.endsWith(';') ? normalized.slice(0, -1) : normalized;
  return stripped.includes(';');
}

function buildAliasMap(ast, allowedColumns) {
  const allowedTables = new Set(Object.keys(allowedColumns));
  const aliasMap = new Map();
  const from = Array.isArray(ast.from) ? ast.from : [];

  for (const item of from) {
    const tableName = item && item.table;
    if (!tableName) {
      continue;
    }

    const cleanTable = String(tableName).replace(/"/g, '');
    if (!allowedTables.has(cleanTable)) {
      return { ok: false, error: `Table is not allowed: ${cleanTable}` };
    }

    aliasMap.set(cleanTable, cleanTable);
    if (item.as) {
      aliasMap.set(String(item.as).replace(/"/g, ''), cleanTable);
    }
  }

  return { ok: true, aliasMap };
}

function validateColumnRef(node, aliasMap, allowedColumns) {
  const columnName = getColumnName(node.column);
  if (!columnName || columnName === '*') {
    return { ok: true };
  }

  const referencedAlias = node.table ? String(node.table).replace(/"/g, '') : null;

  if (!referencedAlias) {
    const referencedTables = new Set(aliasMap.values());
    if (referencedTables.size !== 1) {
      return { ok: false, error: `Unqualified column is not allowed in multi-table queries: ${columnName}` };
    }

    const [onlyTable] = Array.from(referencedTables);
    if (!allowedColumns[onlyTable].includes(columnName)) {
      return { ok: false, error: `Column is not allowed: ${columnName}` };
    }

    return { ok: true };
  }

  const tableName = aliasMap.get(referencedAlias);
  if (!tableName) {
    return { ok: false, error: `Unknown table alias: ${referencedAlias}` };
  }

  if (!allowedColumns[tableName].includes(columnName)) {
    return { ok: false, error: `Column is not allowed: ${tableName}.${columnName}` };
  }

  return { ok: true };
}

function walkAndValidateColumns(node, aliasMap, allowedColumns) {
  if (!node) {
    return { ok: true };
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      const result = walkAndValidateColumns(item, aliasMap, allowedColumns);
      if (!result.ok) {
        return result;
      }
    }
    return { ok: true };
  }

  if (typeof node !== 'object') {
    return { ok: true };
  }

  if (node.type === 'column_ref') {
    return validateColumnRef(node, aliasMap, allowedColumns);
  }

  for (const value of Object.values(node)) {
    const result = walkAndValidateColumns(value, aliasMap, allowedColumns);
    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}

function validateLimit(ast) {
  if (!ast.limit || !Array.isArray(ast.limit.value) || ast.limit.value.length === 0) {
    return { ok: false, error: `Query must include LIMIT <= ${MAX_QUERY_LIMIT}` };
  }

  const limitNode = ast.limit.value[0];
  const rawValue = Number(limitNode && limitNode.value);
  if (!Number.isInteger(rawValue) || rawValue <= 0) {
    return { ok: false, error: 'LIMIT must be a positive integer' };
  }

  if (rawValue > MAX_QUERY_LIMIT) {
    return { ok: false, error: `LIMIT cannot exceed ${MAX_QUERY_LIMIT}` };
  }

  return { ok: true };
}

function normalizeSql(sql) {
  const trimmed = sql.trim();
  return trimmed.endsWith(';') ? trimmed.slice(0, -1) : trimmed;
}

function buildNumericNode(value) {
  return {
    type: 'number',
    value: Number(value)
  };
}

function applyPagination(sql, limit, offset = 0) {
  const normalizedSql = normalizeSql(sql || '');
  if (!normalizedSql) {
    throw new Error('Cannot paginate empty SQL');
  }

  let ast;
  try {
    ast = parser.astify(normalizedSql, { database: 'Postgresql' });
  } catch (err) {
    throw new Error(`Failed to parse SQL for pagination: ${err.message}`);
  }

  if (Array.isArray(ast) || ast.type !== 'select') {
    throw new Error('Pagination can only be applied to a single SELECT statement');
  }

  const safeLimit = Math.min(Math.max(1, Number(limit) || 1), MAX_QUERY_LIMIT);
  const safeOffset = Math.max(0, Number(offset) || 0);

  ast.limit = {
    seperator: safeOffset > 0 ? 'offset' : '',
    value: safeOffset > 0
      ? [buildNumericNode(safeLimit), buildNumericNode(safeOffset)]
      : [buildNumericNode(safeLimit)]
  };

  const paginatedSql = parser.sqlify(ast, { database: 'Postgresql' });
  return normalizeSql(paginatedSql);
}

function validateSelectSQL(sql, allowedColumns = DEFAULT_ALLOWED_COLUMNS) {
  if (!sql || typeof sql !== 'string') {
    return { ok: false, error: 'Model did not return SQL text' };
  }

  const normalizedSql = normalizeSql(sql);
  if (!normalizedSql) {
    return { ok: false, error: 'Empty SQL is not allowed' };
  }

  if (hasSqlComments(normalizedSql)) {
    return { ok: false, error: 'SQL comments are not allowed' };
  }

  if (hasMultipleStatements(normalizedSql)) {
    return { ok: false, error: 'Multiple SQL statements are not allowed' };
  }

  let ast;
  try {
    ast = parser.astify(normalizedSql, { database: 'Postgresql' });
  } catch (err) {
    return { ok: false, error: `Invalid SQL: ${err.message}` };
  }

  if (Array.isArray(ast)) {
    return { ok: false, error: 'Only one SQL statement is allowed' };
  }

  if (ast.type !== 'select') {
    return { ok: false, error: 'Only SELECT queries are allowed' };
  }

  const aliasMapResult = buildAliasMap(ast, allowedColumns);
  if (!aliasMapResult.ok) {
    return aliasMapResult;
  }

  const columnValidation = walkAndValidateColumns(ast, aliasMapResult.aliasMap, allowedColumns);
  if (!columnValidation.ok) {
    return columnValidation;
  }

  const limitValidation = validateLimit(ast);
  if (!limitValidation.ok) {
    return limitValidation;
  }

  return { ok: true, sql: normalizedSql };
}

module.exports = {
  validateSelectSQL,
  applyPagination
};