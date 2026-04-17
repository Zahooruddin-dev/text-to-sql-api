require('dotenv').config();
const express = require('express');
const sqlRoutes = require('./routes/sqlRoutes');
const sqlRoutesV3 = require('./routes/sqlRoutesV3');
const sqlRoutesV4 = require('./routes/sqlRoutesV4');
const { validateEnv } = require('./config/env');
const requestContext = require('./middleware/requestContext');
const { getMetricsSnapshot, getPersistedMetrics, getMetricsTimeSeries } = require('./services/metricsService');

validateEnv();

const app = express();
app.use(express.json({ limit: process.env.REQUEST_BODY_LIMIT || '10kb' }));
app.use(requestContext);

// Health checks
app.get('/health', (req, res) => res.json({ 
  status: 'ok', 
  apiVersion: 'v4',
  supportedVersions: ['v1', 'v2', 'v3', 'v4']
}));

// In-memory metrics endpoint (V2)
app.get('/metrics', (req, res) => res.json(getMetricsSnapshot()));

// V4 API Routes (JWT/OAuth authenticated)
app.use('/api/v4', sqlRoutesV4);

// V3 API Routes (JWT/OAuth authenticated)
app.use('/api/v3', sqlRoutesV3);

// V2 API Routes (API Key authenticated)
app.use('/api/v2', sqlRoutes);

// V1 API Routes (deprecated)
app.use('/api/v1', (req, res, next) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', process.env.API_V1_SUNSET || '2026-12-31');
  res.setHeader('Link', '</api/v4>; rel="successor-version"');
  next();
}, sqlRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    code: 'NOT_FOUND',
    message: `Endpoint not found: ${req.method} ${req.path}`,
    supportedVersions: ['/api/v4', '/api/v3', '/api/v2', '/api/v1']
  });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
	app.listen(PORT, () => {
  console.log(`Text-to-SQL API V4 running on port ${PORT}`);
  console.log(`API V4 (JWT/OAuth): http://localhost:${PORT}/api/v4`);
    console.log(`API V3 (JWT/OAuth): http://localhost:${PORT}/api/v3`);
    console.log(`API V2 (API Key):   http://localhost:${PORT}/api/v2`);
    console.log(`API V1 (Deprecated):http://localhost:${PORT}/api/v1`);
  });
}

module.exports = app;