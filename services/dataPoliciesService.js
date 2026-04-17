const pool = require('../config/db');
const { Parser } = require('node-sql-parser');

const parser = new Parser();
const write = typeof pool.writeQuery === 'function'
  ? pool.writeQuery.bind(pool)
  : pool.query.bind(pool);

function normalizeSql(sql) {
  const trimmed = String(sql || '').trim();
  return trimmed.endsWith(';') ? trimmed.slice(0, -1) : trimmed;
}

function cleanIdentifier(value) {
  return String(value || '').replace(/"/g, '');
}

function getTableToken(tableNode) {
  if (!tableNode) {
    return null;
  }
  if (typeof tableNode === 'string') {
    return cleanIdentifier(tableNode);
  }
  if (typeof tableNode === 'object' && tableNode.value) {
    return cleanIdentifier(tableNode.value);
  }
  return null;
}

function getColumnName(columnNode) {
  if (!columnNode) {
    return null;
  }
  if (typeof columnNode === 'string') {
    return columnNode;
  }
  if (typeof columnNode === 'object' && columnNode.expr && columnNode.expr.value) {
    return String(columnNode.expr.value);
  }
  return null;
}

function buildColumnExpression(tableAlias, columnName) {
  return {
    type: 'expr',
    expr: {
      type: 'column_ref',
      table: tableAlias || null,
      column: {
        expr: {
          type: 'default',
          value: columnName
        }
      },
      collate: null
    },
    as: null
  };
}

function buildWildcardExpression(tableAlias) {
  return {
    type: 'expr',
    expr: {
      type: 'column_ref',
      table: tableAlias || null,
      column: '*'
    },
    as: null
  };
}

function extractTableRefs(ast) {
  const fromItems = Array.isArray(ast.from) ? ast.from : [];
  return fromItems
    .map((item) => {
      const table = cleanIdentifier(item && item.table);
      if (!table) {
        return null;
      }
      const alias = item.as ? cleanIdentifier(item.as) : table;
      return { table, alias };
    })
    .filter(Boolean);
}

function combineWithAnd(left, right) {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return {
    type: 'binary_expr',
    operator: 'AND',
    left,
    right
  };
}

function parseFilterExpression(tableRef, rowFilterSql) {
  const fromClause = tableRef.alias && tableRef.alias !== tableRef.table
    ? `${tableRef.table} ${tableRef.alias}`
    : tableRef.table;
  const filterQuery = `SELECT * FROM ${fromClause} WHERE ${rowFilterSql} LIMIT 1`;
  const filterAst = parser.astify(filterQuery, { database: 'Postgresql' });
  if (Array.isArray(filterAst) || !filterAst.where) {
    throw new Error('Invalid row filter SQL');
  }
  return filterAst.where;
}

function applyColumnPolicies(ast, tableRefs, policiesByTable) {
  const sourceColumns = Array.isArray(ast.columns) ? ast.columns : [];
  const rewrittenColumns = [];

  for (const columnNode of sourceColumns) {
    const expr = columnNode && columnNode.expr;
    if (!expr || expr.type !== 'column_ref') {
      rewrittenColumns.push(columnNode);
      continue;
    }

    const tableToken = getTableToken(expr.table);
    const isWildcard = expr.column === '*';

    if (isWildcard && !tableToken) {
      for (const tableRef of tableRefs) {
        const policy = policiesByTable.get(tableRef.table);
        const allowedColumns = Array.isArray(policy && policy.allowed_columns)
          ? policy.allowed_columns
          : null;

        if (allowedColumns && allowedColumns.length > 0) {
          for (const allowedColumn of allowedColumns) {
            rewrittenColumns.push(buildColumnExpression(tableRef.alias, allowedColumn));
          }
          continue;
        }

        rewrittenColumns.push(buildWildcardExpression(tableRef.alias));
      }
      continue;
    }

    if (isWildcard && tableToken) {
      const tableRef = tableRefs.find((item) => item.alias === tableToken || item.table === tableToken);
      if (!tableRef) {
        rewrittenColumns.push(columnNode);
        continue;
      }

      const policy = policiesByTable.get(tableRef.table);
      const allowedColumns = Array.isArray(policy && policy.allowed_columns)
        ? policy.allowed_columns
        : null;

      if (allowedColumns && allowedColumns.length > 0) {
        for (const allowedColumn of allowedColumns) {
          rewrittenColumns.push(buildColumnExpression(tableRef.alias, allowedColumn));
        }
      } else {
        rewrittenColumns.push(buildWildcardExpression(tableRef.alias));
      }
      continue;
    }

    const columnName = getColumnName(expr.column);
    if (!columnName) {
      rewrittenColumns.push(columnNode);
      continue;
    }

    if (tableToken) {
      const tableRef = tableRefs.find((item) => item.alias === tableToken || item.table === tableToken);
      if (!tableRef) {
        rewrittenColumns.push(columnNode);
        continue;
      }

      const policy = policiesByTable.get(tableRef.table);
      const allowedColumns = Array.isArray(policy && policy.allowed_columns)
        ? policy.allowed_columns
        : null;

      if (allowedColumns && !allowedColumns.includes(columnName)) {
        continue;
      }

      rewrittenColumns.push(columnNode);
      continue;
    }

    if (tableRefs.length === 1) {
      const policy = policiesByTable.get(tableRefs[0].table);
      const allowedColumns = Array.isArray(policy && policy.allowed_columns)
        ? policy.allowed_columns
        : null;

      if (allowedColumns && !allowedColumns.includes(columnName)) {
        continue;
      }
    }

    rewrittenColumns.push(columnNode);
  }

  if (rewrittenColumns.length === 0) {
    throw new Error('Policy application removed all selected columns');
  }

  ast.columns = rewrittenColumns;
}

function buildRowFilter(tableRefs, policiesByTable) {
  let combined = null;

  for (const tableRef of tableRefs) {
    const policy = policiesByTable.get(tableRef.table);
    if (!policy || !policy.row_filter_sql) {
      continue;
    }

    const filterAst = parseFilterExpression(tableRef, policy.row_filter_sql);
    combined = combineWithAnd(combined, filterAst);
  }

  return combined;
}

/**
 * Data Policies Service
 * Manages row-level and column-level access control based on roles
 */
const dataPoliciesService = {
  /**
   * Get all policies for a workspace
   */
  getPolicies: async (workspaceId) => {
    try {
      const result = await pool.query(
        `SELECT id, role, table_name, allowed_columns, row_filter_sql, created_at
         FROM data_policies
         WHERE workspace_id = $1
         ORDER BY table_name, role`,
        [workspaceId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching policies:', error);
      throw error;
    }
  },

  /**
   * Get policies for a specific role
   */
  getPoliciesForRole: async (workspaceId, role) => {
    try {
      const result = await pool.query(
        `SELECT id, table_name, allowed_columns, row_filter_sql
         FROM data_policies
         WHERE workspace_id = $1 AND role = $2`,
        [workspaceId, role]
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching role policies:', error);
      throw error;
    }
  },

  /**
   * Create or update a data policy
   */
  setPolicy: async (workspaceId, role, tableName, allowedColumns, rowFilterSql) => {
    try {
      const result = await write(
        `INSERT INTO data_policies (workspace_id, role, table_name, allowed_columns, row_filter_sql)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (workspace_id, role, table_name) 
         DO UPDATE SET allowed_columns = $4, row_filter_sql = $5, updated_at = NOW()
         RETURNING id, role, table_name, allowed_columns, row_filter_sql`,
        [workspaceId, role, tableName, allowedColumns, rowFilterSql]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error setting policy:', error);
      throw error;
    }
  },

  applyPolicies: async (workspaceId, role, sql) => {
    try {
      const policies = await dataPoliciesService.getPoliciesForRole(workspaceId, role);
      const normalizedSql = normalizeSql(sql);

      if (!policies || policies.length === 0) {
        return normalizedSql;
      }

      const ast = parser.astify(normalizedSql, { database: 'Postgresql' });
      if (Array.isArray(ast) || ast.type !== 'select') {
        throw new Error('Policies can only be applied to a single SELECT statement');
      }

      const tableRefs = extractTableRefs(ast);
      const policiesByTable = new Map(
        policies.map((policy) => [cleanIdentifier(policy.table_name), policy])
      );

      applyColumnPolicies(ast, tableRefs, policiesByTable);

      const policyWhere = buildRowFilter(tableRefs, policiesByTable);
      ast.where = combineWithAnd(ast.where || null, policyWhere);

      return normalizeSql(parser.sqlify(ast, { database: 'Postgresql' }));
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      console.error('Error applying policies:', message);
      throw new Error(message);
    }
  },

  applifyPolicies: async (workspaceId, role, sql) => {
    return dataPoliciesService.applyPolicies(workspaceId, role, sql);
  },

  /**
   * Delete a policy
   */
  deletePolicy: async (workspaceId, policyId) => {
    try {
      await write(
        `DELETE FROM data_policies WHERE id = $1 AND workspace_id = $2`,
        [policyId, workspaceId]
      );
    } catch (error) {
      console.error('Error deleting policy:', error);
      throw error;
    }
  },

  /**
   * Example policies setup for a new workspace
   */
  setupDefaultPolicies: async (workspaceId) => {
    try {
      await dataPoliciesService.setPolicy(
        workspaceId,
        'viewer',
        'orders',
        ['id', 'user_id', 'product_id', 'quantity', 'created_at'],
        'created_at >= CURRENT_DATE - INTERVAL \'30 days\''
      );

      await dataPoliciesService.setPolicy(
        workspaceId,
        'editor',
        'orders',
        ['id', 'user_id', 'product_id', 'quantity', 'total', 'created_at'],
        'created_at >= CURRENT_DATE - INTERVAL \'90 days\''
      );
    } catch (error) {
      console.error('Error setting up default policies:', error);
    }
  }
};

module.exports = dataPoliciesService;
