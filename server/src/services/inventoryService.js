'use strict';
/**
 * services/inventoryService.js
 *
 * Core business logic for Saw Mill timber inventory management.
 *
 * Implements strict inventory rules:
 *   1. Transactional isolation for all stock mutations.
 *   2. Row-level locking (SELECT ... FOR UPDATE) to prevent race conditions and overselling.
 *   3. Immutable stock_movements ledger recording every single stock change.
 *   4. Prohibition of negative stock unless authorized by an administrator.
 *   5. Segregation of customer-owned vs mill-owned timber.
 *   6. Mathematical dimensional volume calculations (Quarter-Girth Hoppus & Board Feet).
 */
const { query, withTransaction } = require('../config/db');
const inventoryRepo = require('../repositories/inventoryRepository');
const AppError = require('../utils/AppError');
const audit = require('../utils/audit');
const {
  calculateRectangularVolume,
  calculateLogVolumeHoppus,
  parseDimensionString,
  formatDimensions,
} = require('../utils/timberVolume');

class InventoryService {
  /**
   * List timber batches with filters and inventory KPIs.
   */
  async listBatches(filters = {}) {
    const result = await inventoryRepo.listBatches(filters);

    // Compute summary KPIs over the returned dataset
    const items = await this._attachWoodNames(result.items.map(this._formatBatchResponse));
    const lowStockCount = items.filter((i) => i.status === 'Low Stock').length;
    const totalVolumeCbf = items.reduce((sum, i) => sum + (Number(i.volumeCbf) || 0), 0);
    const totalYardValue = items.reduce((sum, i) => sum + (Number(i.quantity) * Number(i.sellingPrice || 0)), 0);

    return {
      items,
      total: result.total,
      page: result.page,
      limit: result.limit,
      summary: {
        totalSkus: result.total,
        lowStockCount,
        totalVolumeCbf: Number(totalVolumeCbf.toFixed(2)),
        totalYardValue: Number(totalYardValue.toFixed(2)),
      },
    };
  }

  /**
   * Get single batch details and full movement history.
   */
  async getBatchDetails(id) {
    const batch = await inventoryRepo.findById(id);
    if (!batch) {
      throw new AppError('Timber batch not found.', 404, 'BATCH_NOT_FOUND');
    }

    const movements = await inventoryRepo.listMovements(id);
    return {
      batch: (await this._attachWoodNames([this._formatBatchResponse(batch)]))[0],
      movements: movements.map(this._formatMovementResponse),
    };
  }

