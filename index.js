const express = require('express');
const { Groq } = require('groq-sdk');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());

// 1. Initialize Groq (Free LLM)
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// 2. Initialize Postgres (Neon)
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 3. Simple API Key Auth (To protect your endpoint)
const authMiddleware = (req, res, next) => {
    const userKey = req.header('x-api-key');
    if (userKey !== process.env.MY_APP_PASSWORD) {
        return res.status(401).json({ error: "Invalid API Key" });
    }
    next();
};

app.post('/ask', authMiddleware, async (req, res) => {
    const { question } = req.body;

    try {
        // Step A: Ask Groq to turn English into SQL
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: "You are a SQL expert. Return ONLY the SQL query. No explanation. Table: users (id, name, email)." },
                { role: "user", content: `Translate this to SQL: ${question}` }
            ],
            model: "llama-3.3-70b-versatile",
        });

        const sql = chatCompletion.choices[0].message.content.trim();

        // Step B: Run the SQL on Neon
        const dbResult = await pool.query(sql);
        
        res.json({ 
            queryGenerated: sql,
            data: dbResult.rows 
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));