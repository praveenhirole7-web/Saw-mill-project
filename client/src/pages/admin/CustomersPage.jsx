import React, { useState, useEffect, useMemo } from 'react';
import { Plus, RefreshCw, Edit, Trash2, X, Users, Phone, Mail, Building2, Clock } from 'lucide-react';
import DataTable from '../../components/admin/DataTable';
import SearchBar from '../../components/admin/SearchBar';
import FilterPanel from '../../components/admin/FilterPanel';
import Pagination from '../../components/admin/Pagination';
import Modal from '../../components/admin/Modal';
import ConfirmationDialog from '../../components/admin/ConfirmationDialog';
import LoadingSpinner from '../../components/admin/LoadingSpinner';
import EmptyState from '../../components/admin/EmptyState';
import { getCustomers, addCustomer, updateCustomer, getCustomerDetails, getSalesOrders } from '../../services/adminApi';
import { formatCurrency, formatDate } from '../../utils/formatters';
import './AdminPages.css';

const EMPTY_FORM = {
  name: '', contactPerson: '', phone: '', email: '', type: '',
  address: '', city: '', taxId: '', creditLimit: '', paymentTerms: '',
  notes: '', status: 'Active'
};

const AVATAR_COLORS = ['#193826','#8b5327','#1d4ed8','#7c3aed','#0369a1','#b45309'];