  /**
   * Create a new timber batch with automatic volumetric calculation.
   */
  async createBatch(data, actorId) {
    let woodTypeId = null;
    let speciesName = data.species?.trim();
    if (data.wood_type_id !== undefined && data.wood_type_id !== null && data.wood_type_id !== '') {
      woodTypeId = Number(data.wood_type_id);
      if (!Number.isSafeInteger(woodTypeId) || woodTypeId < 1) {
        throw new AppError('Select a valid wood type.', 422, 'INVALID_WOOD_TYPE_ID');
      }
      const [woodTypes] = await query('SELECT common_name_en FROM wood_types WHERE id = ?', [woodTypeId]);
      if (!woodTypes[0]) throw new AppError('Selected wood type was not found.', 422, 'WOOD_TYPE_NOT_FOUND');
      speciesName = woodTypes[0].common_name_en;
    }
    // 1. Resolve dimensions & volumetric calculations
    const timberType = data.timber_type || (data.category === 'Round Logs' ? 'raw_log' : 'sawn_timber');
    let lengthFeet = Number(data.length_feet || 0);
    let widthInches = Number(data.width_inches || 0);
    let thicknessInches = Number(data.thickness_inches || 0);
    let girthInches = Number(data.girth_inches || 0);
    const piecesCount = Math.max(1, parseInt(data.pieces_count || data.piecesCount || 1, 10));

    // If explicit numbers are zero, try parsing from dimensions text (e.g. '2" x 6" x 14 ft')
    if (data.dimensions && (!lengthFeet || (!widthInches && !girthInches))) {
      const parsed = parseDimensionString(data.dimensions);
      if (parsed.lengthFeet) lengthFeet = parsed.lengthFeet;
      if (parsed.widthInches) widthInches = parsed.widthInches;
      if (parsed.thicknessInches) thicknessInches = parsed.thicknessInches;
      if (parsed.girthInches) girthInches = parsed.girthInches;
    }

    let calculatedVolumeCbf = 0;
    let calculatedBoardFeet = 0;

    if (timberType === 'raw_log') {
      const vol = calculateLogVolumeHoppus({ girthInches, lengthFeet, piecesCount });
      calculatedVolumeCbf = vol.volumeCbf;
      calculatedBoardFeet = vol.boardFeet;
    } else {
      const vol = calculateRectangularVolume({ thicknessInches, widthInches, lengthFeet, piecesCount });
      calculatedVolumeCbf = vol.volumeCbf;
      calculatedBoardFeet = vol.boardFeet;
    }

    const dimensionsText = data.dimensions || formatDimensions({
      timberType,
      thicknessInches,
      widthInches,
      lengthFeet,
      girthInches,
    }) || 'Custom Spec';

    // 2. Generate unique batch code if not provided
    const batchCode = (data.batch_code || data.sku || `BATCH-${Date.now().toString(36).toUpperCase()}`).trim();

    // Check uniqueness
    const existing = await inventoryRepo.findByBatchCode(batchCode);
    if (existing) {
      throw new AppError(`A batch with code '${batchCode}' already exists.`, 409, 'BATCH_CODE_EXISTS');
    }

    const qty = Number(data.quantity || 0);
    const minThreshold = Number(data.min_stock_threshold || data.minStockThreshold || 50);
    const initialStatus = qty <= minThreshold ? 'Low Stock' : 'In Stock';

    // 3. Persist batch & record initial intake in a single transaction
    const newBatchId = await withTransaction(async (conn) => {
      const batchId = await inventoryRepo.create({
        batch_code: batchCode,
        name: data.name.trim(),
        timber_type: timberType,
        category: data.category || (timberType === 'raw_log' ? 'Round Logs' : 'Dimensional Lumber'),
        species: speciesName,
        wood_type_id: woodTypeId,
        grade: data.grade || 'Select & Better',
        dimensions_text: dimensionsText,
        length_feet: lengthFeet,
        width_inches: widthInches,
        thickness_inches: thicknessInches,
        girth_inches: girthInches,
        unit: data.unit || 'CFT',
        pieces_count: piecesCount,
        calculated_volume_cbf: calculatedVolumeCbf,
        calculated_board_feet: calculatedBoardFeet,
        quantity_total: qty,
        quantity_available: qty,
        quantity_reserved: 0,
        quantity_consumed: 0,
        ownership: data.ownership || 'mill',
        customer_id: data.ownership === 'customer' ? (data.customer_id || data.customerId) : null,
        status: initialStatus,
        yard_location: data.location || data.yard_location || 'Yard Bay A-1',
        moisture_percent: Number(data.moisture_percent ?? data.moisturePercent ?? 12),
        min_stock_threshold: minThreshold,
        cost_price: Number(data.cost_price ?? data.costPrice ?? 0),
        selling_price: Number(data.selling_price ?? data.sellingPrice ?? 0),
        image_url: data.image_url || null,
        notes: data.notes || null,
      }, conn);

      // Record initial intake in stock movements ledger
      if (qty > 0) {
        await inventoryRepo.recordMovement({
          batch_id: batchId,
          movement_type: 'receipt',
          quantity: qty,
          previous_quantity: 0,
          new_quantity: qty,
          unit: data.unit || 'CFT',
          source_transaction_type: 'initial_intake',
          source_transaction_id: batchCode,
          reason: 'Initial stock registration and intake',
          authorized_by_id: actorId,
          allow_negative: false,
          notes: 'Batch created in inventory system',
        }, conn);
      }

      return batchId;
    });

    await audit.log({
      userId: actorId,
      action: 'BATCH_CREATED',
      tableName: 'timber_batches',
      recordId: newBatchId,
      description: `Timber batch ${batchCode} (${data.name}) created with ${qty} ${data.unit || 'CFT'}`,
    });

    const created = await inventoryRepo.findById(newBatchId);
    return this._formatBatchResponse(created);
  }

