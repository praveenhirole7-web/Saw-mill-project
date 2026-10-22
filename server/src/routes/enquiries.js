'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const enquiryController = require('../controllers/enquiryController');

const publicEnquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many enquiries from this network. Please try again later.',
    code: 'RATE_LIMITED',
  },
});

router.post('/public', publicEnquiryLimiter, enquiryController.submitPublic);
router.use(authenticate);
router.get('/assignees', authorize.permission('view_enquiries'), enquiryController.assignees);
router.get('/', authorize.permission('view_enquiries'), enquiryController.list);
router.patch('/:id', authorize.permission('manage_enquiries'), enquiryController.update);
router.post('/:id/convert', authorize.permission('manage_enquiries'), enquiryController.convert);

module.exports = router;
