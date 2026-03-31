require('dotenv').config();
const express = require('express');
const sqlRoutes = require('./routes/sqlRoutes');
const { validateEnv } = require('./config/env');
const requestContext = require('./middleware/requestContext');
const { getMetricsSnapshot } = require('./services/metricsService');

validateEnv();

const app = express();
app.use(express.json({ limit: process.env.REQUEST_BODY_LIMIT || '10kb' }));
app.use(requestContext);

app.get('/health', (req, res) => res.json({ status: 'ok', apiVersion: 'v2' }));
app.get('/metrics', (req, res) => res.json(getMetricsSnapshot()));

app.use('/api/v2', sqlRoutes);
app.use('/api/v1', (req, res, next) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', process.env.API_V1_SUNSET || '2026-12-31');
  res.setHeader('Link', '</api/v2>; rel="successor-version"');
  next();
}, sqlRoutes);

const PORT = process.env.PORT || 3000;

if (require.main === module) {
	app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;