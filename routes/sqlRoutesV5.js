const express = require('express');
const router = express.Router();
const sqlControllerV3 = require('../controller/sqlControllerV3');
const authV3 = require('../middleware/authV3');
const rbac = require('../services/rbacService');
const { createVersionMiddleware } = require('../services/responseVersioningService');
const askRateLimiter = require('../middleware/rateLimit');

router.use(createVersionMiddleware('v5'));
router.use(authV3);

router.post('/ask', askRateLimiter, sqlControllerV3.askV3);
router.post('/ask/preview', askRateLimiter, sqlControllerV3.previewV3);

router.get('/query/:queryId/explain', sqlControllerV3.explainQuery);
router.get('/optimization/hints', sqlControllerV3.getOptimizationHints);

router.get('/audit/logs',
  rbac.requireRole(['admin', 'editor']),
  sqlControllerV3.getAuditLogs
);

router.get('/audit/stats',
  rbac.requireRole(['admin']),
  sqlControllerV3.getAuditStats
);

router.post('/schema/refresh',
  rbac.requireRole(['admin']),
  sqlControllerV3.refreshSchema
);

router.get('/permissions', sqlControllerV3.checkPermissions);

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    apiVersion: 'v5',
    workspaceId: req.user.workspaceId,
    userRole: req.user.role
  });
});

module.exports = router;
