import { apiClient, apiRequest } from './apiClient';
import { formatNumber } from '../utils/formatters';

// ==========================================
// 1. DASHBOARD & OVERVIEW API
// ==========================================
export async function getDashboardOverview() {
  const result = await requestApi('/api/v1/reports/dashboard');
  return result.data;
}

// ==========================================
// 2. INVENTORY API (EXPRESS + MYSQL BACKEND INTEGRATION)
// ==========================================
async function requestApi(endpoint, options = {}) {
  const data = options.body === undefined
    ? undefined
    : typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
  return apiRequest({
    url: endpoint,
    method: options.method || 'GET',
    data,
    params: options.params,
    signal: options.signal,
    skipAuthRefresh: options.skipAuthRefresh
  });
}

function apiFilters(input, fields) {
  const params = {};
  if (input.search) params.search = input.search;
  for (const [source, target] of Object.entries(fields)) {
    if (input[source] && input[source] !== 'All') params[target] = input[source];
  }
  for (const key of ['from', 'to', 'limit', 'offset', 'page', 'customer_id', 'supplier_id']) {
    if (input[key] !== undefined && input[key] !== null && input[key] !== '') params[key] = input[key];
  }
  if (input.pageSize && !input.limit) params.limit = input.pageSize;
  return params;
}

export async function getInventory(params = {}) {
  const filters = apiFilters(params, {
    timberType: 'timberType', category: 'category', species: 'species',
    status: 'status', ownership: 'ownership'
  });
  const result = await requestApi('/api/v1/inventory', {
    params: { page: params.page || 1, limit: params.limit || params.pageSize || 200, ...filters }
  });
  return result.data?.items ?? [];
}

export async function getWoodTypes(params = {}) {
  const result = await requestApi('/api/v1/wood-types', { params });
  return result.data?.items ?? [];
}

export async function addWoodType(woodType) {
  const result = await requestApi('/api/v1/wood-types', { method: 'POST', body: woodType });
  return result.data;
}

export async function updateWoodType(id, woodType) {
  const result = await requestApi(`/api/v1/wood-types/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: woodType
  });
  return result.data;
}

export async function addInventoryItem(item) {
  const result = await requestApi('/api/v1/inventory', { method: 'POST', body: item });
  return result.data;
}

export async function updateInventoryItem(id, updates) {
  const result = await requestApi(`/api/v1/inventory/${encodeURIComponent(id)}`, { method: 'PATCH', body: updates });
  return result.data;
}

export async function deleteInventoryItem(id) {
  const result = await requestApi(`/api/v1/inventory/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!result.success) throw new Error('Inventory item was not deleted.');
  return true;
}

export async function getInventoryItemDetails(id) {
  const result = await requestApi(`/api/v1/inventory/${encodeURIComponent(id)}`);
  return result.data;
}

export async function recordStockReceipt(id, receiptData) {
  return await requestApi(`/api/v1/inventory/${id}/receipt`, {
    method: 'POST',
    body: receiptData,
  });
}

export async function recordStockIssue(id, issueData) {
  return await requestApi(`/api/v1/inventory/${id}/issue`, {
    method: 'POST',
    body: issueData,
  });
}

export async function recordStockAdjustment(id, adjustmentData) {
  return await requestApi(`/api/v1/inventory/${id}/adjust`, {
    method: 'POST',
    body: adjustmentData,
  });
}


