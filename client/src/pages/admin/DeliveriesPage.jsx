import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Truck, MapPin, CheckCircle2, RotateCcw, CircleAlert } from 'lucide-react';
import DataTable from '../../components/admin/DataTable';
import SearchBar from '../../components/admin/SearchBar';
import Pagination from '../../components/admin/Pagination';
import Modal from '../../components/admin/Modal';
import LoadingSpinner from '../../components/admin/LoadingSpinner';
import { useAuth } from '../../context/AuthContext';
import {
  addDelivery,
  getDeliveries,
  getEligibleDeliveryOrders,
  updateDeliveryStatus
} from '../../services/adminApi';
import './AdminPages.css';
import { formatDate } from '../../utils/formatters';

const statusOptions = ['All', 'Scheduled', 'Dispatched', 'Delivered', 'Failed'];
const today = () => new Date().toISOString().slice(0, 10);
const initialForm = () => ({
  sales_order_id: '',
  planned_delivery_date: today(),
  vehicle_info: '',
  driver_name: '',
  transport_notes: ''
});

export default function DeliveriesPage() {
  const { currentUser } = useAuth();
  const canManage = currentUser?.permissions?.includes('manage_deliveries');
  const [deliveries, setDeliveries] = useState([]);
  const [eligibleOrders, setEligibleOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(initialForm);

  const loadData = useCallback(async () => {
    try {
      const [rows, orders] = await Promise.all([
        getDeliveries({ search, status: statusFilter }),
        getEligibleDeliveryOrders()
      ]);
      setDeliveries(rows);
      setEligibleOrders(orders);
      setError('');
      setCurrentPage(1);
    } catch (err) {
      setError(err.message || 'Unable to load deliveries.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return deliveries.slice(start, start + pageSize);
  }, [deliveries, currentPage, pageSize]);

  const handleCreate = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await addDelivery(form);
      setIsModalOpen(false);
      setForm(initialForm());
      setLoading(true);
      await loadData();
    } catch (err) {
      setError(err.message || 'Unable to schedule delivery.');
    } finally {
      setBusy(false);
    }
  };

  const transition = async (delivery, nextStatus, details = {}) => {
    setError('');
    try {
      await updateDeliveryStatus(delivery.id, nextStatus, details);
      setLoading(true);
      await loadData();
    } catch (err) {
      setError(err.message || 'Unable to update delivery.');
    }
  };

  const handleAction = delivery => {
    if (delivery.status === 'Scheduled') {
      if (window.confirm(`Send order ${delivery.orderRef} to the customer now?`)) {
        transition(delivery, 'dispatched');
      }
    } else if (delivery.status === 'Dispatched') {
      const confirmationName = window.prompt('Name of the person confirming receipt:');
      if (confirmationName === null) return;
      if (confirmationName.trim()) {
        const confirmationNotes = window.prompt('Delivery confirmation notes (optional):') || '';
        transition(delivery, 'delivered', { confirmation_name: confirmationName, confirmation_notes: confirmationNotes });
      } else {
        setError('A delivery confirmation name is required.');
      }
    } else if (delivery.status === 'Failed') {
      const plannedDate = window.prompt('New planned delivery date (YYYY-MM-DD):', delivery.planned_delivery_date);
      if (plannedDate === null) return;
      const reason = window.prompt('Reason for rescheduling:');
      if (reason === null) return;
      transition(delivery, 'scheduled', { planned_delivery_date: plannedDate, reason });
    }
  };

  const handleFailure = delivery => {
    const failureReason = window.prompt('Reason the delivery failed:');
    if (failureReason === null) return;
    transition(delivery, 'failed', { failure_reason: failureReason });
  };

  const columns = [
    {
      key: 'delivery_number',
      label: 'Delivery / Order',
      sortable: true,
      render: (value, row) => (
        <div>
          <strong style={{ color: 'var(--color-forest)' }}>{value}</strong>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-wood)' }}>Order: {row.orderRef}</div>
        </div>
      )
    },
    { key: 'customer', label: 'Customer', sortable: true },
    {
      key: 'destination',
      label: 'Destination',
      render: value => <span style={{ fontSize: '0.8rem' }}><MapPin size={12} /> {value || 'Not provided'}</span>
    },
    {
      key: 'truckNumber',
      label: 'Transport / Driver',
      render: (value, row) => <div><strong>{value || 'Not assigned'}</strong><div>{row.driverName || 'Driver not assigned'}</div></div>
    },
    { key: 'cargo_description', label: 'Cargo' },
    { key: 'planned_delivery_date', label: 'Planned Date', sortable: true, render: value => formatDate(value) },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: value => {
        const cls = value === 'Delivered' ? 'badge-success' :
          value === 'Dispatched' ? 'badge-warning' :
            value === 'Failed' ? 'badge-danger' : 'badge-info';
        return <span className={`badge ${cls}`}>{value}</span>;
      }
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {canManage && row.status !== 'Delivered' && (
            <button type="button" className="btn btn-outline" onClick={() => handleAction(row)} aria-label={`Update ${row.delivery_number}`}>
              {row.status === 'Failed' ? <RotateCcw size={14} /> : row.status === 'Dispatched' ? <CheckCircle2 size={14} /> : <Truck size={14} />}
              {row.status === 'Scheduled' ? 'Send Goods' : row.status === 'Dispatched' ? 'Confirm Delivery' : 'Change Date'}
            </button>
          )}
          {canManage && row.status === 'Dispatched' && (
            <button type="button" className="btn btn-outline" onClick={() => handleFailure(row)} aria-label="Mark delivery failed">
              <CircleAlert size={14} /> Failed
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="admin-subpage">
      <div className="admin-subpage-header">
        <div className="admin-subpage-header__left">
          <h1 className="admin-subpage-title">Delivery Details</h1>
          <p className="admin-subpage-subtitle">Plan when to send finished customer orders and update delivery details.</p>
        </div>
        <div className="admin-subpage-header__actions">
          {canManage && <button type="button" className="btn btn-primary" onClick={() => { setForm(initialForm()); setIsModalOpen(true); }}><Plus size={16} /> Schedule Delivery</button>}
          <button type="button" className="btn btn-outline" onClick={() => { setLoading(true); loadData(); }}><RefreshCw size={15} /> Sync</button>
        </div>
      </div>

      {error && <div className="admin-inline-error" role="alert">{error}</div>}
      <div className="admin-toolbar">
        <div className="admin-toolbar__left">
          <SearchBar value={search} onChange={event => { setSearch(event.target.value); setCurrentPage(1); }} placeholder="Search delivery, order, customer, driver..." />
          <select className="admin-form-select" aria-label="Filter delivery status" value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setCurrentPage(1); }}>
            {statusOptions.map(status => <option key={status} value={status}>{status === 'All' ? 'All statuses' : status}</option>)}
          </select>
        </div>
      </div>

      {loading ? <LoadingSpinner message="Loading delivery history..." /> : (
        <>
          <DataTable columns={columns} data={paginated} keyField="id" />
          <Pagination
            currentPage={currentPage}
            totalPages={Math.ceil(deliveries.length / pageSize) || 1}
            totalItems={deliveries.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={size => { setPageSize(size); setCurrentPage(1); }}
          />
        </>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Schedule Delivery" subtitle="Only fulfilled sales orders are eligible." size="md">
        <form onSubmit={handleCreate}>
          <div className="admin-form-grid">
            <div className="admin-form-group" style={{ gridColumn: 'span 2' }}>
              <label className="admin-form-label" htmlFor="delivery-order">Fulfilled Sales Order</label>
              <select id="delivery-order" className="admin-form-select" required value={form.sales_order_id} onChange={event => setForm({ ...form, sales_order_id: event.target.value })}>
                <option value="">Choose completed order</option>
                {eligibleOrders.map(order => (
                  <option key={order.id} value={order.id}>
                    {order.order_number} — {order.customer_name} — {order.cargo_description || 'Order'}
                  </option>
                ))}
              </select>
              {eligibleOrders.length === 0 && <span className="admin-form-help">There are no fulfilled orders available to schedule.</span>}
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="planned-delivery-date">Planned Delivery Date</label>
              <input id="planned-delivery-date" type="date" required className="admin-form-input" value={form.planned_delivery_date} onChange={event => setForm({ ...form, planned_delivery_date: event.target.value })} />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="delivery-vehicle">Vehicle / Transport</label>
              <input id="delivery-vehicle" maxLength="160" className="admin-form-input" value={form.vehicle_info} onChange={event => setForm({ ...form, vehicle_info: event.target.value })} />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="delivery-driver">Driver</label>
              <input id="delivery-driver" maxLength="120" className="admin-form-input" value={form.driver_name} onChange={event => setForm({ ...form, driver_name: event.target.value })} />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="delivery-notes">Transport Notes</label>
              <input id="delivery-notes" maxLength="2000" className="admin-form-input" value={form.transport_notes} onChange={event => setForm({ ...form, transport_notes: event.target.value })} />
            </div>
          </div>
          {error && <div className="admin-inline-error" role="alert">{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !eligibleOrders.length}>{busy ? 'Scheduling…' : 'Schedule Delivery'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
