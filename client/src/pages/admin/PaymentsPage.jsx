import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Plus, RefreshCw, RotateCcw } from 'lucide-react';
import DataTable from '../../components/admin/DataTable';
import SearchBar from '../../components/admin/SearchBar';
import FilterPanel from '../../components/admin/FilterPanel';
import Pagination from '../../components/admin/Pagination';
import Modal from '../../components/admin/Modal';
import LoadingSpinner from '../../components/admin/LoadingSpinner';
import {
  addPayment,
  downloadReceiptPdf,
  getInvoice,
  getInvoices,
  getPayments,
  reversePayment
} from '../../services/adminApi';
import './AdminPages.css';
import { formatCurrency, formatDate } from '../../utils/formatters';

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const currency = (amount, currencyCode) => formatCurrency(amount, currencyCode);
const newIdempotencyKey = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};
const FORM_STORAGE_KEY = 'tc_mill_payment_attempt_v1';
const initialForm = () => {
  try {
    const saved = sessionStorage.getItem(FORM_STORAGE_KEY);
    if (saved) {
      const previousAttempt = JSON.parse(saved);
      return { ...previousAttempt, idempotency_key: previousAttempt.idempotency_key || newIdempotencyKey() };
    }
  } catch (err) {
    console.warn('[PaymentsPage] Could not restore the pending payment attempt:', err);
  }
  return {
    invoice_id: '',
    amount: '',
    payment_method: 'bank_transfer',
    payment_date: today(),
    transaction_reference: '',
    notes: '',
    idempotency_key: newIdempotencyKey()
  };
};