  /**
   * Update permitted metadata for an existing batch.
   */
  async updateBatchMetadata(id, data, actorId) {
    const batch = await inventoryRepo.findById(id);
    if (!batch) {
      throw new AppError('Timber batch not found.', 404, 'BATCH_NOT_FOUND');
    }

    // Re-evaluate dimensions and volume if updated
    let calculatedVolumeCbf = batch.calculated_volume_cbf;
    let calculatedBoardFeet = batch.calculated_board_feet;

    const lengthFeet = data.length_feet !== undefined ? Number(data.length_feet) : batch.length_feet;
    const widthInches = data.width_inches !== undefined ? Number(data.width_inches) : batch.width_inches;
    const thicknessInches = data.thickness_inches !== undefined ? Number(data.thickness_inches) : batch.thickness_inches;
    const girthInches = data.girth_inches !== undefined ? Number(data.girth_inches) : batch.girth_inches;
    const piecesCount = data.pieces_count !== undefined ? Number(data.pieces_count) : batch.pieces_count;

    if (batch.timber_type === 'raw_log') {
      const vol = calculateLogVolumeHoppus({ girthInches, lengthFeet, piecesCount });
      calculatedVolumeCbf = vol.volumeCbf;
      calculatedBoardFeet = vol.boardFeet;
    } else {
      const vol = calculateRectangularVolume({ thicknessInches, widthInches, lengthFeet, piecesCount });
      calculatedVolumeCbf = vol.volumeCbf;
      calculatedBoardFeet = vol.boardFeet;
    }

    const dimensionsText = data.dimensions || data.dimensions_text || formatDimensions({
      timberType: batch.timber_type,
      thicknessInches,
      widthInches,
      lengthFeet,
      girthInches,
    }) || batch.dimensions_text;

    let woodTypeId;
    let species = data.species;
    if (Object.hasOwn(data, 'wood_type_id')) {
      if (data.wood_type_id === null || data.wood_type_id === '') {
        woodTypeId = null;
      } else {
        woodTypeId = Number(data.wood_type_id);
        if (!Number.isSafeInteger(woodTypeId) || woodTypeId < 1) {
          throw new AppError('Select a valid wood type.', 422, 'INVALID_WOOD_TYPE_ID');
        }
        const [woodTypes] = await query('SELECT common_name_en FROM wood_types WHERE id = ?', [woodTypeId]);
        if (!woodTypes[0]) throw new AppError('Selected wood type was not found.', 422, 'WOOD_TYPE_NOT_FOUND');
        species = woodTypes[0].common_name_en;
      }
    }
    await inventoryRepo.updateMetadata(id, {
      name: data.name,
      species,
      wood_type_id: woodTypeId,
      category: data.category,
      grade: data.grade,
      dimensions_text: dimensionsText,
      length_feet: lengthFeet,
      width_inches: widthInches,
      thickness_inches: thicknessInches,
      girth_inches: girthInches,
      calculated_volume_cbf: calculatedVolumeCbf,
      calculated_board_feet: calculatedBoardFeet,
      unit: data.unit,
      yard_location: data.location || data.yard_location,
      moisture_percent: data.moisture_percent ?? data.moisturePercent,
      min_stock_threshold: data.min_stock_threshold ?? data.minStockThreshold,
      cost_price: data.cost_price ?? data.costPrice,
      selling_price: data.selling_price ?? data.sellingPrice,
      image_url: data.image_url,
      notes: data.notes,
    });

    await audit.log({
      userId: actorId,
      action: 'BATCH_UPDATED',
      tableName: 'timber_batches',
      recordId: id,
      description: `Metadata updated for batch ${batch.batch_code}`,
    });

    const updated = await inventoryRepo.findById(id);
    return this._formatBatchResponse(updated);
  }

