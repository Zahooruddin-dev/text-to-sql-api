/**
 * Response Schema Versioning Service
 * Manages different response formats for backward compatibility and new features
 */
const schemaVersions = {
  v1: 'v1',
  v2: 'v2',
  v3: 'v3'
};

/**
 * Format response based on requested schema version
 */
function formatResponse(data, version = 'v3', apiVersion = '/api/v3') {
  const baseResponse = {
    status: 'success',
    apiVersion,
    schemaVersion: version,
    timestamp: new Date().toISOString()
  };

  switch (version) {
    case 'v1':
      // Legacy V1 response format
      return {
        ...baseResponse,
        sql: data.sql,
        results: data.results,
        rowCount: data.rowCount
      };

    case 'v2':
      // V2 response format with metadata
      return {
        ...baseResponse,
        data: {
          sql: data.sql,
          results: data.results,
          rowCount: data.rowCount,
          executionTime: data.executionTime
        },
        meta: {
          requestId: data.requestId
        }
      };

    case 'v3':
      // V3 response format with pagination, versioning, and advanced features
      return {
        status: 'success',
        apiVersion,
        schemaVersion: version,
        timestamp: new Date().toISOString(),
        data: {
          sql: data.sql,
          results: data.results || [],
          rowCount: data.rowCount,
          executionTime: data.executionTime,
          sqlGenerated: data.sqlGenerated, // Indicate if SQL was generated vs provided
          validationDetails: data.validationDetails
        },
        pagination: {
          limit: data.pagination?.limit || data.results?.length || 0,
          offset: data.pagination?.offset || 0,
          total: data.pagination?.total || data.rowCount || 0,
          hasMore: (data.pagination?.offset || 0) + (data.pagination?.limit || 0) < (data.pagination?.total || data.rowCount || 0)
        },
        meta: {
          requestId: data.requestId,
          workspaceId: data.workspaceId,
          userId: data.userId,
          userRole: data.userRole,
          autoRepairUsed: data.autoRepairUsed,
          queryExplainUrl: data.queryExplainUrl,
          optimizationHintsUrl: data.optimizationHintsUrl
        }
      };

    default:
      return formatResponse(data, 'v3', apiVersion);
  }
}

/**
 * Format error response based on schema version
 */
function formatErrorResponse(error, version = 'v3', apiVersion = '/api/v3') {
  const baseError = {
    status: 'error',
    apiVersion,
    schemaVersion: version,
    timestamp: new Date().toISOString()
  };

  switch (version) {
    case 'v1':
      return {
        ...baseError,
        error: error.message,
        code: error.code || 'UNKNOWN_ERROR'
      };

    case 'v2':
      return {
        ...baseError,
        error: {
          message: error.message,
          code: error.code || 'UNKNOWN_ERROR'
        }
      };

    case 'v3':
      return {
        ...baseError,
        error: {
          message: error.message,
          code: error.code || 'UNKNOWN_ERROR',
          details: error.details || {}
        },
        requestId: error.requestId,
        help: error.helpUrl || 'https://api.docs/errors/' + (error.code || 'UNKNOWN')
      };

    default:
      return formatErrorResponse(error, 'v3', apiVersion);
  }
}

/**
 * Middleware to set response schema version from query param or header
 */
function versionMiddleware(req, res, next) {
  const version = req.query.schema_version || 
                 req.headers['accept-version'] || 
                 req.headers['x-api-schema-version'] || 
                 'v3';

  // Validate version
  if (!Object.values(schemaVersions).includes(version)) {
    return res.status(400).json({
      error: 'Invalid schema version',
      code: 'INVALID_SCHEMA_VERSION',
      supportedVersions: Object.values(schemaVersions)
    });
  }

  req.schemaVersion = version;
  res.setHeader('X-API-Schema-Version', version);
  next();
}

module.exports = {
  formatResponse,
  formatErrorResponse,
  versionMiddleware,
  schemaVersions
};
