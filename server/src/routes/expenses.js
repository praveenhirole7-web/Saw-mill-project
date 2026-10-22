'use strict';

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const expenseController = require('../controllers/expenseController');

router.use(authenticate);
router.get('/', authorize.permission('view_expenses'), expenseController.list);
router.get('/categories', authorize.permission('view_expenses'), expenseController.categories);
router.get('/report', authorize.permission('view_expenses'), expenseController.report);
router.post('/categories', authorize.permission('manage_expenses'), expenseController.createCategory);
router.post('/', authorize.permission('manage_expenses'), expenseController.create);
router.patch('/:id', authorize.permission('manage_expenses'), expenseController.update);
router.post('/:id/reverse', authorize.permission('reverse_expenses'), expenseController.reverse);

module.exports = router;
