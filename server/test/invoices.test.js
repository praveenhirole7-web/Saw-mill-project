'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.DB_NAME = 'sawmill_test_db';
process.env.JWT_SECRET = 'test_jwt_secret_key_minimum_32_characters_long_12345';
process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_key_minimum_32_chars_12345';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const { once } = require('node:events');
const db = require('../src/config/db');

db.withTransaction = async (callback) => callback({
  execute: async (sql, params = []) => {
    if (sql.includes('FROM customers WHERE id = ?')) {
      return [[{ id: 1, name: 'Test Customer', status: 'Active' }]];
    }
    if (sql.includes('FROM wood_types wt')) {
      return [[{ id: params[1], localized_name: 'ತೇಗ' }]];
    }
    return [[]];
  }
});

const invoiceRepo = require('../src/repositories/invoiceRepository');
const persistInvoice = invoiceRepo.createInvoice.bind(invoiceRepo);
const invoiceService = require('../src/services/invoiceService');
const { generateInvoicePdf, generateReceiptPdf } = require('../src/utils/invoicePdfService');
const allocateInvoiceNumber = invoiceRepo.generateInvoiceNumber.bind(invoiceRepo);
const allocatePaymentNumber = invoiceRepo.generatePaymentNumber.bind(invoiceRepo);

let invoice;
let payments;
let nextPaymentId;
let nextPaymentNumber;

function hydrateInvoice() {
  return { ...invoice, payments: payments.map(payment => ({ ...payment })) };
}

beforeEach(() => {
  invoice = {
    id: 1,
    invoice_number: 'INV-2026-0001',
    customer_id: 1,
    customer_name: 'Test Customer',
    grand_total: 100,
    amount_paid: 0,
    amount_due: 100,
    payment_status: 'unpaid',
    currency: 'USD'
  };
  payments = [];
  nextPaymentId = 1;
  nextPaymentNumber = 1;

  invoiceRepo.generateInvoiceNumber = async () => invoice.invoice_number;
  invoiceRepo.generatePaymentNumber = async () => `PAY-2026-${String(nextPaymentNumber++).padStart(4, '0')}`;
  invoiceRepo.createInvoice = async (record, items) => {
    invoice = { ...record, id: 1, customer_name: 'Test Customer', items };
    return 1;
  };
  invoiceRepo.getInvoiceById = async () => hydrateInvoice();
  invoiceRepo.lockInvoiceForUpdate = async (id) => String(id) === String(invoice.id) ? invoice : null;
  invoiceRepo.findPaymentByIdempotencyKey = async (key) => payments.find(payment => payment.idempotency_key === key) || null;
  invoiceRepo.findPaymentByReference = async (id, reference) => payments.find(payment =>
    Number(payment.invoice_id) === Number(id) && payment.transaction_reference === reference
  ) || null;
  invoiceRepo.createPayment = async (payment) => {
    const created = { ...payment, id: nextPaymentId++, status: 'posted', created_at: new Date().toISOString() };
    payments.push(created);
    return created.id;
  };
  invoiceRepo.refreshInvoiceBalance = async (id, grandTotal) => {
    const amountPaid = Math.round(payments.reduce((sum, payment) => sum + Number(payment.amount), 0) * 100) / 100;
    const amountDue = Number(grandTotal) - amountPaid;
    const paymentStatus = amountPaid === 0 ? 'unpaid' : amountDue === 0 ? 'paid' : 'partially_paid';
    Object.assign(invoice, { amount_paid: amountPaid, amount_due: amountDue, payment_status: paymentStatus });
    return { amountPaid, amountDue, paymentStatus };
  };
  invoiceRepo.setPaymentBalanceAfter = async (paymentId, amountDue) => {
    const payment = payments.find(entry => entry.id === paymentId);
    if (payment) payment.balance_after = amountDue;
  };
  invoiceRepo.lockPaymentForUpdate = async (id) => payments.find(payment => String(payment.id) === String(id)) || null;
  invoiceRepo.reversePayment = async (id, { reversalReason, reversedByPaymentId }) => {
    const payment = payments.find(entry => String(entry.id) === String(id));
    Object.assign(payment, { status: 'reversed', reversal_reason: reversalReason, reversed_by_payment_id: reversedByPaymentId });
  };
});