  /**
   * Record a stock receipt (increases available & total stock).
   */
  async recordReceipt(id, receiptData, actorId) {
    const qty = Number(receiptData.quantity);
    if (qty <= 0) {
      throw new AppError('Receipt quantity must be greater than zero.', 400, 'INVALID_QUANTITY');
    }

    const updatedBatch = await withTransaction(async (conn) => {
      // 1. Transactional row lock to prevent race conditions
      const batch = await inventoryRepo.findByIdForUpdate(id, conn);
      if (!batch) {
        throw new AppError('Timber batch not found.', 404, 'BATCH_NOT_FOUND');
      }

      if (receiptData.unit && receiptData.unit !== batch.unit) {
        throw new AppError(`Receipt unit must match this batch (${batch.unit}). Convert the quantity before saving.`, 422, 'UNIT_MISMATCH');
      }

      const prevTotal = Number(batch.quantity_total);
      const prevAvailable = Number(batch.quantity_available);
      const newTotal = prevTotal + qty;
      const newAvailable = prevAvailable + qty;

      const newStatus = newAvailable <= Number(batch.min_stock_threshold) ? 'Low Stock' : 'In Stock';

      // 2. Update batch stock
      await inventoryRepo.updateStock(id, {
        total: newTotal,
        available: newAvailable,
        reserved: Number(batch.quantity_reserved),
        consumed: Number(batch.quantity_consumed),
        status: newStatus,
      }, conn);

      // 3. Append to immutable stock movements ledger
      await inventoryRepo.recordMovement({
        batch_id: id,
        movement_type: 'receipt',
        quantity: qty,
        previous_quantity: prevAvailable,
        new_quantity: newAvailable,
        unit: batch.unit,
        source_transaction_type: receiptData.source_transaction_type || 'purchase',
        source_transaction_id: receiptData.source_transaction_id || null,
        reason: receiptData.reason || 'Goods received and inspected',
        authorized_by_id: actorId,
        allow_negative: false,
        notes: receiptData.notes || null,
      }, conn);

      return await inventoryRepo.findById(id, conn);
    });

    await audit.log({
      userId: actorId,
      action: 'STOCK_RECEIPT',
      tableName: 'stock_movements',
      recordId: id,
      description: `Received ${qty} ${updatedBatch.unit} for batch ${updatedBatch.batch_code}`,
    });

    return this._formatBatchResponse(updatedBatch);
  }

  /**
   * Record a stock issue / dispatch (deducts stock with overselling prevention).
   */
  async recordIssue(id, issueData, actorId) {
    const qty = Number(issueData.quantity);
    if (qty <= 0) {
      throw new AppError('Issue quantity must be greater than zero.', 400, 'INVALID_QUANTITY');
    }

    const updatedBatch = await withTransaction(async (conn) => {
      // 1. Acquire transactional lock
      const batch = await inventoryRepo.findByIdForUpdate(id, conn);
      if (!batch) {
        throw new AppError('Timber batch not found.', 404, 'BATCH_NOT_FOUND');
      }

      if (issueData.unit && issueData.unit !== batch.unit) {
        throw new AppError(`Issue unit must match this batch (${batch.unit}). Convert the quantity before saving.`, 422, 'UNIT_MISMATCH');
      }

      const prevAvailable = Number(batch.quantity_available);
      const prevTotal = Number(batch.quantity_total);

      // 2. Prevent overselling
      if (prevAvailable < qty) {
        throw new AppError(
          `Insufficient stock available. Requested: ${qty} ${batch.unit}, Available: ${prevAvailable} ${batch.unit}.`,
          400,
          'INSUFFICIENT_STOCK'
        );
      }

      const newAvailable = prevAvailable - qty;
      const newTotal = prevTotal - qty;
      const newConsumed = Number(batch.quantity_consumed) + qty;

      let newStatus = 'In Stock';
      if (newTotal <= 0) {
        newStatus = 'Consumed';
      } else if (newAvailable <= Number(batch.min_stock_threshold)) {
        newStatus = 'Low Stock';
      }

      // 3. Update batch stock
      await inventoryRepo.updateStock(id, {
        total: newTotal,
        available: newAvailable,
        reserved: Number(batch.quantity_reserved),
        consumed: newConsumed,
        status: newStatus,
      }, conn);

      // 4. Record in immutable movement ledger
      await inventoryRepo.recordMovement({
        batch_id: id,
        movement_type: 'issue',
        quantity: qty,
        previous_quantity: prevAvailable,
        new_quantity: newAvailable,
        unit: batch.unit,
        source_transaction_type: issueData.source_transaction_type || 'sales_order',
        source_transaction_id: issueData.source_transaction_id || null,
        reason: issueData.reason || 'Stock issued for order delivery',
        authorized_by_id: actorId,
        allow_negative: false,
        notes: issueData.notes || null,
      }, conn);

      return await inventoryRepo.findById(id, conn);
    });

    await audit.log({
      userId: actorId,
      action: 'STOCK_ISSUE',
      tableName: 'stock_movements',
      recordId: id,
      description: `Issued ${qty} ${updatedBatch.unit} from batch ${updatedBatch.batch_code}`,
    });

    return this._formatBatchResponse(updatedBatch);
  }

