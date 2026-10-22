'use strict';

const reportRepository = require('../repositories/reportRepository');
const AppError = require('../utils/AppError');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REPORTS = {
  'sales-periods': {
    title: 'Sales by Period',
    description: 'Completed sales orders, excluding sales tax. Net sales are subtotal less discounts plus shipping.',
    columns: ['period', 'order_count', 'sales'],
  },
  'sales-products': {
    title: 'Sales by Product and Wood Type',
    description: 'Completed order line sales after line discounts and tax exclusion; order-level discounts are not allocated to individual products.',
    columns: ['product_name', 'species', 'unit', 'order_count', 'quantity', 'product_sales'],
  },
  'purchases-suppliers': {
    title: 'Purchases by Supplier',
    description: 'Received purchase order total costs, paid amounts, and remaining obligations.',
    columns: ['supplier', 'purchase_count', 'total_purchased', 'paid_amount', 'outstanding'],
  },
  'raw-inventory': {
    title: 'Raw Log Inventory',
    description: 'Current mill-owned raw log on-hand quantity and value at recorded batch cost.',
    columns: ['batch_code', 'name', 'species', 'grade', 'on_hand', 'available', 'reserved', 'unit', 'cost_price', 'inventory_value', 'status'],
  },
  'finished-inventory': {
    title: 'Finished Timber Inventory',
    description: 'Current mill-owned sawn timber on-hand quantity and value at recorded batch cost.',
    columns: ['batch_code', 'name', 'species', 'grade', 'on_hand', 'available', 'reserved', 'unit', 'cost_price', 'inventory_value', 'status'],
  },
  'low-stock': {
    title: 'Low-Stock Batches',
    description: 'Mill-owned batches whose available quantity is at or below their configured minimum threshold.',
    columns: ['batch_code', 'name', 'species', 'timber_type', 'grade', 'available', 'min_stock_threshold', 'unit', 'status'],
  },
  'cutting-output': {
    title: 'Cutting Output and Waste',
    description: 'Completed jobs only. Waste is recorded input volume less recorded output volume.',
    columns: ['job_number', 'job_title', 'job_type', 'completion_date', 'input_total_volume', 'output_total_volume', 'waste_volume', 'recovery_rate'],
  },
  'cutting-charges': {
    title: 'Cutting Job Charges',
    description: 'Recorded charges from completed cutting jobs; charges are not included in sales-order revenue or margin.',
    columns: ['job_number', 'job_title', 'job_type', 'completion_date', 'rate_per_cbf', 'labour_charges', 'total_charges'],
  },
  'customer-balances': {
    title: 'Customer Outstanding Balances',
    description: 'Open, non-voided invoices. Each invoice balance is counted once from its authoritative amount_due.',
    columns: ['customer', 'company_name', 'invoice_count', 'invoiced', 'paid', 'outstanding'],
  },
  'supplier-obligations': {
    title: 'Supplier Payment Obligations',
    description: 'Ordered or received purchases, excluding cancelled orders. Outstanding is purchase total_cost less recorded paid_amount; payment ledger rows are not added again.',
    columns: ['supplier', 'purchase_count', 'total_cost', 'paid_amount', 'outstanding'],
  },
  'operating-expenses': {
    title: 'Operating Expenses',
    description: 'Posted expense entries only. Reversed expenses are excluded.',
    columns: ['category', 'expense_count', 'total'],
  },
  profitability: {
    title: 'Gross Margin and Estimated Net Operating Profit',
    description: 'Net sales from completed orders less fulfillment snapshots or recorded batch cost; estimated net operating profit also subtracts posted operating expenses. Taxes and invoice payments are excluded. Legacy sales without fulfillment snapshots are flagged.',
    columns: ['net_sales', 'cost_of_goods_sold', 'gross_margin', 'operating_expenses', 'estimated_net_operating_profit', 'costing_method', 'cost_complete', 'legacy_estimated_line_count', 'uncosted_line_count'],
  },
  'delivery-status': {
    title: 'Delivery Status',
    description: 'Delivery records filtered by planned delivery date; status history remains available in the delivery module.',
    columns: ['delivery_number', 'order_number', 'customer', 'planned_delivery_date', 'status', 'vehicle_info', 'driver_name', 'delivered_at', 'failure_reason'],
  },
  'enquiry-conversion': {
    title: 'Public Enquiry Conversion',
    description: 'Enquiries grouped by current status. Conversion is status=converted divided by all matching enquiries.',
    columns: ['status', 'enquiry_count', 'converted_count'],
  },
};

function validateDate(value, name) {
  const date = typeof value === 'string' && DATE_RE.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new AppError(`${name} must be a valid YYYY-MM-DD date.`, 400, 'VALIDATION_ERROR');
  }
}

function normalizeFilters(input = {}, exportAll = false) {
  if (input.from) validateDate(input.from, 'from');
  if (input.to) validateDate(input.to, 'to');
  if (input.from && input.to && input.from > input.to) {
    throw new AppError('from cannot be after to.', 400, 'VALIDATION_ERROR');
  }
  const period = input.period || 'monthly';
  if (!['daily', 'weekly', 'monthly'].includes(period)) {
    throw new AppError('period must be daily, weekly, or monthly.', 400, 'VALIDATION_ERROR');
  }
  const parsedLimit = Number.parseInt(input.limit, 10);
  const limit = exportAll
    ? Math.min(10000, Math.max(1, parsedLimit || 10000))
    : Math.min(200, Math.max(1, parsedLimit || 25));
  const parsedOffset = Number.parseInt(input.offset, 10);
  const offset = Math.min(10000000, Math.max(0, parsedOffset || 0));
  return {
    from: input.from || '',
    to: input.to || '',
    period,
    product: String(input.product || '').trim().slice(0, 120),
    status: String(input.status || '').trim().slice(0, 40),
    limit,
    offset,
  };
}

