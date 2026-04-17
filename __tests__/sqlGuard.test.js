const { validateSelectSQL, applyPagination } = require('../utils/sqlGuard');

describe('validateSelectSQL', () => {
  test('accepts single SELECT with allowed table, columns and limit', () => {
    const result = validateSelectSQL('SELECT u.id, u.name FROM users u LIMIT 10');
    expect(result.ok).toBe(true);
  });

  test('rejects mutation queries', () => {
    const result = validateSelectSQL('DELETE FROM users WHERE id = 1');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Only SELECT/);
  });

  test('rejects multiple statements', () => {
    const result = validateSelectSQL('SELECT * FROM users LIMIT 5; SELECT * FROM orders LIMIT 5');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Multiple SQL statements|Only one SQL statement/);
  });

  test('rejects missing limit', () => {
    const result = validateSelectSQL('SELECT id FROM users');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/LIMIT/);
  });

  test('rejects limit above max', () => {
    const result = validateSelectSQL('SELECT id FROM users LIMIT 9999');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cannot exceed/);
  });

  test('rejects unknown columns', () => {
    const result = validateSelectSQL('SELECT password_hash FROM users LIMIT 10');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Column is not allowed/);
  });

  test('allows wildcard in default mode', () => {
    const result = validateSelectSQL('SELECT * FROM users LIMIT 10');
    expect(result.ok).toBe(true);
  });

  test('rejects wildcard in strict mode', () => {
    const result = validateSelectSQL(
      'SELECT * FROM users LIMIT 10',
      undefined,
      { disallowWildcard: true }
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Wildcard selection is not allowed/);
  });
});

describe('applyPagination', () => {
  test('rewrites existing limit with requested limit and offset', () => {
    const sql = applyPagination('SELECT id, name FROM users LIMIT 10', 25, 5);
    expect(sql).toMatch(/LIMIT 25 OFFSET 5$/);
  });

  test('enforces max limit cap', () => {
    const sql = applyPagination('SELECT id FROM users LIMIT 10', 9999, 0);
    expect(sql).toMatch(/LIMIT 200$/);
  });

  test('throws for non-select statements', () => {
    expect(() => applyPagination('DELETE FROM users WHERE id = 1', 10, 0)).toThrow(/SELECT/);
  });
});