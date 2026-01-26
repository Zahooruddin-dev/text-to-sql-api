const request = require('supertest');
const app = require('../index'); // Make sure index.js has 'module.exports = app'

describe('SQL API', () => {
  it('should return 401 without an API key', async () => {
    const res = await request(app).post('/api/v1/ask').send({ question: 'test' });
    expect(res.statusCode).toEqual(401);
  });
});