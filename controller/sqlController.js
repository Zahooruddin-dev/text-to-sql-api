const { generateSQL, repairSQL } = require('../config/bedrockService');
const pool = require('../config/db');
const { validateSelectSQL } = require('../utils/sqlGuard');
const { getAllowedColumnsMap, getSchemaContext, refreshSchemaCache } = require('../services/schemaService');
const { recordRequest } = require('../services/metricsService');

const QUERY_TIMEOUT_MS = Number(process.env.QUERY_TIMEOUT_MS || 5000);
const ENABLE_AUTO_REPAIR = process.env.ENABLE_AUTO_REPAIR !== 'false';

function sendError(res, status, code, message, extras = {}) {
  return res.status(status).json({
    status: 'error',
    code,
    error: message,
    ...extras
  });
}

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

async function prepareValidatedSql(question) {
  const schemaContext = await getSchemaContext();
  const allowedColumnsMap = await getAllowedColumnsMap();

  const firstAttempt = await generateSQL(question, schemaContext);
  let validation = validateSelectSQL(firstAttempt, allowedColumnsMap);

  if (validation.ok || !ENABLE_AUTO_REPAIR) {
    return {
      sql: validation.sql,
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

  return {
    sql: validation.sql,
    rawSql: repairedSql,
    validation,
    autoRepairUsed: true,
    previousSql: firstAttempt
  };
}

async function handleQuestion(req, res, mode) {
  const startedAt = Date.now();
  const { question } = req.body;

  if (!question || typeof question !== 'string' || !question.trim()) {
    return sendError(res, 400, 'QUESTION_REQUIRED', 'question is required');
  }

  try {
    const prepared = await prepareValidatedSql(question);

    if (!prepared.validation.ok) {
      recordRequest({
        mode,
        success: false,
        latencyMs: Date.now() - startedAt,
        autoRepairUsed: prepared.autoRepairUsed
      });

      return sendError(res, 400, 'SQL_VALIDATION_FAILED', prepared.validation.error, {
        sql: prepared.rawSql,
        autoRepairUsed: prepared.autoRepairUsed
      });
    }

    if (mode === 'preview') {
      recordRequest({
        mode,
        success: true,
        latencyMs: Date.now() - startedAt,
        autoRepairUsed: prepared.autoRepairUsed
      });

      return res.json({
        status: 'success',
        mode: 'preview',
        question,
        sql: prepared.sql,
        autoRepairUsed: prepared.autoRepairUsed
      });
    }

    const result = await pool.query({
      text: prepared.sql,
      query_timeout: QUERY_TIMEOUT_MS
    });

    const latencyMs = Date.now() - startedAt;
    recordRequest({ mode, success: true, latencyMs, autoRepairUsed: prepared.autoRepairUsed });

    logEvent('info', {
      requestId: req.requestId,
      event: 'sql_execute_success',
      mode,
      latencyMs,
      rowCount: result.rowCount,
      autoRepairUsed: prepared.autoRepairUsed
    });

    return res.json({
      status: 'success',
      mode: 'execute',
      question,
      sql: prepared.sql,
      autoRepairUsed: prepared.autoRepairUsed,
      rowCount: result.rowCount,
      data: result.rows
    });
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    recordRequest({ mode, success: false, latencyMs, autoRepairUsed: false });
    logEvent('error', {
      requestId: req.requestId,
      event: 'sql_request_failed',
      mode,
      latencyMs,
      message: err.message
    });

    return sendError(res, 500, 'REQUEST_FAILED', 'Failed to generate or run SQL', {
      details: err.message
    });
  }
}

exports.previewSQL = async (req, res) => handleQuestion(req, res, 'preview');
exports.executeSQL = async (req, res) => handleQuestion(req, res, 'execute');
exports.generateAndRunSQL = exports.executeSQL;

exports.refreshSchema = async (req, res) => {
  try {
    const refreshed = await refreshSchemaCache();
    return res.json({
      status: 'success',
      tables: Object.keys(refreshed.allowedColumns || {}),
      cachedUntil: new Date(refreshed.expiresAt).toISOString()
    });
  } catch (err) {
    return sendError(res, 500, 'SCHEMA_REFRESH_FAILED', 'Failed to refresh schema cache', {
      details: err.message
    });
  }
};