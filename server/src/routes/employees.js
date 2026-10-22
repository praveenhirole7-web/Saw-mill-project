'use strict';

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const employeeController = require('../controllers/employeeController');

router.use(authenticate);
router.get('/', authorize.permission('view_employees'), employeeController.list);
router.post('/', authorize.permission('manage_employees'), employeeController.create);
router.patch('/:id', authorize.permission('manage_employees'), employeeController.update);

module.exports = router;
