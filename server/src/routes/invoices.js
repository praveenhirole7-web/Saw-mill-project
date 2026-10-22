'use strict';

const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const {
  validateCreateInvoice,
  validateRecordPayment,
  validateReversePayment,
  validateVoidInvoice
} = require('../middleware/invoiceValidate');

router.use(authenticate);

const billingReaders = authorize.roles(['admin', 'manager', 'accountant']);
const billingWriters = authorize.roles(['admin', 'manager', 'accountant']);

router.get('/', billingReaders, invoiceController.listInvoices);
router.post('/', billingWriters, validateCreateInvoice, invoiceController.createInvoice);
router.get('/payments', billingReaders, invoiceController.listPayments);
router.get('/:id/pdf', billingReaders, invoiceController.downloadInvoicePdf);
router.get('/:id/preview', billingReaders, invoiceController.previewInvoicePdf);
router.get('/:id', billingReaders, invoiceController.getInvoice);
router.post('/:id/void', billingWriters, validateVoidInvoice, invoiceController.voidInvoice);
router.post('/:invoiceId/payments', billingWriters, validateRecordPayment, invoiceController.recordPayment);
router.post(
  '/payments/:paymentId/reverse',
  authorize.roles(['admin', 'manager', 'accountant']),
  validateReversePayment,
  invoiceController.reversePayment
);
router.get(
  '/:invoiceId/payments/:paymentId/receipt',
  billingReaders,
  invoiceController.downloadReceiptPdf
);

module.exports = router;
