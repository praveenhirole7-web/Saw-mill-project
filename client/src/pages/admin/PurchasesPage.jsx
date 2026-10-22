import React, { useState, useEffect, useMemo } from 'react';
import { Plus, RefreshCw, X, ShoppingCart } from 'lucide-react';
import DataTable from '../../components/admin/DataTable';
import SearchBar from '../../components/admin/SearchBar';
import FilterPanel from '../../components/admin/FilterPanel';
import Pagination from '../../components/admin/Pagination';
import Modal from '../../components/admin/Modal';
import LoadingSpinner from '../../components/admin/LoadingSpinner';
import EmptyState from '../../components/admin/EmptyState';
import { getPurchases, addPurchaseOrder, receivePurchaseOrder, getSuppliers, getWoodTypes } from '../../services/adminApi';
import './AdminPages.css';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { useLanguage } from '../../context/LanguageContext';
import { getLocalizedWoodName, getWoodSpeciesSuggestions } from '../../i18n/woodSpecies';

const EMPTY_FORM = {
  supplier: '', supplierId: null, supplierContact: '', species: '', volume: '',
  wood_type_id: '',
  logsCount: '', pricePerCFT: '', totalCost: '',
  paymentStatus: 'Pending', paymentMethod: '',
  inspectionStatus: '', receivedBy: '',
  deliveryDate: '',
  invoiceRef: '', notes: ''
};

