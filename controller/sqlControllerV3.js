const { generateSQL, repairSQL } = require('../config/bedrockService');
const pool = require('../config/db');
const { validateSelectSQL } = require('../utils/sqlGuard');
const { getAllowedColumnsMap, getSchemaContext, refreshSchemaCache } = require('../services/schemaService');
const { recordRequest } = require('../services/metricsService');
const auditService = require('../services/auditService');
const dataPoliciesService = require('../services/dataPoliciesService');
const queryOptimizationService = require('../services/queryOptimizationService');
const { formatResponse, formatErrorResponse } = require('../services/responseVersioningService');
const rbac = require('../services/rbacService');

const QUERY_TIMEOUT_MS = Number(process.env.QUERY_TIMEOUT_MS || 5000);
const ENABLE_AUTO_REPAIR = process.env.ENABLE_AUTO_REPAIR !== 'false';

/**
 * Logging utility
 */
function logEvent(level, payload) {
  const line = JSON.stringify({
    level,
    timestamp: new Date().toISOString(),
    ...payload
  });
  if (level === 'error') {
    console.error(line);
    return;
  }
  console.log(line);
}

/**
 * Prepare and validate SQL with optional policy application
 */
async function prepareValidatedSql(question, workspaceId, userRole) {
  const schemaContext = await getSchemaContext();
  const allowedColumnsMap = await getAllowedColumnsMap();

  const firstAttempt = await generateSQL(question, schemaContext);
  let validation = validateSelectSQL(firstAttempt, allowedColumnsMap);

  if (validation.ok || !ENABLE_AUTO_REPAIR) {
    let finalSql = validation.sql;

    // Apply data policies based on role
    if (workspaceId && userRole !== 'admin') {
      finalSql = await dataPoliciesService.applifyPolicies(workspaceId, userRole, finalSql);
    }

    return {
      sql: finalSql,
      rawSql: firstAttempt,
      validation,
      autoRepairUsed: false
    };
  }

  const repairedSql = await repairSQL({
    question,
    invalidSql: firstAttempt,
    validationError: validation.error,
    schemaContext
  });

  validation = validateSelectSQL(repairedSql, allowedColumnsMap);

  let finalSql = validation.sql;
  if (workspaceId && userRole !== 'admin') {
    finalSql = await dataPoliciesService.applifyPolicies(workspaceId, userRole, finalSql);
  }

  return {
    sql: finalSql,
    rawSql: repairedSql,
    validation,
    autoRepairUsed: true,
    previousSql: firstAttempt
  };
}

/**
 * Handle pagination offset/limit validation
 */
function getPaginationParams(query) {
  let limit = parseInt(query.limit || '50', 10);
  let offset = parseInt(query.offset || '0', 10);

  // Validate and constrain limits
  limit = Math.min(Math.max(1, limit), 1000); // Min 1, Max 1000
  offset = Math.max(0, offset);

  return { limit, offset };
}

/**
 * V3: Ask endpoint with all new features
 */
