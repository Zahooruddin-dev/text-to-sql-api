const { validateSelectSQL } = require('../utils/sqlGuard');

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
});