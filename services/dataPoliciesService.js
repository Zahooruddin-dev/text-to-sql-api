const pool = require('../config/db');

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
      const result = await pool.query(
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

  /**
   * Apply policies to a SQL query based on user role
   * Modifies the query to add WHERE clauses and COLUMN restrictions
   */
  applifyPolicies: async (workspaceId, role, sql) => {
    try {
      // This is a simplified implementation
      // In production, you'd need to parse the SQL properly and apply restrictions
      const policies = await dataPoliciesService.getPoliciesForRole(workspaceId, role);
      
      let modifiedSql = sql;

      for (const policy of policies) {
        // Add WHERE clause filtering if policy has row_filter_sql
        if (policy.row_filter_sql) {
          // Simple append - in production use proper SQL parser
          if (!modifiedSql.toLowerCase().includes('where')) {
            modifiedSql = modifiedSql.replace(
              new RegExp(`FROM ${policy.table_name}`, 'i'),
              `FROM ${policy.table_name} WHERE ${policy.row_filter_sql}`
            );
          }
        }
      }

      return modifiedSql;
    } catch (error) {
      console.error('Error applying policies:', error);
      return sql; // Return original if policy application fails
    }
  },

  /**
   * Delete a policy
   */
  deletePolicy: async (workspaceId, policyId) => {
    try {
      await pool.query(
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
      // Viewer role: can only see non-sensitive columns and limited rows
      await dataPoliciesService.setPolicy(
        workspaceId,
        'viewer',
        'orders',
        ['id', 'user_id', 'product_id', 'quantity', 'created_at'],
        'created_at >= CURRENT_DATE - INTERVAL \'30 days\''
      );

      // Editor role: can see all order columns from last 90 days
      await dataPoliciesService.setPolicy(
        workspaceId,
        'editor',
        'orders',
        ['id', 'user_id', 'product_id', 'quantity', 'total', 'created_at'],
        'created_at >= CURRENT_DATE - INTERVAL \'90 days\''
      );

      // Admin role: no restrictions (handled in controller)
    } catch (error) {
      console.error('Error setting up default policies:', error);
    }
  }
};

module.exports = dataPoliciesService;
