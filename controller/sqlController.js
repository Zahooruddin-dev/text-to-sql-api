const { Groq } = require('groq-sdk');
const pool = require('../config/db');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

exports.generateAndRunSQL = async (req, res) => {
    const { question } = req.body;
    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: "You are a SQL expert. Return ONLY the raw SQL string for Postgres. No markdown, no backticks." },
                { role: "user", content: `Question: ${question}` }
            ],
            model: "llama-3.3-70b-versatile",
        });

        const sql = completion.choices[0].message.content.trim();
        const result = await pool.query(sql);

        res.json({ sql, data: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};