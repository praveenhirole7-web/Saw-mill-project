'use strict';
/**
 * routes/cuttingJobs.js
 *
 * Sawmill Cutting Floor and Resaw endpoints:
 *   GET    /api/v1/cutting-jobs             - List and filter cutting jobs
 *   GET    /api/v1/cutting-jobs/:id         - Job details, source batches, and outputs
 *   GET    /api/v1/cutting-jobs/:id/report  - Official cutting job recovery & financial report
 *   POST   /api/v1/cutting-jobs             - Create new cutting job draft
 *   POST   /api/v1/cutting-jobs/:id/start   - Dispatch run & reserve input timber stock
 *   POST   /api/v1/cutting-jobs/:id/complete- Complete run, consume input stock, post output inventory
 *   POST   /api/v1/cutting-jobs/:id/correct - Authorized correction for completed jobs
 */
const express = require('express');
const router = express.Router();

const cuttingJobController = require('../controllers/cuttingJobController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { validateCreateCuttingJob, validateJobIdParam } = require('../middleware/cuttingJobValidate');

// All cutting job routes require authentication
router.use(authenticate);

// 1. List cutting jobs
router.get(
  '/',
  authorize.roles(['admin', 'manager', 'operator', 'accountant']),
  cuttingJobController.listCuttingJobs
);

// 2. View cutting job details
router.get(
  '/:id',
  validateJobIdParam,
  authorize.roles(['admin', 'manager', 'operator', 'accountant']),
  cuttingJobController.getCuttingJobDetails
);

// 3. View comprehensive cutting job report
router.get(
  '/:id/report',
  validateJobIdParam,
  authorize.roles(['admin', 'manager', 'operator', 'accountant']),
  cuttingJobController.getCuttingJobReport
);

// 4. Create cutting job draft
router.post(
  '/',
  authorize.roles(['admin', 'manager', 'operator']),
  validateCreateCuttingJob,
  cuttingJobController.createCuttingJob
);

// 5. Start / dispatch run (reserves input stock)
router.post(
  '/:id/start',
  validateJobIdParam,
  authorize.roles(['admin', 'manager', 'operator']),
  cuttingJobController.startCuttingJob
);

// 6. Complete run & post output inventory
router.post(
  '/:id/complete',
  validateJobIdParam,
  authorize.roles(['admin', 'manager', 'operator']),
  cuttingJobController.completeCuttingJob
);

// 7. Apply authorized correction
router.post(
  '/:id/correct',
  validateJobIdParam,
  authorize.roles(['admin', 'manager']),
  cuttingJobController.correctCompletedJob
);

module.exports = router;
