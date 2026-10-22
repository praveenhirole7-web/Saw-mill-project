import React, { useState, useEffect, useMemo } from 'react';
import { Plus, RefreshCw, Star, X, Edit } from 'lucide-react';
import DataTable from '../../components/admin/DataTable';
import SearchBar from '../../components/admin/SearchBar';
import FilterPanel from '../../components/admin/FilterPanel';
import Pagination from '../../components/admin/Pagination';
import Modal from '../../components/admin/Modal';
import LoadingSpinner from '../../components/admin/LoadingSpinner';
import { getSuppliers, addSupplier, updateSupplier, getSupplierDetails } from '../../services/adminApi';
import './AdminPages.css';
import { formatCurrency, formatNumber } from '../../utils/formatters';

function SupplierDetailPanel({ supplier, onClose, onEdit }) {
  if (!supplier) return null;
  const purchases = supplier.purchases || [];

  return (
    <div className="detail-panel-overlay" onClick={onClose}>
      <div className="detail-panel detail-panel--wide" onClick={e => e.stopPropagation()}>
        <div className="detail-panel__header">
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div className="user-avatar" style={{ background: '#193826', width: 48, height: 48, fontSize: '1.25rem' }}>
              🌲
            </div>
            <div>
              <p className="detail-panel__subtitle">{supplier.region || 'Forestry Region'}</p>
              <h2 className="detail-panel__title">{supplier.companyName}</h2>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                <span className={`badge ${supplier.status === 'Preferred' ? 'badge-success' : 'badge-info'}`}>
                  {supplier.status}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#b45309', fontWeight: 600, fontSize: '0.8rem' }}>
                  <Star size={12} fill="#d97706" color="#d97706" /> {supplier.rating} / 5.0
                </span>
              </div>
            </div>
          </div>
          <button className="detail-panel__close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="detail-panel__body">
          <div className="detail-section">
            <div className="detail-section-title">Supplier Information</div>
            <div className="detail-field-grid">
              <div className="detail-field">
                <span className="detail-field-label">Representative Name</span>
                <span className="detail-field-value">{supplier.repName || '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Phone</span>
                <span className="detail-field-value">{supplier.phone}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Email</span>
                <span className="detail-field-value">{supplier.email || '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Supply Specialty</span>
                <span className="detail-field-value">{supplier.specialty || 'Mixed Sawlogs'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Payment Terms</span>
                <span className="detail-field-value">{supplier.paymentTerms || '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Tax / Concession ID</span>
                <span className="detail-field-value">{supplier.taxId || '—'}</span>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <div className="detail-section-title">Purchase Obligations & Financials</div>
            <div className="detail-field-grid">
              <div className="detail-field">
                <span className="detail-field-label">Total Purchase Orders</span>
                <span className="detail-field-value--large">{supplier.purchasesCount || purchases.length} POs</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Total Procurement Spend</span>
                <span className="detail-field-value--large" style={{ color: 'var(--color-forest)' }}>
                  {formatCurrency(supplier.totalPurchased || 0)}
                </span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Outstanding Balance Due</span>
                <span className="detail-field-value--large" style={{ color: supplier.balanceDue > 0 ? '#d97706' : '#16a34a' }}>
                  {formatCurrency(supplier.balanceDue || 0)}
                </span>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <div className="detail-section-title">Purchase Order History</div>
            {purchases.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                No purchase orders recorded for this supplier yet.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="admin-table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>PO #</th>
                      <th>Date</th>
                      <th>Items</th>
                      <th>Volume</th>
                      <th>Total Cost</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((p) => (
                      <tr key={p.id}>
                        <td><strong>{p.purchase_number || p.id}</strong></td>
                        <td>{p.created_at ? p.created_at.split('T')[0] : '—'}</td>
                        <td>{p.items_count || 1} items</td>
                        <td>{p.total_volume_cbf ? `${formatNumber(p.total_volume_cbf)} CFT` : '—'}</td>
                        <td><strong>{formatCurrency(p.total_cost || 0)}</strong></td>
                        <td>
                          <span className={`badge ${p.status === 'received' ? 'badge-success' : 'badge-warning'}`}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {supplier.notes && (
            <div className="detail-section">
              <div className="detail-section-title">Notes</div>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>{supplier.notes}</p>
            </div>
          )}
        </div>

        <div className="detail-panel__footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button type="button" className="btn btn-outline" onClick={() => onEdit(supplier)}>
            <Edit size={14} /> <span>Edit Supplier</span>
          </button>
          <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [editingSupplier, setEditingSupplier] = useState(null);

  const [form, setForm] = useState({
    companyName: '',
    repName: '',
    phone: '',
    email: '',
    region: '',
    specialty: '',
    paymentTerms: '',
    status: 'Active',
    notes: ''
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getSuppliers();
      setSuppliers(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRowClick = async (row) => {
    const details = await getSupplierDetails(row.id);
    setSelectedSupplier(details || row);
  };

  const handleOpenEdit = (sup) => {
    setEditingSupplier(sup);
    setForm({
      companyName: sup.companyName || sup.company_name || '',
      repName: sup.repName || sup.rep_name || '',
      phone: sup.phone || '',
      email: sup.email || '',
      region: sup.region || '',
      specialty: sup.specialty || '',
      paymentTerms: sup.paymentTerms || sup.payment_terms || '',
      status: sup.status || 'Active',
      notes: sup.notes || ''
    });
    setSelectedSupplier(null);
    setIsModalOpen(true);
  };

  const handleOpenAdd = () => {
    setEditingSupplier(null);
    setForm({
      companyName: '',
      repName: '',
      phone: '',
      email: '',
      region: '',
      specialty: '',
      paymentTerms: '',
      status: 'Active',
      notes: ''
    });
    setIsModalOpen(true);
  };

  const filtered = useMemo(() => {
    return suppliers.filter((s) => {
      const name = s.companyName || s.company_name || '';
      const rep = s.repName || s.rep_name || '';
      const spec = s.specialty || '';
      const matchSearch =
        name.toLowerCase().includes(search.toLowerCase()) ||
        rep.toLowerCase().includes(search.toLowerCase()) ||
        spec.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All' || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [suppliers, search, statusFilter]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingSupplier) {
      const updated = await updateSupplier(editingSupplier.id, form);
      setSuppliers((prev) => prev.map((s) => (s.id === editingSupplier.id ? updated : s)));
    } else {
      const created = await addSupplier(form);
      setSuppliers((prev) => [created, ...prev]);
    }
    setIsModalOpen(false);
    setEditingSupplier(null);
  };

  const columns = [
    {
      key: 'companyName',
      label: 'Supplier Entity',
      sortable: true,
      render: (val, row) => (
        <div>
          <strong style={{ color: 'var(--color-forest-dark)' }}>{val}</strong>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Rep: {row.repName} ({row.region})
          </div>
        </div>
      )
    },
    { key: 'specialty', label: 'Timber Species / Supply Scope' },
    {
      key: 'phone',
      label: 'Direct Contact',
      render: (val, row) => (
        <div style={{ fontSize: '0.8rem' }}>
          <div>{val}</div>
          <div style={{ color: 'var(--color-text-muted)' }}>{row.email}</div>
        </div>
      )
    },
    {
      key: 'rating',
      label: 'Harvester Rating',
      sortable: true,
      render: (val) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#b45309', fontWeight: 600 }}>
          <Star size={13} fill="#d97706" color="#d97706" />
          {val} / 5.0
        </span>
      )
    },
    { key: 'paymentTerms', label: 'Payment Terms' },
    {
      key: 'balanceDue',
      label: 'Balance Due',
      sortable: true,
      render: (val) => (
        <strong style={{ color: Number(val) > 0 ? '#d97706' : '#16a34a' }}>
          {formatCurrency(val || 0)}
        </strong>
      )
    },
    {
      key: 'status',
      label: 'Status',
      render: (val) => (
        <span className={`badge ${val === 'Preferred' ? 'badge-success' : 'badge-info'}`}>
          {val}
        </span>
      )
    }
  ];

  return (
    <div className="admin-subpage">
      <div className="admin-subpage-header">
        <div className="admin-subpage-header__left">
          <h1 className="admin-subpage-title">Wood Sellers</h1>
          <p className="admin-subpage-subtitle">
            Manage timber logging concessions, raw log haulers, saw blade manufacturers, and sustainability ratings.
          </p>
        </div>
        <div className="admin-subpage-header__actions">
          <button type="button" className="btn btn-outline" onClick={loadData}>
            <RefreshCw size={15} />
            <span>Sync</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={handleOpenAdd}>
            <Plus size={16} />
            <span>Add Supplier</span>
          </button>
        </div>
      </div>

      <div className="admin-toolbar">
        <div className="admin-toolbar__left">
          <SearchBar
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search forestry concession, rep, or timber species..."
          />
          <FilterPanel
            filters={[
              {
                key: 'status',
                label: 'Supplier Status',
                value: statusFilter,
                onChange: setStatusFilter,
                options: [
                  { label: 'All Statuses', value: 'All' },
                  { label: 'Preferred', value: 'Preferred' },
                  { label: 'Active', value: 'Active' }
                ]
              }
            ]}
            onReset={() => {
              setStatusFilter('All');
              setSearch('');
            }}
            totalResults={filtered.length}
          />
        </div>
      </div>

      {loading ? (
        <LoadingSpinner message="Loading forestry suppliers..." />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={paginated}
            keyField="id"
            onRowClick={handleRowClick}
          />
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filtered.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setCurrentPage(1);
            }}
          />
        </>
      )}

      {selectedSupplier && (
        <SupplierDetailPanel
          supplier={selectedSupplier}
          onClose={() => setSelectedSupplier(null)}
          onEdit={handleOpenEdit}
        />
      )}

      {/* Add / Edit Supplier Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSupplier ? 'Edit Forestry Supplier' : 'Add Forestry Supplier'}
        subtitle="Register or update logging concession or industrial saw blade tooling vendor"
        size="md"
      >
        <form onSubmit={handleSubmit}>
          <div className="admin-form-grid">
            <div className="admin-form-group">
              <label className="admin-form-label">Company / Concession Name <span className="required">*</span></label>
              <input
                type="text"
                required
                className="admin-form-input"
                placeholder="e.g. Olympic Forest Reserves"
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Representative Name</label>
              <input
                type="text"
                className="admin-form-input"
                placeholder="Full Name"
                value={form.repName}
                onChange={(e) => setForm({ ...form, repName: e.target.value })}
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Phone Number <span className="required">*</span></label>
              <input
                type="tel"
                required
                className="admin-form-input"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Email</label>
              <input
                type="email"
                className="admin-form-input"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Forest Region</label>
              <input
                type="text"
                className="admin-form-input"
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Supply Specialty</label>
              <input
                type="text"
                className="admin-form-input"
                value={form.specialty}
                onChange={(e) => setForm({ ...form, specialty: e.target.value })}
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Payment Terms</label>
              <input
                type="text"
                className="admin-form-input"
                value={form.paymentTerms}
                onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Status</label>
              <select
                className="admin-form-select"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="Active">Active</option>
                <option value="Preferred">Preferred</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <div className="admin-form-group" style={{ gridColumn: 'span 2' }}>
              <label className="admin-form-label">Notes</label>
              <textarea
                className="admin-form-textarea"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editingSupplier ? 'Save Changes' : 'Register Supplier'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