describe('invoice calculations', () => {
  test('calculates discounts, tax and charges on the server rather than submitted totals', async () => {
    const created = await invoiceService.createInvoice({
      customer_id: 1,
      due_date: '2026-12-31',
      tax_rate_percent: 10,
      language_code: 'kn',
      currency: 'USD',
      discount_amount: 5,
      additional_charges: 4,
      cutting_charge: 4,
      subtotal: 1,
      grand_total: 1,
      items: [
        { description: 'Oak boards', wood_type_id: 7, dimensions_text: '2 in x 4 in x 8 ft', quantity: 1, unit_price: 100, discount_percent: 10 },
        { description: 'Pine boards', quantity: 2, unit_price: 25 }
      ]
    });

    assert.equal(created.subtotal, 150);
    assert.equal(created.discount_amount, 15);
    assert.equal(created.taxable_value, 135);
    assert.equal(created.tax_rate, 0.1);
    assert.equal(created.tax_amount, 13.5);
    assert.equal(created.additional_charges, 4);
    assert.equal(created.cutting_charge, 4);
    assert.equal(created.grand_total, 156.5);
    assert.equal(created.currency, 'INR');
    assert.equal(created.language_code, 'kn');
    assert.deepEqual(created.items.map(item => item.line_total), [90, 50]);
    assert.equal(created.items[0].dimensions_text, '2 in x 4 in x 8 ft');
    assert.equal(created.items[0].localized_description, 'ತೇಗ');
  });

  test('rejects dimensions that omit or mix unlabeled units', async () => {
    await assert.rejects(invoiceService.createInvoice({
      customer_id: 1, due_date: '2026-12-31', tax_rate_percent: 0,
      items: [{ description: 'Teak plank', dimensions_text: '2 x 4 x 8 ft', quantity: 1, unit_price: 10 }]
    }), { code: 'INVALID_DIMENSIONS' });
  });

  test('does not issue a bill in a PDF language the renderer cannot safely lay out', async () => {
    await assert.rejects(invoiceService.createInvoice({
      customer_id: 1, due_date: '2026-12-31', tax_rate_percent: 0, language_code: 'ur',
      items: [{ description: 'Teak plank', quantity: 1, unit_price: 10 }]
    }), { code: 'INVALID_INVOICE_LANGUAGE' });
  });
});

