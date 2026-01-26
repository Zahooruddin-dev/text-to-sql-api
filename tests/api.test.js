const request = require('supertest');
const app = require('../index'); 
const pool = require('../config/db'); // 1. Import your database pool

describe('SQL API Test', () => {
  it('should attempt to connect to the API', async () => {
    const res = await request(app)
      .post('/api/v1/ask')
      .set('x-api-key', process.env.MY_APP_PASSWORD)
      .send({ question: 'Who are the users?' });
    
    expect(res.status).toBe(200);
  }, 15000); 
});

// 2. Add this block to close the database after tests finish
afterAll(async () => {
  await pool.end(); 
});