'use strict';
/**
 * services/supplierService.js
 *
 * Business logic service for Forestry and Timber Suppliers.
 */
const supplierRepository = require('../repositories/supplierRepository');
const AppError = require('../utils/AppError');
const audit = require('../utils/audit');

class SupplierService {
  /**
   * List suppliers with search, filtering, and pagination.
   */
  async listSuppliers({ search, status, page = 1, limit = 50 }) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    return supplierRepository.listSuppliers({ search, status, page: p, limit: l });
  }

  /**
   * Get single supplier details including complete purchase history.
   */
  async getSupplierDetails(id) {
    const supplierId = parseInt(id, 10);
    if (!supplierId || isNaN(supplierId)) {
      throw new AppError('Valid Supplier ID is required.', 400, 'INVALID_SUPPLIER_ID');
    }

    const supplier = await supplierRepository.findById(supplierId);
    if (!supplier) {
      throw new AppError(`Supplier #${supplierId} not found.`, 404, 'SUPPLIER_NOT_FOUND');
    }

    const purchases = await supplierRepository.getPurchaseHistory(supplierId);

    return {
      ...supplier,
      purchases,
    };
  }

  /**
   * Create a new forestry supplier.
   */
  async createSupplier(data, actorId = null) {
    const name = data.company_name || data.companyName;
    if (!name || !name.trim()) {
      throw new AppError('Supplier company or concession name is required.', 400, 'VALIDATION_ERROR');
    }
    if (!data.phone || !data.phone.trim()) {
      throw new AppError('Contact phone number is required.', 400, 'VALIDATION_ERROR');
    }

    const insertId = await supplierRepository.create(data);
    const created = await supplierRepository.findById(insertId);

    await audit.log({
      userId: actorId,
      action: 'SUPPLIER_CREATED',
      tableName: 'suppliers',
      recordId: insertId,
      description: `Registered new forestry supplier: ${name} (Phone: ${data.phone})`,
    });

    return created;
  }

  /**
   * Update an existing supplier.
   */
  async updateSupplier(id, data, actorId = null) {
    const supplierId = parseInt(id, 10);
    if (!supplierId || isNaN(supplierId)) {
      throw new AppError('Valid Supplier ID is required.', 400, 'INVALID_SUPPLIER_ID');
    }

    const existing = await supplierRepository.findById(supplierId);
    if (!existing) {
      throw new AppError(`Supplier #${supplierId} not found.`, 404, 'SUPPLIER_NOT_FOUND');
    }

    const updated = await supplierRepository.update(supplierId, data);
    if (!updated) {
      throw new AppError('No changes were made or supplier could not be updated.', 400, 'UPDATE_FAILED');
    }

    const result = await supplierRepository.findById(supplierId);

    await audit.log({
      userId: actorId,
      action: 'SUPPLIER_UPDATED',
      tableName: 'suppliers',
      recordId: supplierId,
      description: `Updated supplier #${supplierId} (${result.company_name})`,
    });

    return result;
  }

  /**
   * Delete supplier.
   */
  async deleteSupplier(id, actorId = null) {
    const supplierId = parseInt(id, 10);
    if (!supplierId || isNaN(supplierId)) {
      throw new AppError('Valid Supplier ID is required.', 400, 'INVALID_SUPPLIER_ID');
    }

    const supplier = await supplierRepository.findById(supplierId);
    if (!supplier) {
      throw new AppError(`Supplier #${supplierId} not found.`, 404, 'SUPPLIER_NOT_FOUND');
    }

    if (Number(supplier.purchases_count) > 0) {
      throw new AppError(
        'Cannot delete supplier with recorded purchase orders. Deactivate supplier status instead.',
        400,
        'SUPPLIER_HAS_PURCHASES'
      );
    }

    await supplierRepository.delete(supplierId);

    await audit.log({
      userId: actorId,
      action: 'SUPPLIER_DELETED',
      tableName: 'suppliers',
      recordId: supplierId,
      description: `Deleted supplier record #${supplierId} (${supplier.company_name})`,
    });

    return { id: supplierId, company_name: supplier.company_name };
  }
}

module.exports = new SupplierService();