// ==========================================
// 3. PURCHASES API (EXPRESS + MYSQL BACKEND INTEGRATION)
// ==========================================
function mapPurchaseFromBackend(p) {
  if (!p) return null;
  const firstItem = p.items && p.items.length > 0 ? p.items[0] : null;
  return {
    ...p,
    id: p.purchase_number || String(p.id),
    dbId: p.id,
    purchaseNumber: p.purchase_number,
    supplier: p.supplier_name || p.supplier || '',
    supplierId: p.supplier_id,
    supplierContact: p.supplier_contact || p.supplierContact || '',
    date: p.created_at ? p.created_at.split('T')[0] : (p.date || ''),
    deliveryDate: p.expected_delivery_date || p.deliveryDate || '',
    actualDeliveryDate: p.actual_delivery_date || null,
    status: p.status || 'draft',
    paymentStatus: p.payment_status === 'paid' ? 'Paid' : p.payment_status === 'partially_paid' ? 'Partial' : 'Pending',
    paymentMethod: p.payment_method || '',
    volume: p.total_volume_cbf ? `${formatNumber(p.total_volume_cbf)} CFT` : (p.volume || ''),
    logsCount: Number(p.total_pieces_count || p.logsCount || firstItem?.pieces_count || 0),
    species: firstItem?.species || p.species || '',
    pricePerCFT: firstItem ? Number(firstItem.unit_price) : Number(p.pricePerCFT || 0),
    totalCost: Number(p.total_cost || p.totalCost || 0),
    subtotal: Number(p.subtotal || 0),
    taxAmount: Number(p.tax_amount || 0),
    discountAmount: Number(p.discount_amount || 0),
    invoiceRef: p.invoice_ref || p.invoiceRef || '',
    inspectionStatus: p.inspection_status || '',
    receivedBy: p.received_by_username || p.receivedBy || '',
    items: p.items || [],
  };
}

export async function getPurchases(params = {}) {
  const result = await requestApi('/api/v1/purchases', {
    params: apiFilters(params, { status: 'status', paymentStatus: 'payment_status' })
  });
  return (result.data?.items || []).map(mapPurchaseFromBackend);
}

export async function getPurchaseDetails(id) {
  const result = await requestApi(`/api/v1/purchases/${encodeURIComponent(id)}`);
  return mapPurchaseFromBackend(result.data);
}

export async function addPurchaseOrder(po) {
  const result = await requestApi('/api/v1/purchases', { method: 'POST', body: po });
  return mapPurchaseFromBackend(result.data);
}

export async function receivePurchaseOrder(id, receiptData = {}) {
  const result = await requestApi(`/api/v1/purchases/${id}/receive`, {
    method: 'POST',
    body: receiptData,
  });
  return result;
}

// ==========================================
// 4. CUSTOMERS API (EXPRESS + MYSQL BACKEND INTEGRATION)
// ==========================================
function mapCustomerFromBackend(c) {
  if (!c) return null;
  return {
    ...c,
    id: c.id,
    displayId: `CUST-${String(c.id).padStart(2, '0')}`,
    name: c.name,
    contactPerson: c.contact_person || c.contactPerson || '',
    companyName: c.company_name || c.companyName || '',
    phone: c.phone || '',
    email: c.email || '',
    type: c.type || '',
    address: c.address || '',
    city: c.city || '',
    taxId: c.tax_gst_number || c.taxId || '',
    creditLimit: c.credit_limit == null && c.creditLimit == null ? null : Number(c.credit_limit ?? c.creditLimit),
    paymentTerms: c.payment_terms || c.paymentTerms || '',
    status: c.status || 'Active',
    ordersCount: Number(c.orders_count ?? c.ordersCount ?? 0),
    totalInvoiced: Number(c.total_invoiced ?? c.totalInvoiced ?? 0),
    totalPaid: Number(c.total_paid ?? c.totalPaid ?? 0),
    outstandingBalance: Number(c.outstanding_balance ?? c.outstandingBalance ?? 0),
    notes: c.notes || '',
  };
}

export async function getCustomers(params = {}) {
  const result = await requestApi('/api/v1/customers', { params: apiFilters(params, { status: 'status' }) });
  return (result.data?.items || []).map(mapCustomerFromBackend);
}

export async function getCustomerDetails(id) {
  const result = await requestApi(`/api/v1/customers/${encodeURIComponent(id)}`);
  return mapCustomerFromBackend(result.data);
}

export async function addCustomer(customer) {
  const result = await requestApi('/api/v1/customers', { method: 'POST', body: customer });
  return mapCustomerFromBackend(result.data);
}

export async function updateCustomer(id, updates) {
  const result = await requestApi(`/api/v1/customers/${encodeURIComponent(id)}`, { method: 'PATCH', body: updates });
  return mapCustomerFromBackend(result.data);
}

