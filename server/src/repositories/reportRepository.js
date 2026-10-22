'use strict';

const { query } = require('../config/db');

async function paged(sql, countSql, params, { limit, offset }) {
  const [[count]] = await query(countSql, params);
  const [items] = await query(`${sql} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  return { items, total: Number(count?.total || 0) };
}

function orderDateFilter(from, to, alias = 'so') {
  const conditions = [];
  const params = [];
  if (from) {
    conditions.push(`${alias}.order_date >= ?`);
    params.push(from);
  }
  if (to) {
    conditions.push(`${alias}.order_date <= ?`);
    params.push(to);
  }
  return { sql: conditions.length ? ` AND ${conditions.join(' AND ')}` : '', params };
}

class ReportRepository {
  async getCostingMethod() {
    const [rows] = await query(
      "SELECT inventory_costing_method FROM reporting_settings WHERE id = 1"
    );
    return rows[0]?.inventory_costing_method || null;
  }

  async getReport(type, filters) {
    const { from, to, product, status, limit, offset, period } = filters;
    switch (type) {
      case 'sales-periods': {
        const dateFilter = orderDateFilter(from, to);
        const format = period === 'daily' ? '%Y-%m-%d' : period === 'weekly' ? '%x-W%v' : '%Y-%m';
        const sql = `
          SELECT DATE_FORMAT(so.order_date, ?) AS period,
                 COUNT(*) AS order_count,
                 SUM(so.subtotal - so.discount_amount + so.shipping_charges) AS sales
            FROM sales_orders so
           WHERE so.status = 'completed'${dateFilter.sql}
           GROUP BY DATE_FORMAT(so.order_date, ?)
           ORDER BY MIN(so.order_date)`;
        const params = [format, ...dateFilter.params, format];
        const [items] = await query(sql, params);
        const [[summary]] = await query(
          `SELECT COUNT(*) AS order_count,
                  COALESCE(SUM(so.subtotal - so.discount_amount + so.shipping_charges), 0) AS sales
             FROM sales_orders so
            WHERE so.status = 'completed'${dateFilter.sql}`,
          dateFilter.params
        );
        return { items, total: items.length, summary };
      }
      case 'sales-products': {
        const dateFilter = orderDateFilter(from, to);
        const where = `WHERE so.status = 'completed'${dateFilter.sql}${product ? ` AND (
          soi.product_name LIKE ? OR soi.species LIKE ? OR EXISTS (
            SELECT 1 FROM wood_names wn WHERE wn.wood_type_id = tb.wood_type_id AND wn.name LIKE ?
          )
        )` : ''}`;
        const productParams = product ? [`%${product}%`, `%${product}%`, `%${product}%`] : [];
        const sql = `
          SELECT soi.product_name, soi.species, soi.unit, tb.wood_type_id,
                 COUNT(DISTINCT so.id) AS order_count,
                 SUM(soi.quantity) AS quantity,
                 SUM(soi.line_total - soi.tax_amount) AS product_sales
            FROM sales_order_items soi
            JOIN sales_orders so ON so.id = soi.sales_order_id
            LEFT JOIN timber_batches tb ON tb.id = soi.batch_id
            ${where}
           GROUP BY soi.product_name, soi.species, soi.unit, tb.wood_type_id
           ORDER BY product_sales DESC`;
        const countSql = `
          SELECT COUNT(*) AS total FROM (
            SELECT soi.product_name, soi.species, soi.unit, tb.wood_type_id
              FROM sales_order_items soi
              JOIN sales_orders so ON so.id = soi.sales_order_id
              LEFT JOIN timber_batches tb ON tb.id = soi.batch_id
              ${where}
             GROUP BY soi.product_name, soi.species, soi.unit, tb.wood_type_id
          ) grouped_products`;
        const result = await paged(sql, countSql, [...dateFilter.params, ...productParams], { limit, offset });
        return result;
      }
      case 'purchases-suppliers': {
        const conditions = ["p.status = 'received'"];
        const params = [];
        if (from) { conditions.push('COALESCE(p.actual_delivery_date, DATE(p.created_at)) >= ?'); params.push(from); }
        if (to) { conditions.push('COALESCE(p.actual_delivery_date, DATE(p.created_at)) <= ?'); params.push(to); }
        const where = `WHERE ${conditions.join(' AND ')}`;
        return paged(
          `SELECT s.id AS supplier_id, s.company_name AS supplier, COUNT(*) AS purchase_count,
                  SUM(p.total_cost) AS total_purchased, SUM(p.paid_amount) AS paid_amount,
                  SUM(GREATEST(p.total_cost - p.paid_amount, 0)) AS outstanding
             FROM purchases p JOIN suppliers s ON s.id = p.supplier_id
             ${where}
            GROUP BY s.id, s.company_name
            ORDER BY total_purchased DESC`,
          `SELECT COUNT(*) AS total FROM (
             SELECT p.supplier_id FROM purchases p ${where} GROUP BY p.supplier_id
           ) grouped_suppliers`,
          params,
          { limit, offset }
        );
      }
      case 'raw-inventory':
      case 'finished-inventory': {
        const timberType = type === 'raw-inventory' ? 'raw_log' : 'sawn_timber';
        const conditions = ["tb.ownership = 'mill'", 'tb.timber_type = ?'];
        const params = [timberType];
        if (product) {
          conditions.push(`(tb.name LIKE ? OR tb.species LIKE ? OR tb.batch_code LIKE ? OR EXISTS (
            SELECT 1 FROM wood_names wn WHERE wn.wood_type_id = tb.wood_type_id AND wn.name LIKE ?
          ))`);
          params.push(...Array(4).fill(`%${product}%`));
        }
        if (status && status !== 'All') {
          conditions.push('tb.status = ?');
          params.push(status);
        }
        const where = `WHERE ${conditions.join(' AND ')}`;
        return paged(
          `SELECT tb.id, tb.batch_code, tb.name, tb.species, tb.wood_type_id, tb.grade, tb.dimensions_text,
                  tb.quantity_total AS on_hand, tb.quantity_available AS available,
                  tb.quantity_reserved AS reserved, tb.unit, tb.cost_price,
                  tb.quantity_total * tb.cost_price AS inventory_value,
                  tb.min_stock_threshold, tb.status, tb.created_at
             FROM timber_batches tb ${where}
            ORDER BY tb.created_at, tb.id`,
          `SELECT COUNT(*) AS total FROM timber_batches tb ${where}`,
          params,
          { limit, offset }
        );
      }
      case 'low-stock': {
        const conditions = ["tb.ownership = 'mill'", 'tb.quantity_available <= tb.min_stock_threshold'];
        const params = [];
        if (product) {
          conditions.push(`(tb.name LIKE ? OR tb.species LIKE ? OR tb.batch_code LIKE ? OR EXISTS (
            SELECT 1 FROM wood_names wn WHERE wn.wood_type_id = tb.wood_type_id AND wn.name LIKE ?
          ))`);
          params.push(...Array(4).fill(`%${product}%`));
        }
        if (status && status !== 'All') {
          conditions.push('tb.status = ?');
          params.push(status);
        }
        const where = `WHERE ${conditions.join(' AND ')}`;
        return paged(
          `SELECT tb.id, tb.batch_code, tb.name, tb.species, tb.wood_type_id, tb.timber_type, tb.grade,
                  tb.quantity_available AS available, tb.min_stock_threshold, tb.unit, tb.status
             FROM timber_batches tb ${where}
            ORDER BY (tb.min_stock_threshold - tb.quantity_available) DESC, tb.id`,
          `SELECT COUNT(*) AS total FROM timber_batches tb ${where}`,
          params,
          { limit, offset }
        );
      }
      case 'cutting-output':
      case 'cutting-charges': {
        const conditions = ["cj.status = 'completed'"];
        const params = [];
        if (from) { conditions.push('cj.completion_date >= ?'); params.push(from); }
        if (to) { conditions.push('cj.completion_date <= ?'); params.push(to); }
        if (status && status !== 'All') { conditions.push('cj.job_type = ?'); params.push(status); }
        const where = `WHERE ${conditions.join(' AND ')}`;
        const selection = type === 'cutting-output'
          ? `cj.id, cj.job_number, cj.job_title, cj.job_type, cj.completion_date,
             cj.input_total_volume, cj.output_total_volume, cj.waste_volume, cj.recovery_rate`
          : `cj.id, cj.job_number, cj.job_title, cj.job_type, cj.completion_date,
             cj.rate_per_cbf, cj.labour_charges, cj.total_charges`;
        const sortColumn = type === 'cutting-output' ? 'cj.completion_date' : 'cj.total_charges';
        return paged(
          `SELECT ${selection} FROM cutting_jobs cj ${where} ORDER BY ${sortColumn} DESC, cj.id DESC`,
          `SELECT COUNT(*) AS total FROM cutting_jobs cj ${where}`,
          params,
          { limit, offset }
        );
      }
      case 'customer-balances': {
        const conditions = ["i.payment_status <> 'voided'", 'i.amount_due > 0'];
        const params = [];
        if (from) { conditions.push('i.issue_date >= ?'); params.push(from); }
        if (to) { conditions.push('i.issue_date <= ?'); params.push(to); }
        if (status && status !== 'All') { conditions.push('i.payment_status = ?'); params.push(status); }
        const where = `WHERE ${conditions.join(' AND ')}`;
        return paged(
          `SELECT c.id AS customer_id, c.name AS customer, c.company_name,
                  COUNT(i.id) AS invoice_count, SUM(i.grand_total) AS invoiced,
                  SUM(i.amount_paid) AS paid, SUM(i.amount_due) AS outstanding
             FROM invoices i JOIN customers c ON c.id = i.customer_id
             ${where}
            GROUP BY c.id, c.name, c.company_name
            ORDER BY outstanding DESC`,
          `SELECT COUNT(*) AS total FROM (
             SELECT i.customer_id FROM invoices i ${where} GROUP BY i.customer_id
           ) grouped_customers`,
          params,
          { limit, offset }
        );
      }
      case 'supplier-obligations': {
        const conditions = ["p.status IN ('ordered', 'received')", 'p.total_cost > p.paid_amount'];
        const params = [];
        if (from) { conditions.push('COALESCE(p.actual_delivery_date, DATE(p.created_at)) >= ?'); params.push(from); }
        if (to) { conditions.push('COALESCE(p.actual_delivery_date, DATE(p.created_at)) <= ?'); params.push(to); }
        if (status && status !== 'All') { conditions.push('p.status = ?'); params.push(status); }
        const where = `WHERE ${conditions.join(' AND ')}`;
        return paged(
          `SELECT s.id AS supplier_id, s.company_name AS supplier,
                  COUNT(p.id) AS purchase_count, SUM(p.total_cost) AS total_cost,
                  SUM(p.paid_amount) AS paid_amount,
                  SUM(p.total_cost - p.paid_amount) AS outstanding
             FROM purchases p JOIN suppliers s ON s.id = p.supplier_id
             ${where}
            GROUP BY s.id, s.company_name
            ORDER BY outstanding DESC`,
          `SELECT COUNT(*) AS total FROM (
             SELECT p.supplier_id FROM purchases p ${where} GROUP BY p.supplier_id
           ) grouped_suppliers`,
          params,
          { limit, offset }
        );
      }
      case 'operating-expenses': {
        const conditions = ["e.status = 'posted'"];
        const params = [];
        if (from) { conditions.push('e.expense_date >= ?'); params.push(from); }
        if (to) { conditions.push('e.expense_date <= ?'); params.push(to); }
        if (status && status !== 'All') { conditions.push('c.name = ?'); params.push(status); }
        const where = `WHERE ${conditions.join(' AND ')}`;
        const [[summary]] = await query(
          `SELECT COALESCE(SUM(e.amount), 0) AS total_expenses, COUNT(*) AS expense_count
             FROM expenses e JOIN expense_categories c ON c.id = e.category_id ${where}`,
          params
        );
        return {
          ...(await paged(
            `SELECT c.name AS category, COUNT(*) AS expense_count, SUM(e.amount) AS total
               FROM expenses e JOIN expense_categories c ON c.id = e.category_id ${where}
              GROUP BY c.id, c.name ORDER BY total DESC`,
            `SELECT COUNT(*) AS total FROM (
               SELECT e.category_id FROM expenses e JOIN expense_categories c ON c.id = e.category_id ${where}
               GROUP BY e.category_id
             ) grouped_categories`,
            params,
            { limit, offset }
          )),
          summary
        };
      }
      case 'profitability': {
        const dateSales = orderDateFilter(from, to);
        const expenseConditions = ["e.status = 'posted'"];
        const expenseParams = [];
        if (from) { expenseConditions.push('e.expense_date >= ?'); expenseParams.push(from); }
        if (to) { expenseConditions.push('e.expense_date <= ?'); expenseParams.push(to); }
        const [[row]] = await query(
          `SELECT
             (SELECT COALESCE(SUM(so.subtotal - so.discount_amount + so.shipping_charges), 0)
                FROM sales_orders so WHERE so.status = 'completed'${dateSales.sql}) AS net_sales,
             (SELECT COALESCE(SUM(COALESCE(soi.total_cost_at_fulfillment, tb.cost_price * soi.quantity)), 0)
                FROM sales_order_items soi
                JOIN sales_orders so ON so.id = soi.sales_order_id
                LEFT JOIN timber_batches tb ON tb.id = soi.batch_id
               WHERE so.status = 'completed'${dateSales.sql}) AS cost_of_goods_sold,
             (SELECT COUNT(*) FROM sales_order_items soi
                JOIN sales_orders so ON so.id = soi.sales_order_id
                LEFT JOIN timber_batches tb ON tb.id = soi.batch_id
               WHERE so.status = 'completed'${dateSales.sql}
                 AND COALESCE(soi.total_cost_at_fulfillment, tb.cost_price * soi.quantity, 0) <= 0) AS uncosted_line_count,
             (SELECT COUNT(*) FROM sales_order_items soi
                JOIN sales_orders so ON so.id = soi.sales_order_id
               WHERE so.status = 'completed'${dateSales.sql}
                 AND soi.total_cost_at_fulfillment IS NULL) AS legacy_estimated_line_count,
             (SELECT COALESCE(SUM(e.amount), 0) FROM expenses e
               WHERE ${expenseConditions.join(' AND ')}) AS operating_expenses`,
          [...dateSales.params, ...dateSales.params, ...dateSales.params, ...dateSales.params, ...expenseParams]
        );
        const record = {
          ...row,
          gross_margin: Number(row.net_sales) - Number(row.cost_of_goods_sold),
          estimated_net_operating_profit: Number(row.net_sales) - Number(row.cost_of_goods_sold) - Number(row.operating_expenses),
          costing_method: await this.getCostingMethod(),
          cost_complete: Number(row.uncosted_line_count) === 0,
        };
        return { items: [record], total: 1, summary: record };
      }
      case 'delivery-status': {
        const conditions = ['1=1'];
        const params = [];
        if (from) { conditions.push('d.planned_delivery_date >= ?'); params.push(from); }
        if (to) { conditions.push('d.planned_delivery_date <= ?'); params.push(to); }
        if (status && status !== 'All') { conditions.push('d.status = ?'); params.push(status); }
        const where = `WHERE ${conditions.join(' AND ')}`;
        return paged(
          `SELECT d.id, d.delivery_number, so.order_number, c.name AS customer,
                  d.planned_delivery_date, d.status, d.vehicle_info, d.driver_name,
                  d.delivered_at, d.failure_reason
             FROM deliveries d JOIN sales_orders so ON so.id = d.sales_order_id
             JOIN customers c ON c.id = so.customer_id
             ${where}
            ORDER BY d.planned_delivery_date DESC, d.id DESC`,
          `SELECT COUNT(*) AS total FROM deliveries d ${where}`,
          params,
          { limit, offset }
        );
      }
      case 'enquiry-conversion': {
        const conditions = ['1=1'];
        const params = [];
        if (from) { conditions.push('DATE(e.created_at) >= ?'); params.push(from); }
        if (to) { conditions.push('DATE(e.created_at) <= ?'); params.push(to); }
        if (status && status !== 'All') { conditions.push('e.status = ?'); params.push(status); }
        const where = `WHERE ${conditions.join(' AND ')}`;
        const [[summary]] = await query(
          `SELECT COUNT(*) AS enquiry_count,
                  SUM(e.status = 'converted') AS converted_count,
                  ROUND(100 * SUM(e.status = 'converted') / NULLIF(COUNT(*), 0), 2) AS conversion_rate
             FROM customer_enquiries e ${where}`,
          params
        );
        return {
          ...(await paged(
            `SELECT e.status, COUNT(*) AS enquiry_count,
                    SUM(e.status = 'converted') AS converted_count
               FROM customer_enquiries e ${where}
              GROUP BY e.status ORDER BY e.status`,
            `SELECT COUNT(*) AS total FROM (
               SELECT e.status FROM customer_enquiries e ${where} GROUP BY e.status
             ) grouped_statuses`,
            params,
            { limit, offset }
          )),
          summary
        };
      }
      default:
        throw new Error(`Unknown report type: ${type}`);
    }
  }

  async dashboard() {
    const [[stats]] = await query(
      `SELECT
         (SELECT COALESCE(SUM(subtotal - discount_amount + shipping_charges), 0)
            FROM sales_orders WHERE status = 'completed' AND order_date = UTC_DATE()) AS today_sales,
         (SELECT COALESCE(SUM(subtotal - discount_amount + shipping_charges), 0)
            FROM sales_orders WHERE status = 'completed'
              AND order_date >= DATE_FORMAT(UTC_DATE(), '%Y-%m-01')
              AND order_date <= UTC_DATE()) AS month_sales,
         (SELECT COALESCE(SUM(quantity_total * cost_price), 0)
            FROM timber_batches WHERE ownership = 'mill') AS inventory_value,
         (SELECT COUNT(*) FROM sales_orders WHERE status IN ('draft', 'confirmed', 'processing')) AS pending_orders,
         (SELECT COUNT(*) FROM invoices WHERE payment_status <> 'voided' AND amount_due > 0) AS unpaid_invoices,
         (SELECT COUNT(*) FROM timber_batches
           WHERE ownership = 'mill' AND quantity_available <= min_stock_threshold) AS low_stock_batches`
    );
    const [salesTrend] = await query(
      `SELECT DATE_FORMAT(order_date, '%Y-%m') AS month,
              SUM(subtotal - discount_amount + shipping_charges) AS revenue
         FROM sales_orders
        WHERE status = 'completed'
          AND order_date >= DATE_SUB(DATE_FORMAT(UTC_DATE(), '%Y-%m-01'), INTERVAL 11 MONTH)
          AND order_date <= UTC_DATE()
        GROUP BY DATE_FORMAT(order_date, '%Y-%m')
        ORDER BY MIN(order_date)`
    );
    const [lowStockAlerts] = await query(
      `SELECT id, batch_code, species, grade, quantity_available AS current_stock,
              min_stock_threshold AS min_threshold, unit, status
         FROM timber_batches
        WHERE ownership = 'mill' AND quantity_available <= min_stock_threshold
        ORDER BY (min_stock_threshold - quantity_available) DESC, id
        LIMIT 6`
    );
    const [recentOrders] = await query(
      `SELECT so.id, so.order_number, so.order_date, so.status, so.payment_status,
              so.total_amount, c.name AS customer,
              (SELECT GROUP_CONCAT(DISTINCT soi.species ORDER BY soi.id SEPARATOR ', ')
                 FROM sales_order_items soi WHERE soi.sales_order_id = so.id) AS species
         FROM sales_orders so JOIN customers c ON c.id = so.customer_id
        ORDER BY so.created_at DESC, so.id DESC LIMIT 5`
    );
    const [pendingCuttingJobs] = await query(
      `SELECT id, job_number, job_title, status, saw_line, operator_name,
              requested_dimensions, priority
         FROM cutting_jobs WHERE status IN ('draft', 'scheduled', 'in_progress')
        ORDER BY FIELD(status, 'in_progress', 'scheduled', 'draft'), due_date, id
        LIMIT 4`
    );
    const [recentPayments] = await query(
      `SELECT cp.id, cp.payment_number, cp.amount, cp.payment_method,
              cp.transaction_reference, cp.payment_date, cp.status,
              i.currency, c.name AS customer
         FROM customer_payments cp
         JOIN invoices i ON i.id = cp.invoice_id
         JOIN customers c ON c.id = cp.customer_id
        ORDER BY cp.created_at DESC, cp.id DESC LIMIT 5`
    );
    const [recentActivity] = await query(
      `SELECT h.id, h.action, h.reason AS description, h.created_at,
              so.order_number AS reference
         FROM sales_order_history h
         JOIN sales_orders so ON so.id = h.sales_order_id
        ORDER BY h.created_at DESC, h.id DESC LIMIT 8`
    );
    const [speciesRecovery] = await query(
      `SELECT species, SUM(log_input) AS logsInCFT, SUM(sawn_output) AS sawnCFT,
              CASE WHEN SUM(log_input) = 0 THEN 0
                   ELSE ROUND(100 * SUM(sawn_output) / SUM(log_input), 2) END AS recoveryRate
         FROM (
           SELECT tb.species, SUM(cji.quantity_used) AS log_input, 0 AS sawn_output
             FROM cutting_job_inputs cji
             JOIN cutting_jobs cj ON cj.id = cji.cutting_job_id AND cj.status = 'completed'
             JOIN timber_batches tb ON tb.id = cji.batch_id
            GROUP BY tb.species
           UNION ALL
           SELECT cjo.species, 0 AS log_input, SUM(cjo.volume_cbf) AS sawn_output
             FROM cutting_job_outputs cjo
             JOIN cutting_jobs cj ON cj.id = cjo.cutting_job_id AND cj.status = 'completed'
            GROUP BY cjo.species
         ) volumes
        GROUP BY species ORDER BY logsInCFT DESC LIMIT 8`
    );
    return { stats, salesTrend, lowStockAlerts, recentOrders, pendingCuttingJobs, recentPayments, recentActivity, speciesRecovery };
  }
}

module.exports = new ReportRepository();
