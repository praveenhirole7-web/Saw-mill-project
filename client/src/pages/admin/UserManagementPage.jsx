import React, { useState, useEffect, useMemo } from 'react';
import { Plus, RefreshCw, ShieldCheck, KeyRound, UserRoundCog, UserX, UserCheck, UserPlus } from 'lucide-react';
import DataTable from '../../components/admin/DataTable';
import SearchBar from '../../components/admin/SearchBar';
import FilterPanel from '../../components/admin/FilterPanel';
import Pagination from '../../components/admin/Pagination';
import Modal from '../../components/admin/Modal';
import LoadingSpinner from '../../components/admin/LoadingSpinner';
import { getUsers, addUser, addAdmin, setUserPermissions, setUserStatus, resetStaffPassword, getStaffRegistrationRequests, decideStaffRegistration } from '../../services/adminApi';
import { useAuth } from '../../context/AuthContext';
import './AdminPages.css';

const STAFF_PERMISSIONS = [
  ['view_inventory', 'View inventory'], ['manage_inventory', 'Add or update stock'],
  ['view_purchases', 'View purchases'], ['manage_purchases', 'Record purchases'],
  ['view_cutting_jobs', 'View cutting work'], ['manage_cutting_jobs', 'Record cutting operations'],
  ['view_sales_orders', 'View assigned orders'], ['view_deliveries', 'View deliveries'],
  ['manage_deliveries', 'Update deliveries'], ['view_payments', 'View payments'],
  ['manage_payments', 'Record payments'], ['view_customers', 'View customer details'],
  ['manage_customers', 'Manage customers'], ['view_suppliers', 'View suppliers'], ['manage_suppliers', 'Manage suppliers'],
  ['view_invoices', 'View invoices'], ['manage_invoices', 'Manage invoices'], ['view_expenses', 'View expenses'],
  ['manage_expenses', 'Manage expenses'], ['view_reports', 'View business reports'], ['view_finance_reports', 'View finance reports'],
  ['view_employees', 'View staff directory'], ['manage_employees', 'Manage staff directory'], ['view_enquiries', 'View enquiries'],
  ['manage_staff', 'Review and manage staff accounts'], ['manage_admins', 'Manage administrator accounts'], ['manage_settings', 'Manage business settings']
];