// ==========================================
// 5. SUPPLIERS API (EXPRESS + MYSQL BACKEND INTEGRATION)
// ==========================================
function mapSupplierFromBackend(s) {
  if (!s) return null;
  return {
    ...s,
    id: s.id,
    name: s.company_name || s.name,
    companyName: s.company_name || s.companyName,
    repName: s.rep_name || s.repName || '',
    phone: s.phone || '',
    email: s.email || '',
    region: s.region || '',
    specialty: s.specialty || '',
    paymentTerms: s.payment_terms || s.paymentTerms || '',
    status: s.status || 'Active',
    rating: s.rating == null ? null : Number(s.rating),
    purchasesCount: Number(s.purchases_count || 0),
    totalPurchased: Number(s.total_purchased || 0),
    balanceDue: Number(s.balance_due || 0),
    address: s.address || '',
    taxId: s.tax_id || s.taxId || '',
    notes: s.notes || '',
    purchases: s.purchases || [],
  };
}

export async function getSuppliers(params = {}) {
  const result = await requestApi('/api/v1/suppliers', {
    params: apiFilters(params, { status: 'status' })
  });
  return (result.data?.items || []).map(mapSupplierFromBackend);
}

export async function getSupplierDetails(id) {
  const result = await requestApi(`/api/v1/suppliers/${encodeURIComponent(id)}`);
  return mapSupplierFromBackend(result.data);
}

export async function addSupplier(supplier) {
  const result = await requestApi('/api/v1/suppliers', { method: 'POST', body: supplier });
  return mapSupplierFromBackend(result.data);
}

export async function updateSupplier(id, updates) {
  const result = await requestApi(`/api/v1/suppliers/${encodeURIComponent(id)}`, { method: 'PATCH', body: updates });
  return mapSupplierFromBackend(result.data);
}

// ==========================================
// 6. CUTTING JOBS API (EXPRESS + MYSQL BACKEND INTEGRATION)
// ==========================================
function mapCuttingJobFromBackend(cj) {
  if (!cj) return null;
  const firstInput = cj.inputs && cj.inputs.length > 0 ? cj.inputs[0] : null;
  const inputVol = Number(cj.input_total_volume || 0);
  const outputVol = Number(cj.output_total_volume || 0);
  const statusDisplay = cj.status === 'completed' ? 'Completed' : (cj.status === 'in_progress' ? 'In Progress' : 'Scheduled');
  const progressPercent = cj.status === 'completed' ? 100 : (cj.status === 'in_progress' ? 50 : 0);

  return {
    ...cj,
    id: cj.job_number || String(cj.id),
    dbId: cj.id,
    jobNumber: cj.job_number,
    jobTitle: cj.job_title || cj.jobTitle,
    customer: cj.customer_name || cj.customer || '',
    customerId: cj.customer_id,
    logTag: firstInput?.batch_code || cj.logTag || '',
    sawLine: cj.saw_line || cj.sawLine || '',
    cuttingSpec: cj.requested_dimensions || cj.cuttingSpec || '',
    kerfAllowance: cj.kerf_allowance || cj.kerfAllowance || '',
    inputVolume: inputVol > 0 ? `${formatNumber(inputVol)} CFT` : (cj.inputVolume || ''),
    targetOutput: outputVol > 0 ? `${formatNumber(outputVol)} CFT` : '',
    operator: cj.operator_name || cj.operator || '',
    priority: cj.priority || 'Normal',
    status: statusDisplay,
    rawStatus: cj.status || 'draft',
    progress: progressPercent,
    wasteVolume: Number(cj.waste_volume || 0),
    recoveryRate: Number(cj.recovery_rate || 0),
    totalCharges: Number(cj.total_charges || 0),
    ownership: cj.ownership || 'mill',
    inputs: cj.inputs || [],
    outputs: cj.outputs || [],
  };
}

export async function getCuttingJobs(params = {}) {
  const result = await requestApi('/api/v1/cutting-jobs', {
    params: apiFilters(params, { status: 'status', sawLine: 'saw_line' })
  });
  return (result.data?.items || []).map(mapCuttingJobFromBackend);
}

export async function getCuttingJobDetails(id) {
  const result = await requestApi(`/api/v1/cutting-jobs/${encodeURIComponent(id)}`);
  return mapCuttingJobFromBackend(result.data);
}

export async function getCuttingJobReport(id) {
  const result = await requestApi(`/api/v1/cutting-jobs/${encodeURIComponent(id)}/report`);
  return result.data;
}

export async function addCuttingJob(job) {
  const result = await requestApi('/api/v1/cutting-jobs', { method: 'POST', body: job });
  return mapCuttingJobFromBackend(result.data);
}

