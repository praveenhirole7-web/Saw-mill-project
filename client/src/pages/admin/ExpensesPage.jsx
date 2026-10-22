import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, RefreshCw, RotateCcw, Pencil, Tags } from 'lucide-react';
import DataTable from '../../components/admin/DataTable';
import SearchBar from '../../components/admin/SearchBar';
import Pagination from '../../components/admin/Pagination';
import Modal from '../../components/admin/Modal';
import LoadingSpinner from '../../components/admin/LoadingSpinner';
import { useAuth } from '../../context/AuthContext';
import {
  addExpense,
  addExpenseCategory,
  getExpenseCategories,
  getExpenses,
  reverseExpense,
  updateExpense
} from '../../services/adminApi';
import './AdminPages.css';
import { formatCurrency, formatDate } from '../../utils/formatters';

const today = () => new Date().toISOString().slice(0, 10);
const blankForm = () => ({
  category: 'Electricity',
  description: '',
  vendor: '',
  expense_date: today(),
  amount: ''
});

export default function ExpensesPage() {
  const { currentUser } = useAuth();
  const permissions = currentUser?.permissions || [];
  const canManage = permissions.includes('manage_expenses');
  const canReverse = permissions.includes('reverse_expenses');
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(blankForm);
  const requestSequence = useRef(0);

  const loadData = useCallback(async () => {
    const requestId = ++requestSequence.current;
    try {
      const [expenseRows, categoryRows] = await Promise.all([
        getExpenses({ search, category: categoryFilter, from, to, limit: 500 }),
        getExpenseCategories()
      ]);
      if (requestId !== requestSequence.current) return;
      setExpenses(expenseRows);
      setCategories(categoryRows);
      setError('');
      setCurrentPage(1);
    } catch (err) {
      if (requestId === requestSequence.current) setError(err.message || 'Unable to load expenses.');
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [search, categoryFilter, from, to]);

  useEffect(() => {
    loadData();
    return () => { requestSequence.current += 1; };
  }, [loadData]);
  const refreshData = () => {
    setLoading(true);
    loadData();
  };

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return expenses.slice(start, start + pageSize);
  }, [expenses, currentPage, pageSize]);

  const openCreate = () => {
    setEditing(null);
    setForm(blankForm());
    setError('');
    setIsModalOpen(true);
  };

  const openEdit = (expense) => {
    setEditing(expense);
    setForm({
      category: expense.category,
      description: expense.description,
      vendor: expense.vendor || '',
      expense_date: expense.date,
      amount: String(expense.amount)
    });
    setError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editing) await updateExpense(editing.id, form);
      else await addExpense(form);
      setIsModalOpen(false);
      setLoading(true);
      await loadData();
    } catch (err) {
      setError(err.message || 'Unable to save expense.');
    } finally {
      setBusy(false);
    }
  };

  const handleReverse = async (expense) => {
    const reason = window.prompt(`Reason for reversing expense #${expense.id}:`);
    if (reason === null) return;
    setError('');
    try {
      await reverseExpense(expense.id, reason);
      setLoading(true);
      await loadData();
    } catch (err) {
      setError(err.message || 'Unable to reverse expense.');
    }
  };

  const handleAddCategory = async () => {
    const name = window.prompt('New expense category name:');
    if (name === null) return;
    setError('');
    try {
      const created = await addExpenseCategory(name);
      const nextCategories = await getExpenseCategories();
      setCategories(nextCategories);
      setForm(current => ({ ...current, category: created.name }));
    } catch (err) {
      setError(err.message || 'Unable to add expense category.');
    }
  };

  const columns = [
    {
      key: 'id',
      label: 'Expense ID',
      sortable: true,
      render: value => <strong style={{ color: 'var(--color-wood)' }}>EXP-{value}</strong>
    },
    { key: 'category', label: 'Category', sortable: true },
    { key: 'description', label: 'Description' },
    { key: 'vendor', label: 'Vendor / Provider', sortable: true },
    { key: 'date', label: 'Date', sortable: true, render: value => formatDate(value) },
    {
      key: 'amount',
      label: 'Amount',
      sortable: true,
      render: value => <strong>{formatCurrency(value)}</strong>
    },
    {
      key: 'status',
      label: 'Status',
      render: value => <span className={`badge ${value === 'Posted' ? 'badge-success' : 'badge-secondary'}`}>{value}</span>
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {canManage && row.status === 'Posted' && (
            <button type="button" className="btn btn-outline" onClick={() => openEdit(row)} aria-label="Edit expense">
              <Pencil size={14} />
            </button>
          )}
          {canReverse && row.status === 'Posted' && (
            <button type="button" className="btn btn-outline" onClick={() => handleReverse(row)} aria-label="Reverse expense">
              <RotateCcw size={14} />
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
          <h1 className="admin-subpage-title">Business Costs</h1>
          <p className="admin-subpage-subtitle">Record and review electricity, labour, transport, maintenance, and other expenses.</p>
        </div>
        <div className="admin-subpage-header__actions">
          {canManage && (
            <>
              <button type="button" className="btn btn-outline" onClick={handleAddCategory}><Tags size={15} /> Add Category</button>
              <button type="button" className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Log Expense</button>
            </>
          )}
          <button type="button" className="btn btn-outline" onClick={refreshData}><RefreshCw size={15} /> Sync</button>
        </div>
      </div>

      {error && <div className="admin-inline-error" role="alert">{error}</div>}
      <div className="admin-toolbar">
        <div className="admin-toolbar__left">
          <SearchBar value={search} onChange={event => setSearch(event.target.value)} placeholder="Search description, vendor, or category..." />
          <select className="admin-form-select" aria-label="Expense category" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}>
            <option value="">All categories</option>
            {categories.map(category => <option key={category.id} value={category.name}>{category.name}</option>)}
          </select>
          <label className="admin-form-group">
            <span className="admin-form-label">From</span>
            <input className="admin-form-input" type="date" value={from} onChange={event => setFrom(event.target.value)} />
          </label>
          <label className="admin-form-group">
            <span className="admin-form-label">To</span>
            <input className="admin-form-input" type="date" value={to} onChange={event => setTo(event.target.value)} />
          </label>
        </div>
      </div>

      {loading ? <LoadingSpinner message="Loading expenses..." /> : (
        <>
          <DataTable columns={columns} data={paginated} keyField="id" />
          <Pagination
            currentPage={currentPage}
            totalPages={Math.ceil(expenses.length / pageSize) || 1}
            totalItems={expenses.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={size => { setPageSize(size); setCurrentPage(1); }}
          />
        </>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editing ? 'Edit Expense' : 'Log Expense'}
        subtitle="Changes are recorded in the financial audit history."
        size="md"
      >
        <form onSubmit={handleSubmit}>
          <div className="admin-form-grid">
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="expense-category">Category</label>
              <select id="expense-category" className="admin-form-select" required value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}>
                {categories.map(category => <option key={category.id} value={category.name}>{category.name}</option>)}
              </select>
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="expense-date">Expense Date</label>
              <input id="expense-date" type="date" required className="admin-form-input" value={form.expense_date} onChange={event => setForm({ ...form, expense_date: event.target.value })} />
            </div>
            <div className="admin-form-group" style={{ gridColumn: 'span 2' }}>
              <label className="admin-form-label" htmlFor="expense-description">Description</label>
              <input id="expense-description" maxLength="255" required className="admin-form-input" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="expense-vendor">Vendor / Provider</label>
              <input id="expense-vendor" maxLength="160" className="admin-form-input" value={form.vendor} onChange={event => setForm({ ...form, vendor: event.target.value })} />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="expense-amount">Amount</label>
              <input id="expense-amount" type="number" min="0.01" max="9999999999.99" step="0.01" required className="admin-form-input" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} />
            </div>
          </div>
          {error && <div className="admin-inline-error" role="alert">{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save Changes' : 'Save Expense'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
