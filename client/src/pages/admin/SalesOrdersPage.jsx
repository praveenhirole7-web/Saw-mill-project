import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  RefreshCw,
  ClipboardList,
  CheckCircle2,
  Truck,
  FileText,
  Eye,
  XCircle,
  AlertTriangle,
  Trash2,
  Building2,
  Clock,
  DollarSign,
  Package,
  Calendar
} from 'lucide-react';
import DataTable from '../../components/admin/DataTable';
import SearchBar from '../../components/admin/SearchBar';
import FilterPanel from '../../components/admin/FilterPanel';
import Pagination from '../../components/admin/Pagination';
import Modal from '../../components/admin/Modal';
import LoadingSpinner from '../../components/admin/LoadingSpinner';
import {
  getSalesOrders,
  addSalesOrder,
  confirmSalesOrder,
  fulfillSalesOrder,
  cancelSalesOrder,
  getSalesOrderDetails,
  getCustomers,
  getInventory
} from '../../services/adminApi';
import './AdminPages.css';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';

export default function SalesOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [inventoryBatches, setInventoryBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('All');
  const [fulfillmentFilter, setFulfillmentFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState('');

  // Create Order Form State
  const initialLineItem = {
    batch_id: '',
    product_name: '',
    species: '',
    dimensions_text: '',
    quantity: '',
    unit: '',
    unit_price: '',
    discount_percent: 0,
    tax_percent: 0
  };

  const [form, setForm] = useState({
    customer_id: '',
    order_date: '',
    delivery_date: '',
    status: 'draft',
    discount_amount: 0,
    tax_rate: '',
    shipping_charges: 0,
    notes: '',
    items: [initialLineItem]
  });

  const loadData = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [ordersData, customersData, invData] = await Promise.all([
        getSalesOrders(),
        getCustomers(),
        getInventory()
      ]);
      setOrders(ordersData || []);
      setCustomers(customersData || []);

      // Filter available saleable sawn batches for line item selection
      const sawnBatches = (invData || []).filter(
        b => (b.timberType === 'sawn_timber' || b.timber_type === 'sawn_timber') &&
             (b.ownership === 'mill' || !b.ownership) &&
             Number(b.quantity || b.quantity_available || 0) > 0
      );
      setInventoryBatches(sawnBatches);

    } catch (err) {
      setLoadError(err.message || 'Unable to load sales order data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter and pagination
  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const q = search.toLowerCase();
      const matchSearch =
        (o.id && o.id.toLowerCase().includes(q)) ||
        (o.orderNumber && o.orderNumber.toLowerCase().includes(q)) ||
        (o.customer && o.customer.toLowerCase().includes(q)) ||
        (o.species && o.species.toLowerCase().includes(q));

      const matchPay = paymentFilter === 'All' || o.paymentStatus === paymentFilter;

      let matchFul = true;
      if (fulfillmentFilter !== 'All') {
        matchFul = o.fulfillmentStatus === fulfillmentFilter || o.rawStatus === fulfillmentFilter.toLowerCase();
      }

      return matchSearch && matchPay && matchFul;
    });
  }, [orders, search, paymentFilter, fulfillmentFilter]);

  const paginated = useMemo(() => {
    const s = (currentPage - 1) * pageSize;
    return filtered.slice(s, s + pageSize);
  }, [filtered, currentPage, pageSize]);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;

  // Key KPI stats
  const stats = useMemo(() => {
    const totalCount = orders.length;
    const confirmedCount = orders.filter(o => o.fulfillmentStatus === 'Confirmed' || o.rawStatus === 'confirmed').length;
    const completedCount = orders.filter(o => o.fulfillmentStatus === 'Delivered' || o.rawStatus === 'completed').length;
    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
    return { totalCount, confirmedCount, completedCount, totalRevenue };
  }, [orders]);

  // Form helpers
  const handleItemChange = (index, field, value) => {
    const updated = [...form.items];
    updated[index] = { ...updated[index], [field]: value };

    // If batch selection changed, auto-fill species, specs, and price
    if (field === 'batch_id' && value) {
      const batch = inventoryBatches.find(b => String(b.id) === String(value) || b.batchCode === value);
      if (batch) {
        updated[index].product_name = batch.name || `Batch ${batch.batchCode}`;
        updated[index].species = batch.species || '';
        updated[index].dimensions_text = batch.dimensions || batch.dimensions_text || '';
        updated[index].unit = batch.unit || '';
        if (batch.sellingPrice) updated[index].unit_price = Number(batch.sellingPrice);
      }
    }

    setForm({ ...form, items: updated });
  };

  const addItemRow = () => {
    setForm(prev => ({
      ...prev,
      items: [...prev.items, { ...initialLineItem }]
    }));
  };

  const removeItemRow = (index) => {
    if (form.items.length <= 1) return;
    setForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  // Live order calculations for the creation modal
  const calculatedSummary = useMemo(() => {
    let subtotal = 0;
    let lineDiscounts = 0;

    (form.items || []).forEach(item => {
      const qty = Number(item.quantity || 0);
      const price = Number(item.unit_price || 0);
      const itemSub = qty * price;
      const disc = (itemSub * Number(item.discount_percent || 0)) / 100;
      subtotal += itemSub;
      lineDiscounts += disc;
    });

    const orderDiscount = Number(form.discount_amount || 0);
    const totalDiscount = lineDiscounts + orderDiscount;
    const taxable = Math.max(0, subtotal - totalDiscount);
    const tax = (taxable * Number(form.tax_rate || 0)) / 100;
    const shipping = Number(form.shipping_charges || 0);
    const grandTotal = taxable + tax + shipping;

    return {
      subtotal: subtotal.toFixed(2),
      totalDiscount: totalDiscount.toFixed(2),
      tax: tax.toFixed(2),
      shipping: shipping.toFixed(2),
      grandTotal: grandTotal.toFixed(2)
    };
  }, [form]);

  // Handle Order Create
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setNotice('');
    if (!form.customer_id) {
      setActionError('Select a customer before creating the sales order.');
      return;
    }
    if (form.tax_rate === '') {
      setActionError('Enter the tax rate applicable to this order. Enter 0 only if the order is tax-exempt.');
      return;
    }
    setActionLoading(true);
    setActionError('');
    try {
      const payload = {
        customer_id: Number(form.customer_id),
        order_date: form.order_date,
        delivery_date: form.delivery_date,
        status: form.status,
        discount_amount: Number(form.discount_amount || 0),
        tax_rate: Number(form.tax_rate || 0),
        shipping_charges: Number(form.shipping_charges || 0),
        notes: form.notes,
        items: form.items.map(i => ({
          batch_id: i.batch_id ? Number(i.batch_id) : null,
          product_name: i.product_name || `${i.species} Lumber`,
          species: i.species,
          dimensions_text: i.dimensions_text,
          quantity: Number(i.quantity),
          unit: i.unit,
          unit_price: Number(i.unit_price),
          discount_percent: Number(i.discount_percent || 0),
          tax_percent: Number(i.tax_percent || 0)
        }))
      };

      const created = await addSalesOrder(payload);
      setOrders(prev => [created, ...prev]);
      setNotice('Customer order saved successfully.');
      setIsCreateModalOpen(false);
      // Reset form
      setForm({
        customer_id: customers[0]?.id || '',
        order_date: '',
        delivery_date: '',
        status: 'draft',
        discount_amount: 0,
        tax_rate: '',
        shipping_charges: 0,
        notes: '',
        items: [{ ...initialLineItem }]
      });
    } catch (err) {
      setActionError(err.message || 'Failed to create sales order');
    } finally {
      setActionLoading(false);
    }
  };

  // View details
  const handleViewDetails = async (order) => {
    setSelectedOrder(order);
    setIsDetailsModalOpen(true);
    // Fetch fresh complete details
    try {
      const details = await getSalesOrderDetails(order.dbId || order.id);
      if (details) setSelectedOrder(details);
    } catch (err) {
      console.warn('Could not load complete order details:', err.message);
    }
  };

  // Confirm order action (reserves inventory)
  const handleConfirmOrder = async (order) => {
    if (!window.confirm(`Confirm order ${order.orderNumber || order.id}? This will set aside the wood for this customer.`)) {
      return;
    }
    setNotice('');
    setActionLoading(true);
    try {
      const updated = await confirmSalesOrder(order.dbId || order.id);
      setOrders(prev => prev.map(o => (o.id === order.id || o.dbId === order.dbId ? updated : o)));
      setNotice('Order confirmed. Wood has been set aside.');
      if (selectedOrder && (selectedOrder.id === order.id || selectedOrder.dbId === order.dbId)) {
        setSelectedOrder(updated);
      }
    } catch (err) {
      alert(`Could not confirm this order. ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Fulfill order action (dispatches lumber & consumes inventory)
  const handleFulfillOrder = async (order) => {
    if (!window.confirm(`Send the wood for order ${order.orderNumber || order.id}? This will reduce the available wood stock.`)) {
      return;
    }
    setNotice('');
    setActionLoading(true);
    try {
      const updated = await fulfillSalesOrder(order.dbId || order.id);
      setOrders(prev => prev.map(o => (o.id === order.id || o.dbId === order.dbId ? updated : o)));
      setNotice('Order sent successfully. Wood stock has been updated.');
      if (selectedOrder && (selectedOrder.id === order.id || selectedOrder.dbId === order.dbId)) {
        setSelectedOrder(updated);
      }
    } catch (err) {
      alert(`Could not send this order. ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Cancel order modal trigger
  const handleOpenCancelModal = (order) => {
    setSelectedOrder(order);
    setCancelReason('');
    setActionError('');
    setIsCancelModalOpen(true);
  };

  const handleCancelSubmit = async (e) => {
    e.preventDefault();
    setNotice('');
    if (!cancelReason.trim()) {
      setActionError('Cancellation reason is required.');
      return;
    }
    setActionLoading(true);
    try {
      const updated = await cancelSalesOrder(selectedOrder.dbId || selectedOrder.id, cancelReason);
      setOrders(prev => prev.map(o => (o.id === selectedOrder.id || o.dbId === selectedOrder.dbId ? updated : o)));
      setNotice('Customer order cancelled.');
      setIsCancelModalOpen(false);
      if (isDetailsModalOpen) setSelectedOrder(updated);
    } catch (err) {
      setActionError(err.message || 'Failed to cancel order');
    } finally {
      setActionLoading(false);
    }
  };

  // Table columns definition
  const columns = [
    {
      key: 'id',
      label: 'Order ID',
      sortable: true,
      render: (val, row) => (
        <div>
          <button
            type="button"
            className="table-link-btn"
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontWeight: 700,
              color: 'var(--color-forest, #2d5a3f)',
              fontSize: '0.875rem'
            }}
            onClick={() => handleViewDetails(row)}
          >
            {row.orderNumber || val}
          </button>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #718096)' }}>
            {formatDate(row.orderDate)}
          </div>
        </div>
      )
    },
    {
      key: 'customer',
      label: 'Customer',
      sortable: true,
      render: (val, row) => (
        <div>
          <strong style={{ color: 'var(--color-text-dark, #1a202c)' }}>{val}</strong>
          {row.company_name && (
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #718096)' }}>
              {row.company_name}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'species',
      label: 'Wood Type and Size',
      render: (val, row) => (
        <div style={{ maxWidth: '280px' }}>
          <strong style={{ color: 'var(--color-forest, #2d5a3f)' }}>{val}</strong>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #718096)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {row.specifications}
          </div>
        </div>
      )
    },
    {
      key: 'totalAmount',
      label: 'Total Amount',
      sortable: true,
      render: (val) => (
        <strong style={{ color: 'var(--color-forest-dark, #0f2318)', fontSize: '0.95rem' }}>
          {formatCurrency(val || 0)}
        </strong>
      )
    },
    {
      key: 'paymentStatus',
      label: 'Payment',
      sortable: true,
      render: (val) => {
        let cls = 'badge-warning';
        if (val === 'Paid') cls = 'badge-success';
        if (val === 'Unpaid' || val === 'Pending') cls = 'badge-danger';
        return <span className={`badge ${cls}`}>{val}</span>;
      }
    },
    {
      key: 'fulfillmentStatus',
      label: 'Order Progress',
      sortable: true,
      render: (val, row) => {
        const raw = row.rawStatus || val?.toLowerCase();
        let cls = 'badge-neutral';
        let label = val;

        if (raw === 'draft') {
          cls = 'badge-neutral';
          label = 'Draft (Unreserved)';
        } else if (raw === 'confirmed') {
          cls = 'badge-info';
          label = 'Confirmed (Reserved)';
        } else if (raw === 'processing' || val === 'Cutting In Progress') {
          cls = 'badge-warning';
          label = 'Processing / Resawing';
        } else if (raw === 'completed' || val === 'Delivered') {
          cls = 'badge-success';
          label = 'Dispatched / Fulfilled';
        } else if (raw === 'cancelled') {
          cls = 'badge-danger';
          label = 'Cancelled';
        }

        return <span className={`badge ${cls}`}>{label}</span>;
      }
    },
    {
      key: 'deliveryDate',
      label: 'Est. Delivery',
      sortable: true,
      render: (val) => (
        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary, #4a5568)' }}>
          {formatDate(val)}
        </span>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => {
        const raw = row.rawStatus || row.fulfillmentStatus?.toLowerCase();
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              title="View Order Details & Audit History"
              onClick={() => handleViewDetails(row)}
            >
              <Eye size={14} />
            </button>

            {raw === 'draft' && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                title="Confirm Order & Reserve Inventory"
                onClick={() => handleConfirmOrder(row)}
                disabled={actionLoading}
              >
                <CheckCircle2 size={14} />
                <span>Confirm</span>
              </button>
            )}

            {(raw === 'confirmed' || raw === 'processing') && (
              <button
                type="button"
                className="btn btn-success btn-sm"
                title="Fulfill Order & Issue Stock"
                style={{ backgroundColor: '#1b6e41', color: '#fff' }}
                onClick={() => handleFulfillOrder(row)}
                disabled={actionLoading}
              >
                <Truck size={14} />
                <span>Fulfill</span>
              </button>
            )}

            {raw !== 'completed' && raw !== 'cancelled' && (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                title="Cancel Order & Release Inventory"
                onClick={() => handleOpenCancelModal(row)}
                disabled={actionLoading}
              >
                <XCircle size={14} />
              </button>
            )}
          </div>
        );
      }
    }
  ];

  return (
    <div className="admin-subpage">
      {/* Page Header */}
      <div className="admin-subpage-header">
        <div className="admin-subpage-header__left">
          <h1 className="admin-subpage-title">Customer Orders</h1>
          <p className="admin-subpage-subtitle">
            See customer orders, check wood stock and update order progress.
          </p>
        </div>
        <div className="admin-subpage-header__actions">
          <button type="button" className="btn btn-outline" onClick={loadData}>
            <RefreshCw size={15} />
            <span>Refresh</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setIsCreateModalOpen(true)}>
            <Plus size={16} />
            <span>Sell Wood</span>
          </button>
        </div>
      </div>

      {notice && <div className="admin-inline-success" role="status">{notice}</div>}

      {/* KPI Stats Ribbon */}
      <div className="admin-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div className="admin-stat-card" style={{ background: '#fff', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8e4' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'rgba(45, 90, 63, 0.1)', padding: '0.5rem', borderRadius: '8px', color: 'var(--color-forest)' }}>
              <ClipboardList size={22} />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Orders</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a202c' }}>{stats.totalCount}</div>
            </div>
          </div>
        </div>

        <div className="admin-stat-card" style={{ background: '#fff', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8e4' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '0.5rem', borderRadius: '8px', color: '#2563eb' }}>
              <Package size={22} />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Confirmed & Reserved</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2563eb' }}>{stats.confirmedCount}</div>
            </div>
          </div>
        </div>

        <div className="admin-stat-card" style={{ background: '#fff', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8e4' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '0.5rem', borderRadius: '8px', color: '#059669' }}>
              <Truck size={22} />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fulfilled / Delivered</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669' }}>{stats.completedCount}</div>
            </div>
          </div>
        </div>

        <div className="admin-stat-card" style={{ background: '#fff', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8e4' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'rgba(217, 119, 6, 0.1)', padding: '0.5rem', borderRadius: '8px', color: '#b45309' }}>
              <DollarSign size={22} />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Order Value</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#b45309' }}>
                {formatCurrency(stats.totalRevenue)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="admin-toolbar">
        <div className="admin-toolbar__left">
          <SearchBar
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search order #, customer, or species..."
          />
          <FilterPanel
            filters={[
              {
                key: 'fulfillment',
                label: 'Status',
                value: fulfillmentFilter,
                onChange: setFulfillmentFilter,
                options: [
                  { label: 'All Statuses', value: 'All' },
                  { label: 'Draft', value: 'Draft' },
                  { label: 'Confirmed', value: 'Confirmed' },
                  { label: 'Cutting In Progress', value: 'Cutting In Progress' },
                  { label: 'Delivered', value: 'Delivered' },
                  { label: 'Cancelled', value: 'Cancelled' }
                ]
              },
              {
                key: 'payment',
                label: 'Payment',
                value: paymentFilter,
                onChange: setPaymentFilter,
                options: [
                  { label: 'All Payments', value: 'All' },
                  { label: 'Paid', value: 'Paid' },
                  { label: 'Partial', value: 'Partial' },
                  { label: 'Pending', value: 'Pending' }
                ]
              }
            ]}
            onReset={() => {
              setPaymentFilter('All');
              setFulfillmentFilter('All');
              setSearch('');
            }}
            totalResults={filtered.length}
          />
        </div>
      </div>

      {/* Main Table */}
      {loading ? (
        <LoadingSpinner message="Loading sales orders..." />
      ) : (
        <>
          {loadError && <div className="alert alert-error" role="alert">{loadError} <button type="button" onClick={loadData}>Retry</button></div>}
          <DataTable columns={columns} data={paginated} keyField="id" />
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

      {/* Create Order Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create Wholesale Sales Order"
        subtitle="Book commercial lumber order with customer delivery targets and inventory reservations"
        size="lg"
      >
        <form onSubmit={handleCreateSubmit}>
          {actionError && (
            <div className="alert alert-danger" style={{ marginBottom: '1rem', padding: '0.75rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px' }}>
              <AlertTriangle size={16} style={{ display: 'inline', marginRight: '6px' }} />
              {actionError}
            </div>
          )}

          <div className="admin-form-grid" style={{ marginBottom: '1.5rem' }}>
            <div className="admin-form-group">
              <label className="admin-form-label">Customer / Registered Client *</label>
              <select
                className="admin-form-select"
                required
                value={form.customer_id}
                onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
              >
                <option value="">Select a registered customer...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.companyName ? `(${c.companyName})` : ''} — {c.phone}
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Initial Workflow Status</label>
              <select
                className="admin-form-select"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="draft">Draft (Do not reserve inventory yet)</option>
                <option value="confirmed">Confirmed (Validate & reserve yard stock immediately)</option>
              </select>
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Order Date</label>
              <input
                type="date"
                required
                className="admin-form-input"
                value={form.order_date}
                onChange={(e) => setForm({ ...form, order_date: e.target.value })}
              />
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Target Delivery Date</label>
              <input
                type="date"
                required
                className="admin-form-input"
                value={form.delivery_date}
                onChange={(e) => setForm({ ...form, delivery_date: e.target.value })}
              />
            </div>
          </div>

          {/* Line items section */}
          <div style={{ marginBottom: '1.5rem', background: '#f8faf9', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8e4' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--color-forest-dark)' }}>
                Timber Products & Line Items
              </h3>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={addItemRow}
              >
                <Plus size={14} />
                <span>Add Item</span>
              </button>
            </div>

            {form.items.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr auto',
                  gap: '0.5rem',
                  alignItems: 'flex-end',
                  marginBottom: '0.75rem',
                  background: '#fff',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #edf2f7'
                }}
              >
                <div>
                  <label style={{ fontSize: '0.75rem', color: '#718096', display: 'block', marginBottom: '2px' }}>
                    Finished Timber Batch (Yard Stock)
                  </label>
                  <select
                    className="admin-form-select"
                    style={{ fontSize: '0.85rem', padding: '0.35rem 0.5rem' }}
                    value={item.batch_id}
                    onChange={(e) => handleItemChange(idx, 'batch_id', e.target.value)}
                  >
                    <option value="">-- Custom Order Line --</option>
                    {inventoryBatches.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.batchCode} - {b.name} ({b.quantityAvailable || b.quantity} {b.unit} avail)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: '#718096', display: 'block', marginBottom: '2px' }}>
                    Species & Product Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. White Oak FAS"
                    className="admin-form-input"
                    style={{ fontSize: '0.85rem', padding: '0.35rem 0.5rem' }}
                    value={item.product_name}
                    onChange={(e) => handleItemChange(idx, 'product_name', e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: '#718096', display: 'block', marginBottom: '2px' }}>
                    Qty & Unit
                  </label>
                  <div style={{ display: 'flex', gap: '2px' }}>
                    <input
                      type="number"
                      min="0.1"
                      step="any"
                      required
                      className="admin-form-input"
                      style={{ fontSize: '0.85rem', padding: '0.35rem 0.4rem', width: '60%' }}
                      value={item.quantity}
                      onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                    />
                    <select
                      className="admin-form-select"
                      style={{ fontSize: '0.85rem', padding: '0.35rem 0.2rem', width: '40%' }}
                      value={item.unit}
                      onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                    >
                      <option value="CFT">CFT</option>
                      <option value="BF">BF</option>
                      <option value="PCS">PCS</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: '#718096', display: 'block', marginBottom: '2px' }}>
                    Price ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    className="admin-form-input"
                    style={{ fontSize: '0.85rem', padding: '0.35rem 0.5rem' }}
                    value={item.unit_price}
                    onChange={(e) => handleItemChange(idx, 'unit_price', e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', color: '#718096', display: 'block', marginBottom: '2px' }}>
                    Line Total
                  </label>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, padding: '0.35rem 0', color: 'var(--color-forest)' }}>
                    {formatCurrency(Number(item.quantity || 0) * Number(item.unit_price || 0))}
                  </div>
                </div>

                <div>
                  {form.items.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      style={{ color: '#e53e3e', borderColor: '#feb2b2', padding: '0.35rem' }}
                      title="Remove Item"
                      onClick={() => removeItemRow(idx)}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pricing Summary & Extra Charges */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <div>
              <div className="admin-form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="admin-form-label">Order Discount ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="admin-form-input"
                  value={form.discount_amount}
                  onChange={(e) => setForm({ ...form, discount_amount: e.target.value })}
                />
              </div>

              <div className="admin-form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="admin-form-label">Applicable Tax Rate (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  className="admin-form-input"
                  value={form.tax_rate}
                  onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
                  placeholder="Enter the configured business rate; use 0 only if exempt"
                />
              </div>

              <div className="admin-form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="admin-form-label">Delivery & Shipping Charges ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="admin-form-input"
                  value={form.shipping_charges}
                  onChange={(e) => setForm({ ...form, shipping_charges: e.target.value })}
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">Delivery Notes / Site Access</label>
                <textarea
                  rows="2"
                  className="admin-form-input"
                  placeholder="e.g. Call site manager 1 hr prior to delivery..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>

            {/* Live calculation panel */}
            <div style={{ background: '#f0fdf4', padding: '1rem', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', color: '#166534', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase' }}>
                Live Backend Order Summary
              </h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.875rem' }}>
                <span style={{ color: '#4b5563' }}>Items Subtotal:</span>
                <strong>{formatCurrency(calculatedSummary.subtotal)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.875rem' }}>
                <span style={{ color: '#4b5563' }}>Discounts:</span>
                <span style={{ color: '#dc2626' }}>−{formatCurrency(calculatedSummary.totalDiscount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.875rem' }}>
                <span style={{ color: '#4b5563' }}>Delivery / Freight:</span>
                <strong>{formatCurrency(calculatedSummary.shipping)}</strong>
              </div>
              <div style={{ borderTop: '1px dashed #86efac', margin: '0.5rem 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 800, color: '#14532d' }}>
                <span>Grand Total:</span>
                <span>{formatCurrency(calculatedSummary.grandTotal)}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={actionLoading}>
              {actionLoading ? 'Creating Order...' : (form.status === 'confirmed' ? 'Confirm & Reserve Stock' : 'Save Order Draft')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Order Details & Audit History Modal */}
      {selectedOrder && (
        <Modal
          isOpen={isDetailsModalOpen}
          onClose={() => setIsDetailsModalOpen(false)}
          title={`Order Details: ${selectedOrder.orderNumber || selectedOrder.id}`}
          subtitle={`Customer: ${selectedOrder.customer || selectedOrder.customer_name}`}
          size="lg"
        >
          <div>
            {/* Header info */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', background: '#f8faf9', padding: '1rem', borderRadius: '8px', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#718096' }}>Order Number</div>
                <strong style={{ color: 'var(--color-forest-dark)' }}>{selectedOrder.orderNumber || selectedOrder.id}</strong>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#718096' }}>Order Date</div>
                <div>{formatDate(selectedOrder.orderDate)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#718096' }}>Est. Delivery</div>
                <div>{formatDate(selectedOrder.deliveryDate)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#718096' }}>Current Status</div>
                <span className={`badge ${selectedOrder.status === 'completed' ? 'badge-success' : selectedOrder.status === 'confirmed' ? 'badge-info' : selectedOrder.status === 'cancelled' ? 'badge-danger' : 'badge-neutral'}`}>
                  {selectedOrder.status}
                </span>
              </div>
            </div>

            {/* Cancellation reason if cancelled */}
            {selectedOrder.status === 'cancelled' && selectedOrder.cancellationReason && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', color: '#991b1b' }}>
                <strong>Cancellation Reason: </strong>
                <span>{selectedOrder.cancellationReason}</span>
              </div>
            )}

            {/* Line Items Table */}
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', color: 'var(--color-forest-dark)' }}>
              Ordered Timber Line Items
            </h4>
            <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#edf2f7', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem' }}>Batch Code</th>
                    <th style={{ padding: '0.5rem' }}>Product / Species</th>
                    <th style={{ padding: '0.5rem' }}>Specs</th>
                    <th style={{ padding: '0.5rem' }}>Quantity</th>
                    <th style={{ padding: '0.5rem' }}>Unit Price</th>
                    <th style={{ padding: '0.5rem' }}>Discount</th>
                    <th style={{ padding: '0.5rem' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedOrder.items || []).map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #e2e8e4' }}>
                      <td style={{ padding: '0.5rem', fontWeight: 600 }}>{item.batch_code || item.batchId || '—'}</td>
                      <td style={{ padding: '0.5rem' }}>{item.product_name} ({item.species})</td>
                      <td style={{ padding: '0.5rem', color: '#718096' }}>{item.dimensions_text || '—'}</td>
                      <td style={{ padding: '0.5rem' }}>{Number(item.quantity).toFixed(2)} {item.unit || 'CFT'}</td>
                      <td style={{ padding: '0.5rem' }}>{formatCurrency(item.unit_price)}</td>
                      <td style={{ padding: '0.5rem' }}>{item.discount_percent > 0 ? `${item.discount_percent}%` : '—'}</td>
                      <td style={{ padding: '0.5rem', fontWeight: 600, color: 'var(--color-forest)' }}>
                        {formatCurrency(item.line_total || (item.quantity * item.unit_price))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Order totals summary */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
              <div style={{ width: '260px', background: '#f8faf9', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #e2e8e4' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.85rem' }}>
                  <span>Subtotal:</span>
                  <strong>{formatCurrency(selectedOrder.subtotal || selectedOrder.totalAmount)}</strong>
                </div>
                {Number(selectedOrder.discountAmount) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.85rem', color: '#dc2626' }}>
                    <span>Discounts:</span>
                    <span>−{formatCurrency(selectedOrder.discountAmount)}</span>
                  </div>
                )}
                {Number(selectedOrder.shippingCharges) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem', fontSize: '0.85rem' }}>
                    <span>Freight / Shipping:</span>
                    <span>{formatCurrency(selectedOrder.shippingCharges)}</span>
                  </div>
                )}
                <div style={{ borderTop: '1px solid #cbd5e0', margin: '0.4rem 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1rem', color: 'var(--color-forest-dark)' }}>
                  <span>Total Amount:</span>
                  <span>{formatCurrency(selectedOrder.totalAmount)}</span>
                </div>
              </div>
            </div>

            {/* Audit & Status History Timeline */}
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', color: 'var(--color-forest-dark)' }}>
              Order Lifecycle & Status History
            </h4>
            <div style={{ background: '#f8faf9', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8e4' }}>
              {(selectedOrder.history || []).length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: '#718096', fontStyle: 'italic' }}>
                  Initial order record created.
                </div>
              ) : (
                selectedOrder.history.map((h, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                    <div style={{ color: 'var(--color-forest)', marginTop: '2px' }}>
                      <Clock size={15} />
                    </div>
                    <div>
                      <strong>{h.action.replace(/_/g, ' ').toUpperCase()}</strong>
                      <span style={{ color: '#718096', marginLeft: '6px' }}>
                        ({h.created_at ? formatDateTime(h.created_at) : 'Recent'})
                      </span>
                      {h.reason && <div style={{ color: '#4a5568' }}>{h.reason}</div>}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button type="button" className="btn btn-outline" onClick={() => setIsDetailsModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Cancel Order Modal */}
      {selectedOrder && (
        <Modal
          isOpen={isCancelModalOpen}
          onClose={() => setIsCancelModalOpen(false)}
          title={`Cancel Sales Order: ${selectedOrder.orderNumber || selectedOrder.id}`}
          subtitle="Provide a mandatory cancellation reason. Any reserved timber stock will be immediately returned to available yard inventory."
          size="md"
        >
          <form onSubmit={handleCancelSubmit}>
            {actionError && (
              <div className="alert alert-danger" style={{ marginBottom: '1rem', padding: '0.75rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px' }}>
                <AlertTriangle size={16} style={{ display: 'inline', marginRight: '6px' }} />
                {actionError}
              </div>
            )}

            <div className="admin-form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="admin-form-label">Cancellation Reason *</label>
              <textarea
                required
                rows="3"
                className="admin-form-input"
                placeholder="e.g. Client cancelled project, duplicate order, or delivery spec mismatch..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button type="button" className="btn btn-outline" onClick={() => setIsCancelModalOpen(false)}>
                Back
              </button>
              <button type="submit" className="btn btn-danger" disabled={actionLoading}>
                {actionLoading ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