function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (
    typeof value === 'string' &&
    /^[\t\r ]*[=+\-@]/.test(text) &&
    !/^-?(?:\d+\.?\d*|\.\d+)$/.test(text)
  ) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

class ReportService {
  listTypes() {
    return Object.entries(REPORTS).map(([id, report]) => ({
      id,
      title: report.title,
      description: report.description,
      columns: report.columns,
    }));
  }

  async getReport(type, input = {}, exportAll = false) {
    const definition = REPORTS[type];
    if (!definition) throw new AppError('Unknown report type.', 404, 'REPORT_NOT_FOUND');
    const filters = normalizeFilters(input, exportAll);
    const result = await reportRepository.getReport(type, filters);
    return {
      type,
      title: definition.title,
      description: definition.description,
      columns: definition.columns,
      ...result,
      page: Math.floor(filters.offset / filters.limit) + 1,
      limit: filters.limit,
      offset: filters.offset,
    };
  }

  async dashboard() {
    const data = await reportRepository.dashboard();
    const money = value => new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
    const count = value => Number(value || 0).toLocaleString('en-US');
    const stats = data.stats;
    return {
      stats: {
        todaySales: { value: Number(stats.today_sales || 0), formatted: money(stats.today_sales), subtitle: 'Completed sales orders today' },
        monthlySales: { value: Number(stats.month_sales || 0), formatted: money(stats.month_sales), subtitle: 'Completed sales orders this month' },
        totalInventoryValue: { value: Number(stats.inventory_value || 0), formatted: money(stats.inventory_value), subtitle: 'Mill-owned on-hand stock at recorded batch cost' },
        pendingOrders: { value: Number(stats.pending_orders || 0), formatted: count(stats.pending_orders), subtitle: 'Draft, confirmed, or processing orders' },
        unpaidInvoices: { value: Number(stats.unpaid_invoices || 0), formatted: count(stats.unpaid_invoices), subtitle: 'Non-voided invoices with balance due' },
        lowStockItems: { value: Number(stats.low_stock_batches || 0), formatted: count(stats.low_stock_batches), subtitle: 'Batches at or below their minimum threshold' },
      },
      salesTrend: data.salesTrend.map(item => ({ month: item.month, revenue: Number(item.revenue || 0) })),
      speciesRecovery: data.speciesRecovery.map(item => ({
        species: item.species,
        logsInCFT: Number(item.logsInCFT || 0),
        sawnCFT: Number(item.sawnCFT || 0),
        recoveryRate: Number(item.recoveryRate || 0),
      })),
      lowStockAlerts: data.lowStockAlerts.map(item => ({
        id: item.id,
        sku: item.batch_code,
        species: item.species,
        grade: item.grade,
        currentStock: Number(item.current_stock || 0),
        minThreshold: Number(item.min_threshold || 0),
        unit: item.unit,
        urgency: Number(item.current_stock || 0) <= Number(item.min_threshold || 0) * 0.25 ? 'Critical' : 'Reorder',
      })),
      recentOrders: data.recentOrders.map(item => ({
        id: item.order_number,
        customer: item.customer,
        species: item.species || '—',
        totalAmount: Number(item.total_amount || 0),
        paymentStatus: item.payment_status.replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase()),
        fulfillmentStatus: item.status.replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase()),
      })),
      pendingCuttingJobs: data.pendingCuttingJobs.map(item => ({
        id: item.job_number,
        jobTitle: item.job_title,
        status: item.status.replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase()),
        sawLine: item.saw_line || '—',
        operator: item.operator_name || 'Unassigned',
        cuttingSpec: item.requested_dimensions,
      })),
      recentPayments: data.recentPayments.map(item => ({
        ...item,
        customer: item.customer,
        method: String(item.payment_method || '').replaceAll('_', ' '),
        transactionRef: item.transaction_reference || item.payment_number,
        amount: item.status === 'reversed' ? -Math.abs(Number(item.amount || 0)) : Number(item.amount || 0),
        currency: item.currency || 'USD',
        status: item.status === 'reversed' ? 'Reversed' : 'Posted',
      })),
      recentActivity: data.recentActivity.map(item => ({
        id: item.id,
        user: item.reference || 'Operations',
        role: 'Sales order',
        badge: item.action,
        timestamp: item.created_at,
        action: item.description || item.action,
      })),
    };
  }

  async exportCsv(type, input = {}) {
    const report = await this.getReport(type, { ...input, offset: 0, limit: 10000 }, true);
    const lines = [
      report.columns.map(csvCell).join(','),
      ...report.items.map(item => report.columns.map(column => csvCell(item[column])).join(',')),
    ];
    return { filename: `${type}-${report.from || input.from || 'all-dates'}-${report.to || input.to || 'all-dates'}.csv`, content: `\uFEFF${lines.join('\r\n')}` };
  }
}

module.exports = new ReportService();