export async function startCuttingJob(id) {
  const result = await requestApi(`/api/v1/cutting-jobs/${id}/start`, {
    method: 'POST',
  });
  return mapCuttingJobFromBackend(result.data);
}

export async function completeCuttingJob(id, completionData = {}) {
  const result = await requestApi(`/api/v1/cutting-jobs/${id}/complete`, {
    method: 'POST',
    body: completionData,
  });
  return mapCuttingJobFromBackend(result.data?.job || result.data);
}

export async function updateCuttingJobStatus(id, newStatus, _newProgress) {
  if (newStatus === 'Completed') return completeCuttingJob(id);
  if (newStatus === 'In Progress') return startCuttingJob(id);
  throw new Error(`Unsupported cutting job status transition: ${newStatus}`);
}

// ==========================================
// 7. SALES ORDERS API (EXPRESS + MYSQL BACKEND INTEGRATION)
// ==========================================
function mapSalesOrderFromBackend(so) {
  if (!so) return null;
  const rawStatus = so.status || 'draft';
  let fulfillmentStatus = 'Draft';
  if (rawStatus === 'confirmed') fulfillmentStatus = 'Confirmed';
  if (rawStatus === 'processing') fulfillmentStatus = 'Cutting In Progress';
  if (rawStatus === 'completed') fulfillmentStatus = 'Delivered';
  if (rawStatus === 'cancelled') fulfillmentStatus = 'Cancelled';

  let paymentStatus = 'Pending';
  if (so.payment_status === 'paid') paymentStatus = 'Paid';
  else if (so.payment_status === 'partially_paid') paymentStatus = 'Partial';

  const firstItem = so.items && so.items.length > 0 ? so.items[0] : null;

  return {
    ...so,
    id: so.order_number || (so.id ? `SO-${so.id}` : ''),
    dbId: so.id,
    orderNumber: so.order_number,
    customer: so.customer_name || so.customer || '',
    customerId: so.customer_id,
    orderDate: so.order_date ? so.order_date.split('T')[0] : (so.orderDate || ''),
    deliveryDate: so.delivery_date ? so.delivery_date.split('T')[0] : (so.deliveryDate || ''),
    species: so.species_summary || firstItem?.species || so.species || '',
    specifications: firstItem?.dimensions_text ? `${firstItem.product_name} (${firstItem.dimensions_text})` : (so.specifications || ''),
    totalAmount: Number(so.total_amount || 0),
    subtotal: Number(so.subtotal || 0),
    discountAmount: Number(so.discount_amount || 0),
    taxAmount: Number(so.tax_amount || 0),
    shippingCharges: Number(so.shipping_charges || 0),
    paymentStatus: paymentStatus,
    rawPaymentStatus: so.payment_status || 'unpaid',
    fulfillmentStatus: fulfillmentStatus,
    rawStatus: rawStatus,
    status: rawStatus,
    cancellationReason: so.cancellation_reason,
    notes: so.notes,
    items: so.items || [],
    history: so.history || []
  };
}

export async function getSalesOrders(params = {}) {
  const result = await requestApi('/api/v1/sales-orders', {
    params: apiFilters(params, { status: 'status', payment_status: 'payment_status' })
  });
  return (result.data?.items || []).map(mapSalesOrderFromBackend);
}

export async function getSalesOrderDetails(id) {
  const result = await requestApi(`/api/v1/sales-orders/${encodeURIComponent(id)}`);
  return mapSalesOrderFromBackend(result.data);
}

export async function addSalesOrder(order) {
  const result = await requestApi('/api/v1/sales-orders', { method: 'POST', body: order });
  return mapSalesOrderFromBackend(result.data);
}

export async function confirmSalesOrder(id) {
  const result = await requestApi(`/api/v1/sales-orders/${encodeURIComponent(id)}/confirm`, {
    method: 'POST',
  });
  return mapSalesOrderFromBackend(result.data);
}

export async function fulfillSalesOrder(id) {
  const result = await requestApi(`/api/v1/sales-orders/${encodeURIComponent(id)}/fulfill`, {
    method: 'POST',
  });
  return mapSalesOrderFromBackend(result.data);
}

