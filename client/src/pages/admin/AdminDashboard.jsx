import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  DollarSign,
  TrendingUp,
  Boxes,
  ClipboardList,
  AlertOctagon,
  FileText,
  Clock,
  ArrowUpRight,
  Plus,
  RefreshCw,
  Scissors,
  AlertTriangle,
  PackagePlus,
  ShoppingCart,
  HandCoins,
  UserRoundPlus,
  CreditCard,
  Receipt
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import StatCard from '../../components/admin/StatCard';
import DataTable from '../../components/admin/DataTable';
import LoadingSpinner from '../../components/admin/LoadingSpinner';
import { getDashboardOverview } from '../../services/adminApi';
import { formatCurrency } from '../../utils/formatters';
import './AdminDashboard.css';

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');

  const fetchOverview = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const overview = await getDashboardOverview();
      setData(overview);
    } catch (err) {
      setLoadError(err.message || 'Could not load the business summary. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  if (loading) {
    return <LoadingSpinner size="lg" message="Loading Sawmill Command Center..." />;
  }
  if (!data) {
    return (
      <div className="admin-subpage">
          <div className="admin-inline-error" role="alert">{loadError || 'Business summary is not available.'}</div>
          <button type="button" className="btn btn-outline" onClick={fetchOverview}><RefreshCw size={15} /> Try again</button>
      </div>
    );
  }

  const {
    stats,
    salesTrend,
    speciesRecovery,
    lowStockAlerts,
    recentOrders,
    pendingCuttingJobs,
    recentPayments,
    recentActivity
  } = data;

  // Columns for Recent Orders DataTable
  const orderColumns = [
    {
      key: 'id',
      label: 'Order #',
      render: (val) => <strong className="admin-text-forest">{val}</strong>
    },
    { key: 'customer', label: 'Customer Name' },
    { key: 'species', label: 'Wood Type' },
    {
      key: 'totalAmount',
      label: 'Total Value',
      render: (val) => formatCurrency(val)
    },
    {
      key: 'paymentStatus',
      label: 'Payment',
      render: (val) => (
        <span
          className={`badge ${
            val === 'Paid' ? 'badge-success' : 'badge-warning'
          }`}
        >
          {val}
        </span>
      )
    },
    {
      key: 'fulfillmentStatus',
      label: 'Order Status',
      render: (val) => {
        let badgeClass = 'badge-info';
        if (val === 'Delivered') badgeClass = 'badge-success';
        if (val === 'Cutting In Progress') badgeClass = 'badge-warning';
        return <span className={`badge ${badgeClass}`}>{val}</span>;
      }
    }
  ];

  return (
    <div className="admin-dashboard-page">
      {/* Page Header */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Business Summary</h1>
          <p className="admin-page-subtitle">
            See today’s sales, wood stock, orders and work at the mill.
          </p>
        </div>

        <div className="admin-page-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={fetchOverview}
            title="Refresh business summary"
          >
            <RefreshCw size={15} />
            <span>Refresh</span>
          </button>
          <Link to="/admin/cutting-jobs" className="btn btn-primary">
            <Plus size={16} />
            <span>Add Cutting Work</span>
          </Link>
        </div>
      </div>
      {loadError && <div className="admin-inline-error" role="alert">{loadError}</div>}

      <section className="dashboard-quick-actions" aria-label="Common actions">
        <h2 className="dashboard-section__title">Common actions</h2>
        <div className="dashboard-quick-actions__grid">
          {[
            { label: 'Add Inventory', to: '/admin/inventory', icon: PackagePlus },
            { label: 'Buy Wood', to: '/admin/purchases', icon: ShoppingCart },
            { label: 'Sell Wood', to: '/admin/sales-orders', icon: HandCoins },
            { label: 'Cut Wood', to: '/admin/cutting-jobs', icon: Scissors },
            { label: 'Add Customer', to: '/admin/customers', icon: UserRoundPlus },
            { label: 'Receive Payment', to: '/admin/payments', icon: CreditCard },
            { label: 'Print Bill', to: '/admin/invoices', icon: Receipt },
            { label: 'View Stock', to: '/admin/inventory', icon: Boxes }
          ].map(({ label, to, icon: Icon }) => (
            <Link key={label} to={to} className="dashboard-quick-action">
              <Icon size={22} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* 1. SIX MANDATORY DASHBOARD STAT CARDS */}
      <section className="dashboard-stats-grid" aria-label="Business summary">
        <StatCard
          title="Today's Sales"
          value={formatCurrency(stats.todaySales.value)}
          subtitle="Sales saved today"
          icon={DollarSign}
          variant="forest"
        />

        <StatCard
          title="Sales This Month"
          value={formatCurrency(stats.monthlySales.value)}
          subtitle="Sales saved this month"
          icon={TrendingUp}
          variant="emerald"
        />

        <StatCard
          title="Value of Wood Stock"
          value={formatCurrency(stats.totalInventoryValue.value)}
          subtitle="Wood owned by the mill"
          icon={Boxes}
          variant="wood"
        />

        <StatCard
          title="Orders to Process"
          value={stats.pendingOrders.formatted}
          subtitle="Orders waiting for the next step"
          icon={ClipboardList}
          variant="blue"
        />

        <StatCard
          title="Invoices to Pay"
          value={stats.unpaidInvoices.formatted}
          subtitle="Invoices with money to collect"
          icon={FileText}
          variant="amber"
        />

        <StatCard
          title="Wood Stock Running Low"
          value={stats.lowStockItems.formatted}
          subtitle="Wood batches running low"
          icon={AlertOctagon}
          variant="danger"
        />
      </section>

      {/* 2. SALES TREND CHART & SPECIES YIELD RECOVERY */}
      <div className="dashboard-grid-2col">
        {/* Sales Trend Chart */}
        <div className="card dashboard-card">
          <div className="dashboard-card__header">
            <div>
              <h2 className="dashboard-card__title">Sales Over the Last 12 Months</h2>
              <p className="dashboard-card__desc">
                Total sales from completed orders
              </p>
            </div>
            <span className="badge badge-success">Orders completed</span>
          </div>

          {salesTrend.length > 0 ? <div className="dashboard-chart-wrapper">
            <ResponsiveContainer width="100%" height={290}>
              <AreaChart data={salesTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#193826" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#193826" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8e4" />
                <XAxis dataKey="month" tickLine={false} stroke="#7d8c83" fontSize={12} />
                <YAxis
                  tickLine={false}
                  stroke="#7d8c83"
                  fontSize={12}
                  tickFormatter={(value) => `${formatCurrency(value)}`}
                />
                <Tooltip
                  formatter={(value) => [formatCurrency(value), 'Total Sales']}
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderRadius: '8px',
                    border: '1px solid #e2e8e4',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#193826"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#revenueGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div> : <p className="admin-subpage-subtitle">No completed sales orders in the last 12 months.</p>}
        </div>

        {/* Species Yield & Recovery Rate Breakdown */}
        <div className="card dashboard-card">
          <div className="dashboard-card__header">
            <div>
              <h2 className="dashboard-card__title">Wood Cutting Results</h2>
              <p className="dashboard-card__desc">
                Wood sent for cutting and the amount of sawn wood produced
              </p>
            </div>
            <Link to="/admin/reports" className="admin-card-link">
              See Cutting Reports &rarr;
            </Link>
          </div>

          {speciesRecovery.length > 0 ? <div className="yield-recovery-list">
            {speciesRecovery.map((item) => (
              <div key={item.species} className="yield-recovery-item">
                <div className="yield-recovery-item__info">
                  <span className="yield-recovery-item__species">{item.species}</span>
                  <span className="yield-recovery-item__rate">{item.recoveryRate}% wood recovered</span>
                </div>
                <div className="yield-recovery-item__bar-bg">
                  <div
                    className="yield-recovery-item__bar-fill"
                    style={{
                      width: `${item.recoveryRate}%`,
                      backgroundColor:
                        item.recoveryRate > 70
                          ? '#16a34a'
                          : item.recoveryRate > 64
                          ? '#28543b'
                          : '#d97706'
                    }}
                  />
                </div>
                <div className="yield-recovery-item__meta">
                  <span>Wood used: {item.logsInCFT} CFT</span>
                  <span>Wood produced: {item.sawnCFT} CFT</span>
                </div>
              </div>
            ))}
          </div> : <p className="admin-subpage-subtitle">No completed cutting jobs have recorded recovery data.</p>}
        </div>
      </div>

      {/* 3. RECENT ORDERS TABLE */}
      <div className="dashboard-section">
        <div className="dashboard-section__header">
          <div>
            <h2 className="dashboard-section__title">Recent Customer Orders</h2>
            <p className="dashboard-section__desc">
              The latest orders added to the system.
            </p>
          </div>
          <Link to="/admin/sales-orders" className="btn btn-outline" style={{ padding: '0.45rem 0.95rem' }}>
            <span>See All Orders</span>
            <ArrowUpRight size={15} />
          </Link>
        </div>

        <DataTable
          columns={orderColumns}
          data={recentOrders}
          keyField="id"
        />
      </div>

      {/* 4. THREE COLUMNS: LOW-STOCK ALERTS, PENDING CUTTING JOBS, RECENT PAYMENTS */}
      <div className="dashboard-grid-3col">
        {/* Low-Stock Alerts */}
        <div className="card dashboard-card">
          <div className="dashboard-card__header">
            <div className="dashboard-card__title-wrap">
              <AlertTriangle size={18} className="text-warning" />
              <h2 className="dashboard-card__title">Low-Stock Alerts</h2>
            </div>
            <Link to="/admin/inventory" className="admin-card-link">
              Inventory &rarr;
            </Link>
          </div>

          {lowStockAlerts.length > 0 ? <div className="alerts-list">
            {lowStockAlerts.map((item) => (
              <div key={item.id} className="alert-card-item">
                <div className="alert-card-item__top">
                  <strong className="alert-card-item__species">{item.species}</strong>
                  <span
                    className={`badge ${
                      item.urgency === 'Critical' ? 'badge-danger' : 'badge-warning'
                    }`}
                  >
                    {item.urgency}
                  </span>
                </div>
                <div className="alert-card-item__details">
                  <span>Current: <strong>{item.currentStock}</strong></span>
                  <span>Min: <strong>{item.minThreshold}</strong></span>
                </div>
                <Link to="/admin/purchases" className="btn btn-wood alert-card-item__reorder-btn">Open Purchasing</Link>
              </div>
            ))}
          </div> : <p className="admin-subpage-subtitle">No batches are below their minimum stock thresholds.</p>}
        </div>

        {/* Pending Cutting Jobs */}
        <div className="card dashboard-card">
          <div className="dashboard-card__header">
            <div className="dashboard-card__title-wrap">
              <Scissors size={18} className="text-forest" />
              <h2 className="dashboard-card__title">Wood Cutting Work</h2>
            </div>
            <Link to="/admin/cutting-jobs" className="admin-card-link">
              See All Work &rarr;
            </Link>
          </div>

          {pendingCuttingJobs.length > 0 ? <div className="cutting-jobs-mini-list">
            {pendingCuttingJobs.map((job) => (
              <div key={job.id} className="cutting-job-mini-item">
                <div className="cutting-job-mini-item__head">
                  <strong className="cutting-job-mini-item__id">{job.id}</strong>
                  <span
                    className={`badge ${
                      job.status === 'In Progress'
                        ? 'badge-info'
                        : job.status === 'Pending'
                        ? 'badge-warning'
                        : 'badge-success'
                    }`}
                  >
                    {job.status}
                  </span>
                </div>
                <div className="cutting-job-mini-item__title">{job.jobTitle}</div>
                <div className="cutting-job-mini-item__meta">
                  <span>{job.sawLine}</span>
                  <span>Op: {job.operator}</span>
                </div>
                <div className="cutting-job-mini-item__sub">
                  <span>{job.cuttingSpec}</span>
                </div>
              </div>
            ))}
          </div> : <p className="admin-subpage-subtitle">No open cutting jobs.</p>}
        </div>

        {/* Recent Payments */}
        <div className="card dashboard-card">
          <div className="dashboard-card__header">
            <div className="dashboard-card__title-wrap">
              <DollarSign size={18} className="text-emerald" />
              <h2 className="dashboard-card__title">Recent Payments</h2>
            </div>
            <Link to="/admin/payments" className="admin-card-link">
              See All Payments &rarr;
            </Link>
          </div>

          {recentPayments.length > 0 ? <div className="payments-mini-list">
            {recentPayments.map((pay) => (
              <div key={pay.id} className="payment-mini-item">
                <div className="payment-mini-item__left">
                  <strong className="payment-mini-item__customer">{pay.customer}</strong>
                  <span className="payment-mini-item__method">
                    {pay.method} • {pay.transactionRef}
                  </span>
                </div>
                <div className="payment-mini-item__right">
                  <span className="payment-mini-item__amount">
                    {Number(pay.amount) < 0 ? '−' : '+'}{formatCurrency(Math.abs(Number(pay.amount)))}
                  </span>
                  <span className={`badge ${pay.status === 'Reversed' ? 'badge-danger' : 'badge-success'} payment-mini-item__status`}>
                    {pay.status}
                  </span>
                </div>
              </div>
            ))}
          </div> : <p className="admin-subpage-subtitle">No customer payments recorded.</p>}
        </div>
      </div>

      {/* 5. RECENT ACTIVITY TIMELINE */}
      <div className="card dashboard-card dashboard-activity-card">
        <div className="dashboard-card__header">
          <div className="dashboard-card__title-wrap">
            <Clock size={18} className="text-forest" />
            <h2 className="dashboard-card__title">Recent Sales Order Activity</h2>
          </div>
          <span className="dashboard-card__desc">Recent sales order history</span>
        </div>

        {recentActivity.length > 0 ? <div className="activity-timeline">
          {recentActivity.map((act) => (
            <div key={act.id} className="activity-timeline-item">
              <div className="activity-timeline-item__marker" />
              <div className="activity-timeline-item__content">
                <div className="activity-timeline-item__header">
                  <strong className="activity-timeline-item__user">{act.user}</strong>
                  <span className="activity-timeline-item__role">({act.role})</span>
                  <span className="activity-timeline-item__badge badge badge-info">
                    {act.badge}
                  </span>
                  <span className="activity-timeline-item__time">{act.timestamp}</span>
                </div>
                <p className="activity-timeline-item__action">{act.action}</p>
              </div>
            </div>
          ))}
        </div> : <p className="admin-subpage-subtitle">No recent sales-order activity.</p>}
      </div>

    </div>
  );
}
