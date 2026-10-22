'use strict';
/**
 * services/customerService.js
 *
 * Business logic service for Customer management.
 */
const customerRepository = require('../repositories/customerRepository');
const AppError = require('../utils/AppError');
const audit = require('../utils/audit');

class CustomerService {
  /**
   * List customers with search, pagination, and dynamic outstanding balance calculation.
   */
  async listCustomers({ search, status, page = 1, limit = 50 }) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    return customerRepository.listCustomers({ search, status, page: p, limit: l });
  }

  /**
   * Get single customer with detailed order history and invoice ledger.
   */
  async getCustomerDetails(id) {
    const customerId = parseInt(id, 10);
    if (!customerId || isNaN(customerId)) {
      throw new AppError('Valid Customer ID is required.', 400, 'INVALID_CUSTOMER_ID');
    }

    const customer = await customerRepository.findById(customerId);
    if (!customer) {
      throw new AppError(`Customer #${customerId} not found.`, 404, 'CUSTOMER_NOT_FOUND');
    }

    const [orders, invoices] = await Promise.all([
      customerRepository.getOrderHistory(customerId),
      customerRepository.getInvoiceHistory(customerId),
    ]);

    return {
      ...customer,
      orders,
      invoices,
    };
  }

  /**
   * Create a new customer record.
   */
  async createCustomer(data, actorId = null) {
    if (!data.name || !data.name.trim()) {
      throw new AppError('Customer or business name is required.', 400, 'VALIDATION_ERROR');
    }
    if (!data.phone || !data.phone.trim()) {
      throw new AppError('Contact phone number is required.', 400, 'VALIDATION_ERROR');
    }

    const insertId = await customerRepository.create(data);
    const created = await customerRepository.findById(insertId);

    await audit.log({
      userId: actorId,
      action: 'CUSTOMER_CREATED',
      tableName: 'customers',
      recordId: insertId,
      description: `Registered new customer: ${data.name} (Phone: ${data.phone})`,
    });

    return created;
  }

  /**
   * Update an existing customer record.
   */
  async updateCustomer(id, data, actorId = null) {
    const customerId = parseInt(id, 10);
    if (!customerId || isNaN(customerId)) {
      throw new AppError('Valid Customer ID is required.', 400, 'INVALID_CUSTOMER_ID');
    }

    const existing = await customerRepository.findById(customerId);
    if (!existing) {
      throw new AppError(`Customer #${customerId} not found.`, 404, 'CUSTOMER_NOT_FOUND');
    }

    const updated = await customerRepository.update(customerId, data);
    if (!updated) {
      throw new AppError('No changes were made or customer could not be updated.', 400, 'UPDATE_FAILED');
    }

    const result = await customerRepository.findById(customerId);

    await audit.log({
      userId: actorId,
      action: 'CUSTOMER_UPDATED',
      tableName: 'customers',
      recordId: customerId,
      description: `Updated customer #${customerId} (${result.name})`,
    });

    return result;
  }

  /**
   * Delete a customer.
   */
  async deleteCustomer(id, actorId = null) {
    const customerId = parseInt(id, 10);
    if (!customerId || isNaN(customerId)) {
      throw new AppError('Valid Customer ID is required.', 400, 'INVALID_CUSTOMER_ID');
    }

    const customer = await customerRepository.findById(customerId);
    if (!customer) {
      throw new AppError(`Customer #${customerId} not found.`, 404, 'CUSTOMER_NOT_FOUND');
    }

    // Safety check: Prevent deleting customers who have order or invoice history
    if (Number(customer.orders_count) > 0 || Number(customer.total_invoiced) > 0) {
      throw new AppError(
        'Cannot delete customer with existing orders or invoices. Deactivate customer status instead.',
        400,
        'CUSTOMER_HAS_ACTIVITY'
      );
    }

    await customerRepository.delete(customerId);

    await audit.log({
      userId: actorId,
      action: 'CUSTOMER_DELETED',
      tableName: 'customers',
      recordId: customerId,
      description: `Deleted customer record #${customerId} (${customer.name})`,
    });

    return { id: customerId, name: customer.name };
  }
}

module.exports = new CustomerService();
