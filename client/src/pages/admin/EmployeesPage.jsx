import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, RefreshCw, Pencil } from 'lucide-react';
import DataTable from '../../components/admin/DataTable';
import SearchBar from '../../components/admin/SearchBar';
import Pagination from '../../components/admin/Pagination';
import Modal from '../../components/admin/Modal';
import LoadingSpinner from '../../components/admin/LoadingSpinner';
import { useAuth } from '../../context/AuthContext';
import { addEmployee, getEmployees, updateEmployee } from '../../services/adminApi';
import './AdminPages.css';
import { formatCurrency, formatDate } from '../../utils/formatters';

const blankForm = () => ({
  name: '',
  phone: '',
  email: '',
  job_title: '',
  joining_date: new Date().toISOString().slice(0, 10),
  salary: '',
  salary_period: 'hourly'
});

export default function EmployeesPage() {
  const { currentUser } = useAuth();
  const permissions = currentUser?.permissions || [];
  const canManage = permissions.includes('manage_employees');
  const canViewSalary = permissions.includes('view_employee_salary') || permissions.includes('manage_employee_salary');
  const canManageSalary = permissions.includes('manage_employee_salary');
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(blankForm);
  const requestSequence = useRef(0);

  const loadData = useCallback(async () => {
    const requestId = ++requestSequence.current;
    try {
      const result = await getEmployees();
      if (requestId !== requestSequence.current) return;
      setEmployees(result);
      setError('');
    } catch (err) {
      if (requestId === requestSequence.current) setError(err.message || 'Unable to load employee records.');
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    return () => { requestSequence.current += 1; };
  }, [loadData]);
  const refreshData = () => {
    setLoading(true);
    loadData();
  };

  const filtered = useMemo(() => {
    const needle = search.toLowerCase();
    return employees.filter(employee =>
      [employee.name, employee.job_title, employee.email, employee.phone]
        .some(value => String(value || '').toLowerCase().includes(needle))
    );
  }, [employees, search]);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const openCreate = () => {
    setEditing(null);
    setForm(blankForm());
    setError('');
    setIsModalOpen(true);
  };

  const openEdit = employee => {
    setEditing(employee);
    setForm({
      name: employee.name || '',
      phone: employee.phone || '',
      email: employee.email || '',
      job_title: employee.job_title || '',
      joining_date: employee.joining_date,
      salary: employee.salary ?? '',
      salary_period: employee.salary_period || 'hourly'
    });
    setError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const payload = {
      name: form.name,
      phone: form.phone,
      email: form.email,
      job_title: form.job_title,
      joining_date: form.joining_date
    };
    if (canManageSalary) {
      payload.salary = form.salary;
      payload.salary_period = form.salary ? form.salary_period : null;
    }
    try {
      if (editing) await updateEmployee(editing.id, payload);
      else await addEmployee(payload);
      setIsModalOpen(false);
      setLoading(true);
      await loadData();
    } catch (err) {
      setError(err.message || 'Unable to save employee.');
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Employee',
      sortable: true,
      render: (value, row) => (
        <div>
          <strong style={{ color: 'var(--color-forest-dark)' }}>{value}</strong>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{row.job_title}</div>
        </div>
      )
    },
    {
      key: 'phone',
      label: 'Contact',
      render: (value, row) => <div><div>{value || '—'}</div><div style={{ color: 'var(--color-text-muted)' }}>{row.email || '—'}</div></div>
    },
    { key: 'joining_date', label: 'Joining Date', sortable: true, render: value => formatDate(value) },
    ...(canViewSalary ? [{
      key: 'salary',
      label: 'Salary',
      sortable: true,
      render: (value, row) => value === null || value === undefined
        ? 'Not set'
        : <strong>{formatCurrency(value)} / {row.salary_period}</strong>
    }] : []),
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => canManage
        ? <button type="button" className="btn btn-outline" onClick={() => openEdit(row)} aria-label="Edit employee"><Pencil size={14} /></button>
        : '—'
    }
  ];

  return (
    <div className="admin-subpage">
      <div className="admin-subpage-header">
        <div className="admin-subpage-header__left">
          <h1 className="admin-subpage-title">Employees</h1>
          <p className="admin-subpage-subtitle">Save staff contact details, work roles and joining dates.</p>
        </div>
        <div className="admin-subpage-header__actions">
          {canManage && <button type="button" className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Add Employee</button>}
          <button type="button" className="btn btn-outline" onClick={refreshData}><RefreshCw size={15} /> Sync</button>
        </div>
      </div>
      {error && <div className="admin-inline-error" role="alert">{error}</div>}
      <div className="admin-toolbar">
        <div className="admin-toolbar__left">
          <SearchBar value={search} onChange={event => { setSearch(event.target.value); setCurrentPage(1); }} placeholder="Search name, job title, or contact..." />
        </div>
      </div>
      {loading ? <LoadingSpinner message="Loading employee records..." /> : (
        <>
          <DataTable columns={columns} data={paginated} keyField="id" />
          <Pagination
            currentPage={currentPage}
            totalPages={Math.ceil(filtered.length / pageSize) || 1}
            totalItems={filtered.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={size => { setPageSize(size); setCurrentPage(1); }}
          />
        </>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editing ? 'Update Employee' : 'Add Employee'}
        subtitle="Employee profile changes are recorded for audit."
        size="md"
      >
        <form onSubmit={handleSubmit}>
          <div className="admin-form-grid">
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="employee-name">Full Name</label>
              <input id="employee-name" maxLength="120" required className="admin-form-input" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="employee-title">Job Title</label>
              <input id="employee-title" maxLength="120" required className="admin-form-input" value={form.job_title} onChange={event => setForm({ ...form, job_title: event.target.value })} />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="employee-phone">Phone</label>
              <input id="employee-phone" type="tel" maxLength="30" className="admin-form-input" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="employee-email">Email</label>
              <input id="employee-email" type="email" maxLength="150" className="admin-form-input" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="employee-joining-date">Joining Date</label>
              <input id="employee-joining-date" type="date" required className="admin-form-input" value={form.joining_date} onChange={event => setForm({ ...form, joining_date: event.target.value })} />
            </div>
            {canManageSalary && (
              <>
                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="employee-salary">Salary / Rate</label>
                  <input id="employee-salary" type="number" min="0" max="9999999999.99" step="0.01" className="admin-form-input" value={form.salary} onChange={event => setForm({ ...form, salary: event.target.value })} />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="employee-salary-period">Salary Period</label>
                  <select id="employee-salary-period" className="admin-form-select" value={form.salary_period} onChange={event => setForm({ ...form, salary_period: event.target.value })}>
                    <option value="hourly">Hourly</option>
                    <option value="monthly">Monthly</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>
              </>
            )}
          </div>
          {error && <div className="admin-inline-error" role="alert">{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save Changes' : 'Register Employee'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
