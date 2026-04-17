jest.mock('../config/db', () => ({
  query: jest.fn(),
  writeQuery: jest.fn()
}));

const pool = require('../config/db');
const dataPoliciesService = require('../services/dataPoliciesService');

describe('dataPoliciesService.applyPolicies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns normalized SQL when no policies exist', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const sql = await dataPoliciesService.applyPolicies(
      1,
      'viewer',
      'SELECT id FROM users LIMIT 10;'
    );

    expect(sql.endsWith(';')).toBe(false);
    expect(sql).toContain('SELECT');
    expect(sql).toContain('LIMIT 10');
  });

  test('applies row and column policies using AST rewrite', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          table_name: 'orders',
          allowed_columns: ['id', 'total'],
          row_filter_sql: 'total > 100'
        }
      ]
    });

    const sql = await dataPoliciesService.applyPolicies(
      7,
      'viewer',
      'SELECT o.* FROM orders o LIMIT 25'
    );

    expect(sql).toMatch(/id/i);
    expect(sql).toMatch(/total/i);
    expect(sql).not.toMatch(/quantity/i);
    expect(sql).toMatch(/WHERE/i);
    expect(sql).toMatch(/100/);
    expect(sql).toMatch(/LIMIT 25$/);
  });

  test('throws when row filter SQL is invalid', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          table_name: 'orders',
          allowed_columns: ['id'],
          row_filter_sql: 'this is not valid sql'
        }
      ]
    });

    await expect(
      dataPoliciesService.applyPolicies(2, 'viewer', 'SELECT id FROM orders LIMIT 10')
    ).rejects.toThrow();
  });

  test('rejects strict mode when no policies exist', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      dataPoliciesService.applyPolicies(
        3,
        'viewer',
        'SELECT id FROM users LIMIT 10',
        { requirePoliciesForAllTables: true }
      )
    ).rejects.toThrow(/Strict policy mode requires explicit policies/);
  });

  test('rejects strict mode when any table is missing policy coverage', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          table_name: 'orders',
          allowed_columns: ['id'],
          row_filter_sql: null
        }
      ]
    });

    await expect(
      dataPoliciesService.applyPolicies(
        4,
        'viewer',
        'SELECT u.id, o.id FROM users u JOIN orders o ON o.user_id = u.id LIMIT 10',
        { requirePoliciesForAllTables: true }
      )
    ).rejects.toThrow(/Missing strict data policies for tables/);
  });
});
