const pool = require('../config/db');

/**
 * Role-Based Access Control (RBAC) Middleware for V3
 * Checks if user has required role and permissions
 */
const rbac = {
  /**
   * Middleware factory - checks if user has required role
   */
  requireRole: (allowedRoles) => {
    return async (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ 
          error: 'Forbidden',
          code: 'INSUFFICIENT_ROLE',
          required: allowedRoles,
          actual: req.user.role
        });
      }

      next();
    };
  },

  /**
   * Check if user has a specific permission
   */
  hasPermission: async (userId, workspaceId, permission) => {
    try {
      const result = await pool.query(
        `SELECT 1 FROM tenant_permissions 
         WHERE user_id = $1 AND workspace_id = $2 AND permission = $3`,
        [userId, workspaceId, permission]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error('Permission check error:', error);
      return false;
    }
  },

  /**
   * Get all roles for a workspace
   */
  getWorkspaceRoles: async (workspaceId) => {
    try {
      const result = await pool.query(
        `SELECT id, name, description, permissions FROM roles 
         WHERE workspace_id = $1 ORDER BY name`,
        [workspaceId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching roles:', error);
      return [];
    }
  },

  /**
   * Create a custom role
   */
  createRole: async (workspaceId, roleName, permissions) => {
    try {
      const result = await pool.query(
        `INSERT INTO roles (workspace_id, name, permissions)
         VALUES ($1, $2, $3)
         RETURNING id, name, permissions`,
        [workspaceId, roleName, JSON.stringify(permissions)]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error creating role:', error);
      throw error;
    }
  }
};

module.exports = rbac;