export async function cancelSalesOrder(id, cancellationReason) {
  const result = await requestApi(`/api/v1/sales-orders/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    body: { cancellation_reason: cancellationReason }
  });
  return mapSalesOrderFromBackend(result.data);
}

export async function updateSalesOrder(id, updates) {
  const result = await requestApi(`/api/v1/sales-orders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates)
  });
  return mapSalesOrderFromBackend(result.data);
}

// ==========================================
// 8. INVOICES API
// ==========================================
export async function getInvoices(params = {}) {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  if (params.status && params.status !== 'All') searchParams.set('status', params.status);
  searchParams.set('limit', String(params.limit || 200));
  if (params.offset) searchParams.set('offset', String(params.offset));
  const query = searchParams.toString();
  const result = await requestApi(`/api/v1/invoices${query ? `?${query}` : ''}`);
  return (result.data?.items || []).map(mapInvoiceFromBackend);
}

export async function addInvoice(invoice) {
  const result = await requestApi('/api/v1/invoices', {
    method: 'POST',
    body: JSON.stringify(invoice),
  });
  return mapInvoiceFromBackend(result.data);
}

export async function getInvoice(id) {
  const result = await requestApi(`/api/v1/invoices/${encodeURIComponent(id)}`);
  return mapInvoiceFromBackend(result.data);
}

function mapInvoiceFromBackend(invoice) {
  if (!invoice) return invoice;
  return {
    ...invoice,
    issue_date: dateOnly(invoice.issue_date),
    due_date: dateOnly(invoice.due_date),
    items: (invoice.items || []).map(item => ({
      ...item,
      created_at: dateOnly(item.created_at)
    })),
    payments: (invoice.payments || []).map(payment => ({
      ...payment,
      payment_date: dateOnly(payment.payment_date)
    }))
  };
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : '';
}

export async function previewInvoicePdf(id, paperSize = 'A4') {
  const response = await apiClient.get(`/api/v1/invoices/${encodeURIComponent(id)}/preview`, {
    params: { paperSize },
    responseType: 'blob'
  });
  const objectUrl = URL.createObjectURL(response.data);
  const preview = window.open(objectUrl, '_blank');
  if (!preview) {
    URL.revokeObjectURL(objectUrl);
    throw new Error('Allow pop-ups to preview or print the invoice PDF.');
  }
  preview.opener = null;
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}

export async function downloadInvoicePdf(id, paperSize = 'A4') {
  return downloadBillingPdf(`/api/v1/invoices/${encodeURIComponent(id)}/pdf?paperSize=${encodeURIComponent(paperSize)}`);
}

// ==========================================
// 9. PAYMENTS API
// ==========================================
export async function getPayments(params = {}) {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  if (params.invoice_id) searchParams.set('invoice_id', params.invoice_id);
  searchParams.set('limit', String(params.limit || 200));
  if (params.offset) searchParams.set('offset', String(params.offset));
  const query = searchParams.toString();
  const result = await requestApi(`/api/v1/invoices/payments${query ? `?${query}` : ''}`);
  return (result.data?.items || []).map(payment => ({
    ...payment,
    payment_date: dateOnly(payment.payment_date)
  }));
}

export async function addPayment(invoiceId, payment) {
  const result = await requestApi(`/api/v1/invoices/${encodeURIComponent(invoiceId)}/payments`, {
    method: 'POST',
    body: JSON.stringify(payment),
  });
  return result.data;
}

export async function reversePayment(paymentId, reversalReason) {
  const result = await requestApi(`/api/v1/invoices/payments/${encodeURIComponent(paymentId)}/reverse`, {
    method: 'POST',
    body: JSON.stringify({ reversal_reason: reversalReason }),
  });
  return result.data;
}

export async function downloadReceiptPdf(invoiceId, paymentId, paperSize = 'A5') {
  return downloadBillingPdf(
    `/api/v1/invoices/${encodeURIComponent(invoiceId)}/payments/${encodeURIComponent(paymentId)}/receipt?paperSize=${encodeURIComponent(paperSize)}`
  );
}

async function downloadBillingPdf(url) {
  const response = await apiClient.get(url, {
    responseType: 'blob'
  });
  const objectUrl = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = response.headers['content-disposition']?.match(/filename="([^"]+)"/)?.[1] || 'billing-document.pdf';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

