const express = require('express');
const router = express.Router();
const sqlController = require('../controller/sqlController');
const auth = require('../middleware/auth');
const askRateLimiter = require('../middleware/rateLimit');

router.post('/ask', askRateLimiter, auth, sqlController.generateAndRunSQL);
router.post('/ask/preview', askRateLimiter, auth, sqlController.previewSQL);
router.post('/ask/execute', askRateLimiter, auth, sqlController.executeSQL);
router.post('/schema/refresh', auth, sqlController.refreshSchema);

module.exports = router;