'use strict';

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const deliveryController = require('../controllers/deliveryController');

router.use(authenticate);
router.get('/', authorize.permission('view_deliveries'), deliveryController.list);
router.get('/eligible-orders', authorize.permission('view_deliveries'), deliveryController.eligibleOrders);
router.post('/', authorize.permission('manage_deliveries'), deliveryController.create);
router.patch('/:id', authorize.permission('manage_deliveries'), deliveryController.updateSchedule);
router.post('/:id/status', authorize.permission('manage_deliveries'), deliveryController.transition);

module.exports = router;
