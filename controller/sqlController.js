const { generateSQL } = require('../config/bedrockService');
const pool = require('../config/db');

const BLOCKED_KEYWORDS = ['insert', 'update', 'delete', 'drop', 'truncate', 'alter', 'create'];

exports.generateAndRunSQL = async (req, res) => {
  const { question } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'question is required' });
  }

  try {
    const sql = await generateSQL(question);

    const lowerSQL = sql.toLowerCase();
    const isBlocked = BLOCKED_KEYWORDS.some(keyword => lowerSQL.includes(keyword));

    if (isBlocked) {
      return res.status(400).json({ error: 'Only SELECT queries are permitted', sql });
    }

    const result = await pool.query(sql);

    res.json({
      status: 'success',
      question,
      sql,
      rowCount: result.rowCount,
      data: result.rows
    });
  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: 'Failed to generate or run SQL', details: err.message });
  }
};