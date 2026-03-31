const express = require('express');
const router = express.Router();
const sqlControllerV3 = require('../controller/sqlControllerV3');
const authV3 = require('../middleware/authV3');
const rbac = require('../services/rbacService');
const { versionMiddleware } = require('../services/responseVersioningService');
const askRateLimiter = require('../middleware/rateLimit');

// Apply version middleware to all routes
router.use(versionMiddleware);

// Apply authentication to all routes
router.use(authV3);

// Core query endpoints
router.post('/ask', askRateLimiter, sqlControllerV3.askV3);
router.post('/ask/preview', askRateLimiter, sqlControllerV3.previewV3);

// Query explain and optimization endpoints
router.get('/query/:queryId/explain', sqlControllerV3.explainQuery);
router.get('/optimization/hints', sqlControllerV3.getOptimizationHints);

// Audit and compliance endpoints
router.get('/audit/logs', 
  rbac.requireRole(['admin', 'editor']),
  sqlControllerV3.getAuditLogs
);

router.get('/audit/stats', 
  rbac.requireRole(['admin']),
  sqlControllerV3.getAuditStats
);

// Schema management
router.post('/schema/refresh', 
  rbac.requireRole(['admin']),
  sqlControllerV3.refreshSchema
);

// Permissions and access control
router.get('/permissions', sqlControllerV3.checkPermissions);

// Health check
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    apiVersion: 'v3',
    workspaceId: req.user.workspaceId,
    userRole: req.user.role
  });
});

module.exports = router;