function ErrorMessage({ children }) {
  return children ? <div role="alert" className="admin-inline-error">{children}</div> : null;
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [invoiceDetails, setInvoiceDetails] = useState(null);
  const [paymentToReverse, setPaymentToReverse] = useState(null);
  const [reversalReason, setReversalReason] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [paymentRows, invoiceRows] = await Promise.all([
        getPayments({ limit: 200 }),
        getInvoices({ limit: 200 })
      ]);
      setPayments(paymentRows);
      setInvoices(invoiceRows);
    } catch (err) {
      setError(err.message || 'Unable to load payments from the billing API.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(loadData); }, [loadData]);
  const refreshData = () => {
    setLoading(true);
    setError('');
    loadData();
  };
  useEffect(() => {
    try {
      sessionStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(form));
    } catch (err) {
      console.warn('[PaymentsPage] Could not persist the pending payment attempt:', err);
    }
  }, [form]);

  const filtered = useMemo(() => payments.filter((payment) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [
      payment.payment_number,
      payment.invoice_number,
      payment.customer_name,
      payment.transaction_reference
    ].some((value) => String(value || '').toLowerCase().includes(query));
    return matchesSearch && (methodFilter === 'All' || payment.payment_method === methodFilter);
  }), [payments, search, methodFilter]);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const selectedInvoice = invoices.find((invoice) => String(invoice.id) === form.invoice_id);

  const selectInvoice = async (invoiceId) => {
    setForm((current) => ({ ...current, invoice_id: invoiceId }));
    setInvoiceDetails(null);
    if (!invoiceId) return;
    try {
      setInvoiceDetails(await getInvoice(invoiceId));
    } catch (err) {
      setError(err.message || 'Unable to load the selected invoice balance.');
    }
  };

  const submitPayment = async (event) => {
    event.preventDefault();
    const invoiceNumber = invoiceDetails?.invoice_number || selectedInvoice?.invoice_number || 'selected invoice';
    if (!window.confirm(`Save ${currency(form.amount, invoiceDetails?.currency || selectedInvoice?.currency)} payment for ${invoiceNumber}?`)) return;
    setNotice('');
    setSaving(true);
    setError('');
    try {
      await addPayment(form.invoice_id, {
        amount: Number(form.amount),
        payment_method: form.payment_method,
        payment_date: form.payment_date,
        transaction_reference: form.transaction_reference.trim() || null,
        notes: form.notes.trim() || null,
        idempotency_key: form.idempotency_key
      });
      setNotice('Payment saved successfully.');
      sessionStorage.removeItem(FORM_STORAGE_KEY);
      setForm(initialForm());
      setInvoiceDetails(null);
      setIsModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err.message || 'The payment could not be recorded. Retrying will use the same idempotency key.');
    } finally {
      setSaving(false);
    }
  };

  const submitReversal = async (event) => {
    event.preventDefault();
    if (!paymentToReverse || reversalReason.trim().length < 5) return;
    setNotice('');
    setSaving(true);
    setError('');
    try {
      await reversePayment(paymentToReverse.id, reversalReason.trim());
      setNotice('Payment change saved successfully.');
      setPaymentToReverse(null);
      setReversalReason('');
      await loadData();
    } catch (err) {
      setError(err.message || 'The payment reversal could not be posted.');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      key: 'payment_number',
      label: 'Payment #',
      sortable: true,
      render: (value) => <strong style={{ color: 'var(--color-forest)' }}>{value}</strong>
    },
    { key: 'invoice_number', label: 'Invoice', sortable: true },
    { key: 'customer_name', label: 'Customer', sortable: true },
    { key: 'payment_date', label: 'Date', sortable: true, render: value => formatDate(value) },
    {
      key: 'payment_method',
      label: 'Method',
      sortable: true,
      render: (value) => String(value || '').replaceAll('_', ' ')
    },
    { key: 'transaction_reference', label: 'Transaction reference' },
    {
      key: 'notes',
      label: 'Notes / reversal reason',
      render: (value, row) => row.reversal_reason || value || '—'
    },
    {
      key: 'amount',
      label: 'Amount',
      sortable: true,
      render: (value, row) => (
        <strong style={{ color: Number(value) < 0 ? '#b91c1c' : '#15803d' }}>
          {Number(value) < 0 ? '−' : '+'}{currency(Math.abs(Number(value)), row.currency)}
        </strong>
      )
    },
    {
      key: 'status',
      label: 'Status',
      render: (value, row) => <span className={`badge ${value === 'reversed' || Number(row.amount) < 0 ? 'badge-danger' : 'badge-success'}`}>
        {value === 'reversed' || Number(row.amount) < 0 ? 'Reversed' : 'Posted'}
      </span>
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 8 }}>
          {Number(row.amount) > 0 && row.status === 'posted' && (
            <>
              <button type="button" className="btn btn-outline" title="Download receipt" onClick={() => downloadReceiptPdf(row.invoice_id, row.id).catch((err) => setError(err.message))}><Download size={15} /></button>
              <button type="button" className="btn btn-outline" title="Reverse payment" onClick={() => { setPaymentToReverse(row); setReversalReason(''); }}><RotateCcw size={15} /></button>
            </>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="admin-subpage">
      <div className="admin-subpage-header">
        <div className="admin-subpage-header__left">
          <h1 className="admin-subpage-title">Customer Payments</h1>
          <p className="admin-subpage-subtitle">Save payments, download receipts and review payment changes.</p>
        </div>
        <div className="admin-subpage-header__actions">
          <button type="button" className="btn btn-outline" onClick={refreshData}><RefreshCw size={15} /><span>Refresh</span></button>
          <button type="button" className="btn btn-primary" onClick={() => { setError(''); setIsModalOpen(true); }}><Plus size={16} /><span>Receive Payment</span></button>
        </div>
      </div>

      <ErrorMessage>{error}</ErrorMessage>
      {notice && <div className="admin-inline-success" role="status">{notice}</div>}

      <div className="admin-toolbar">
        <div className="admin-toolbar__left">
          <SearchBar value={search} onChange={(event) => { setSearch(event.target.value); setCurrentPage(1); }} placeholder="Search payment, invoice, customer, or reference..." />
          <FilterPanel
            filters={[{
              key: 'method',
              label: 'Payment method',
              value: methodFilter,
              onChange: (value) => { setMethodFilter(value); setCurrentPage(1); },
              options: [
                { label: 'All methods', value: 'All' },
                { label: 'Cash', value: 'cash' },
                { label: 'Bank transfer', value: 'bank_transfer' },
                { label: 'UPI', value: 'upi' },
                { label: 'Cheque', value: 'cheque' },
                { label: 'Credit card', value: 'credit_card' },
                { label: 'Other', value: 'other' }
              ]
            }]}
            onReset={() => { setMethodFilter('All'); setSearch(''); }}
            totalResults={filtered.length}
          />
        </div>
      </div>

      {loading ? <LoadingSpinner message="Loading customer payment ledger..." /> : (
        <>
          <DataTable columns={columns} data={paginated} keyField="id" />
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filtered.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
          />
        </>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => { if (!saving) setIsModalOpen(false); }}
        title="Record invoice payment"
        subtitle="Payments are posted to the invoice ledger in a database transaction; overpayments are rejected."
        size="md"
      >
        <form onSubmit={submitPayment}>
          <div className="admin-form-grid">
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="payment-invoice">Invoice</label>
              <select id="payment-invoice" className="admin-form-select" required value={form.invoice_id} onChange={(event) => selectInvoice(event.target.value)}>
                <option value="">Choose an outstanding invoice</option>
                {invoices.filter((invoice) => invoice.payment_status !== 'paid' && invoice.payment_status !== 'voided' && Number(invoice.amount_due) > 0).map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>{invoice.invoice_number} · {invoice.customer_name} · Due {currency(invoice.amount_due, invoice.currency)}</option>
                ))}
              </select>
            </div>
            {invoiceDetails && (
              <div className="admin-form-group">
                <span className="admin-form-label">Outstanding balance</span>
                <strong>{currency(invoiceDetails.amount_due, invoiceDetails.currency)}</strong>
                <small>Previously received: {currency(invoiceDetails.amount_paid, invoiceDetails.currency)}</small>
              </div>
            )}
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="payment-amount">Amount received</label>
              <input id="payment-amount" type="number" required min="0.01" step="0.01" max={invoiceDetails?.amount_due || selectedInvoice?.amount_due || undefined} className="admin-form-input" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="payment-method">Payment method</label>
              <select id="payment-method" required className="admin-form-select" value={form.payment_method} onChange={(event) => setForm({ ...form, payment_method: event.target.value })}>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
                <option value="credit_card">Credit card</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="payment-date">Payment date</label>
              <input id="payment-date" type="date" required className="admin-form-input" value={form.payment_date} onChange={(event) => setForm({ ...form, payment_date: event.target.value })} />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="payment-reference">Transaction reference</label>
              <input id="payment-reference" type="text" maxLength="150" className="admin-form-input" value={form.transaction_reference} onChange={(event) => setForm({ ...form, transaction_reference: event.target.value })} placeholder="Bank reference, UPI ID, cheque number…" />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="payment-notes">Notes</label>
              <input id="payment-notes" type="text" className="admin-form-input" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </div>
          </div>
          <ErrorMessage>{error}</ErrorMessage>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-outline" disabled={saving} onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !form.invoice_id}>{saving ? 'Posting…' : 'Post payment'}</button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(paymentToReverse)}
        onClose={() => { if (!saving) setPaymentToReverse(null); }}
        title="Reverse posted payment"
        subtitle="The original record remains in the ledger. A reversal entry and your reason are retained for audit."
        size="md"
      >
        {paymentToReverse && <form onSubmit={submitReversal}>
          <p>Reverse {currency(paymentToReverse.amount, paymentToReverse.currency)} on {paymentToReverse.invoice_number}?</p>
          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="reversal-reason">Correction / reversal reason</label>
            <textarea id="reversal-reason" required minLength="5" className="admin-form-input" rows="3" value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} />
          </div>
          <ErrorMessage>{error}</ErrorMessage>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-outline" disabled={saving} onClick={() => setPaymentToReverse(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || reversalReason.trim().length < 5}>{saving ? 'Reversing…' : 'Confirm reversal'}</button>
          </div>
        </form>}
      </Modal>
    </div>
  );
}