export default function UserManagementPage() {
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [selectedPermissions, setSelectedPermissions] = useState([]);

  const [form, setForm] = useState({
    username: '',
    email: '',
    employee_id: '',
    password: '',
    role: 'operator'
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getUsers();
      const canManageStaff = currentUser?.role === 'owner' || currentUser?.permissions?.includes('manage_staff');
      const pending = canManageStaff ? await getStaffRegistrationRequests() : [];
      setUsers(data);
      setRequests(pending);
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser]);

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
      if (form.role === 'admin') await addAdmin({ username: form.username, email: form.email, password: form.password, permissions: selectedPermissions });
      else await addUser({ ...form, permissions: selectedPermissions });
      setForm({ username: '', email: '', employee_id: '', password: '', role: 'operator' });
      setIsModalOpen(false);
      await loadData();
    } catch (createError) {
      setError(createError.message || 'Unable to create the user.');
    } finally {
      setSubmitting(false);
    }
  };

  const openCreate = () => {
    setEditingUser(null);
    setSelectedPermissions([]);
    setForm({ username: '', email: '', employee_id: '', password: '', role: 'operator' });
    setIsModalOpen(true);
  };
  const openPermissions = (user) => {
    setEditingUser(user);
    setSelectedPermissions(user.permissions || []);
    setIsModalOpen(true);
  };
  const savePermissions = async () => {
    setSubmitting(true); setError('');
    try { await setUserPermissions(editingUser.id, selectedPermissions); setIsModalOpen(false); await loadData(); }
    catch (err) { setError(err.message || 'Unable to update permissions.'); }
    finally { setSubmitting(false); }
  };
  const toggleStatus = async (user) => {
    const nextStatus = user.status === 'active' ? 'inactive' : 'active';
    if (!window.confirm(`${nextStatus === 'inactive' ? 'Deactivate' : 'Reactivate'} ${user.username}?`)) return;
    try { await setUserStatus(user.id, nextStatus); await loadData(); }
    catch (err) { setError(err.message || 'Unable to update account status.'); }
  };
  const resetPassword = async (user) => {
    const password = window.prompt(`Enter a temporary password for ${user.username} (at least 12 characters):`);
    if (!password) return;
    try { await resetStaffPassword(user.id, password); window.alert('Password reset. Existing staff sessions have been signed out.'); }
    catch (err) { setError(err.message || 'Unable to reset the password.'); }
  };
  const reviewRequest = async (decision, request) => {
    if (decision === 'approve') {
      setEditingUser({ ...request, registrationRequest: true });
      setSelectedPermissions([]);
      setIsModalOpen(true);
      return;
    }
    if (!window.confirm(`Reject ${request.name}'s staff registration request?`)) return;
    try { await decideStaffRegistration(request.id, 'reject'); await loadData(); }
    catch (err) { setError(err.message || 'Unable to reject registration.'); }
  };
  const approveRequest = async () => {
    setSubmitting(true); setError('');
    try { await decideStaffRegistration(editingUser.id, 'approve', selectedPermissions); setIsModalOpen(false); await loadData(); }
    catch (err) { setError(err.message || 'Unable to approve registration.'); }
    finally { setSubmitting(false); }
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
    },
    { key: 'actions', label: 'Actions', render: (_, row) => row.role === 'owner' ? <span>Protected owner</span> : <div className="admin-user-actions">
      <button type="button" title={row.role === 'admin' ? 'Manage admin permissions' : 'Manage permissions'} onClick={() => openPermissions(row)}><UserRoundCog size={15} /></button>
      <button type="button" title="Reset password" onClick={() => resetPassword(row)}><KeyRound size={15} /></button>
      <button type="button" title={row.status === 'active' ? 'Deactivate' : 'Reactivate'} onClick={() => toggleStatus(row)}><UserX size={15} /></button>
    </div> }
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
          {(currentUser?.role === 'owner' || currentUser?.permissions?.includes('manage_staff')) && <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} />
            <span>Create User</span>
          </button>}
          {(currentUser?.role === 'owner' || currentUser?.permissions?.includes('manage_admins')) && <button type="button" className="btn btn-outline" onClick={() => { setEditingUser(null); setSelectedPermissions([]); setForm({ username: '', email: '', employee_id: '', password: '', role: 'admin' }); setIsModalOpen(true); }}><UserPlus size={16} /><span>Create Admin</span></button>}
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
          <section className="admin-subpage" aria-label="Staff registration requests">
            <h2>Pending staff registration requests ({requests.length})</h2>
            {requests.length === 0 ? <p>No pending staff requests.</p> : requests.map((request) => <div key={request.id} className="admin-toolbar" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
              <div><strong>{request.name}</strong> · {request.department}<br /><small>{request.username} · {request.email || 'No email'} · {request.phone}</small></div>
              <div className="admin-user-actions"><button type="button" title="Approve and assign permissions" onClick={() => reviewRequest('approve', request)}><UserCheck size={15} /> Approve</button><button type="button" title="Reject request" onClick={() => reviewRequest('reject', request)}><UserX size={15} /> Reject</button></div>
            </div>)}
          </section>
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
        title={editingUser ? (editingUser.registrationRequest ? `Approve ${editingUser.name}` : `Permissions for ${editingUser.username}`) : form.role === 'admin' ? 'Create Administrator' : 'Create Staff Account'}
        subtitle={editingUser?.registrationRequest ? 'Select the exact permissions this staff member will receive.' : editingUser ? 'Choose the work areas this account can access.' : 'Create an account with only the permissions selected below.'}
        size="md"
      >
        <form onSubmit={editingUser ? (e) => { e.preventDefault(); editingUser.registrationRequest ? approveRequest() : savePermissions(); } : handleSubmit}>
          {!editingUser && <>
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
              <label className="admin-form-label">Email</label>
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
              <label className="admin-form-label">Employee record ID (optional)</label>
              <input type="number" min="1" className="admin-form-input" placeholder="Link an existing employee" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Initial Password</label>
              <input
                type="password"
                required
                minLength={12}
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
                <option value="manager">Manager</option>
                <option value="operator">Operator</option>
                <option value="accountant">Accountant</option>
                {(currentUser?.role === 'owner' || currentUser?.permissions?.includes('manage_admins')) && <option value="admin">Administrator</option>}
              </select>
            </div>
          </div>
          </>}
          <fieldset className="staff-permission-picker">
            <legend>{form.role === 'admin' && !editingUser ? 'Administrator permissions' : 'Account permissions'}</legend>
            {STAFF_PERMISSIONS.filter(([key]) => {
              const adminTarget = editingUser?.role === 'admin' || (!editingUser && form.role === 'admin');
              return adminTarget || !['manage_staff', 'manage_admins', 'manage_settings'].includes(key);
            }).map(([key, label]) => <label key={key}>
              <input type="checkbox" checked={selectedPermissions.includes(key)} onChange={(e) => setSelectedPermissions(current => e.target.checked ? [...current, key] : current.filter(item => item !== key))} />
              <span>{label}</span>
            </label>)}
          </fieldset>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {editingUser ? (editingUser.registrationRequest ? 'Approve and activate' : 'Save permissions') : form.role === 'admin' ? 'Create administrator' : 'Create staff account'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