  /**
   * Record a stock adjustment (audit trail & negative stock protection).
   */
  async recordAdjustment(id, adjustmentData, actorId, actorRole) {
    const { adjustment_type, quantity, reason, allow_negative, notes } = adjustmentData;
    const qty = Number(quantity);

    if (isNaN(qty) || qty < 0) {
      throw new AppError('Adjustment quantity must be non-negative.', 400, 'INVALID_QUANTITY');
    }

    if (!reason || reason.trim().length < 5) {
      throw new AppError('A valid operational reason (minimum 5 characters) is required for adjustments.', 422, 'VALIDATION_ERROR');
    }

    const updatedBatch = await withTransaction(async (conn) => {
      // 1. Transactional lock
      const batch = await inventoryRepo.findByIdForUpdate(id, conn);
      if (!batch) {
        throw new AppError('Timber batch not found.', 404, 'BATCH_NOT_FOUND');
      }

      const prevAvailable = Number(batch.quantity_available);
      const prevTotal = Number(batch.quantity_total);
      let delta = 0;
      let movementType = 'adjustment_add';

      if (adjustment_type === 'add') {
        delta = qty;
        movementType = 'adjustment_add';
      } else if (adjustment_type === 'deduct') {
        delta = -qty;
        movementType = 'adjustment_deduct';
      } else if (adjustment_type === 'set_exact') {
        delta = qty - prevAvailable;
        movementType = delta >= 0 ? 'adjustment_add' : 'adjustment_deduct';
      }

      const newAvailable = prevAvailable + delta;
      const newTotal = prevTotal + delta;

      // 2. Negative stock protection rule
      if (newAvailable < 0) {
        const isAuthorizedOverride = Boolean(allow_negative) && actorRole === 'admin';
        if (!isAuthorizedOverride) {
          throw new AppError(
            `Adjustment results in negative stock (${newAvailable} ${batch.unit}). Negative stock requires authorized administrative approval.`,
            400,
            'NEGATIVE_STOCK_NOT_ALLOWED'
          );
        }
      }

      let newStatus = 'In Stock';
      if (newTotal <= 0) {
        newStatus = 'Consumed';
      } else if (newAvailable <= Number(batch.min_stock_threshold)) {
        newStatus = 'Low Stock';
      }

      // 3. Update batch stock
      await inventoryRepo.updateStock(id, {
        total: newTotal,
        available: newAvailable,
        reserved: Number(batch.quantity_reserved),
        consumed: Number(batch.quantity_consumed),
        status: newStatus,
      }, conn);

      // 4. Record immutable stock movement
      await inventoryRepo.recordMovement({
        batch_id: id,
        movement_type: movementType,
        quantity: Math.abs(delta),
        previous_quantity: prevAvailable,
        new_quantity: newAvailable,
        unit: batch.unit,
        source_transaction_type: 'manual_adjustment',
        source_transaction_id: `ADJ-${Date.now().toString(36).toUpperCase()}`,
        reason: reason.trim(),
        authorized_by_id: actorId,
        allow_negative: Boolean(allow_negative),
        notes: notes || null,
      }, conn);

      return await inventoryRepo.findById(id, conn);
    });

    await audit.log({
      userId: actorId,
      action: 'STOCK_ADJUSTMENT',
      tableName: 'stock_movements',
      recordId: id,
      description: `Stock adjusted on ${updatedBatch.batch_code} (${adjustment_type}: ${qty}). Reason: ${reason}`,
    });

    return this._formatBatchResponse(updatedBatch);
  }

