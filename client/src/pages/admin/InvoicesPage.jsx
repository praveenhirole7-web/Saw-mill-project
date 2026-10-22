import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Eye, FileText, Plus, Printer, RefreshCw, Trash2 } from 'lucide-react';
import DataTable from '../../components/admin/DataTable';
import SearchBar from '../../components/admin/SearchBar';
import FilterPanel from '../../components/admin/FilterPanel';
import Pagination from '../../components/admin/Pagination';
import Modal from '../../components/admin/Modal';
import LoadingSpinner from '../../components/admin/LoadingSpinner';
import {
  addInvoice,
  downloadInvoicePdf,
  downloadReceiptPdf,
  getCustomers,
  getCuttingJobs,
  getInvoice,
  getInvoices,
  getSalesOrders,
  getWoodTypes,
  previewInvoicePdf
} from '../../services/adminApi';
import './AdminPages.css';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { LANGUAGES } from '../../i18n/languages';
import { getLocalizedWoodName } from '../../i18n/woodSpecies';

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const datePlusDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const currency = (amount, currencyCode) => formatCurrency(amount, currencyCode);
const invoiceStatus = (invoice) => {
  if (invoice.payment_status === 'voided') return 'Voided';
  if (invoice.payment_status === 'paid') return 'Paid';
  if (invoice.due_date < today()) return 'Overdue';
  return invoice.payment_status === 'partially_paid' ? 'Partially Paid' : 'Unpaid';
};
const emptyItem = () => ({ wood_type_id: '', description: '', quantity: '1', unit: 'CFT', unit_price: '', discount_percent: '0' });
const invoiceLanguageNames = { en: 'English', kn: 'ಕನ್ನಡ', hi: 'हिन्दी', te: 'తెలుగు', ta: 'தமிழ்', ml: 'മലയാളം', mr: 'मराठी', bn: 'বাংলা', gu: 'ગુજરાતી', pa: 'ਪੰਜਾਬੀ', or: 'ଓଡ଼ିଆ', as: 'অসমীয়া', ur: 'اردو', sa: 'संस्कृतम्', kok: 'कोंकणी', mni: 'মেইতেই', ne: 'नेपाली', ks: 'کٲشُر', sd: 'سنڌي', brx: 'बड़ो', doi: 'डोगरी', sat: 'ᱥᱟᱱᱛᱟᱲᱤ', mai: 'मैथिली' };

const initialForm = () => ({
  customer_id: '',
  source_type: '',
  sales_order_id: '',
  cutting_job_id: '',
  issue_date: today(),
  due_date: datePlusDays(30),
  tax_rate_percent: '',
  discount_amount: '0',
  additional_charges: '0',
  cutting_charge: '0',
  currency: 'INR',
  language_code: 'en',
  payment_terms: 'Net 30',
  notes: '',
  items: [emptyItem()]
});

