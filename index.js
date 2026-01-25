const express = require('express');
const sqlRoutes = require('./routes/sqlRoutes');
require('dotenv').config();

const app = express();
app.use(express.json());

// Use the routes
app.use('/api/v1', sqlRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app; // Export for testing