  /**
   * Delete batch.
   */
  async deleteBatch(id, actorId) {
    const batch = await inventoryRepo.findById(id);
    if (!batch) {
      throw new AppError('Timber batch not found.', 404, 'BATCH_NOT_FOUND');
    }

    await inventoryRepo.delete(id);

    await audit.log({
      userId: actorId,
      action: 'BATCH_DELETED',
      tableName: 'timber_batches',
      recordId: id,
      description: `Deleted batch ${batch.batch_code} (${batch.name})`,
    });

    return { id, batch_code: batch.batch_code };
  }

  /**
   * Helper: Map raw database record to frontend-compatible contract.
   */
  _formatBatchResponse(row) {
    return {
      id: row.id,
      sku: row.batch_code,
      batchCode: row.batch_code,
      name: row.name,
      timberType: row.timber_type,
      category: row.category,
      species: row.species,
      woodTypeId: row.wood_type_id || null,
      names: [],
      imageUrl: row.display_image_url || row.image_url || null,
      grade: row.grade,
      dimensions: row.dimensions_text,
      lengthFeet: Number(row.length_feet || 0),
      widthInches: Number(row.width_inches || 0),
      thicknessInches: Number(row.thickness_inches || 0),
      girthInches: Number(row.girth_inches || 0),
      unit: row.unit,
      piecesCount: Number(row.pieces_count || 1),
      volumeCbf: Number(row.calculated_volume_cbf || 0),
      boardFeet: Number(row.calculated_board_feet || 0),
      // Stock figures
      quantity: Number(row.quantity_available || 0),
      quantityTotal: Number(row.quantity_total || 0),
      quantityAvailable: Number(row.quantity_available || 0),
      quantityReserved: Number(row.quantity_reserved || 0),
      quantityConsumed: Number(row.quantity_consumed || 0),
      ownership: row.ownership,
      customerId: row.customer_id,
      customerName: row.customer_name || row.customer_company || null,
      status: row.status,
      location: row.yard_location,
      yardLocation: row.yard_location,
      moisturePercent: Number(row.moisture_percent || 0),
      minStockThreshold: Number(row.min_stock_threshold || 50),
      costPrice: Number(row.cost_price || 0),
      sellingPrice: Number(row.selling_price || 0),
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async _attachWoodNames(items) {
    const ids = [...new Set(items.map((item) => item.woodTypeId).filter(Boolean))];
    if (!ids.length) return items;
    const placeholders = ids.map(() => '?').join(', ');
    const [woodTypes] = await query(
      `SELECT id, scientific_name, scientific_name_verified, common_name_verified
         FROM wood_types WHERE id IN (${placeholders})`,
      ids
    );
    const [names] = await query(
      `SELECT wood_type_id, language_code, name, name_kind, verified
         FROM wood_names
        WHERE wood_type_id IN (${placeholders})
        ORDER BY language_code, name_kind = 'preferred' DESC, name`,
      ids
    );
    const namesByType = new Map();
    for (const name of names) {
      const list = namesByType.get(name.wood_type_id) || [];
      list.push(name);
      namesByType.set(name.wood_type_id, list);
    }
    const typeById = new Map(woodTypes.map((type) => [type.id, type]));
    return items.map((item) => {
      const type = typeById.get(item.woodTypeId);
      return {
        ...item,
        names: namesByType.get(item.woodTypeId) || [],
        scientificName: type?.scientific_name || null,
        scientificNameVerified: Boolean(type?.scientific_name_verified),
        commonNameVerified: Boolean(type?.common_name_verified)
      };
    });
  }

  /**
   * Helper: Map raw movement record to API contract.
   */
  _formatMovementResponse(row) {
    return {
      id: row.id,
      batchId: row.batch_id,
      movementType: row.movement_type,
      quantity: Number(row.quantity),
      previousQuantity: Number(row.previous_quantity),
      newQuantity: Number(row.new_quantity),
      unit: row.unit,
      sourceTransactionType: row.source_transaction_type,
      sourceTransactionId: row.source_transaction_id,
      reason: row.reason,
      authorizedByUsername: row.authorized_by_username || 'System',
      allowNegative: Boolean(row.allow_negative),
      notes: row.notes,
      createdAt: row.created_at,
    };
  }
}

module.exports = new InventoryService();
