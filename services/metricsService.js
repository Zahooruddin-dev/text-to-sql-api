const pool = require('../config/db');

const write = typeof pool.writeQuery === 'function'
  ? pool.writeQuery.bind(pool)
  : pool.query.bind(pool);

const metrics = {
  startedAt: new Date().toISOString(),
  requestsTotal: 0,
  previewTotal: 0,
  executeTotal: 0,
  succeededTotal: 0,
  failedTotal: 0,
  autoRepairAttempts: 0,
  totalLatencyMs: 0,
  avgRowsReturned: 0
};

/**
 * Record a request in memory and persist to database
 */
async function recordRequest(options = {}) {
  const {
    mode,
    success,
    latencyMs,
    autoRepairUsed,
    workspaceId,
    userId,
    requestId,
    rowCount,
    errorMessage,
    sqlPreview,
    endpoint,
    responseVersion = 'v3'
  } = options;

  // Update in-memory metrics
  metrics.requestsTotal += 1;
  if (mode === 'preview') {
    metrics.previewTotal += 1;
  }
  if (mode === 'execute') {
    metrics.executeTotal += 1;
  }

  if (success) {
    metrics.succeededTotal += 1;
  } else {
    metrics.failedTotal += 1;
  }

  if (autoRepairUsed) {
    metrics.autoRepairAttempts += 1;
  }

  metrics.totalLatencyMs += Number(latencyMs || 0);

  // Persist to database if workspaceId is provided (V3 feature)
  if (workspaceId) {
    try {
      await write(
        `INSERT INTO query_metrics 
         (workspace_id, user_id, request_id, query_time_ms, row_count, success, 
          error_message, sql_preview, endpoint, response_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          workspaceId,
          userId || null,
          requestId,
          latencyMs || 0,
          rowCount || 0,
          success || false,
          errorMessage || null,
          sqlPreview || null,
          endpoint || null,
          responseVersion
        ]
      );
    } catch (error) {
      console.error('Error persisting metrics:', error);
      // Don't throw - metrics persistence shouldn't break the API
    }
  }
}

/**
 * Get in-memory metrics snapshot
 */
function getMetricsSnapshot() {
  const avgLatencyMs = metrics.requestsTotal > 0
    ? Number((metrics.totalLatencyMs / metrics.requestsTotal).toFixed(2))
    : 0;

  return {
    ...metrics,
    avgLatencyMs
  };
}

/**
 * Get persistent metrics from database
 */
async function getPersistedMetrics(workspaceId, options = {}) {
  try {
    const safeLimit = Math.min(Math.max(Number(options.limit) || 1000, 1), 5000);
    const safeDays = Math.min(Math.max(Number(options.days) || 7, 1), 365);

    const result = await pool.query(
      `SELECT 
         endpoint,
         response_version,
         COUNT(*) as total_requests,
         SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful_requests,
         AVG(query_time_ms) as avg_query_time_ms,
         MAX(query_time_ms) as max_query_time_ms,
         MIN(query_time_ms) as min_query_time_ms,
         AVG(row_count) as avg_rows_returned
       FROM query_metrics
       WHERE workspace_id = $1 
         AND created_at >= NOW() - ($2::int * INTERVAL '1 day')
       GROUP BY endpoint, response_version
       ORDER BY total_requests DESC
       LIMIT $3`,
      [workspaceId, safeDays, safeLimit]
    );

    return result.rows;
  } catch (error) {
    console.error('Error fetching persisted metrics:', error);
    return [];
  }
}

/**
 * Get metrics for specific time period
 */
async function getMetricsTimeSeries(workspaceId, options = {}) {
  try {
    const safeDays = Math.min(Math.max(Number(options.days) || 7, 1), 365);
    const interval = options.interval || 'hour';

    const intervalMap = {
      day: 'day',
      hour: 'hour',
      minute: 'minute'
    };

    const timeInterval = intervalMap[interval] || 'hour';

    const result = await pool.query(
      `SELECT 
         DATE_TRUNC('${timeInterval}', created_at) as bucket,
         COUNT(*) as request_count,
         SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful_count,
         AVG(query_time_ms) as avg_duration_ms
       FROM query_metrics
       WHERE workspace_id = $1 
         AND created_at >= NOW() - ($2::int * INTERVAL '1 day')
       GROUP BY DATE_TRUNC('${timeInterval}', created_at)
       ORDER BY bucket DESC`,
      [workspaceId, safeDays]
    );

    return result.rows;
  } catch (error) {
    console.error('Error fetching metrics time series:', error);
    return [];
  }
}

module.exports = {
  recordRequest,
  getMetricsSnapshot,
  getPersistedMetrics,
  getMetricsTimeSeries
};