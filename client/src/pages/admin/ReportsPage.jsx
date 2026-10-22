import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { Download, FileText, Printer } from 'lucide-react';
import DataTable from '../../components/admin/DataTable';
import LoadingSpinner from '../../components/admin/LoadingSpinner';
import Pagination from '../../components/admin/Pagination';
import { useAuth } from '../../context/AuthContext';
import { downloadReportExport, getReport, getReportTypes } from '../../services/adminApi';
import './AdminPages.css';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { getWoodTypes } from '../../services/adminApi';
import { useLanguage } from '../../context/LanguageContext';
import { getLocalizedWoodName } from '../../i18n/woodSpecies';

const today = new Date().toISOString().slice(0, 10);
const yearStart = `${new Date().getFullYear()}-01-01`;
const DATE_FREE_REPORTS = new Set(['raw-inventory', 'finished-inventory', 'low-stock']);
const PRODUCT_REPORTS = new Set(['sales-products', 'raw-inventory', 'finished-inventory', 'low-stock']);
const STATUS_OPTIONS = {
  'low-stock': ['All', 'Low Stock', 'In Stock', 'Reserved', 'Consumed', 'Quarantine'],
  'cutting-output': ['All', 'customer_order', 'internal_production'],
  'cutting-charges': ['All', 'customer_order', 'internal_production'],
  'customer-balances': ['All', 'unpaid', 'partially_paid'],
  'supplier-obligations': ['All', 'ordered', 'received'],
  'delivery-status': ['All', 'scheduled', 'dispatched', 'delivered', 'failed'],
  'enquiry-conversion': ['All', 'new', 'qualified', 'in_progress', 'converted', 'closed']
};
const CHART_METRICS = {
  'sales-periods': 'sales',
  'sales-products': 'product_sales',
  'purchases-suppliers': 'total_purchased',
  'raw-inventory': 'inventory_value',
  'finished-inventory': 'inventory_value',
  'low-stock': 'available',
  'cutting-output': 'output_total_volume',
  'cutting-charges': 'total_charges',
  'customer-balances': 'outstanding',
  'supplier-obligations': 'outstanding',
  'operating-expenses': 'total',
  'enquiry-conversion': 'enquiry_count'
};
const SUMMARY_METRICS = {
  'sales-periods': ['sales', 'order_count'],
  'operating-expenses': ['total_expenses', 'expense_count'],
  profitability: ['net_sales', 'cost_of_goods_sold', 'gross_margin', 'estimated_net_operating_profit'],
  'enquiry-conversion': ['enquiry_count', 'converted_count', 'conversion_rate']
};
const REPORT_TEXT = {
  'sales-periods': ['Sales by Date', 'Total sales from completed customer orders, before tax.'],
  'sales-products': ['Sales by Wood Type', 'Sales quantity and value for each wood product.'],
  'purchases-suppliers': ['Wood Purchases by Seller', 'Wood purchases received, amount paid and money still to pay.'],
  'raw-inventory': ['Raw Wood Stock', 'Raw wood owned by the mill and its recorded value.'],
  'finished-inventory': ['Finished Wood Stock', 'Finished wood owned by the mill and its recorded value.'],
  'low-stock': ['Wood Stock Running Low', 'Wood batches at or below their minimum stock level.'],
  'cutting-output': ['Wood Cutting Results', 'Wood used, wood produced and waste from completed jobs.'],
  'cutting-charges': ['Wood Cutting Costs', 'Charges recorded for completed cutting jobs.'],
  'customer-balances': ['Money to Collect', 'Unpaid amounts on open customer invoices.'],
  'supplier-obligations': ['Money to Pay Wood Sellers', 'Amounts due for ordered or received wood purchases.'],
  'operating-expenses': ['Business Costs', 'Recorded business costs.'],
  profitability: ['Sales and Estimated Profit', 'Sales less recorded wood costs and business costs.'],
  'delivery-status': ['Delivery Details', 'Customer orders and their delivery dates and status.'],
  'enquiry-conversion': ['Customer Enquiries', 'Website enquiries grouped by their current status.']
};
const COLUMN_LABELS = {
  period: 'Period', order_count: 'Number of Orders', sales: 'Total Sales',
  product_name: 'Wood Product', species: 'Wood Type', unit: 'Unit',
  quantity: 'Quantity', product_sales: 'Sales Amount', supplier: 'Wood Seller',
  purchase_count: 'Number of Purchases', total_purchased: 'Purchase Cost',
  paid_amount: 'Amount Paid', outstanding: 'Money to Collect',
  batch_code: 'Batch Number', name: 'Wood Name', grade: 'Grade',
  on_hand: 'Total Stock', available: 'Available Stock', reserved: 'Reserved Stock',
  cost_price: 'Cost per Unit', inventory_value: 'Wood Stock Value',
  status: 'Status', timber_type: 'Wood Type', min_stock_threshold: 'Low Stock Level',
  job_number: 'Work Number', job_title: 'Work Name', job_type: 'Work Type',
  completion_date: 'Date Completed', input_total_volume: 'Wood Used',
  output_total_volume: 'Wood Produced', waste_volume: 'Waste',
  recovery_rate: 'Wood Recovery Rate', rate_per_cbf: 'Rate per CFT',
  labour_charges: 'Labour Cost', total_charges: 'Total Cost',
  customer: 'Customer', company_name: 'Business Name', invoice_count: 'Number of Invoices',
  invoiced: 'Invoice Total', total_cost: 'Purchase Cost', category: 'Type',
  expense_count: 'Number of Costs', total_expenses: 'Total Business Costs',
  conversion_rate: 'Enquiry Conversion Rate', converted_count: 'Enquiries Accepted',
  total: 'Total Cost', net_sales: 'Total Sales',
  cost_of_goods_sold: 'Wood Cost', gross_margin: 'Sales Margin',
  operating_expenses: 'Business Costs', estimated_net_operating_profit: 'Estimated Profit',
  costing_method: 'Cost Method', cost_complete: 'Cost Details Complete?',
  legacy_estimated_line_count: 'Older Sales Estimated', uncosted_line_count: 'Sales Missing Cost',
  delivery_number: 'Delivery Number', order_number: 'Order Number',
  planned_delivery_date: 'Planned Delivery Date', vehicle_info: 'Vehicle',
  driver_name: 'Driver', delivered_at: 'Date Delivered', failure_reason: 'Reason',
  enquiry_count: 'Number of Enquiries'
};

