jest.mock('../services/llmAdapter', () => ({
  generateSQL: jest.fn(),
  repairSQL: jest.fn()
}));

jest.mock('../config/db', () => ({
  query: jest.fn()
}));

const request = require('supertest');
const { generateSQL, repairSQL } = require('../services/llmAdapter');
const pool = require('../config/db');

describe('POST /api/v2/ask', () => {
  let app;

  beforeAll(() => {
    process.env.API_SECRET = 'test-secret';
    process.env.RATE_LIMIT_MAX = '1000';
    process.env.QUERY_TIMEOUT_MS = '2000';
    app = require('../server');
  });

  beforeEach(() => {
    jest.clearAllMocks();

    pool.query.mockImplementation((input) => {
      if (typeof input === 'string' && input.includes('information_schema.columns')) {
        return Promise.resolve({
          rows: [
            { table_name: 'users', column_name: 'id' },
            { table_name: 'users', column_name: 'name' },
            { table_name: 'users', column_name: 'email' },
            { table_name: 'users', column_name: 'created_at' },
            { table_name: 'products', column_name: 'id' },
            { table_name: 'products', column_name: 'name' },
            { table_name: 'products', column_name: 'price' },
            { table_name: 'products', column_name: 'stock' },
            { table_name: 'products', column_name: 'created_at' },
            { table_name: 'orders', column_name: 'id' },
            { table_name: 'orders', column_name: 'user_id' },
            { table_name: 'orders', column_name: 'product_id' },
            { table_name: 'orders', column_name: 'quantity' },
            { table_name: 'orders', column_name: 'total' },
            { table_name: 'orders', column_name: 'created_at' }
          ]
        });
      }

      return Promise.resolve({ rowCount: 1, rows: [{ id: 1, name: 'Alice Johnson' }] });
    });
  });

  test('returns 401 without api key', async () => {
    const res = await request(app).post('/api/v2/ask').send({ question: 'Get users' });
    expect(res.status).toBe(401);
  });

  test('returns 400 for missing question', async () => {
    const res = await request(app)
      .post('/api/v2/ask')
      .set('x-api-key', 'test-secret')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/question is required/);
  });

  test('returns 400 for unsafe SQL from model', async () => {
    generateSQL.mockResolvedValue('SELECT id FROM users');
    repairSQL.mockResolvedValue('SELECT id FROM users');

    const res = await request(app)
      .post('/api/v2/ask')
      .set('x-api-key', 'test-secret')
      .send({ question: 'get users' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SQL_VALIDATION_FAILED');
    expect(res.body.error).toMatch(/LIMIT/);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('executes validated SQL and returns result', async () => {
    generateSQL.mockResolvedValue('SELECT id, name FROM users LIMIT 10');

    const res = await request(app)
      .post('/api/v2/ask/execute')
      .set('x-api-key', 'test-secret')
      .send({ question: 'get users' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.mode).toBe('execute');
    expect(res.body.rowCount).toBe(1);
    expect(pool.query).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'SELECT id, name FROM users LIMIT 10',
        query_timeout: 2000
      })
    );
  });

  test('returns preview without executing SQL', async () => {
    generateSQL.mockResolvedValue('SELECT id, name FROM users LIMIT 10');

    const res = await request(app)
      .post('/api/v2/ask/preview')
      .set('x-api-key', 'test-secret')
      .send({ question: 'get users' });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('preview');
    expect(res.body.sql).toBe('SELECT id, name FROM users LIMIT 10');
    expect(pool.query).not.toHaveBeenCalledWith(
      expect.objectContaining({ text: 'SELECT id, name FROM users LIMIT 10' })
    );
  });

  test('refreshes schema cache via endpoint', async () => {
    const res = await request(app)
      .post('/api/v2/schema/refresh')
      .set('x-api-key', 'test-secret')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(Array.isArray(res.body.tables)).toBe(true);
  });

  test('keeps v1 compatibility with deprecation headers', async () => {
    generateSQL.mockResolvedValue('SELECT id, name FROM users LIMIT 10');

    const res = await request(app)
      .post('/api/v1/ask')
      .set('x-api-key', 'test-secret')
      .send({ question: 'get users' });

    expect(res.status).toBe(200);
    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.link).toContain('/api/v4');
  });
});