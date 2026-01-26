const request = require('supertest');
const app = require('../index'); 
const pool = require('../config/db'); // Import the database pool

describe('SQL API Test', () => {
  it('should attempt to connect to the API', async () => {
    const res = await request(app)
      .post('/api/v1/ask')
      .set('x-api-key', process.env.MY_APP_PASSWORD) // Send the key
      .send({ question: 'Who are the users?' });
    
    expect(res.status).toBe(200);
  });
});

// 🛠️ THIS FIXES THE HANGING JEST:
afterAll(async () => {
  await pool.end(); // Close the database connection
});