function CustomerDetailPanel({ customer, orders, onClose, onEdit }) {
  if (!customer) return null;
  const initials = customer.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const color = AVATAR_COLORS[customer.name.charCodeAt(0) % AVATAR_COLORS.length];
  const customerOrders = (customer.orders && customer.orders.length > 0)
    ? customer.orders
    : orders.filter(o => o.customer === customer.name || o.customerId === customer.id).slice(0, 5);
  const invoices = customer.invoices || [];

  return (
    <div className="detail-panel-overlay" onClick={onClose}>
      <div className="detail-panel detail-panel--wide" onClick={e => e.stopPropagation()}>
        <div className="detail-panel__header">
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div className="user-avatar" style={{ background: color, width: 48, height: 48, fontSize: '1rem' }}>{initials}</div>
            <div>
              <p className="detail-panel__subtitle">{customer.type}</p>
              <h2 className="detail-panel__title">{customer.name}</h2>
              <span className={`badge ${customer.status === 'Active' ? 'badge-success' : 'badge-secondary'}`}>
                {customer.status}
              </span>
            </div>
          </div>
          <button className="detail-panel__close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="detail-panel__body">
          <div className="detail-section">
            <div className="detail-section-title">Contact Information</div>
            <div className="detail-field-grid">
              <div className="detail-field">
                <span className="detail-field-label">Primary Contact</span>
                <span className="detail-field-value">{customer.contactPerson || customer.contact_person || '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Phone</span>
                <span className="detail-field-value">{customer.phone}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Email</span>
                <span className="detail-field-value">{customer.email || '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Tax / Business ID</span>
                <span className="detail-field-value">{customer.taxId || customer.tax_gst_number || '—'}</span>
              </div>
              {customer.address && (
                <div className="detail-field" style={{ gridColumn: 'span 2' }}>
                  <span className="detail-field-label">Address</span>
                  <span className="detail-field-value">{customer.address}{customer.city ? `, ${customer.city}` : ''}</span>
                </div>
              )}
            </div>
          </div>

          <div className="detail-section">
            <div className="detail-section-title">Money Summary</div>
            <div className="detail-field-grid">
              <div className="detail-field">
                <span className="detail-field-label">Credit Limit</span>
                <span className="detail-field-value--large">{formatCurrency(customer.creditLimit || customer.credit_limit || 0)}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Money to Collect</span>
                <span className="detail-field-value--large" style={{ color: Number(customer.outstandingBalance || customer.outstanding_balance) > 0 ? '#dc2626' : '#16a34a' }}>
                  {formatCurrency(customer.outstandingBalance || customer.outstanding_balance || 0)}
                </span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Total Invoiced</span>
                <span className="detail-field-value">{formatCurrency(customer.totalInvoiced || customer.total_invoiced || 0)}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Payment Terms</span>
                <span className="detail-field-value">{customer.paymentTerms || customer.payment_terms || 'Net 30'}</span>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <div className="detail-section-title">Invoices</div>
            {invoices.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>No invoices generated for this customer yet.</p>
            ) : (
              <table className="line-items-table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Due Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id}>
                      <td><strong style={{ color: 'var(--color-forest)' }}>{inv.invoice_number}</strong></td>
                      <td>{formatDate(inv.due_date)}</td>
                      <td><strong>{formatCurrency(inv.grand_total)}</strong></td>
                      <td>
                        <span className={`badge ${
                          inv.payment_status === 'paid' ? 'badge-success' :
                          inv.payment_status === 'partially_paid' ? 'badge-warning' : 'badge-danger'
                        }`}>{inv.payment_status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="detail-section">
            <div className="detail-section-title">Recent Orders and Work</div>
            {customerOrders.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>No orders found for this customer.</p>
            ) : (
              <table className="line-items-table">
                <thead>
                  <tr>
                    <th>Order / Job #</th>
                    <th>Date</th>
                    <th>Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {customerOrders.map(o => (
                    <tr key={o.id}>
                      <td><strong style={{ color: 'var(--color-forest)' }}>{o.job_number || o.id}</strong></td>
                      <td>{formatDate(o.orderDate || o.created_at)}</td>
                      <td><strong>{formatCurrency(o.total_amount || o.totalAmount || 0)}</strong></td>
                      <td>
                        <span className={`badge ${
                          o.status === 'Completed' || o.status === 'completed' ? 'badge-success' :
                          o.status === 'Pending' || o.status === 'pending' ? 'badge-warning' : 'badge-info'
                        }`}>{o.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {customer.notes && (
            <div className="detail-section">
              <div className="detail-section-title">Notes</div>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>{customer.notes}</p>
            </div>
          )}
        </div>
        <div className="detail-panel__footer">
          <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary" onClick={() => onEdit(customer)}>
            <Edit size={14} /> Edit Customer
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomerForm({ formData, onChange, onSubmit, onClose, isEdit }) {
  return (
    <form onSubmit={onSubmit}>
      <div className="admin-form-section">
        <div className="admin-form-section-title">Company Information</div>
        <div className="admin-form-grid">
          <div className="admin-form-group" style={{ gridColumn: 'span 2' }}>
            <label className="admin-form-label">Company Name <span className="required">*</span></label>
            <input type="text" required className="admin-form-input" placeholder="e.g. Apex Framing Co."
              value={formData.name} onChange={e => onChange({ ...formData, name: e.target.value })} />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Client Category</label>
            <select className="admin-form-select" value={formData.type}
              onChange={e => onChange({ ...formData, type: e.target.value })}>
              {['Builder','Furniture Maker','Carpenter','Wood Shop','Other Business','Retail Wood Shop'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Tax / Business ID</label>
            <input type="text" className="admin-form-input" placeholder="GSTIN or business ID"
              value={formData.taxId || ''} onChange={e => onChange({ ...formData, taxId: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="admin-form-section">
        <div className="admin-form-section-title">Contact Information</div>
        <div className="admin-form-grid">
          <div className="admin-form-group">
            <label className="admin-form-label">Primary Contact Person <span className="required">*</span></label>
            <input type="text" required className="admin-form-input" value={formData.contactPerson}
              onChange={e => onChange({ ...formData, contactPerson: e.target.value })} />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Business Phone <span className="required">*</span></label>
            <input type="tel" required className="admin-form-input" placeholder="Enter phone number"
              value={formData.phone} onChange={e => onChange({ ...formData, phone: e.target.value })} />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Billing Email <span className="required">*</span></label>
            <input type="email" required className="admin-form-input" value={formData.email}
              onChange={e => onChange({ ...formData, email: e.target.value })} />
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">City / State</label>
            <input type="text" className="admin-form-input" placeholder="e.g. Coimbatore, Tamil Nadu"
              value={formData.city || ''} onChange={e => onChange({ ...formData, city: e.target.value })} />
          </div>
          <div className="admin-form-group" style={{ gridColumn: 'span 2' }}>
            <label className="admin-form-label">Delivery Address</label>
            <input type="text" className="admin-form-input" placeholder="Street address"
              value={formData.address || ''} onChange={e => onChange({ ...formData, address: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="admin-form-section">
        <div className="admin-form-section-title">Credit and Payment</div>
        <div className="admin-form-grid">
          <div className="admin-form-group">
            <label className="admin-form-label">Credit Limit (₹)</label>
            <input type="number" min="0" className="admin-form-input" aria-describedby="credit-limit-help" value={formData.creditLimit}
              onChange={e => onChange({ ...formData, creditLimit: e.target.value })} />
            <small id="credit-limit-help">Maximum amount the customer can owe before you review more orders.</small>
          </div>
          <div className="admin-form-group">
            <label className="admin-form-label">Payment Terms</label>
            <select className="admin-form-select" value={formData.paymentTerms || 'Net 30'}
              onChange={e => onChange({ ...formData, paymentTerms: e.target.value })}>
              {[
                ['Immediate', 'Pay now'],
                ['Net 15', 'Pay within 15 days'],
                ['Net 30', 'Pay within 30 days'],
                ['Net 45', 'Pay within 45 days'],
                ['Net 60', 'Pay within 60 days'],
                ['COD', 'Pay when goods arrive']
              ].map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          {isEdit && (
            <div className="admin-form-group">
              <label className="admin-form-label">Account Status</label>
              <select className="admin-form-select" value={formData.status}
                onChange={e => onChange({ ...formData, status: e.target.value })}>
                <option value="Active">Active</option>
                <option value="On Hold">On Hold</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="admin-form-section">
        <div className="admin-form-section-title">Notes</div>
        <div className="admin-form-group">
          <textarea className="admin-form-textarea" rows={3}
            placeholder="Account notes, special pricing, delivery preferences..."
            value={formData.notes || ''} onChange={e => onChange({ ...formData, notes: e.target.value })} />
        </div>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary">
          {isEdit ? 'Save Changes' : 'Save Customer'}
        </button>
      </div>
    </form>
  );
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [notice, setNotice] = useState('');
  const [operationError, setOperationError] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [custs, ords] = await Promise.all([getCustomers(), getSalesOrders()]);
      setCustomers(custs);
      setOrders(ords);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => customers.filter(c => {
    const ms = c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.contactPerson.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase());
    return ms && (typeFilter === 'All' || c.type === typeFilter);
  }), [customers, search, typeFilter]);

  const paginated = useMemo(() => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize), [filtered, currentPage, pageSize]);
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;

  const openEdit = (customer) => {
    setFormData({ ...EMPTY_FORM, ...customer });
    setEditTarget(customer);
    setSelectedCustomer(null);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setNotice('');
    setOperationError('');
    try {
      const created = await addCustomer({ ...formData, creditLimit: Number(formData.creditLimit) });
      setCustomers(prev => [created, ...prev]);
      setNotice('Customer saved successfully.');
      setIsAddModalOpen(false);
    } catch (error) {
      setOperationError(error.message || 'Could not save the customer. Please try again.');
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setNotice('');
    setOperationError('');
    try {
      const updated = await updateCustomer(editTarget.id, {
        ...formData,
        creditLimit: Number(formData.creditLimit),
      });
      setCustomers(prev => prev.map(c => c.id === editTarget.id ? updated : c));
      setNotice('Customer details updated successfully.');
      setEditTarget(null);
    } catch (error) {
      setOperationError(error.message || 'Could not update the customer. Please try again.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setCustomers(prev => prev.filter(c => c.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const columns = [
    {
      key: 'name', label: 'Customer / Company', sortable: true,
      render: (val, row) => {
        const initials = val.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const color = AVATAR_COLORS[val.charCodeAt(0) % AVATAR_COLORS.length];
        return (
          <div className="user-avatar-cell">
            <div className="user-avatar" style={{ background: color }}>{initials}</div>
            <div className="user-avatar-info">
              <strong>{val}</strong>
              <span>Attn: {row.contactPerson}</span>
            </div>
          </div>
        );
      }
    },
    { key: 'type', label: 'Type', sortable: true },
    {
      key: 'phone', label: 'Contact',
      render: (val, row) => (
        <div style={{ fontSize: '0.8rem' }}>
          <div>{val}</div>
          <div style={{ color: 'var(--color-text-muted)' }}>{row.email}</div>
        </div>
      )
    },
    {
      key: 'creditLimit', label: 'Credit Limit', sortable: true,
      render: val => formatCurrency(val)
    },
    {
      key: 'outstandingBalance', label: 'Outstanding', sortable: true,
      render: val => (
        <strong style={{ color: val > 0 ? '#dc2626' : '#16a34a' }}>
          {formatCurrency(val)}
        </strong>
      )
    },
    {
      key: 'ordersCount', label: 'Orders',
      render: val => `${val} orders`
    },
    {
      key: 'status', label: 'Status',
      render: val => <span className={`badge ${val === 'Active' ? 'badge-success' : 'badge-secondary'}`}>{val}</span>
    },
    {
      key: 'actions', label: '', align: 'right',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" style={{ padding: '0.3rem 0.6rem' }}
            onClick={e => { e.stopPropagation(); openEdit(row); }}>
            <Edit size={13} />
          </button>
          <button type="button" className="btn btn-outline"
            style={{ padding: '0.3rem 0.6rem', color: '#dc2626', borderColor: '#fca5a5' }}
            onClick={e => { e.stopPropagation(); setDeleteTarget(row); }}>
            <Trash2 size={13} />
          </button>
        </div>
      )
    }
  ];

  const totalOutstanding = customers.reduce((s, c) => s + Number(c.outstandingBalance), 0);

  return (
    <div className="admin-subpage">
      <div className="admin-subpage-header">
        <div className="admin-subpage-header__left">
          <h1 className="admin-subpage-title">Customers</h1>
          <p className="admin-subpage-subtitle">Save customer contact details, orders and payment information.</p>
        </div>
        <div className="admin-subpage-header__actions">
          <button type="button" className="btn btn-outline" onClick={loadData}><RefreshCw size={15} /><span>Sync</span></button>
          <button type="button" className="btn btn-primary" onClick={() => { setFormData(EMPTY_FORM); setIsAddModalOpen(true); }}>
            <Plus size={16} /><span>Add Customer</span>
          </button>
        </div>
      </div>

      {operationError && <div className="admin-inline-error" role="alert">{operationError}</div>}
      {notice && <div className="admin-inline-success" role="status">{notice}</div>}

      <div className="admin-summary-pills">
        <div className="admin-summary-pill"><span>Total Customers:</span><strong>{customers.length}</strong></div>
        <div className="admin-summary-pill"><span>Active Customers:</span><strong style={{ color: '#16a34a' }}>{customers.filter(c => c.status === 'Active').length}</strong></div>
        <div className="admin-summary-pill"><span>Money to Collect:</span><strong style={{ color: totalOutstanding > 0 ? '#dc2626' : '#16a34a' }}>{formatCurrency(totalOutstanding)}</strong></div>
      </div>

      <div className="admin-toolbar">
        <div className="admin-toolbar__left">
          <SearchBar value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            placeholder="Search company, contact, or email..." />
          <FilterPanel
            filters={[{
              key: 'type', label: 'Business Type', value: typeFilter, onChange: setTypeFilter,
              options: [
                { label: 'All Types', value: 'All' },
                ...['Builder','Furniture Maker','Carpenter','Wood Shop','Other Business']
                  .map(t => ({ label: t, value: t }))
              ]
            }]}
            onReset={() => { setTypeFilter('All'); setSearch(''); }}
            totalResults={filtered.length} />
        </div>
      </div>

      {loading ? (
        <LoadingSpinner message="Loading customer directory..." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Users size={40} />} title="No customers found"
          description="Add your first commercial customer to get started." />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={paginated}
            keyField="id"
            onRowClick={async (row) => {
              const details = await getCustomerDetails(row.id);
              setSelectedCustomer(details || row);
            }}
          />
          <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={filtered.length}
            pageSize={pageSize} onPageChange={setCurrentPage}
            onPageSizeChange={sz => { setPageSize(sz); setCurrentPage(1); }} />
        </>
      )}

      {selectedCustomer && (
        <CustomerDetailPanel customer={selectedCustomer} orders={orders}
          onClose={() => setSelectedCustomer(null)} onEdit={openEdit} />
      )}

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)}
        title="Add Customer" subtitle="Enter the customer’s contact and payment details." size="lg">
        <CustomerForm formData={formData} onChange={setFormData}
          onSubmit={handleCreate} onClose={() => setIsAddModalOpen(false)} isEdit={false} />
      </Modal>

      <Modal isOpen={Boolean(editTarget)} onClose={() => setEditTarget(null)}
        title="Edit Customer" subtitle={`Updating: ${editTarget?.name}`} size="lg">
        <CustomerForm formData={formData} onChange={setFormData}
          onSubmit={handleEdit} onClose={() => setEditTarget(null)} isEdit={true} />
      </Modal>

      <ConfirmationDialog isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete} title="Remove Customer"
        message={`Are you sure you want to remove ${deleteTarget?.name} from the system?`}
        confirmLabel="Remove Customer" variant="danger" />
    </div>
  );
}
