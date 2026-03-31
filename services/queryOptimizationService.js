const pool = require('../config/db');

/**
 * Query Optimization Service
 * Provides query explain analysis and optimization hints
 */
const queryOptimizationService = {
  /**
   * Explain a query and provide execution plan
   */
  explainQuery: async (sql, analyze = false) => {
    try {
      const explainSql = analyze 
        ? `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`
        : `EXPLAIN (FORMAT JSON) ${sql}`;

      const result = await pool.query(explainSql);
      return {
        plan: result.rows[0],
        analyzed: analyze
      };
    } catch (error) {
      console.error('Error explaining query:', error);
      return {
        error: error.message,
        plan: null
      };
    }
  },

  /**
   * Analyze query and suggest optimizations
   */
  analyzeAndSuggest: async (sql, workspaceId) => {
    try {
      const explainResult = await queryOptimizationService.explainQuery(sql, false);
      
      if (explainResult.error) {
        return {
          error: explainResult.error,
          suggestions: []
        };
      }

      const suggestions = [];
      const plan = explainResult.plan[0];

      // Check for sequential scans - suggest indexes
      const planJson = JSON.stringify(plan);
      if (planJson.includes('Seq Scan') && planJson.includes('Filter')) {
        suggestions.push({
          type: 'index',
          severity: 'high',
          message: 'Sequential scan detected with filters. Consider adding an index on filtered columns.',
          hint: 'CREATE INDEX idx_[table]_[column] ON [table]([column]);'
        });
      }

      // Check for nested loops with high iteration count
      if (planJson.includes('Nested Loop') && plan['Plan-Height'] > 3) {
        suggestions.push({
          type: 'join',
          severity: 'medium',
          message: 'Deep nested loop detected. May benefit from index optimization or query restructuring.'
        });
      }

      // Check for sorts
      if (planJson.includes('Sort')) {
        suggestions.push({
          type: 'sort',
          severity: 'low',
          message: 'Query includes a sort operation. Ensure sort columns are indexed if this is frequent.'
        });
      }

      // Store optimization hints in DB
      for (const suggestion of suggestions) {
        await queryOptimizationService.recordOptimizationHint(
          workspaceId,
          sql,
          suggestion.hint || suggestion.message,
          calculateImprovementEstimate(suggestion.severity)
        );
      }

      return {
        plan,
        suggestions,
        estimatedRows: plan['Plan-Rows'],
        actualRows: plan['Actual-Rows'],
        executionTime: plan['Execution Time']
      };
    } catch (error) {
      console.error('Error analyzing query:', error);
      throw error;
    }
  },

  /**
   * Record an optimization hint for future analysis
   */
  recordOptimizationHint: async (workspaceId, queryPattern, suggestedIndex, improvementPercent) => {
    try {
      await pool.query(
        `INSERT INTO query_optimization_hints 
         (workspace_id, query_pattern, suggested_index, estimated_improvement_percent)
         VALUES ($1, $2, $3, $4)`,
        [workspaceId, queryPattern, suggestedIndex, improvementPercent]
      );
    } catch (error) {
      console.error('Error recording optimization hint:', error);
    }
  },

  /**
   * Get all optimization hints for a workspace
   */
  getHints: async (workspaceId, implementedOnly = false) => {
    try {
      let query = `SELECT * FROM query_optimization_hints WHERE workspace_id = $1`;
      const params = [workspaceId];

      if (implementedOnly) {
        query += ` AND implemented = true`;
      }

      query += ` ORDER BY estimated_improvement_percent DESC`;

      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Error fetching hints:', error);
      throw error;
    }
  },

  /**
   * Mark a hint as implemented
   */
  markHintImplemented: async (hintId, workspaceId) => {
    try {
      await pool.query(
        `UPDATE query_optimization_hints SET implemented = true 
         WHERE id = $1 AND workspace_id = $2`,
        [hintId, workspaceId]
      );
    } catch (error) {
      console.error('Error marking hint as implemented:', error);
      throw error;
    }
  }
};

/**
 * Helper: Calculate improvement estimate based on severity
 */
function calculateImprovementEstimate(severity) {
  const estimates = {
    high: 40,
    medium: 20,
    low: 5
  };
  return estimates[severity] || 10;
}

module.exports = queryOptimizationService;
