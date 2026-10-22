'use strict';
/**
 * controllers/invoiceController.js
 *
 * HTTP handlers for the Invoicing & Payment API.
 * All monetary totals are calculated server-side — client-submitted totals are ignored.
 */

const invoiceService = require('../services/invoiceService');
const { generateInvoicePdf, generateReceiptPdf } = require('../utils/invoicePdfService');

// ── Invoices ─────────────────────────────────────────────────────────────────

async function listInvoices(req, res) {
  try {
    const result = await invoiceService.listInvoices({
      search:      req.query.search      || '',
      status:      req.query.status      || '',
      customer_id: req.query.customer_id || null,
      limit:       Math.min(parseInt(req.query.limit,  10) || 50, 200),
      offset:      parseInt(req.query.offset, 10) || 0
    });
    res.json({ success: true, data: result });
  } catch (e) { next500(res, e); }
}

async function getInvoice(req, res) {
  try {
    const inv = await invoiceService.getInvoiceById(req.params.id);
    if (!inv) return res.status(404).json({ success: false, code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    res.json({ success: true, data: inv });
  } catch (e) { next500(res, e); }
}

async function createInvoice(req, res) {
  try {
    const inv = await invoiceService.createInvoice(req.body, req.user?.id);
    res.status(201).json({ success: true, data: inv });
  } catch (e) { nextErr(res, e); }
}

async function voidInvoice(req, res) {
  try {
    const inv = await invoiceService.voidInvoice(
      req.params.id, req.body.void_reason, req.user?.id
    );
    res.json({ success: true, data: inv });
  } catch (e) { nextErr(res, e); }
}

// ── PDF generation ────────────────────────────────────────────────────────────

async function downloadInvoicePdf(req, res) {
  try {
    const inv = await invoiceService.getInvoiceById(req.params.id);
    if (!inv) return res.status(404).json({ success: false, code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });

    const paperSize = pdfPaper(req.query.paperSize);
    const filename = `${inv.invoice_number}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    generateInvoicePdf(inv, res, { paperSize });
  } catch (e) { clearPdfHeaders(res); nextErr(res, e); }
}

async function previewInvoicePdf(req, res) {
  try {
    const inv = await invoiceService.getInvoiceById(req.params.id);
    if (!inv) return res.status(404).json({ success: false, code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });

    const paperSize = pdfPaper(req.query.paperSize);
    const filename = `${inv.invoice_number}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    generateInvoicePdf(inv, res, { paperSize });
  } catch (e) { clearPdfHeaders(res); nextErr(res, e); }
}

// ── Payments ─────────────────────────────────────────────────────────────────

async function listPayments(req, res) {
  try {
    const result = await invoiceService.listPayments({
      search:      req.query.search      || '',
      invoice_id:  req.query.invoice_id  || null,
      customer_id: req.query.customer_id || null,
      limit:       Math.min(parseInt(req.query.limit,  10) || 50, 200),
      offset:      parseInt(req.query.offset, 10) || 0
    });
    res.json({ success: true, data: result });
  } catch (e) { next500(res, e); }
}

async function recordPayment(req, res) {
  try {
    const result = await invoiceService.recordPayment(
      req.params.invoiceId, req.body, req.user?.id
    );
    res.status(201).json({ success: true, data: result });
  } catch (e) { nextErr(res, e); }
}

async function reversePayment(req, res) {
  try {
    const result = await invoiceService.reversePayment(
      req.params.paymentId, req.body.reversal_reason, req.user?.id
    );
    res.json({ success: true, data: result });
  } catch (e) { nextErr(res, e); }
}

async function downloadReceiptPdf(req, res) {
  try {
    const { invoiceId, paymentId } = req.params;
    const inv = await invoiceService.getInvoiceById(invoiceId);
    if (!inv) return res.status(404).json({ success: false, code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });

    const pay = (inv.payments || []).find(p => String(p.id) === String(paymentId));
    if (!pay) return res.status(404).json({ success: false, code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' });
    if (pay.status !== 'posted' || Number(pay.amount) <= 0) {
      return res.status(409).json({ success: false, code: 'PAYMENT_NOT_RECEIPT', message: 'A receipt is only available for an active customer payment.' });
    }

    const paperSize = pdfPaper(req.query.paperSize, 'A5');
    const filename = `${pay.payment_number || `receipt-${paymentId}`}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    generateReceiptPdf(inv, pay, res, { paperSize });
  } catch (e) { clearPdfHeaders(res); nextErr(res, e); }
}

// ── Error helpers ─────────────────────────────────────────────────────────────
function nextErr(res, e) {
  const status = e.statusCode || 500;
  res.status(status).json({ success: false, code: e.code || 'INTERNAL_ERROR', message: e.message });
}
function next500(res, e) {
  console.error('[InvoiceController]', e);
  res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: 'Internal server error' });
}
function pdfPaper(value, defaultSize = 'A4') {
  const allowed = new Set(['A4', 'A5', 'Letter', 'Legal']);
  if (!value) return defaultSize;
  if (!allowed.has(value)) throw Object.assign(new Error('Choose A4, A5, Letter, or Legal paper.'), { statusCode: 400, code: 'INVALID_PAPER_SIZE' });
  return value;
}
function clearPdfHeaders(res) {
  if (res.headersSent) return;
  res.removeHeader('Content-Type');
  res.removeHeader('Content-Disposition');
}

module.exports = {
  listInvoices, getInvoice, createInvoice, voidInvoice,
  downloadInvoicePdf, previewInvoicePdf,
  listPayments, recordPayment, reversePayment, downloadReceiptPdf
};