exports.askV3 = async (req, res) => {
  const startedAt = Date.now();
  const { question, includeExplain = false, includeSuggestions = false } = req.body;
  const { schema_version: schemaVersion = 'v3' } = req.query;
  const { limit, offset } = getPaginationParams(req.query);

  // Validate input
  if (!question || typeof question !== 'string' || !question.trim()) {
    const error = {
      message: 'question is required and must be a string',
      code: 'QUESTION_REQUIRED',
      requestId: req.requestId
    };

    await auditService.log({
      workspaceId: req.user.workspaceId,
      userId: req.user.id,
      requestId: req.requestId,
      action: 'ask',
      resourceType: 'query',
      statusCode: 400,
      durationMs: Date.now() - startedAt,
      details: { error: 'invalid_question' }
    });

    return res.status(400).json(formatErrorResponse(error, schemaVersion));
  }

  try {
    // Prepare SQL
    const prepared = await prepareValidatedSql(
      question,
      req.user.workspaceId,
      req.user.role
    );

    if (!prepared.validation.ok) {
      await recordRequest({
        workspaceId: req.user.workspaceId,
        userId: req.user.id,
        requestId: req.requestId,
        mode: 'execute',
        success: false,
        latencyMs: Date.now() - startedAt,
        autoRepairUsed: prepared.autoRepairUsed,
        endpoint: '/ask',
        responseVersion: schemaVersion
      });

      await auditService.log({
        workspaceId: req.user.workspaceId,
        userId: req.user.id,
        requestId: req.requestId,
        action: 'ask',
        resourceType: 'query',
        statusCode: 400,
        durationMs: Date.now() - startedAt,
        details: { validationError: prepared.validation.error }
      });

      const error = {
        message: prepared.validation.error,
        code: 'SQL_VALIDATION_FAILED',
        requestId: req.requestId,
        details: { sql: prepared.rawSql }
      };
      return res.status(400).json(formatErrorResponse(error, schemaVersion));
    }

    // Execute query
    const result = await pool.query({
      text: prepared.sql + ` LIMIT ${limit} OFFSET ${offset}`,
      query_timeout: QUERY_TIMEOUT_MS
    });

    const latencyMs = Date.now() - startedAt;

    // Record metrics
    await recordRequest({
      workspaceId: req.user.workspaceId,
      userId: req.user.id,
      requestId: req.requestId,
      mode: 'execute',
      success: true,
      latencyMs,
      autoRepairUsed: prepared.autoRepairUsed,
      rowCount: result.rows.length,
      sqlPreview: prepared.sql.substring(0, 500),
      endpoint: '/ask',
      responseVersion: schemaVersion
    });

    // Log success
    await auditService.log({
      workspaceId: req.user.workspaceId,
      userId: req.user.id,
      requestId: req.requestId,
      action: 'ask',
      statusCode: 200,
      durationMs: latencyMs,
      details: { rowCount: result.rows.length, autoRepairUsed: prepared.autoRepairUsed }
    });

    // Prepare response
    let responseData = {
      sql: prepared.sql,
      results: result.rows,
      rowCount: result.rows.length,
      executionTime: latencyMs,
      sqlGenerated: true,
      validationDetails: prepared.validation,
      requestId: req.requestId,
      workspaceId: req.user.workspaceId,
      userId: req.user.id,
      userRole: req.user.role,
      autoRepairUsed: prepared.autoRepairUsed,
      pagination: { limit, offset, total: result.rows.length }
    };

    // Add explain plan if requested
    if (includeExplain) {
      try {
        const explainResult = await queryOptimizationService.explainQuery(prepared.sql, false);
        responseData.queryExplainUrl = `/api/v3/query/${req.requestId}/explain`;
      } catch (err) {
        logEvent('warn', { event: 'explain_failed', error: err.message });
      }
    }

    // Add optimization suggestions if requested
    if (includeSuggestions) {
      try {
        const suggestions = await queryOptimizationService.analyzeAndSuggest(
          prepared.sql,
          req.user.workspaceId
        );
        responseData.optimizationHintsUrl = `/api/v3/query/${req.requestId}/hints`;
      } catch (err) {
        logEvent('warn', { event: 'suggestions_failed', error: err.message });
      }
    }

    return res.json(formatResponse(responseData, schemaVersion, '/api/v3'));
  } catch (err) {
    const latencyMs = Date.now() - startedAt;

    await recordRequest({
      workspaceId: req.user.workspaceId,
      userId: req.user.id,
      requestId: req.requestId,
      mode: 'execute',
      success: false,
      latencyMs,
      errorMessage: err.message,
      endpoint: '/ask',
      responseVersion: schemaVersion
    });

    await auditService.log({
      workspaceId: req.user.workspaceId,
      userId: req.user.id,
      requestId: req.requestId,
      action: 'ask',
      statusCode: 500,
      durationMs: latencyMs,
      details: { error: err.message }
    });

    logEvent('error', {
      requestId: req.requestId,
      event: 'ask_failed',
      error: err.message
    });

    const error = {
      message: 'Failed to process query',
      code: 'REQUEST_FAILED',
      requestId: req.requestId
    };
    return res.status(500).json(formatErrorResponse(error, schemaVersion));
  }
};

/**
 * V3: Preview endpoint
 */
