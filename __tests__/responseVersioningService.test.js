const {
  formatResponse,
  formatErrorResponse,
  createVersionMiddleware,
  schemaVersions
} = require('../services/responseVersioningService');

describe('responseVersioningService v4', () => {
  test('includes v4 schema in supported versions', () => {
    expect(schemaVersions.v4).toBe('v4');
  });

  test('formats v4 success responses', () => {
    const payload = formatResponse({
      sql: 'SELECT id FROM users LIMIT 10',
      results: [{ id: 1 }],
      rowCount: 1,
      executionTime: 15,
      sqlGenerated: true,
      validationDetails: { ok: true },
      requestId: 'req-1',
      workspaceId: 3,
      userId: 9,
      userRole: 'viewer',
      autoRepairUsed: false,
      pagination: { limit: 10, offset: 0, total: 1 },
      queryExplainUrl: '/api/v4/query/req-1/explain',
      optimizationHintsUrl: '/api/v4/optimization/hints'
    }, 'v4', '/api/v4');

    expect(payload.schemaVersion).toBe('v4');
    expect(payload.data.query.sql).toContain('SELECT');
    expect(payload.data.result.rowCount).toBe(1);
    expect(payload.links.queryExplain).toContain('/api/v4/query/req-1/explain');
  });

  test('formats v4 error responses', () => {
    const payload = formatErrorResponse({
      message: 'failed',
      code: 'REQUEST_FAILED',
      requestId: 'req-2'
    }, 'v4', '/api/v4');

    expect(payload.schemaVersion).toBe('v4');
    expect(payload.error.code).toBe('REQUEST_FAILED');
    expect(payload.context.requestId).toBe('req-2');
  });

  test('createVersionMiddleware applies default schema version', () => {
    const middleware = createVersionMiddleware('v4');
    const req = { query: {}, headers: {} };
    const res = {
      headers: {},
      setHeader: function (key, value) {
        this.headers[key] = value;
      },
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    middleware(req, res, next);

    expect(req.schemaVersion).toBe('v4');
    expect(res.headers['X-API-Schema-Version']).toBe('v4');
    expect(next).toHaveBeenCalled();
  });
});
