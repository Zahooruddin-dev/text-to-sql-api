const { OpenAI } = require("openai");
const pool = require('../config/db');

// Initialize OpenRouter
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000", // Required by OpenRouter for rankings
    "X-Title": "Text-to-SQL-Linux-Project",
  }
});

exports.generateAndRunSQL = async (req, res) => {
    const { question } = req.body;

    try {
        // Step 1: Generate SQL using LiquidAI LFM 2.5 Thinking
        const completion = await openai.chat.completions.create({
            model: "liquid/lfm-2.5-1.2b-thinking:free",
            messages: [
                { 
                    role: "system", 
                    content: "You are a specialized SQL assistant. Database: Postgres. Table: users(id, name, email). Return ONLY the SQL string. No conversational text." 
                },
                { role: "user", content: question }
            ],
            temperature: 0.1 // Keep it precise for SQL
        });

        const sql = completion.choices[0].message.content.trim();

        // Step 2: Run the query on Neon
        const dbResult = await pool.query(sql);

        res.json({
            status: "success",
            sql: sql,
            data: dbResult.rows
        });

    } catch (err) {
        console.error("Error:", err);
        res.status(500).json({ error: "Failed to generate or run SQL", details: err.message });
    }
};