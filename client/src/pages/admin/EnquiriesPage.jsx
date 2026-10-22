import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Eye, RefreshCw, UserRoundCheck } from 'lucide-react';
import DataTable from '../../components/admin/DataTable';
import SearchBar from '../../components/admin/SearchBar';
import Pagination from '../../components/admin/Pagination';
import Modal from '../../components/admin/Modal';
import LoadingSpinner from '../../components/admin/LoadingSpinner';
import { useAuth } from '../../context/AuthContext';
import {
  convertEnquiry,
  getEnquiries,
  getEnquiryAssignees,
  updateEnquiry
} from '../../services/adminApi';
import './AdminPages.css';

const STATUS_LABELS = {
  new: 'New',
  qualified: 'Qualified',
  in_progress: 'In Progress',
  converted: 'Converted',
  closed: 'Closed'
};

export default function EnquiriesPage() {
  const { currentUser } = useAuth();
  const canManage = currentUser?.permissions?.includes('manage_enquiries');
  const [enquiries, setEnquiries] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState({ status: 'new', assigned_to_id: '', internal_notes: '' });
  const requestVersion = useRef(0);

  const fetchData = useCallback(() => Promise.all([
    getEnquiries({ search, status: statusFilter }),
    getEnquiryAssignees()
  ]), [search, statusFilter]);

  const loadData = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const [rows, users] = await fetchData();
      if (version === requestVersion.current) {
        setEnquiries(rows);
        setAssignees(users);
        setError('');
      }
    } catch (err) {
      if (version === requestVersion.current) setError(err.message || 'Unable to load enquiries.');
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [fetchData]);

  useEffect(() => {
    const version = ++requestVersion.current;
    let active = true;
    fetchData()
      .then(([rows, users]) => {
        if (active && version === requestVersion.current) {
          setEnquiries(rows);
          setAssignees(users);
          setError('');
        }
      })
      .catch(err => {
        if (active && version === requestVersion.current) setError(err.message || 'Unable to load enquiries.');
      })
      .finally(() => {
        if (active && version === requestVersion.current) setLoading(false);
      });
    return () => { active = false; };
  }, [fetchData]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return enquiries.slice(start, start + pageSize);
  }, [enquiries, currentPage, pageSize]);

  const openDetails = enquiry => {
    setSelected(enquiry);
    setEdit({
      status: enquiry.status,
      assigned_to_id: enquiry.assigned_to_id ? String(enquiry.assigned_to_id) : '',
      internal_notes: enquiry.internal_notes || ''
    });
    setNotice('');
    setError('');
  };

  const saveEnquiry = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updates = {
        assigned_to_id: edit.assigned_to_id || null,
        internal_notes: edit.internal_notes
      };
      if (edit.status !== selected.status) updates.status = edit.status;
      await updateEnquiry(selected.id, updates);
      setSelected(null);
      setNotice(`Enquiry ${selected.reference} updated.`);
      setLoading(true);
      await loadData();
    } catch (err) {
      setError(err.message || 'Unable to update enquiry.');
    } finally {
      setBusy(false);
    }
  };

  const handleConvert = async target => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const converted = await convertEnquiry(selected.id, target);
      const detail = target === 'quotation'
        ? `quotation ${converted.quotation_number}`
        : `customer ${converted.customer_id}`;
      setSelected(null);
      setNotice(`Enquiry ${converted.reference} linked to ${detail}.`);
      setLoading(true);
      await loadData();
    } catch (err) {
      setError(err.message || 'Unable to convert enquiry.');
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    {
      key: 'reference',
      label: 'Reference',
      sortable: true,
      render: (value, row) => <div><strong>{value}</strong><div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{row.source === 'quote' ? 'Quote request' : 'Contact form'}</div></div>
    },
    { key: 'name', label: 'Name', sortable: true },
    {
      key: 'contact',
      label: 'Contact',
      render: (_, row) => <div><div>{row.phone || '—'}</div><div>{row.email || '—'}</div></div>
    },
    {
      key: 'requested_product',
      label: 'Product / Quantity',
      render: (_, row) => `${row.requested_product} · ${Number(row.quantity)} ${row.quantity_unit}`
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: value => <span className={`badge ${value === 'closed' ? 'badge-secondary' : value === 'converted' ? 'badge-success' : 'badge-info'}`}>{STATUS_LABELS[value] || value}</span>
    },
    { key: 'assigned_to_username', label: 'Assigned To' },
    {
      key: 'actions',
      label: 'Details',
      render: (_, row) => <button type="button" className="btn btn-outline" onClick={() => openDetails(row)}><Eye size={14} /> Review</button>
    }
  ];

  return (
    <div className="admin-subpage">
      <div className="admin-subpage-header">
        <div className="admin-subpage-header__left">
          <h1 className="admin-subpage-title">Customer Enquiries</h1>
          <p className="admin-subpage-subtitle">Read and reply to quote or contact requests from the website.</p>
        </div>
        <div className="admin-subpage-header__actions">
          <button type="button" className="btn btn-outline" onClick={() => { setLoading(true); loadData(); }}><RefreshCw size={15} /> Sync</button>
        </div>
      </div>

      {notice && <div className="admin-inline-success" role="status">{notice}</div>}
      {error && <div className="admin-inline-error" role="alert">{error}</div>}
      <div className="admin-toolbar">
        <div className="admin-toolbar__left">
          <SearchBar value={search} onChange={event => { setLoading(true); setSearch(event.target.value); setCurrentPage(1); }} placeholder="Search reference, name, contact, product..." />
          <select className="admin-form-select" aria-label="Filter enquiry status" value={statusFilter} onChange={event => { setLoading(true); setStatusFilter(event.target.value); setCurrentPage(1); }}>
            <option value="All">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>
      {loading ? <LoadingSpinner message="Loading private enquiries..." /> : (
        <>
          <DataTable columns={columns} data={paginated} keyField="id" />
          <Pagination
            currentPage={currentPage}
            totalPages={Math.ceil(enquiries.length / pageSize) || 1}
            totalItems={enquiries.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={size => { setPageSize(size); setCurrentPage(1); }}
          />
        </>
      )}

      <Modal isOpen={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? `Enquiry ${selected.reference}` : ''} subtitle="Customer message and internal notes are visible only to authorized staff." size="lg">
        {selected && (
          <>
            <div className="admin-form-grid">
              <div><strong>Name</strong><div>{selected.name}</div></div>
              <div><strong>Contact</strong><div>{selected.phone || '—'} · {selected.email || '—'}</div></div>
              <div><strong>Requested product</strong><div>{selected.requested_product}</div></div>
              <div><strong>Quantity</strong><div>{Number(selected.quantity)} {selected.quantity_unit}</div></div>
              <div><strong>Service</strong><div>{selected.service_required || '—'}</div></div>
              <div><strong>Dimensions</strong><div>{selected.dimensions || '—'}</div></div>
              <div style={{ gridColumn: 'span 2' }}><strong>Customer message</strong><div style={{ whiteSpace: 'pre-wrap' }}>{selected.message}</div></div>
              {selected.preferred_delivery_date && <div><strong>Preferred delivery</strong><div>{String(selected.preferred_delivery_date).slice(0, 10)}</div></div>}
              {selected.customer_id && <div><strong>Linked customer</strong><div>#{selected.customer_id}</div></div>}
              {selected.quotation_number && <div><strong>Draft quotation</strong><div>{selected.quotation_number}</div></div>}
            </div>

            {canManage ? (
              <form onSubmit={saveEnquiry}>
                <div className="admin-form-grid" style={{ marginTop: '1.25rem' }}>
                  <div className="admin-form-group">
                    <label className="admin-form-label" htmlFor="enquiry-status">Status</label>
                    <select id="enquiry-status" className="admin-form-select" value={edit.status} onChange={event => setEdit({ ...edit, status: event.target.value })}>
                      {Object.entries(STATUS_LABELS).filter(([status]) => status !== 'converted').map(([value, label]) => (
                        <option key={value} value={value} disabled={selected.status === 'closed' && value !== 'closed'}>{label}</option>
                      ))}
                      {selected.status === 'converted' && <option value="converted">Converted</option>}
                    </select>
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-form-label" htmlFor="enquiry-assignee">Assigned Staff</label>
                    <select id="enquiry-assignee" className="admin-form-select" value={edit.assigned_to_id} onChange={event => setEdit({ ...edit, assigned_to_id: event.target.value })}>
                      <option value="">Unassigned</option>
                      {assignees.map(user => <option key={user.id} value={user.id}>{user.username} ({user.role})</option>)}
                    </select>
                  </div>
                  <div className="admin-form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="admin-form-label" htmlFor="enquiry-internal-notes">Internal Notes</label>
                    <textarea id="enquiry-internal-notes" className="admin-form-input" rows="4" maxLength="10000" value={edit.internal_notes} onChange={event => setEdit({ ...edit, internal_notes: event.target.value })} />
                  </div>
                </div>
                {error && <div className="admin-inline-error" role="alert">{error}</div>}
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                  {['qualified', 'converted'].includes(selected.status) && !selected.customer_id && (
                    <button type="button" className="btn btn-outline" disabled={busy} onClick={() => handleConvert('customer')}><UserRoundCheck size={14} /> Convert to Customer</button>
                  )}
                  {['qualified', 'converted'].includes(selected.status) && !selected.quotation_id && (
                    <button type="button" className="btn btn-outline" disabled={busy} onClick={() => handleConvert('quotation')}><Check size={14} /> Create Draft Quotation</button>
                  )}
                  <button type="button" className="btn btn-outline" onClick={() => setSelected(null)}>Close</button>
                  <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save Updates'}</button>
                </div>
              </form>
            ) : (
              <div style={{ marginTop: '1.25rem' }}><strong>Internal Notes</strong><div style={{ whiteSpace: 'pre-wrap' }}>{selected.internal_notes || '—'}</div></div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
