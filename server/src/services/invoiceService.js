'use strict';
/**
 * services/invoiceService.js
 *
 * Business-logic for Invoicing & Payment Management.
 *
 * FINANCIAL RULES enforced here:
 *  1. All totals are authoritative — calculated on the backend, never trusted from client.
 *  2. tax_rate is supplied as a percentage (e.g. 18) and stored as a fraction (0.18).
 *     Tax-rate configuration is explicit; there is no hard-coded default.
 *  3. Payments may not exceed the current outstanding balance.
 *  4. Duplicate submissions are blocked by an idempotency key and transaction reference.
 *  5. Reversals append a negative ledger entry and retain the original payment for audit.
 *  6. Invoice voiding sets status='voided' and blocks further payments.
 *  7. All multi-table writes run inside withTransaction().
 */

const { withTransaction } = require('../config/db');
const invoiceRepo = require('../repositories/invoiceRepository');
const SUPPORTED_BILL_LANGUAGES = new Set(['en','kn','hi','te','ta','ml','mr','bn','gu','pa','or','as','sa','kok','mni','ne','brx','doi','sat','mai']);

class InvoiceService {

  // ── Calculation engine ───────────────────────────────────────────────────────

  /**
   * Calculate item-level and order-level totals on the backend.
   *
   * tax_rate_percent: number — e.g. 18 means 18 %. Explicit — never defaulted silently.
   * Returns calculated header and enriched items.
   */
  _calculate(items = [], { discount_amount = 0, tax_rate_percent, additional_charges = 0, cutting_charge = 0 }) {
    if (tax_rate_percent === undefined || tax_rate_percent === null || String(tax_rate_percent).trim() === '') {
      throw Object.assign(new Error('tax_rate_percent is required — do not omit or hardcode tax rates.'), { statusCode: 400, code: 'TAX_RATE_REQUIRED' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw err400('INVALID_ITEMS', 'At least one invoice line item is required.');
    }
    const taxRatePercent = finiteNumber(tax_rate_percent, 'tax_rate_percent');
    if (taxRatePercent < 0 || taxRatePercent > 100) {
      throw err400('INVALID_TAX_RATE', 'tax_rate_percent must be between 0 and 100.');
    }
    const taxRateFraction = taxRatePercent / 100;

    let subtotal = 0;
    let itemDiscountTotal = 0;
    const enriched = items.map((item, i) => {
      const qty = finiteNumber(item.quantity, `items[${i}].quantity`);
      const up = finiteNumber(item.unit_price, `items[${i}].unit_price`);
      const discPercent = finiteNumber(item.discount_percent || 0, `items[${i}].discount_percent`);
      if (qty <= 0 || up < 0 || discPercent < 0 || discPercent > 100) {
        throw err400('INVALID_ITEM', `Invoice line ${i + 1} has invalid quantity, price, or discount.`);
      }
      const gross = round2(qty * up);
      const itemDisc = round2(gross * (discPercent / 100));
      const afterItemDisc = round2(gross - itemDisc);
      itemDiscountTotal += itemDisc;
      subtotal += gross;
      return {
        ...item,
        quantity: qty,
        unit_price: up,
        discount_percent: discPercent / 100,
        discount_amount: itemDisc,
        tax_percent: 0,
        tax_amount: 0,
        line_total: afterItemDisc
      };
    });

    subtotal = round2(subtotal);
    const requestedDiscount = round2(finiteNumber(discount_amount || 0, 'discount_amount'));
    const totalDiscount = round2(itemDiscountTotal + requestedDiscount);
    if (requestedDiscount < 0 || totalDiscount > subtotal) {
      throw err400('INVALID_DISCOUNT', 'Invoice discounts cannot be negative or exceed the subtotal.');
    }
    const taxableValue = round2(subtotal - totalDiscount);
    const taxAmount = round2(taxableValue * taxRateFraction);
    const addlCharges = round2(finiteNumber(additional_charges || 0, 'additional_charges'));
    const cuttingCharge = round2(finiteNumber(cutting_charge || 0, 'cutting_charge'));
    if (addlCharges < 0 || cuttingCharge < 0) {
      throw err400('INVALID_CHARGES', 'Additional charges and cutting charge cannot be negative.');
    }
    const grandTotal    = round2(taxableValue + taxAmount + addlCharges + cuttingCharge);

    return {
      subtotal,
      discount_amount: totalDiscount,
      taxable_value: taxableValue,
      tax_rate: taxRateFraction,
      tax_amount: taxAmount,
      additional_charges: addlCharges,
      cutting_charge: cuttingCharge,
      grand_total: grandTotal,
      items: enriched
    };
  }

  // ── Invoice creation ─────────────────────────────────────────────────────────

  async createInvoice(data, actorId = null) {
    return await withTransaction(async (conn) => {
      if (data.sales_order_id && data.cutting_job_id) {
        throw err400('INVALID_SOURCE', 'An invoice may be linked to a sales order or a cutting job, not both.');
      }
      // 1. Verify customer
      const [[cust]] = await conn.execute(
        `SELECT id, name, status FROM customers WHERE id = ? LIMIT 1`, [data.customer_id]
      );
      if (!cust) throw err400('INVALID_CUSTOMER', `Customer ${data.customer_id} not found`);
      if (cust.status && cust.status.toLowerCase() === 'suspended')
        throw err400('CUSTOMER_SUSPENDED', `Customer '${cust.name}' is suspended`);

      if (data.sales_order_id) {
        const [[order]] = await conn.execute(
          `SELECT id, customer_id, status FROM sales_orders WHERE id = ? LIMIT 1`,
          [data.sales_order_id]
        );
        if (!order) throw err400('INVALID_SALES_ORDER', 'The selected sales order does not exist.');
        if (order.status === 'cancelled') throw err400('INVALID_SALES_ORDER', 'A cancelled sales order cannot be invoiced.');
        if (Number(order.customer_id) !== Number(data.customer_id)) {
          throw err400('SOURCE_CUSTOMER_MISMATCH', 'The sales order belongs to a different customer.');
        }
      }
      if (data.cutting_job_id) {
        const [[job]] = await conn.execute(
          `SELECT id, customer_id, job_type, status FROM cutting_jobs WHERE id = ? LIMIT 1`,
          [data.cutting_job_id]
        );
        if (!job || job.job_type !== 'customer_order' || !job.customer_id || job.status === 'cancelled') {
          throw err400('INVALID_CUTTING_JOB', 'The selected cutting job is not a customer job.');
        }
        if (Number(job.customer_id) !== Number(data.customer_id)) {
          throw err400('SOURCE_CUSTOMER_MISMATCH', 'The cutting job belongs to a different customer.');
        }
      }

      // 2. Authoritative calculations
      const calc = this._calculate(data.items || [], {
        discount_amount: data.discount_amount,
        tax_rate_percent: data.tax_rate_percent,
        additional_charges: data.additional_charges,
        cutting_charge: data.cutting_charge
      });
      const languageCode = String(data.language_code || 'en').toLowerCase();
      if (!SUPPORTED_BILL_LANGUAGES.has(languageCode)) {
        throw err400('INVALID_INVOICE_LANGUAGE', `PDF invoices do not yet support the selected language (${languageCode}). Select a supported language before issuing the bill.`);
      }
      calc.items = await Promise.all(calc.items.map(async (item, index) => {
        const dimensions = item.dimensions_text == null ? null : String(item.dimensions_text).trim();
        if (dimensions && (dimensions.length > 255 || /[\r\n]/.test(dimensions) || !validDimensions(dimensions))) {
          throw err400('INVALID_DIMENSIONS', `Invoice line ${index + 1} dimensions must show a unit for each size, for example 2 in x 4 in x 8 ft.`);
        }
        let localizedDescription = item.localized_description || null;
        let woodTypeId = null;
        if (item.wood_type_id !== undefined && item.wood_type_id !== null && String(item.wood_type_id).trim() !== '') {
          woodTypeId = Number(item.wood_type_id);
          if (!Number.isSafeInteger(woodTypeId) || woodTypeId < 1) {
            throw err400('INVALID_WOOD_TYPE', `Invoice line ${index + 1} has an invalid catalogue wood type.`);
          }
          const [[woodType]] = await conn.execute(
            `SELECT wt.id, wn.name AS localized_name
               FROM wood_types wt
               LEFT JOIN wood_names wn
                 ON wn.wood_type_id = wt.id AND wn.language_code = ? AND wn.name_kind = 'preferred'
              WHERE wt.id = ?
              ORDER BY wn.verified DESC, wn.id
              LIMIT 1`,
            [languageCode, woodTypeId]
          );
          if (!woodType) throw err400('INVALID_WOOD_TYPE', `Invoice line ${index + 1} catalogue wood type was not found.`);
          localizedDescription = woodType.localized_name || item.description;
        }
        return { ...item, wood_type_id: woodTypeId, localized_description: localizedDescription, dimensions_text: dimensions || null };
      }));

      // 3. Generate invoice number
      const invoiceNumber = await invoiceRepo.generateInvoiceNumber(conn);

      // 4. Persist
      const invoiceId = await invoiceRepo.createInvoice({
        invoice_number: invoiceNumber,
        sales_order_id: data.sales_order_id || null,
        cutting_job_id: data.cutting_job_id || null,
        customer_id: data.customer_id,
        ...calc,
        issue_date: data.issue_date || new Date().toISOString().split('T')[0],
        due_date: data.due_date,
        currency: 'INR',
        language_code: languageCode,
        payment_terms: data.payment_terms || 'Net 30',
        notes: data.notes || null,
        created_by_id: actorId
      }, calc.items, conn);

      return await invoiceRepo.getInvoiceById(invoiceId, conn);
    });
  }

  // ── Payment recording ────────────────────────────────────────────────────────

  /**
   * Record a full or partial payment against an invoice.
   *
   * Financial rules:
   *  - Amount must be > 0.
   *  - Amount may not exceed amount_due.
   *  - Idempotency key and transaction reference are both checked for duplicates.
   */
  async recordPayment(invoiceId, payData, actorId = null) {
    return withTransaction(async (conn) => {
      const invoice = await invoiceRepo.lockInvoiceForUpdate(invoiceId, conn);
      if (!invoice) throw err404('INVOICE_NOT_FOUND', `Invoice ${invoiceId} not found`);
      if (!payData.idempotency_key) {
        throw err400('IDEMPOTENCY_KEY_REQUIRED', 'An idempotency key is required to post a payment.');
      }
      const amount = round2(finiteNumber(payData.amount, 'amount'));
      if (amount <= 0) {
        throw err400('INVALID_AMOUNT', 'Payment amount must be greater than zero.');
      }
      const priorPayment = await invoiceRepo.findPaymentByIdempotencyKey(payData.idempotency_key, conn);
      if (priorPayment) {
        if (Number(priorPayment.invoice_id) !== Number(invoice.id)) {
          throw err409('IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used for another invoice.');
        }
        if (round2(Number(priorPayment.amount)) !== amount
          || (payData.payment_method && priorPayment.payment_method !== payData.payment_method)
          || (payData.payment_date && String(priorPayment.payment_date).slice(0, 10) !== payData.payment_date)
          || (payData.transaction_reference || null) !== (priorPayment.transaction_reference || null)) {
          throw err409('IDEMPOTENCY_KEY_REUSED', 'This idempotency key was previously used with different payment details.');
        }
        const priorInvoice = await invoiceRepo.getInvoiceById(invoice.id, conn);
        const priorRecord = priorInvoice.payments.find(p => Number(p.id) === Number(priorPayment.id));
        if (!priorRecord) throw new Error(`Idempotent payment ${priorPayment.id} is missing from invoice ${invoice.id} history.`);
        return {
          invoice: priorInvoice,
          payment: priorRecord,
          balance: {
            amountPaid: Number(priorInvoice.amount_paid),
            amountDue: Number(priorInvoice.amount_due),
            paymentStatus: priorInvoice.payment_status
          },
          replayed: true
        };
      }
      if (invoice.payment_status === 'voided')
        throw err400('INVOICE_VOIDED', `Cannot post payment to voided invoice ${invoice.invoice_number}`);
      if (invoice.payment_status === 'paid')
        throw err400('INVOICE_FULLY_PAID', `Invoice ${invoice.invoice_number} is already fully paid`);

      const amountDue = round2(Number(invoice.amount_due));
      if (amount > amountDue) {
        throw err400('OVERPAYMENT', `Payment ${invoice.currency} ${amount.toFixed(2)} exceeds outstanding balance ${invoice.currency} ${amountDue.toFixed(2)}.`);
      }

      if (payData.transaction_reference) {
        const dup = await invoiceRepo.findPaymentByReference(invoice.id, payData.transaction_reference, conn);
        if (dup) throw err400('DUPLICATE_PAYMENT', `A payment with reference '${payData.transaction_reference}' already exists for this invoice.`);
      }

      // Generate payment number
      const paymentNumber = await invoiceRepo.generatePaymentNumber(conn);

      const paymentId = await invoiceRepo.createPayment({
        payment_number: paymentNumber,
        invoice_id: invoiceId,
        customer_id: invoice.customer_id,
        amount,
        payment_method: payData.payment_method || 'bank_transfer',
        payment_date: payData.payment_date || new Date().toISOString().split('T')[0],
        transaction_reference: payData.transaction_reference || null,
        idempotency_key: payData.idempotency_key,
        notes: payData.notes || null,
        recorded_by_id: actorId
      }, conn);

      // Refresh invoice balance
      const balance = await invoiceRepo.refreshInvoiceBalance(invoiceId, invoice.grand_total, conn);
      await invoiceRepo.setPaymentBalanceAfter(paymentId, balance.amountDue, conn);

      const fullInvoice = await invoiceRepo.getInvoiceById(invoiceId, conn);
      const payment = fullInvoice.payments.find(p => p.id === paymentId);
      return { invoice: fullInvoice, payment, balance };
    }).catch((error) => {
      if (error.code === 'ER_DUP_ENTRY') {
        throw Object.assign(new Error('This payment submission or transaction reference has already been recorded.'), {
          statusCode: 409,
          code: 'DUPLICATE_PAYMENT'
        });
      }
      throw error;
    });
  }

  // ── Payment reversal ─────────────────────────────────────────────────────────

  /**
   * Reverse a posted payment.
   * Posts a negating entry (negative amount) + marks original as 'reversed'.
   * Then refreshes the invoice balance.
   */
  async reversePayment(paymentId, reversalReason, actorId = null) {
    if (!reversalReason || !reversalReason.trim())
      throw err400('REASON_REQUIRED', 'A reversal reason is required');

    return await withTransaction(async (conn) => {
      const pay = await invoiceRepo.lockPaymentForUpdate(paymentId, conn);
      if (!pay) throw err404('PAYMENT_NOT_FOUND', `Payment ${paymentId} not found`);
      if (pay.status === 'reversed' || Number(pay.amount) <= 0)
        throw err400('ALREADY_REVERSED', `Payment ${pay.payment_number} has already been reversed`);

      const invoice = await invoiceRepo.lockInvoiceForUpdate(pay.invoice_id, conn);
      if (!invoice) throw err404('INVOICE_NOT_FOUND', 'Parent invoice not found');

      // Keep the original entry for audit; the negative entry offsets it in balance calculations.
      const reversalNumber = await invoiceRepo.generatePaymentNumber(conn);
      const reversalId = await invoiceRepo.createPayment({
        payment_number: reversalNumber,
        invoice_id: pay.invoice_id,
        customer_id: pay.customer_id,
        amount: round2(-Math.abs(Number(pay.amount))),  // negative amount
        payment_method: pay.payment_method,
        payment_date: new Date().toISOString().split('T')[0],
        transaction_reference: `REVERSAL-OF-${pay.payment_number}`,
        notes: reversalReason,
        recorded_by_id: actorId
      }, conn);

      // Mark original as reversed
      await invoiceRepo.reversePayment(paymentId, {
        reversalReason,
        reversedByPaymentId: reversalId,
        reversedByUserId: actorId
      }, conn);

      // Refresh balance
      const balance = await invoiceRepo.refreshInvoiceBalance(pay.invoice_id, invoice.grand_total, conn);
      await invoiceRepo.setPaymentBalanceAfter(reversalId, balance.amountDue, conn);

      return {
        reversed_payment_id: paymentId,
        reversal_payment_id: reversalId,
        balance,
        invoice: await invoiceRepo.getInvoiceById(pay.invoice_id, conn)
      };
    });
  }

  // ── Invoice voiding ──────────────────────────────────────────────────────────

  async voidInvoice(invoiceId, voidReason, actorId = null) {
    if (!voidReason || !voidReason.trim())
      throw err400('REASON_REQUIRED', 'A void reason is required');

    return await withTransaction(async (conn) => {
      const invoice = await invoiceRepo.lockInvoiceForUpdate(invoiceId, conn);
      if (!invoice) throw err404('INVOICE_NOT_FOUND', `Invoice ${invoiceId} not found`);
      if (invoice.payment_status === 'voided')
        throw err400('ALREADY_VOIDED', `Invoice ${invoice.invoice_number} is already voided`);
      if (Number(invoice.amount_paid) > 0)
        throw err400('INVOICE_HAS_PAYMENTS', `Cannot void invoice ${invoice.invoice_number} with posted payments. Reverse payments first.`);

      await conn.execute(
        `UPDATE invoices
            SET payment_status='voided', voided_by_id=?, voided_at=NOW(), void_reason=?
          WHERE id=?`,
        [actorId || null, voidReason, invoiceId]
      );

      return await invoiceRepo.getInvoiceById(invoiceId, conn);
    });
  }

  // ── Queries ──────────────────────────────────────────────────────────────────

  async listInvoices(params) { return await invoiceRepo.listInvoices(params); }
  async getInvoiceById(id)   { return await invoiceRepo.getInvoiceById(id); }
  async listPayments(params) { return await invoiceRepo.listPayments(params); }
}

// ── Error helpers ─────────────────────────────────────────────────────────────
function err400(code, msg) { return Object.assign(new Error(msg), { statusCode: 400, code }); }
function err409(code, msg) { return Object.assign(new Error(msg), { statusCode: 409, code }); }
function err404(code, msg) { return Object.assign(new Error(msg), { statusCode: 404, code }); }
function finiteNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw err400('INVALID_AMOUNT', `${field} must be a finite number.`);
  return number;
}
function round2(v) { return Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100; }
function validDimensions(value) {
  const measure = String.raw`\d+(?:\.\d+)?\s*(?:in(?:ches?)?|ft|feet|foot|mm|cm|m|["'])`;
  return new RegExp(`^\\s*${measure}\\s*(?:[x×*]\\s*${measure}\\s*){0,2}$`, 'i').test(value);
}

module.exports = new InvoiceService();