function PurchaseDetailPanel({ item, onClose, onReceive }) {
  if (!item) return null;
  const isReceived = item.status === 'received';

  return (
    <div className="detail-panel-overlay" onClick={onClose}>
      <div className="detail-panel" onClick={e => e.stopPropagation()}>
        <div className="detail-panel__header">
          <div>
            <p className="detail-panel__subtitle">WOOD PURCHASE</p>
            <h2 className="detail-panel__title">{item.id}</h2>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem' }}>
              <span className={`badge ${isReceived ? 'badge-success' : 'badge-warning'}`}>
                {isReceived ? '✓ Goods Received' : 'Draft / Ordered'}
              </span>
              <span className={`badge ${item.paymentStatus === 'Paid' ? 'badge-success' : 'badge-warning'}`}>
                {item.paymentStatus}
              </span>
            </div>
          </div>
          <button className="detail-panel__close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="detail-panel__body">
          <div className="detail-section">
            <div className="detail-section-title">Wood Seller Details</div>
            <div className="detail-field-grid">
              <div className="detail-field">
                <span className="detail-field-label">Wood Seller</span>
                <span className="detail-field-value">{item.supplier}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Contact Person</span>
                <span className="detail-field-value">{item.supplierContact || '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Invoice Reference</span>
                <span className="detail-field-value">{item.invoiceRef || '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Received By</span>
                <span className="detail-field-value">{item.receivedBy}</span>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <div className="detail-section-title">Timber Details</div>
            <div className="detail-field-grid">
              <div className="detail-field">
                <span className="detail-field-label">Species Delivered</span>
                <span className="detail-field-value">{getLocalizedWoodName(item.species, t)}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Scaled Volume</span>
                <span className="detail-field-value--large">{item.volume}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Number of Logs</span>
                <span className="detail-field-value">{item.logsCount} logs</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Delivery Date</span>
                <span className="detail-field-value">{formatDate(item.deliveryDate || item.date)}</span>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <div className="detail-section-title">Financial Summary</div>
            <div className="order-totals">
              <div className="order-totals-row">
                <span>Price per CFT</span>
                <span>{formatCurrency(item.pricePerCFT || 0)}</span>
              </div>
              <div className="order-totals-row">
                <span>Volume (CFT)</span>
                <span>{item.volume}</span>
              </div>
              <div className="order-totals-row">
                <span>Payment Method</span>
                <span>{item.paymentMethod || '—'}</span>
              </div>
              <div className="order-totals-row--total order-totals-row">
                <span>Total Cost</span>
                <strong>{formatCurrency(item.totalCost)}</strong>
              </div>
            </div>
          </div>

          {item.notes && (
            <div className="detail-section">
              <div className="detail-section-title">Notes</div>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>{item.notes}</p>
            </div>
          )}
        </div>
        <div className="detail-panel__footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {!isReceived ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onReceive(item)}
              >
                📦 Mark Wood Received
              </button>
            ) : (
              <span className="badge badge-success" style={{ fontSize: '0.85rem', padding: '0.4rem 0.75rem' }}>
                ✓ Inventory Batches Created
              </span>
            )}
          </div>
          <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function PurchasesPage() {
  const { t, language } = useLanguage();
  const speciesSuggestions = getWoodSpeciesSuggestions(t, language);
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [woodTypes, setWoodTypes] = useState([]);
  const [catalogError, setCatalogError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');

  const loadData = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [pos, sups] = await Promise.all([getPurchases(), getSuppliers()]);
      setPurchases(pos);
      setSuppliers(sups);
    } catch (error) {
      setLoadError(error.message || 'Unable to load purchase data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    getWoodTypes().then(setWoodTypes).catch((error) => {
      setCatalogError(error.message || 'Wood type catalogue could not be loaded.');
    });
  }, []);

  // Auto-calculate total cost
  const handleFormChange = (updated) => {
    if (updated.pricePerCFT !== form.pricePerCFT || updated.volume !== form.volume) {
      const vol = parseFloat(String(updated.volume).replace(/[^0-9.]/g, '')) || 0;
      const price = parseFloat(updated.pricePerCFT) || 0;
      updated.totalCost = (vol * price).toFixed(2);
    }
    setForm(updated);
  };

  const handleReceiveGoods = async (po) => {
    setNotice('');
    try {
      const idToReceive = po.dbId || po.id;
      await receivePurchaseOrder(idToReceive, { deliveryDate: new Date().toISOString().split('T')[0] });
      await loadData();
      setSelectedPO(null);
      setNotice('Wood received successfully. Stock has been updated.');
    } catch (err) {
      alert(err.message || 'Error processing goods receipt.');
    }
  };

  const filtered = useMemo(() => purchases.filter(item => {
    const ms = item.id.toLowerCase().includes(search.toLowerCase()) ||
      item.supplier.toLowerCase().includes(search.toLowerCase()) ||
      item.species.toLowerCase().includes(search.toLowerCase());
    const ms2 = statusFilter === 'All' || item.paymentStatus === statusFilter;
    return ms && ms2;
  }), [purchases, search, statusFilter]);

  const paginated = useMemo(() => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize), [filtered, currentPage, pageSize]);
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setNotice('');
    const selSup = suppliers.find(s => String(s.id) === String(form.supplierId));
    if (!selSup) {
      setFormError('Select a supplier that exists in the supplier register.');
      return;
    }

    setSubmitting(true);
    try {
      setFormError('');
      const created = await addPurchaseOrder({
        ...form,
        supplier_id: selSup.id,
        supplierId: selSup.id,
        logsCount: Number(form.logsCount),
        totalCost: Number(form.totalCost)
      });
      setPurchases(prev => [created, ...prev]);
      setNotice('Wood purchase saved successfully.');
      setIsModalOpen(false);
      setForm(EMPTY_FORM);
    } catch (error) {
      setFormError(error.message || 'Unable to create purchase order.');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      key: 'id', label: 'PO Number', sortable: true,
      render: val => <strong style={{ color: 'var(--color-forest)' }}>{val}</strong>
    },
    {
      key: 'supplier', label: 'Wood Seller', sortable: true,
      render: (val, row) => (
        <div>
          <strong>{val}</strong>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{getLocalizedWoodName(row.species, t)}</div>
        </div>
      )
    },
    { key: 'date', label: 'Date', sortable: true, render: value => formatDate(value) },
    { key: 'volume', label: 'Volume (CFT)' },
    { key: 'logsCount', label: 'Logs', render: val => `${val} logs` },
    {
      key: 'totalCost', label: 'Total Cost', sortable: true,
      render: val => <strong>{formatCurrency(val)}</strong>
    },
    {
      key: 'status', label: 'Receipt Status', sortable: true,
      render: val => (
        <span className={`badge ${val === 'received' ? 'badge-success' : 'badge-warning'}`}>
          {val === 'received' ? '✓ Received' : 'Waiting for Wood'}
        </span>
      )
    },
    {
      key: 'paymentStatus', label: 'Payment', sortable: true,
      render: val => (
        <span className={`badge ${val === 'Paid' ? 'badge-success' : 'badge-warning'}`}>{val}</span>
      )
    }
  ];

  const totalSpend = purchases.reduce((s, p) => s + Number(p.totalCost), 0);
  const paidCount = purchases.filter(p => p.paymentStatus === 'Paid').length;

  return (
    <div className="admin-subpage">
      <div className="admin-subpage-header">
        <div className="admin-subpage-header__left">
          <h1 className="admin-subpage-title">Wood Purchases</h1>
          <p className="admin-subpage-subtitle">Save wood bought from sellers and record when it arrives.</p>
        </div>
        <div className="admin-subpage-header__actions">
          <button type="button" className="btn btn-outline" onClick={loadData}><RefreshCw size={15} /><span>Sync</span></button>
          <button type="button" className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setIsModalOpen(true); }}>
            <Plus size={16} /><span>Buy Wood</span>
          </button>
        </div>
      </div>

      {notice && <div className="admin-inline-success" role="status">{notice}</div>}
      {catalogError && <div className="admin-inline-notice" role="status">{catalogError}</div>}

      <div className="admin-summary-pills">
        <div className="admin-summary-pill"><span>Wood Purchases:</span><strong>{purchases.length}</strong></div>
        <div className="admin-summary-pill"><span>Paid:</span><strong style={{ color: '#16a34a' }}>{paidCount}</strong></div>
        <div className="admin-summary-pill"><span>Pending Payment:</span><strong style={{ color: '#d97706' }}>{purchases.length - paidCount}</strong></div>
        <div className="admin-summary-pill"><span>Total Wood Purchase Cost:</span><strong style={{ color: 'var(--color-forest)' }}>{formatCurrency(totalSpend)}</strong></div>
      </div>

      <div className="admin-toolbar">
        <div className="admin-toolbar__left">
          <SearchBar value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            placeholder="Search purchase, wood seller or wood type..." />
          <FilterPanel
            filters={[{
              key: 'status', label: 'Payment', value: statusFilter, onChange: setStatusFilter,
              options: [
                { label: 'All', value: 'All' }, { label: 'Paid', value: 'Paid' }, { label: 'Pending', value: 'Pending' }
              ]
            }]}
            onReset={() => { setStatusFilter('All'); setSearch(''); }}
            totalResults={filtered.length} />
        </div>
      </div>

      {loading ? (
        <LoadingSpinner message="Loading wood purchases..." />
      ) : loadError ? (
        <div className="alert alert-error" role="alert">{loadError} <button type="button" onClick={loadData}>Retry</button></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<ShoppingCart size={40} />} title="No wood purchases found"
          description="Add a wood purchase to get started."
          actionLabel="Buy Wood" onAction={() => setIsModalOpen(true)} />
      ) : (
        <>
          <DataTable columns={columns} data={paginated} keyField="id" onRowClick={row => setSelectedPO(row)} />
          <Pagination currentPage={currentPage} totalPages={totalPages} totalItems={filtered.length}
            pageSize={pageSize} onPageChange={setCurrentPage}
            onPageSizeChange={sz => { setPageSize(sz); setCurrentPage(1); }} />
        </>
      )}

      {selectedPO && (
        <PurchaseDetailPanel
          item={selectedPO}
          onClose={() => setSelectedPO(null)}
          onReceive={handleReceiveGoods}
        />
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}
        title="Create Timber Purchase Order" subtitle="Record supplier, purchase items, and expected delivery" size="lg">
        <form onSubmit={handleSubmit}>
          {formError && <div className="alert alert-error" role="alert">{formError}</div>}
          <div className="admin-form-section">
            <div className="admin-form-section-title">Choose Wood Seller</div>
            <div className="admin-form-grid">
              <div className="admin-form-group">
                <label className="admin-form-label">Wood Seller <span className="required">*</span></label>
                <select className="admin-form-select" value={form.supplierId || form.supplier}
                  onChange={e => {
                    const sel = suppliers.find(s => String(s.id) === e.target.value || s.name === e.target.value || s.companyName === e.target.value);
                    setForm({
                      ...form,
                      supplier: sel ? (sel.name || sel.companyName) : e.target.value,
                      supplierId: sel ? sel.id : null,
                      supplierContact: sel ? (sel.repName || sel.rep_name || '') : form.supplierContact,
                    });
                  }}>
                  <option value="">— Select Wood Seller —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name || s.companyName}</option>)}
                </select>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Seller Contact Name</label>
                <input type="text" className="admin-form-input" value={form.supplierContact}
                  onChange={e => setForm({ ...form, supplierContact: e.target.value })} />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Seller Bill Number</label>
                <input type="text" className="admin-form-input" placeholder="e.g. SUP-INV-2026-001"
                  value={form.invoiceRef} onChange={e => setForm({ ...form, invoiceRef: e.target.value })} />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Delivery Date</label>
                <input type="date" className="admin-form-input" value={form.deliveryDate}
                  onChange={e => setForm({ ...form, deliveryDate: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="admin-form-section">
            <div className="admin-form-section-title">Timber Details</div>
            <div className="admin-form-grid">
              <div className="admin-form-group" style={{ gridColumn: 'span 2' }}>
                <label className="admin-form-label">Wood type from catalogue</label>
                <select className="admin-form-select" value={form.wood_type_id || ''}
                  onChange={(event) => {
                    const selected = woodTypes.find((wood) => String(wood.id) === event.target.value);
                    setForm({ ...form, wood_type_id: event.target.value, species: selected?.common_name_en || form.species });
                  }}>
                  <option value="">Not in catalogue / enter below</option>
                  {woodTypes.map((wood) => <option key={wood.id} value={wood.id}>
                    {getLocalizedWoodName(wood, t, language)}{wood.common_name_en !== getLocalizedWoodName(wood, t, language) ? ` (${wood.common_name_en})` : ''}
                  </option>)}
                </select>
                <label className="admin-form-label">Wood name / species <span className="required">*</span></label>
                <input type="text" required list="purchase-wood-species" className="admin-form-input" placeholder="Enter timber species"
                  value={form.species} onChange={e => setForm({ ...form, species: e.target.value, wood_type_id: '' })} />
                <datalist id="purchase-wood-species">
                  {speciesSuggestions.map(({ key, value, label }) => (
                    <option key={key} value={value} label={label} />
                  ))}
                </datalist>
                <span className="admin-form-hint">{t('woodSpecies.hint')}</span>
                <span className="admin-form-hint">{t('woodSpecies.rosewoodNote')}</span>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Scaled Volume (CFT) <span className="required">*</span></label>
                <input type="text" required className="admin-form-input" placeholder="e.g. 2,400"
                  value={form.volume} onChange={e => handleFormChange({ ...form, volume: e.target.value })} />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Number of Round Logs</label>
                <input type="number" min="1" className="admin-form-input" value={form.logsCount}
                  onChange={e => setForm({ ...form, logsCount: e.target.value })} />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Inspection / Grading Status</label>
                <select className="admin-form-select" value={form.inspectionStatus}
                  onChange={e => setForm({ ...form, inspectionStatus: e.target.value })}>
                  {['Grading Pending','Grade A Accepted','Grade B Accepted','Rejected - Substandard'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Receiving Scaler / Inspector</label>
                <input type="text" className="admin-form-input" value={form.receivedBy}
                  onChange={e => setForm({ ...form, receivedBy: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="admin-form-section">
            <div className="admin-form-section-title">Purchase Totals</div>
            <div className="admin-form-grid">
              <div className="admin-form-group">
                <label className="admin-form-label">Price per CFT (₹)</label>
                <input type="number" step="0.01" min="0" className="admin-form-input" value={form.pricePerCFT}
                  onChange={e => handleFormChange({ ...form, pricePerCFT: e.target.value })} />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Total cost (₹) <span className="required">*</span></label>
                <input type="number" required min="0" className="admin-form-input"
                  style={{ fontWeight: 700 }} value={form.totalCost}
                  onChange={e => setForm({ ...form, totalCost: e.target.value })} />
                <span className="admin-form-hint">Auto-calculated from volume × price, or enter manually</span>
              </div>
              <p className="admin-form-hint" style={{ gridColumn: 'span 2' }}>
                Wood purchases are saved as unpaid. Record payments from the Payments page.
              </p>
            </div>
          </div>

          <div className="admin-form-section">
            <div className="admin-form-section-title">Goods Receipt Status</div>
            <div className="admin-form-group">
              <textarea className="admin-form-textarea" rows={3}
                placeholder="Any notes on log quality, moisture, or delivery conditions..."
                value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Create Purchase Order'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
