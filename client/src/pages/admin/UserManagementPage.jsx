import React, { useState, useEffect, useMemo } from 'react';
import { Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import DataTable from '../../components/admin/DataTable';
import SearchBar from '../../components/admin/SearchBar';
import FilterPanel from '../../components/admin/FilterPanel';
import Pagination from '../../components/admin/Pagination';
import Modal from '../../components/admin/Modal';
import LoadingSpinner from '../../components/admin/LoadingSpinner';
import { getUsers, addUser } from '../../services/adminApi';
import './AdminPages.css';

export default function UserManagementPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'operator'
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getUsers();
      setUsers(data);
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        (u.name || u.username || '').toLowerCase().includes(search.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(search.toLowerCase()) ||
        (u.role || '').toLowerCase().includes(search.toLowerCase());
      const matchRole = roleFilter === 'All' || u.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [users, search, roleFilter]);

  const paginated = useMemo(() => {
    const s = (currentPage - 1) * pageSize;
    return filtered.slice(s, s + pageSize);
  }, [filtered, currentPage, pageSize]);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await addUser(form);
      setForm({ username: '', email: '', password: '', role: 'operator' });
      setIsModalOpen(false);
      await loadData();
    } catch (createError) {
      setError(createError.message || 'Unable to create the user.');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Staff Member',
      sortable: true,
      render: (val, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'var(--color-forest)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '0.85rem'
              }}
            >
              {(val || row.username || '?').charAt(0).toUpperCase()}
            </div>
          }
          <div>
            <strong style={{ color: 'var(--color-forest-dark)' }}>{val || row.username}</strong>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{row.email}</div>
          </div>
        </div>
      )
    },
    {
      key: 'role',
      label: 'Access Role',
      sortable: true,
      render: (val) => (
        <span
          className="badge"
          style={{
            backgroundColor: val === 'admin' ? 'rgba(25, 56, 38, 0.1)' : '#f1f5f9',
            color: val === 'admin' ? 'var(--color-forest)' : '#475569'
          }}
        >
          <ShieldCheck size={12} style={{ marginRight: '4px' }} />
          {val}
        </span>
      )
    },
    {
      key: 'status',
      label: 'Account Status',
      render: (val) => <span className={`badge ${val === 'active' ? 'badge-success' : ''}`}>{val}</span>
    }
  ];

  return (
    <div className="admin-subpage">
      <div className="admin-subpage-header">
        <div className="admin-subpage-header__left">
          <h1 className="admin-subpage-title">Manage Users</h1>
          <p className="admin-subpage-subtitle">
            Manage administrative accounts, role-based access control (RBAC), and mill operator privileges.
          </p>
        </div>
        <div className="admin-subpage-header__actions">
          <button type="button" className="btn btn-outline" onClick={loadData}>
            <RefreshCw size={15} />
            <span>Sync</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={16} />
            <span>Create User</span>
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
            placeholder="Search user name, email, or role..."
          />
          <FilterPanel
            filters={[
              {
                key: 'role',
                label: 'Role',
                value: roleFilter,
                onChange: setRoleFilter,
                options: [
                  { label: 'All Roles', value: 'All' },
                  { label: 'Super Administrator', value: 'Super Administrator' },
                  { label: 'Yard Manager & Grader', value: 'Yard Manager & Grader' },
                  { label: 'Cutting Floor Supervisor', value: 'Cutting Floor Supervisor' },
                  { label: 'Accountant & Invoicing', value: 'Accountant & Invoicing' },
                  { label: 'Logistics Operator', value: 'Logistics Operator' }
                ]
              }
            ]}
            onReset={() => {
              setRoleFilter('All');
              setSearch('');
            }}
            totalResults={filtered.length}
          />
        </div>
      </div>

      {loading ? (
        <LoadingSpinner message="Loading authorized users..." />
      ) : (
        <>
          {error && <div className="alert alert-error" role="alert">{error} <button type="button" onClick={loadData}>Retry</button></div>}
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

      {/* Create User Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Invite New System User"
        subtitle="Grant console credentials and assign permission role"
        size="md"
      >
        <form onSubmit={handleSubmit}>
          <div className="admin-form-grid">
            <div className="admin-form-group">
              <label className="admin-form-label">Username</label>
              <input
                type="text"
                required
                className="admin-form-input"
                placeholder="Username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Corporate Email</label>
              <input
                type="email"
                required
                className="admin-form-input"
                placeholder="name@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Initial Password</label>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="admin-form-input"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Role Assignment</label>
              <select
                className="admin-form-select"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="admin">Administrator</option>
                <option value="manager">Manager</option>
                <option value="operator">Operator</option>
                <option value="accountant">Accountant</option>
              </select>
            </div>
          </div>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              Issue Credentials
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
