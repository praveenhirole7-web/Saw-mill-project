'use strict';

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const reportController = require('../controllers/reportController');

router.use(authenticate, authorize.permission('view_reports'));
router.get('/dashboard', reportController.dashboard);
router.get('/types', reportController.types);
router.get('/:type/export.csv', reportController.csv);
router.get('/:type/export.pdf', reportController.pdf);
router.get('/:type', reportController.get);

module.exports = router;