function ErrorMessage({ children }) {
  return children ? <div role="alert" className="admin-inline-error">{children}</div> : null;
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [cuttingJobs, setCuttingJobs] = useState([]);
  const [woodTypes, setWoodTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [paperSize, setPaperSize] = useState('A4');

  const loadData = useCallback(async () => {
    try {
      const [invoiceRows, customerRows, orderRows, jobRows, woodRows] = await Promise.all([
        getInvoices({ limit: 200 }),
        getCustomers(),
        getSalesOrders(),
        getCuttingJobs(),
        getWoodTypes()
      ]);
      setInvoices(invoiceRows);
      setCustomers(customerRows);
      setSalesOrders(orderRows);
      setCuttingJobs(jobRows);
      setWoodTypes(woodRows);
    } catch (err) {
      setError(err.message || 'Unable to load invoices from the billing API.');
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

  const filtered = useMemo(() => invoices.filter((invoice) => {
    const query = search.trim().toLowerCase();
    const sourceRef = invoice.sales_order_number || invoice.cutting_job_number || '';
    const matchesSearch = !query || [
      invoice.invoice_number,
      sourceRef,
      invoice.customer_name,
      invoice.company_name
    ].some((value) => String(value || '').toLowerCase().includes(query));
    const matchesStatus = statusFilter === 'All' || invoiceStatus(invoice) === statusFilter;
    return matchesSearch && matchesStatus;
  }), [invoices, search, statusFilter]);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;

  const openInvoice = async (invoice) => {
    setError('');
    try {
      setSelectedInvoice(await getInvoice(invoice.id));
    } catch (err) {
      setError(err.message || 'Unable to load invoice details.');
    }
  };

  const updateItem = (index, field, value) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item)
    }));
  };

  const selectWoodType = (index, woodTypeId) => {
    const woodType = woodTypes.find((entry) => String(entry.id) === String(woodTypeId));
    const description = woodType ? getLocalizedWoodName(woodType, null, form.language_code) : '';
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index
        ? { ...item, wood_type_id: woodTypeId, description: description || item.description }
        : item)
    }));
  };

  const updateInvoiceLanguage = (language_code) => {
    setForm((current) => ({
      ...current,
      language_code,
      items: current.items.map((item) => {
        const woodType = woodTypes.find((entry) => String(entry.id) === String(item.wood_type_id));
        return woodType
          ? { ...item, description: getLocalizedWoodName(woodType, null, language_code) }
          : item;
      })
    }));
  };

  const updateSourceType = (source_type) => {
    setForm((current) => ({ ...current, source_type, sales_order_id: '', cutting_job_id: '' }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setNotice('');
    setSaving(true);
    setError('');
    try {
      const payload = {
        customer_id: Number(form.customer_id),
        issue_date: form.issue_date,
        due_date: form.due_date,
        tax_rate_percent: Number(form.tax_rate_percent),
        discount_amount: Number(form.discount_amount || 0),
        additional_charges: Number(form.additional_charges || 0),
        cutting_charge: Number(form.cutting_charge || 0),
        currency: 'INR',
        language_code: form.language_code,
        payment_terms: form.payment_terms,
        notes: form.notes.trim() || null,
        ...(form.source_type === 'sales_order' && { sales_order_id: Number(form.sales_order_id) }),
        ...(form.source_type === 'cutting_job' && { cutting_job_id: Number(form.cutting_job_id) }),
        items: form.items.map((item) => ({
          description: item.description.trim(),
          wood_type_id: item.wood_type_id ? Number(item.wood_type_id) : null,
          dimensions_text: item.dimensions_text?.trim() || null,
          quantity: Number(item.quantity),
          unit: item.unit.trim() || 'CFT',
          unit_price: Number(item.unit_price),
          discount_percent: Number(item.discount_percent || 0)
        }))
      };
      const created = await addInvoice(payload);
      setInvoices((current) => [created, ...current]);
      setNotice('Invoice saved successfully.');
      setForm(initialForm());
      setIsModalOpen(false);
      try {
        setSelectedInvoice(await getInvoice(created.id));
      } catch (err) {
        setError(`Invoice ${created.invoice_number} was issued, but its details could not be loaded: ${err.message}`);
      }
    } catch (err) {
      setError(err.message || 'The invoice could not be issued.');
    } finally {
      setSaving(false);
    }
  };

  const downloadInvoice = async (invoice) => {
    try {
      await downloadInvoicePdf(invoice.id, paperSize);
    } catch (err) {
      setError(err.message || 'Invoice PDF download failed.');
    }
  };

  const columns = [
    {
      key: 'invoice_number',
      label: 'Invoice #',
      sortable: true,
      render: (value) => <strong style={{ color: 'var(--color-forest)' }}>{value}</strong>
    },
    {
      key: 'sales_order_number',
      label: 'Order / Job',
      render: (_, row) => row.sales_order_number || row.cutting_job_number || 'Standalone'
    },
    { key: 'customer_name', label: 'Billed Customer', sortable: true },
    { key: 'issue_date', label: 'Issued', sortable: true, render: value => formatDate(value) },
    { key: 'due_date', label: 'Due', sortable: true, render: value => formatDate(value) },
    { key: 'subtotal', label: 'Subtotal', render: (value, row) => currency(value, row.currency) },
    { key: 'tax_amount', label: 'Tax', render: (value, row) => currency(value, row.currency) },
    {
      key: 'grand_total',
      label: 'Total',
      sortable: true,
      render: (value, row) => <strong>{currency(value, row.currency)}</strong>
    },
    {
      key: 'payment_status',
      label: 'Status',
      render: (_, row) => {
        const status = invoiceStatus(row);
        const badge = status === 'Paid' ? 'badge-success' : status === 'Overdue' || status === 'Voided' ? 'badge-danger' : 'badge-warning';
        return <span className={`badge ${badge}`}>{status}</span>;
      }
    },
    {
      key: 'actions',
      label: 'Documents',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-outline" title="View invoice" onClick={() => openInvoice(row)}><Eye size={15} /></button>
          <button type="button" className="btn btn-outline" title="Download PDF" onClick={() => downloadInvoice(row)}><Download size={15} /></button>
        </div>
      )
    }
  ];

  const selectedCustomer = customers.find((customer) => String(customer.id) === form.customer_id);
  const selectableOrders = salesOrders.filter((order) => String(order.customerId ?? order.customer_id) === form.customer_id);
  const selectableJobs = cuttingJobs.filter((job) =>
    String(job.customerId ?? job.customer_id) === form.customer_id && job.rawStatus !== 'cancelled'
  );

  return (
    <div className="admin-subpage">
      <div className="admin-subpage-header">
        <div className="admin-subpage-header__left">
          <h1 className="admin-subpage-title">Invoices</h1>
          <p className="admin-subpage-subtitle">Issue audited customer invoices, review balances, and print or download PDF documents.</p>
        </div>
        <div className="admin-subpage-header__actions">
          <button type="button" className="btn btn-outline" onClick={refreshData}><RefreshCw size={15} /><span>Refresh</span></button>
          <button type="button" className="btn btn-primary" onClick={() => { setError(''); setIsModalOpen(true); }}><Plus size={16} /><span>Issue Invoice</span></button>
        </div>
      </div>

      <ErrorMessage>{error}</ErrorMessage>
      {notice && <div className="admin-inline-success" role="status">{notice}</div>}

      <div className="admin-toolbar">
        <div className="admin-toolbar__left">
          <SearchBar value={search} onChange={(event) => { setSearch(event.target.value); setCurrentPage(1); }} placeholder="Search invoice number, order, or customer..." />
          <FilterPanel
            filters={[{
              key: 'status',
              label: 'Status',
              value: statusFilter,
              onChange: (value) => { setStatusFilter(value); setCurrentPage(1); },
              options: [
                { label: 'All Invoices', value: 'All' },
                { label: 'Unpaid', value: 'Unpaid' },
                { label: 'Partially Paid', value: 'Partially Paid' },
                { label: 'Paid', value: 'Paid' },
                { label: 'Overdue', value: 'Overdue' },
                { label: 'Voided', value: 'Voided' }
              ]
            }]}
            onReset={() => { setStatusFilter('All'); setSearch(''); }}
            totalResults={filtered.length}
          />
        </div>
      </div>

      {loading ? <LoadingSpinner message="Loading invoices from billing API..." /> : (
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
        title="Issue customer invoice"
        subtitle="Tax and totals are calculated and stored by the billing service. Select the tax rate applicable to this sale."
        size="lg"
      >
        <form onSubmit={handleSubmit}>
          <div className="admin-form-grid">
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="invoice-customer">Customer</label>
              <select id="invoice-customer" className="admin-form-select" required value={form.customer_id} onChange={(event) => setForm({ ...form, customer_id: event.target.value, sales_order_id: '', cutting_job_id: '' })}>
                <option value="">Select a customer</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName || customer.company_name || customer.name}</option>)}
              </select>
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="invoice-source-type">Linked source</label>
              <select id="invoice-source-type" className="admin-form-select" value={form.source_type} onChange={(event) => updateSourceType(event.target.value)}>
                <option value="">Standalone invoice</option>
                <option value="sales_order">Sales order</option>
                <option value="cutting_job">Cutting job</option>
              </select>
            </div>
            {form.source_type === 'sales_order' && (
              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="invoice-order">Sales order</label>
                <select id="invoice-order" className="admin-form-select" required value={form.sales_order_id} onChange={(event) => setForm({ ...form, sales_order_id: event.target.value })}>
                  <option value="">Select a sales order</option>
                  {selectableOrders.map((order) => <option key={order.dbId || order.id} value={order.dbId || order.id}>{order.orderNumber || order.order_number}</option>)}
                </select>
                {!selectableOrders.length && selectedCustomer && <small>No sales orders for this customer.</small>}
              </div>
            )}
            {form.source_type === 'cutting_job' && (
              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="invoice-job">Cutting job</label>
                <select id="invoice-job" className="admin-form-select" required value={form.cutting_job_id} onChange={(event) => setForm({ ...form, cutting_job_id: event.target.value })}>
                  <option value="">Select a cutting job</option>
                  {selectableJobs.map((job) => <option key={job.dbId || job.id} value={job.dbId || job.id}>{job.jobNumber || job.job_number} — {job.jobTitle || job.job_title}</option>)}
                </select>
                {!selectableJobs.length && selectedCustomer && <small>No customer cutting jobs for this customer.</small>}
              </div>
            )}
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="invoice-issue-date">Issue date</label>
              <input id="invoice-issue-date" type="date" required className="admin-form-input" value={form.issue_date} onChange={(event) => setForm({ ...form, issue_date: event.target.value })} />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="invoice-due-date">Due date</label>
              <input id="invoice-due-date" type="date" required className="admin-form-input" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="invoice-tax-rate">Applicable tax rate (%)</label>
              <input id="invoice-tax-rate" type="number" min="0" max="100" step="0.01" required className="admin-form-input" value={form.tax_rate_percent} onChange={(event) => setForm({ ...form, tax_rate_percent: event.target.value })} placeholder="Enter the rate applicable to this invoice" />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="invoice-discount">Additional discount (₹)</label>
              <input id="invoice-discount" type="number" min="0" step="0.01" className="admin-form-input" value={form.discount_amount} onChange={(event) => setForm({ ...form, discount_amount: event.target.value })} />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="invoice-charges">Additional charges (₹)</label>
              <input id="invoice-charges" type="number" min="0" step="0.01" className="admin-form-input" value={form.additional_charges} onChange={(event) => setForm({ ...form, additional_charges: event.target.value })} />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="invoice-cutting-charge">Cutting Charge (₹)</label>
              <input id="invoice-cutting-charge" type="number" min="0" step="0.01" className="admin-form-input" value={form.cutting_charge} onChange={(event) => setForm({ ...form, cutting_charge: event.target.value })} />
              <small>Enter this only when cutting work was charged.</small>
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="invoice-currency">Currency code</label>
              <input id="invoice-currency" type="text" aria-describedby="invoice-currency-hint" className="admin-form-input" value="INR (₹)" readOnly />
              <small id="invoice-currency-hint">Use INR for Indian rupees (₹).</small>
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="invoice-language">Bill language</label>
              <select id="invoice-language" className="admin-form-select" value={form.language_code} onChange={(event) => updateInvoiceLanguage(event.target.value)}>{LANGUAGES.map((language) => <option key={language.code} value={language.code}>{invoiceLanguageNames[language.code] || language.code}{language.direction === 'rtl' ? ' (PDF unavailable)' : ''}</option>)}</select>
              <small>The language is saved with this bill. Urdu, Kashmiri, and Sindhi PDF output is not available yet.</small>
              <label className="admin-form-label" htmlFor="invoice-terms">Payment terms</label>
              <input id="invoice-terms" type="text" maxLength="100" className="admin-form-input" value={form.payment_terms} onChange={(event) => setForm({ ...form, payment_terms: event.target.value })} />
            </div>
          </div>

          <div style={{ marginTop: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h3>Invoice line items</h3>
              <button type="button" className="btn btn-outline" onClick={() => setForm({ ...form, items: [...form.items, emptyItem()] })}><Plus size={15} /> Add line</button>
            </div>
            {form.items.map((item, index) => (
              <div key={index} className="admin-form-grid" style={{ marginTop: 12, padding: 12, border: '1px solid var(--color-border, #ddd)', borderRadius: 8 }}>
                <div className="admin-form-group">
                  <label className="admin-form-label">Wood from catalogue (optional)</label>
                  <select className="admin-form-select" value={item.wood_type_id} onChange={(event) => selectWoodType(index, event.target.value)}>
                    <option value="">Enter wood name manually</option>
                    {woodTypes.map((woodType) => <option key={woodType.id} value={woodType.id}>{getLocalizedWoodName(woodType, null, form.language_code)}</option>)}
                  </select>
                  <small>Saved catalogue names are copied into the issued bill.</small>
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Description</label>
                  <input type="text" required maxLength={255} className="admin-form-input" value={item.description} onChange={(event) => updateItem(index, 'description', event.target.value)} />
                  <small>Enter the wood name in the selected bill language.</small>
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Dimensions (optional)</label>
                  <input type="text" maxLength={255} placeholder="2 × 4 × 8 ft" className="admin-form-input" value={item.dimensions_text || ''} onChange={(event) => updateItem(index, 'dimensions_text', event.target.value)} />
                  <small>Include each unit, for example 2 in × 4 in × 8 ft.</small>
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Quantity</label>
                  <input type="number" required min="0.001" step="0.001" className="admin-form-input" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Unit</label>
                  <input type="text" maxLength={30} className="admin-form-input" value={item.unit} onChange={(event) => updateItem(index, 'unit', event.target.value)} />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Unit price (₹)</label>
                  <input type="number" required min="0" step="0.01" className="admin-form-input" value={item.unit_price} onChange={(event) => updateItem(index, 'unit_price', event.target.value)} />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Line discount (%)</label>
                  <input type="number" min="0" max="100" step="0.01" className="admin-form-input" value={item.discount_percent} onChange={(event) => updateItem(index, 'discount_percent', event.target.value)} />
                </div>
                {form.items.length > 1 && <button type="button" className="btn btn-outline" aria-label={`Remove line ${index + 1}`} onClick={() => setForm({ ...form, items: form.items.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={15} /> Remove</button>}
              </div>
            ))}
          </div>
          <div className="admin-form-group" style={{ marginTop: '1rem' }}>
            <label className="admin-form-label" htmlFor="invoice-notes">Notes</label>
            <textarea id="invoice-notes" className="admin-form-input" rows="3" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </div>

          <ErrorMessage>{error}</ErrorMessage>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-outline" disabled={saving} onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Issuing…' : 'Issue invoice'}</button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(selectedInvoice)}
        onClose={() => setSelectedInvoice(null)}
        title={selectedInvoice?.invoice_number || 'Invoice details'}
        subtitle={selectedInvoice?.customer_name}
        size="lg"
      >
        {selectedInvoice && (
          <section>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
              <label className="admin-form-group" style={{ minWidth: 150, margin: 0 }}><span className="admin-form-label">Paper size</span><select className="admin-form-select" value={paperSize} onChange={(event) => setPaperSize(event.target.value)}><option>A4</option><option>A5</option><option>Letter</option><option>Legal</option></select></label>
              <button type="button" className="btn btn-outline" onClick={() => previewInvoicePdf(selectedInvoice.id, paperSize).catch((err) => setError(err.message))}><Printer size={15} /> Print / Preview</button>
              <button type="button" className="btn btn-primary" onClick={() => downloadInvoice(selectedInvoice)}><Download size={15} /> Download PDF</button>
            </div>
            <p><strong>Status:</strong> {invoiceStatus(selectedInvoice)} &nbsp; <strong>Due:</strong> {selectedInvoice.due_date}</p>
            <div style={{ overflowX: 'auto' }}>
              <table className="billing-details-table">
                <thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Discount</th><th>Line Total</th></tr></thead>
                <tbody>{(selectedInvoice.items || []).map((item) => (
                  <tr key={item.id}>
                    <td>{item.localized_description || item.description}{item.dimensions_text && <small style={{ display: 'block' }}>Dimensions: {item.dimensions_text}</small>}</td>
                    <td>{item.quantity} {item.unit}</td>
                    <td>{currency(item.unit_price, selectedInvoice.currency)}</td>
                    <td>{(Number(item.discount_percent || 0) * 100).toFixed(2)}%</td>
                    <td>{currency(item.line_total, selectedInvoice.currency)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div style={{ maxWidth: 360, margin: '16px 0 20px auto' }}>
              <p>Subtotal: {currency(selectedInvoice.subtotal, selectedInvoice.currency)}</p>
              <p>Discount: −{currency(selectedInvoice.discount_amount, selectedInvoice.currency)}</p>
              <p>Taxable value: {currency(selectedInvoice.taxable_value, selectedInvoice.currency)}</p>
              <p>Tax ({(Number(selectedInvoice.tax_rate) * 100).toFixed(2)}%): {currency(selectedInvoice.tax_amount, selectedInvoice.currency)}</p>
              <p>Additional charges: {currency(selectedInvoice.additional_charges, selectedInvoice.currency)}</p>
              <p>Cutting Charge: {currency(selectedInvoice.cutting_charge, selectedInvoice.currency)}</p>
              <p><strong>Invoice total: {currency(selectedInvoice.grand_total, selectedInvoice.currency)}</strong></p>
              <p>Paid: {currency(selectedInvoice.amount_paid, selectedInvoice.currency)} · Remaining: {currency(selectedInvoice.amount_due, selectedInvoice.currency)}</p>
            </div>
            <h3>Payment history</h3>
            {!selectedInvoice.payments?.length ? <p>No payments recorded.</p> : selectedInvoice.payments.map((payment) => (
              <div key={payment.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', borderTop: '1px solid var(--color-border, #ddd)', padding: '10px 0' }}>
                <span>
                  {payment.payment_number} · {payment.payment_date} · {payment.payment_method.replaceAll('_', ' ')}
                  {payment.transaction_reference ? ` · Ref ${payment.transaction_reference}` : ''}
                  {payment.recorded_by_username ? ` · By ${payment.recorded_by_username}` : ''}
                  {payment.status === 'reversed' || Number(payment.amount) < 0 ? ` · Reversed${payment.reversal_reason || payment.notes ? `: ${payment.reversal_reason || payment.notes}` : ''}` : ''}
                </span>
                <span>{currency(Math.abs(Number(payment.amount)), selectedInvoice.currency)}</span>
                {payment.status === 'posted' && Number(payment.amount) > 0 && <button type="button" className="btn btn-outline" title="Download receipt" onClick={() => downloadReceiptPdf(selectedInvoice.id, payment.id, paperSize).catch((err) => setError(err.message))}><FileText size={15} /> Receipt</button>}
              </div>
            ))}
          </section>
        )}
      </Modal>

    </div>
  );
}