// ==========================================
// 10. EXPENSES API
// ==========================================
function mapExpenseFromBackend(expense) {
  return {
    ...expense,
    id: Number(expense.id),
    date: dateOnly(expense.expense_date),
    amount: Number(expense.amount),
    approvedBy: expense.created_by_id ? `User #${expense.created_by_id}` : '—',
    status: expense.status === 'posted' ? 'Posted' : 'Reversed'
  };
}

export async function getExpenses(params = {}) {
  const searchParams = new URLSearchParams();
  for (const key of ['search', 'category', 'from', 'to']) {
    if (params[key]) searchParams.set(key, params[key]);
  }
  if (params.limit) searchParams.set('limit', String(params.limit));
  const query = searchParams.toString();
  const result = await requestApi(`/api/v1/expenses${query ? `?${query}` : ''}`);
  return (result.data || []).map(mapExpenseFromBackend);
}

export async function getExpenseCategories() {
  const result = await requestApi('/api/v1/expenses/categories');
  return result.data || [];
}

export async function addExpenseCategory(name) {
  const result = await requestApi('/api/v1/expenses/categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return result.data;
}

export async function addExpense(expense) {
  const result = await requestApi('/api/v1/expenses', {
    method: 'POST',
    body: JSON.stringify(expense),
  });
  return mapExpenseFromBackend(result.data);
}

export async function updateExpense(id, expense) {
  const result = await requestApi(`/api/v1/expenses/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(expense),
  });
  return mapExpenseFromBackend(result.data);
}

export async function reverseExpense(id, reason) {
  const result = await requestApi(`/api/v1/expenses/${encodeURIComponent(id)}/reverse`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return mapExpenseFromBackend(result.data);
}

export async function getExpenseReport(params = {}) {
  const searchParams = new URLSearchParams();
  if (params.from) searchParams.set('from', params.from);
  if (params.to) searchParams.set('to', params.to);
  const query = searchParams.toString();
  const result = await requestApi(`/api/v1/expenses/report${query ? `?${query}` : ''}`);
  return result.data;
}

// ==========================================
// 11. EMPLOYEES API
// ==========================================
function mapEmployeeFromBackend(employee) {
  return {
    ...employee,
    id: Number(employee.id),
    joining_date: dateOnly(employee.joining_date),
    salary: employee.salary === undefined || employee.salary === null ? null : Number(employee.salary),
  };
}

export async function getEmployees(params = {}) {
  const search = params.search ? `?search=${encodeURIComponent(params.search)}` : '';
  const result = await requestApi(`/api/v1/employees${search}`);
  return (result.data || []).map(mapEmployeeFromBackend);
}

export async function addEmployee(employee) {
  const result = await requestApi('/api/v1/employees', {
    method: 'POST',
    body: JSON.stringify(employee),
  });
  return mapEmployeeFromBackend(result.data);
}

export async function updateEmployee(id, employee) {
  const result = await requestApi(`/api/v1/employees/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(employee),
  });
  return mapEmployeeFromBackend(result.data);
}

// ==========================================
// 12. DELIVERIES API
// ==========================================
const DELIVERY_LABELS = {
  scheduled: 'Scheduled',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  failed: 'Failed'
};

function mapDeliveryFromBackend(delivery) {
  return {
    ...delivery,
    id: Number(delivery.id),
    orderRef: delivery.order_number,
    customer: delivery.company_name || delivery.customer_name,
    destination: delivery.destination || '',
    truckNumber: delivery.vehicle_info || '',
    driverName: delivery.driver_name || '',
    cargoDescription: delivery.cargo_description || '',
    planned_delivery_date: dateOnly(delivery.planned_delivery_date),
    status: DELIVERY_LABELS[delivery.status] || delivery.status
  };
}

export async function getDeliveries(params = {}) {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  if (params.status && params.status !== 'All') {
    const status = Object.keys(DELIVERY_LABELS).find(key => DELIVERY_LABELS[key] === params.status) || params.status;
    searchParams.set('status', status);
  }
  const query = searchParams.toString();
  const result = await requestApi(`/api/v1/deliveries${query ? `?${query}` : ''}`);
  return (result.data || []).map(mapDeliveryFromBackend);
}

export async function getEligibleDeliveryOrders() {
  const result = await requestApi('/api/v1/deliveries/eligible-orders');
  return result.data || [];
}

export async function addDelivery(delivery) {
  const result = await requestApi('/api/v1/deliveries', {
    method: 'POST',
    body: JSON.stringify(delivery),
  });
  return mapDeliveryFromBackend(result.data);
}

