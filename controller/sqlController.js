const { GoogleGenerativeAI } = require("@google/generative-ai");
const pool = require('../config/db');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Use gemini-2.0-flash (the newest free one)
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
    systemInstruction: "You are a SQL expert for Postgres. Return ONLY the raw SQL code. No markdown, no backticks, no 'sql' prefix. Just the query string."
});

exports.generateAndRunSQL = async (req, res) => {
    const { question } = req.body;

    try {
        // Step 1: Generate SQL from Natural Language
        const result = await model.generateContent(question);
        const sql = result.response.text().trim();

        // Step 2: Run that SQL on Neon Postgres
        const dbResult = await pool.query(sql);

        res.json({
            status: "success",
            query: sql,
            data: dbResult.rows
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Something went wrong", details: err.message });
    }
};