exports.previewV3 = async (req, res) => {
  const startedAt = Date.now();
  const { question } = req.body;
  const { schema_version: schemaVersion = 'v3' } = req.query;

  if (!question || typeof question !== 'string' || !question.trim()) {
    const error = {
      message: 'question is required',
      code: 'QUESTION_REQUIRED',
      requestId: req.requestId
    };

    await auditService.log({
      workspaceId: req.user.workspaceId,
      userId: req.user.id,
      requestId: req.requestId,
      action: 'preview',
      statusCode: 400,
      durationMs: Date.now() - startedAt
    });

    return res.status(400).json(formatErrorResponse(error, schemaVersion));
  }

  try {
    const prepared = await prepareValidatedSql(question, req.user.workspaceId, req.user.role);

    await auditService.log({
      workspaceId: req.user.workspaceId,
      userId: req.user.id,
      requestId: req.requestId,
      action: 'preview',
      statusCode: 200,
      durationMs: Date.now() - startedAt,
      details: { valid: prepared.validation.ok }
    });

    const responseData = {
      sql: prepared.sql,
      results: [],
      rowCount: 0,
      sqlGenerated: true,
      validationDetails: prepared.validation,
      requestId: req.requestId,
      autoRepairUsed: prepared.autoRepairUsed
    };

    return res.json(formatResponse(responseData, schemaVersion, '/api/v3'));
  } catch (err) {
    await auditService.log({
      workspaceId: req.user.workspaceId,
      userId: req.user.id,
      requestId: req.requestId,
      action: 'preview',
      statusCode: 500,
      durationMs: Date.now() - startedAt
    });

    const error = {
      message: err.message,
      code: 'PREVIEW_FAILED',
      requestId: req.requestId
    };
    return res.status(500).json(formatErrorResponse(error, schemaVersion));
  }
};

/**
 * V3: Query Explain endpoint
 */
exports.explainQuery = async (req, res) => {
  const { queryId } = req.params;
  const { analyze = false } = req.query;

  try {
    // Get the original SQL from audit or metrics
    const queryResult = await pool.query(
      `SELECT sql_preview FROM query_metrics WHERE request_id = $1 AND workspace_id = $2`,
      [queryId, req.user.workspaceId]
    );

    if (queryResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Query not found',
        code: 'QUERY_NOT_FOUND'
      });
    }

    const sql = queryResult.rows[0].sql_preview;
    const explanation = await queryOptimizationService.explainQuery(sql, analyze === 'true');

    return res.json({
      status: 'success',
      queryId,
      explained: true,
      analyzed: analyze === 'true',
      plan: explanation.plan,
      suggestions: []
    });
  } catch (err) {
    logEvent('error', { event: 'explain_query_failed', error: err.message });
    return res.status(500).json({
      error: err.message,
      code: 'EXPLAIN_FAILED'
    });
  }
};

/**
 * V3: Get Optimization Hints for a query
 */
exports.getOptimizationHints = async (req, res) => {
  try {
    const hints = await queryOptimizationService.getHints(req.user.workspaceId);
    return res.json({
      status: 'success',
      hints,
      total: hints.length
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
      code: 'HINTS_FAILED'
    });
  }
};

/**
 * V3: Get Audit Logs
 */
exports.getAuditLogs = async (req, res) => {
  try {
    const { userId, action, days = 7, limit = 100, offset = 0 } = req.query;

    const filters = {
      userId: userId ? parseInt(userId, 10) : null,
      action,
      startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
      limit: Math.min(parseInt(limit, 10) || 100, 1000),
      offset: parseInt(offset, 10) || 0
    };

    const logs = await auditService.getLogs(req.user.workspaceId, filters);
    return res.json({
      status: 'success',
      data: logs.data,
      pagination: logs.pagination
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
      code: 'AUDIT_LOGS_FAILED'
    });
  }
};

/**
 * V3: Get Audit Statistics
 */
exports.getAuditStats = async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const stats = await auditService.getStats(req.user.workspaceId, parseInt(days, 10) || 7);
    return res.json({
      status: 'success',
      stats
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
      code: 'AUDIT_STATS_FAILED'
    });
  }
};

/**
 * V3: Refresh Schema
 */
exports.refreshSchema = async (req, res) => {
  try {
    const refreshed = await refreshSchemaCache();

    await auditService.log({
      workspaceId: req.user.workspaceId,
      userId: req.user.id,
      requestId: req.requestId,
      action: 'schema_refresh',
      statusCode: 200,
      durationMs: 0
    });

    return res.json({
      status: 'success',
      tables: Object.keys(refreshed.allowedColumns || {}),
      cachedUntil: new Date(refreshed.expiresAt).toISOString()
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
      code: 'SCHEMA_REFRESH_FAILED'
    });
  }
};

/**
 * V3: Check Query Permissions (for multi-tenant)
 */
exports.checkPermissions = async (req, res) => {
  try {
    const hasExecPerm = await rbac.hasPermission(
      req.user.id,
      req.user.workspaceId,
      'execute_queries'
    );

    const hasPreviePerm = await rbac.hasPermission(
      req.user.id,
      req.user.workspaceId,
      'preview_queries'
    );

    return res.json({
      status: 'success',
      permissions: {
        executeQueries: hasExecPerm,
        previewQueries: hasPreviePerm,
        userRole: req.user.role
      }
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
      code: 'PERMISSION_CHECK_FAILED'
    });
  }
};