describe('payment ledger', () => {
  const paymentData = (amount, key, extra = {}) => ({
    amount,
    payment_method: 'bank_transfer',
    payment_date: '2026-10-19',
    idempotency_key: key,
    ...extra
  });

  test('records a partial payment followed by a full settlement', async () => {
    const partial = await invoiceService.recordPayment(1, paymentData(30, 'partial-001'));
    assert.equal(partial.invoice.payment_status, 'partially_paid');
    assert.equal(partial.invoice.amount_paid, 30);
    assert.equal(partial.invoice.amount_due, 70);
    assert.equal(partial.payment.amount, 30);
    assert.equal(partial.payment.balance_after, 70);

    const full = await invoiceService.recordPayment(1, paymentData(70, 'settle-0001'));
    assert.equal(full.invoice.payment_status, 'paid');
    assert.equal(full.invoice.amount_paid, 100);
    assert.equal(full.invoice.amount_due, 0);
    assert.equal(payments.length, 2);
  });

  test('rejects payments above the outstanding balance', async () => {
    await assert.rejects(
      invoiceService.recordPayment(1, paymentData(100.01, 'overpay-01')),
      { code: 'OVERPAYMENT' }
    );
    assert.equal(payments.length, 0);
  });

  test('makes retries with the same idempotency key safe and blocks duplicate references', async () => {
    const first = await invoiceService.recordPayment(1, paymentData(25, 'retry-key-001', {
      transaction_reference: 'BANK-REF-25'
    }));
    const retry = await invoiceService.recordPayment(1, paymentData(25, 'retry-key-001', {
      transaction_reference: 'BANK-REF-25'
    }));
    assert.equal(retry.replayed, true);
    assert.equal(retry.payment.id, first.payment.id);
    assert.equal(payments.length, 1);

    await assert.rejects(
      invoiceService.recordPayment(1, paymentData(26, 'retry-key-001', {
        transaction_reference: 'BANK-REF-25'
      })),
      { code: 'IDEMPOTENCY_KEY_REUSED' }
    );
    await assert.rejects(
      invoiceService.recordPayment(1, paymentData(25, 'new-key-0002', {
        transaction_reference: 'BANK-REF-25'
      })),
      { code: 'DUPLICATE_PAYMENT' }
    );
    assert.equal(payments.length, 1);
  });

  test('reverses a posted payment through an offsetting entry and restores invoice balance', async () => {
    const posted = await invoiceService.recordPayment(1, paymentData(40, 'reverse-me-001'));
    const result = await invoiceService.reversePayment(posted.payment.id, 'Duplicate receipt entered');

    assert.equal(result.invoice.amount_paid, 0);
    assert.equal(result.invoice.amount_due, 100);
    assert.equal(result.invoice.payment_status, 'unpaid');
    assert.equal(result.invoice.payments.length, 2);
    assert.equal(result.invoice.payments[0].status, 'reversed');
    assert.equal(result.invoice.payments[1].amount, -40);
    assert.equal(result.invoice.payments[1].notes, 'Duplicate receipt entered');
  });
});

