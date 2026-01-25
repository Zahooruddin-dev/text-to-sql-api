const express = require('express');
const router = express.Router();
const sqlController = require('../controllers/sqlController');
const auth = require('../middleware/auth');

// Apply auth middleware only to this route
router.post('/ask', auth, sqlController.generateAndRunSQL);

module.exports = router;