export async function updateDeliverySchedule(id, data) {
  const result = await requestApi(`/api/v1/deliveries/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return mapDeliveryFromBackend(result.data);
}

export async function updateDeliveryStatus(id, status, details = {}) {
  const rawStatus = Object.keys(DELIVERY_LABELS).find(key => DELIVERY_LABELS[key] === status) || status;
  const result = await requestApi(`/api/v1/deliveries/${encodeURIComponent(id)}/status`, {
    method: 'POST',
    body: JSON.stringify({ status: rawStatus, ...details }),
  });
  return mapDeliveryFromBackend(result.data);
}

// ==========================================
// 12A. CUSTOMER ENQUIRIES API
// ==========================================
export async function getEnquiries(params = {}) {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  if (params.status && params.status !== 'All') searchParams.set('status', params.status);
  if (params.assigned_to_id) searchParams.set('assigned_to_id', String(params.assigned_to_id));
  const query = searchParams.toString();
  const result = await requestApi(`/api/v1/enquiries${query ? `?${query}` : ''}`);
  return result.data || [];
}

export async function getEnquiryAssignees() {
  const result = await requestApi('/api/v1/enquiries/assignees');
  return result.data || [];
}

export async function updateEnquiry(id, updates) {
  const result = await requestApi(`/api/v1/enquiries/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return result.data;
}

export async function convertEnquiry(id, target) {
  const result = await requestApi(`/api/v1/enquiries/${encodeURIComponent(id)}/convert`, {
    method: 'POST',
    body: JSON.stringify({ target }),
  });
  return result.data;
}

// ==========================================
// 12B. OPERATIONAL AND FINANCIAL REPORTS API
// ==========================================
export async function getReportTypes() {
  const result = await requestApi('/api/v1/reports/types');
  return result.data || [];
}

export async function getReport(type, params = {}) {
  const searchParams = new URLSearchParams();
  for (const key of ['from', 'to', 'period', 'product', 'status', 'limit', 'offset']) {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      searchParams.set(key, String(params[key]));
    }
  }
  const query = searchParams.toString();
  const result = await requestApi(`/api/v1/reports/${encodeURIComponent(type)}${query ? `?${query}` : ''}`);
  return result.data;
}

export async function downloadReportExport(type, format, params = {}) {
  const response = await apiClient.get(`/api/v1/reports/${encodeURIComponent(type)}/export.${format}`, {
    params,
    responseType: 'blob'
  });
  return {
    blob: response.data,
    filename: response.headers['content-disposition']?.match(/filename="([^"]+)"/)?.[1] || `${type}-report.${format}`
  };
}

// ==========================================
// 13. USER MANAGEMENT API
// ==========================================
export async function getUsers() {
  const result = await requestApi('/api/v1/auth/users');
  return result.data?.items || [];
}

export async function addUser(user) {
  const result = await requestApi('/api/v1/auth/users', { method: 'POST', body: user });
  return result.data;
}

export async function addAdmin(user) {
  const result = await requestApi('/api/v1/auth/admins', { method: 'POST', body: user });
  return result.data;
}

export async function getStaffRegistrationRequests() {
  const result = await requestApi('/api/v1/auth/staff-registration-requests');
  return result.data?.items || [];
}

export async function decideStaffRegistration(id, decision, permissions = []) {
  const result = await requestApi(`/api/v1/auth/staff-registration-requests/${encodeURIComponent(id)}/decision`, {
    method: 'POST', body: { decision, permissions }
  });
  return result.data;
}

export async function setUserPermissions(id, permissions) {
  const result = await requestApi(`/api/v1/auth/users/${encodeURIComponent(id)}/permissions`, {
    method: 'PUT', body: JSON.stringify({ permissions })
  });
  return result.data;
}

export async function setUserStatus(id, status) {
  const result = await requestApi(`/api/v1/auth/users/${encodeURIComponent(id)}/status`, {
    method: 'PATCH', body: JSON.stringify({ status })
  });
  return result.data;
}

export async function resetStaffPassword(id, password) {
  const result = await requestApi(`/api/v1/auth/users/${encodeURIComponent(id)}/password-reset`, {
    method: 'POST', body: JSON.stringify({ password })
  });
  return result.data;
}