function formatCell(column, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (/(^|_)(date|at)$|date$/i.test(column)) return formatDate(value);
  if (['conversion_rate', 'recovery_rate'].includes(column)) return `${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;
  if (typeof value === 'number' || (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value))) {
    const number = Number(value);
    if (/(sales|cost|margin|profit|expenses|outstanding|invoiced|paid|total|value|charges|price|amount)/i.test(column)) {
      return formatCurrency(number);
    }
    return number.toLocaleString('en-IN', { maximumFractionDigits: 3 });
  }
  if (typeof value === 'boolean' || value === 0 || value === 1) return value ? 'Yes' : 'No';
  return String(value);
}

export default function ReportsPage() {
  const { t, language } = useLanguage();
  const { currentUser } = useAuth();
  const canView = currentUser?.permissions?.includes('view_reports');
  const [types, setTypes] = useState([]);
  const [woodTypes, setWoodTypes] = useState([]);
  const [type, setType] = useState('sales-periods');
  const [report, setReport] = useState(null);
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(today);
  const [period, setPeriod] = useState('monthly');
  const [product, setProduct] = useState('');
  const [status, setStatus] = useState('All');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!canView) return;
    getReportTypes()
      .then(items => setTypes(items.map(item => {
        const [title, description] = REPORT_TEXT[item.id] || [];
        return { ...item, title: title || item.title, description: description || item.description };
      })))
      .catch(err => setError(err.message || 'Could not load the report list. Please try again.'));
  }, [canView]);

  useEffect(() => {
    getWoodTypes().then(setWoodTypes).catch((error) => {
      console.error('Could not load wood names for reports:', error);
    });
  }, []);

  const params = useMemo(() => ({
    from: DATE_FREE_REPORTS.has(type) ? '' : from,
    to: DATE_FREE_REPORTS.has(type) ? '' : to,
    period: type === 'sales-periods' ? period : undefined,
    product: PRODUCT_REPORTS.has(type) ? product.trim() : '',
    status: STATUS_OPTIONS[type] && status !== 'All' ? status : '',
    limit: pageSize,
    offset: (page - 1) * pageSize
  }), [type, from, to, period, product, status, page, pageSize]);

  const loadReport = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');
    try {
      setReport(await getReport(type, params));
    } catch (err) {
      setReport(null);
      setError(err.message || 'Could not load this report. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [canView, type, params]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const activeType = types.find(item => item.id === type);
  const chart = useMemo(() => {
    if (!report?.items?.length) return null;
    if (type === 'profitability') return null;
    const categoryKey = report.columns.find(key => typeof report.items[0][key] === 'string');
    const preferredMetric = CHART_METRICS[type];
    const valueKey = (preferredMetric && typeof report.items[0][preferredMetric] === 'number' ? preferredMetric : null) ||
      report.columns.find(key => typeof report.items[0][key] === 'number' &&
        !['id', 'order_count', 'purchase_count', 'expense_count', 'enquiry_count', 'converted_count', 'quantity'].includes(key));
    if (!categoryKey || !valueKey) return null;
    return {
      categoryKey,
      valueKey,
      data: report.items.slice(0, 20).map((row) => row.wood_type_id
        ? { ...row, [categoryKey]: getLocalizedWoodName(
          woodTypes.find((wood) => Number(wood.id) === Number(row.wood_type_id)), t, language
        ) }
        : row)
    };
  }, [report, type, woodTypes, t, language]);

  const handleExport = async format => {
    setExporting(true);
    setError('');
    try {
      const file = await downloadReportExport(type, format, params);
      const href = URL.createObjectURL(file.blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    } catch (err) {
      setError(err.message || 'Could not download the report. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  if (!canView) {
    return <div className="admin-inline-error" role="alert">You do not have permission to view or export reports.</div>;
  }

  const columns = (report?.columns || []).map(key => ({
    key,
    label: COLUMN_LABELS[key] || key.replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase()),
    sortable: true,
    render: (value, row) => key === 'species' && row.wood_type_id
      ? getLocalizedWoodName(woodTypes.find((wood) => Number(wood.id) === Number(row.wood_type_id)), t, language)
      : formatCell(key, value)
  }));
  const summaryMetrics = SUMMARY_METRICS[type] || [];
  const summaryEntries = summaryMetrics
    .filter(key => report?.summary?.[key] !== null && report?.summary?.[key] !== undefined)
    .map(key => [COLUMN_LABELS[key] || key.replaceAll('_', ' '), key, report.summary[key]]);

  return (
    <div className="admin-subpage">
      <div className="admin-subpage-header">
        <div className="admin-subpage-header__left">
          <h1 className="admin-subpage-title">Business Reports</h1>
          <p className="admin-subpage-subtitle">
            Check sales, wood stock, purchases, cutting work and money to collect.
          </p>
        </div>
        <div className="admin-subpage-header__actions">
          <button type="button" className="btn btn-outline" onClick={() => window.print()}><Printer size={15} /> Print</button>
          <button type="button" className="btn btn-outline" disabled={loading || exporting} onClick={() => handleExport('pdf')}><FileText size={15} /> PDF</button>
          <button type="button" className="btn btn-primary" disabled={loading || exporting} onClick={() => handleExport('csv')}><Download size={15} /> CSV</button>
        </div>
      </div>

      <section className="card" style={{ padding: '1rem', marginBottom: '1rem' }} aria-label="Report filters">
        <div className="admin-form-grid">
          <div className="admin-form-group">
            <label className="admin-form-label" htmlFor="report-type">Report</label>
            <select id="report-type" className="admin-form-select" value={type} onChange={event => {
              setType(event.target.value);
              setPage(1);
              setStatus('All');
              setProduct('');
            }}>
              {types.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </div>
          {!DATE_FREE_REPORTS.has(type) && (
            <>
              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="report-from">From</label>
                <input id="report-from" className="admin-form-input" type="date" value={from} max={to} onChange={event => { setFrom(event.target.value); setPage(1); }} />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label" htmlFor="report-to">To</label>
                <input id="report-to" className="admin-form-input" type="date" value={to} min={from} max={today} onChange={event => { setTo(event.target.value); setPage(1); }} />
              </div>
            </>
          )}
          {type === 'sales-periods' && (
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="sales-period">Show sales by</label>
              <select id="sales-period" className="admin-form-select" value={period} onChange={event => { setPeriod(event.target.value); setPage(1); }}>
                <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
              </select>
            </div>
          )}
          {PRODUCT_REPORTS.has(type) && (
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="report-product">Product / Wood Type</label>
              <input id="report-product" className="admin-form-input" value={product} maxLength={120} onChange={event => { setProduct(event.target.value); setPage(1); }} placeholder="Search product or species" />
            </div>
          )}
          {STATUS_OPTIONS[type] && (
            <div className="admin-form-group">
              <label className="admin-form-label" htmlFor="report-status">Status / Category</label>
              <select id="report-status" className="admin-form-select" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
                {STATUS_OPTIONS[type].map(option => <option key={option} value={option}>{option === 'All' ? 'All' : option.replaceAll('_', ' ')}</option>)}
              </select>
            </div>
          )}
        </div>
      </section>

      {error && <div className="admin-inline-error" role="alert">{error}</div>}
      {activeType && <p className="admin-subpage-subtitle" style={{ margin: '0 0 1rem' }}>{activeType.description}</p>}
      {type === 'profitability' && (
        <p className="admin-inline-notice" role="note">
        This report counts older wood stock as sold first. Some older sales may use an estimated wood cost. The profit estimate subtracts recorded business costs from sales margin. It does not include wages, taxes, cutting charges or invoices that are not recorded.
        </p>
      )}

      {loading && <LoadingSpinner message="Loading report..." />}
      {!loading && report && (
        <>
          {summaryEntries.length > 0 && (
            <div className="dashboard-stats-grid" style={{ marginBottom: '1rem' }}>
              {summaryEntries.map(([label, key, value]) => (
                  <div className="card" key={key} style={{ padding: '1rem' }}>
                    <div className="admin-subpage-subtitle">{label}</div>
                    <strong style={{ fontSize: '1.25rem' }}>{formatCell(key, value)}</strong>
                  </div>
                ))}
            </div>
          )}

          {chart && (
            <div className="card dashboard-card" style={{ height: 310, padding: '1rem', marginBottom: '1rem' }}>
              <h2 className="dashboard-card__title">{activeType?.title} chart</h2>
              <ResponsiveContainer width="100%" height="85%">
                <BarChart data={chart.data} margin={{ top: 12, right: 12, left: 4, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey={chart.categoryKey} angle={-20} textAnchor="end" interval={0} height={55} />
                  <YAxis tickFormatter={value => formatCell(chart.valueKey, value)} />
                  <Tooltip formatter={value => formatCell(chart.valueKey, value)} />
                  <Bar dataKey={chart.valueKey} fill="#193826" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <DataTable
            columns={columns}
            data={report.items || []}
            keyField="id"
            emptyTitle="No report rows"
            emptyMessage="No database records match the selected date range and filters."
          />
          <Pagination
            currentPage={page}
            totalPages={Math.max(1, Math.ceil(Number(report.total || 0) / pageSize))}
            totalItems={Number(report.total || 0)}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={size => { setPageSize(size); setPage(1); }}
          />
        </>
      )}
    </div>
  );
}
