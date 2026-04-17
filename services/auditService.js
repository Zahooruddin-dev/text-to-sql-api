const pool = require('../config/db');

const write = typeof pool.writeQuery === 'function'
  ? pool.writeQuery.bind(pool)
  : pool.query.bind(pool);

/**
 * Audit Logging Service
 * Persists all API requests and actions to audit_logs table
 */
const auditService = {
  /**
   * Log an audit event
   */
  log: async (auditData) => {
    try {
      const {
        workspaceId,
        userId,
        requestId,
        action,
        resourceType,
        resourceId,
        details = {},
        ipAddress,
        userAgent,
        statusCode,
        durationMs
      } = auditData;

      await write(
        `INSERT INTO audit_logs 
         (workspace_id, user_id, request_id, action, resource_type, resource_id, 
          details, ip_address, user_agent, status_code, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          workspaceId,
          userId || null,
          requestId,
          action,
          resourceType || null,
          resourceId || null,
          JSON.stringify(details),
          ipAddress,
          userAgent,
          statusCode,
          durationMs
        ]
      );
    } catch (error) {
      console.error('Audit log insert error:', error);
      // Don't throw - audit failures shouldn't break the app
    }
  },

  /**
   * Get audit logs for a workspace with pagination
   */
  getLogs: async (workspaceId, filters = {}) => {
    try {
      const {
        userId,
        action,
        resourceType,
        startDate,
        endDate,
        limit = 100,
        offset = 0
      } = filters;

      let query = `SELECT * FROM audit_logs WHERE workspace_id = $1`;
      let params = [workspaceId];
      let paramIndex = 2;

      if (userId) {
        query += ` AND user_id = $${paramIndex}`;
        params.push(userId);
        paramIndex++;
      }

      if (action) {
        query += ` AND action = $${paramIndex}`;
        params.push(action);
        paramIndex++;
      }

      if (resourceType) {
        query += ` AND resource_type = $${paramIndex}`;
        params.push(resourceType);
        paramIndex++;
      }

      if (startDate) {
        query += ` AND created_at >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        query += ` AND created_at <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      // Get total count for pagination
      let countQuery = `SELECT COUNT(*) as total FROM audit_logs WHERE workspace_id = $1`;
      let countParams = [workspaceId];
      let countParamIndex = 2;

      if (userId) {
        countQuery += ` AND user_id = $${countParamIndex}`;
        countParams.push(userId);
        countParamIndex++;
      }

      if (action) {
        countQuery += ` AND action = $${countParamIndex}`;
        countParams.push(action);
        countParamIndex++;
      }

      if (resourceType) {
        countQuery += ` AND resource_type = $${countParamIndex}`;
        countParams.push(resourceType);
        countParamIndex++;
      }

      const countResult = await pool.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].total, 10);

      return {
        data: result.rows,
        pagination: {
          total,
          limit,
          offset,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      throw error;
    }
  },

  /**
   * Get audit summary stats
   */
  getStats: async (workspaceId, days = 7) => {
    try {
      const result = await pool.query(
        `SELECT 
           action, 
           COUNT(*) as count,
           SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) as successful,
           AVG(duration_ms) as avg_duration_ms
         FROM audit_logs
         WHERE workspace_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'
         GROUP BY action
         ORDER BY count DESC`,
        [workspaceId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching audit stats:', error);
      throw error;
    }
  }
};

module.exports = auditService;