async function generatePdf(generator) {
  const stream = new PassThrough();
  const chunks = [];
  stream.on('data', chunk => chunks.push(chunk));
  const ended = new Promise((resolve, reject) => {
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  generator(stream);
  await ended;
  return Buffer.concat(chunks);
}

test('generates invoice and receipt PDF documents', async () => {
  const invoiceData = {
    invoice_number: 'INV-2026-0001',
    issue_date: '2026-10-19',
    due_date: '2026-11-18',
    customer_name: 'Test Customer',
    company_name: 'Test Company',
    customer_address: '1 Mill Road',
    customer_tax_id: 'TAX-123',
    currency: 'USD',
    payment_terms: 'Net 30',
    subtotal: 100,
    discount_amount: 0,
    taxable_value: 100,
    tax_rate: 0.1,
    tax_amount: 10,
    additional_charges: 0,
    grand_total: 110,
    amount_paid: 25,
    amount_due: 85,
    payment_status: 'partially_paid',
    items: [{ description: 'Oak boards', quantity: 1, unit: 'CFT', unit_price: 100, line_total: 100 }],
    payments: []
  };
  const invoicePdf = await generatePdf(stream => generateInvoicePdf(invoiceData, stream));
  const receiptPdf = await generatePdf(stream => generateReceiptPdf(invoiceData, {
    payment_number: 'PAY-2026-0001',
    payment_date: '2026-10-19',
    payment_method: 'cash',
    amount: 25,
    balance_after: 85
  }, stream));

  for (const pdf of [invoicePdf, receiptPdf]) {
    assert.ok(pdf.subarray(0, 5).equals(Buffer.from('%PDF-')));
    assert.ok(pdf.includes(Buffer.from('%%EOF')));
  }

  const multiPage = await generatePdf(stream => generateInvoicePdf({
    ...invoiceData,
    items: Array.from({ length: 45 }, (_, index) => ({
      description: `Line item ${index + 1}`,
      quantity: 1,
      unit: 'CFT',
      unit_price: 1,
      line_total: 1
    }))
  }, stream));
  assert.ok((multiPage.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length > 1);
});

test('embeds Unicode fonts for Kannada, Hindi, Telugu and Tamil bills', async () => {
  const scripts = [
    ['kn', 'ಗ್ರಾಹಕ', 'ತೇಗ'],
    ['hi', 'ग्राहक', 'सागवान'],
    ['te', 'వినియోగదారు', 'టేకు'],
    ['ta', 'வாடிக்கையாளர்', 'தேக்கு']
  ];
  for (const [language_code, customer_name, description] of scripts) {
    const pdf = await generatePdf((stream) => generateInvoicePdf({
      invoice_number: 'INV-2026-0001', issue_date: '2026-10-19', customer_name,
      language_code, currency: 'INR', subtotal: 100, taxable_value: 100,
      tax_rate: 0, tax_amount: 0, additional_charges: 0, grand_total: 100,
      amount_paid: 0, amount_due: 100, payment_status: 'unpaid',
      items: [{ description, quantity: 1, unit: 'CFT', unit_price: 100, line_total: 100 }]
    }, stream));
    const pdfText = pdf.toString('latin1');
    assert.ok(pdfText.includes('/FontFile2'), `${language_code} font is embedded`);
    assert.ok(pdfText.includes('/ToUnicode'), `${language_code} has a Unicode character map`);
    assert.ok(pdfText.includes('/MediaBox [0 0 595.28 841.89]'), 'A4 page dimensions are used');
  }
});

test('rejects right-to-left PDF output instead of producing incorrectly ordered text', async () => {
  await assert.rejects(
    generatePdf((stream) => generateInvoicePdf({ language_code: 'ur', invoice_number: 'INV-1', items: [] }, stream)),
    { code: 'PDF_LANGUAGE_UNSUPPORTED' }
  );
});

test('allocates invoice and payment numbers sequentially inside transactions', async () => {
  let invoiceSequence = 0;
  let paymentSequence = 0;
  const connection = {
    execute: async (sql, params = []) => {
      if (sql.includes('INSERT INTO billing_sequences')) {
        if (params[0].startsWith('invoice:')) invoiceSequence = invoiceSequence ? invoiceSequence + 1 : 4;
        else paymentSequence = paymentSequence ? paymentSequence + 1 : 9;
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SELECT last_value')) {
        const value = params[0].startsWith('invoice:') ? invoiceSequence : paymentSequence;
        return [[{ last_value: value }]];
      }
      return [[]];
    }
  };
  const year = new Date().getFullYear();
  assert.equal(await allocateInvoiceNumber(connection), `INV-${year}-0004`);
  assert.equal(await allocateInvoiceNumber(connection), `INV-${year}-0005`);
  assert.equal(await allocatePaymentNumber(connection), `PAY-${year}-0009`);
  assert.equal(await allocatePaymentNumber(connection), `PAY-${year}-0010`);
});

test('persists invoice language and cutting charge with line measurements', async () => {
  const statements = [];
  await persistInvoice({
    invoice_number: 'INV-2026-0003', customer_id: 1, subtotal: 10, discount_amount: 0,
    taxable_value: 10, tax_rate: 0, tax_amount: 0, additional_charges: 0,
    cutting_charge: 5, grand_total: 15, issue_date: '2026-10-20', due_date: '2026-11-20',
    currency: 'INR', language_code: 'kn'
  }, [{ description: 'ತೇಗ', localized_description: 'ತೇಗ', dimensions_text: '2 in x 4 in x 8 ft', quantity: 1, unit: 'CFT', unit_price: 10, line_total: 10 }], {
    execute: async (sql, params) => {
      statements.push({ sql, params });
      return sql.includes('INSERT INTO invoices') ? [{ insertId: 3 }] : [{ affectedRows: 1 }];
    }
  });
  assert.equal(statements.length, 2);
  for (const statement of statements) assert.equal((statement.sql.match(/\?/g) || []).length, statement.params.length);
  assert.match(statements[0].sql, /language_code/);
  assert.ok(statements[0].params.includes('kn'));
  assert.ok(statements[0].params.includes(5));
  assert.ok(statements[1].params.includes('2 in x 4 in x 8 ft'));
});

test('billing API routes are mounted and require authentication', async (t) => {
  const app = require('../src/server');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/invoices`);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'NO_TOKEN');
});
