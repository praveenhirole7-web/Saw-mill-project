'use strict';
/**
 * services/purchaseService.js
 *
 * Timber Procurement & Goods Receipt Service.
 * Coordinates multi-table transactional purchases, line item calculations,
 * and goods receipt inventory batch generation.
 */
const purchaseRepository = require('../repositories/purchaseRepository');
const supplierRepository = require('../repositories/supplierRepository');
const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const audit = require('../utils/audit');
const {
  calculateRectangularVolume,
  calculateLogVolumeHoppus,
  formatDimensions,
} = require('../utils/timberVolume');

class PurchaseService {
  /**
   * List purchase orders.
   */
  async listPurchases({ search, status, paymentStatus, page = 1, limit = 50 }) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    return purchaseRepository.listPurchases({ search, status, paymentStatus, page: p, limit: l });
  }

  /**
   * Get single purchase details.
   */
  async getPurchaseDetails(id) {
    const purchaseId = parseInt(id, 10);
    if (!purchaseId || isNaN(purchaseId)) {
      throw new AppError('Valid Purchase ID is required.', 400, 'INVALID_PURCHASE_ID');
    }

    const purchase = await purchaseRepository.findById(purchaseId);
    if (!purchase) {
      throw new AppError(`Purchase order #${purchaseId} not found.`, 404, 'PURCHASE_NOT_FOUND');
    }

    return purchase;
  }

  /**
   * Create a purchase order / draft.
   * NOTE: This does NOT update inventory or create timber batches.
   */
  async createPurchase(data, actorId = null) {
    const supplierId = parseInt(data.supplier_id || data.supplierId, 10);
    if (!supplierId || isNaN(supplierId)) {
      throw new AppError('A valid Supplier ID is required.', 400, 'VALIDATION_ERROR');
    }

    const supplier = await supplierRepository.findById(supplierId);
    if (!supplier) {
      throw new AppError(`Supplier #${supplierId} does not exist.`, 404, 'SUPPLIER_NOT_FOUND');
    }

    // Process & validate line items
    let rawItems = data.items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      // Support single item quick form from UI if items array is not given
      if (data.species) {
        rawItems = [{
          timber_type: data.timber_type || data.timberType || 'raw_log',
          species: data.species,
          wood_type_id: data.wood_type_id,
          grade: data.grade || 'Select & Better',
          length_feet: Number(data.length_feet || data.lengthFeet || 12),
          girth_inches: Number(data.girth_inches || data.girthInches || (data.timber_type === 'raw_log' ? 36 : 0)),
          width_inches: Number(data.width_inches || data.widthInches || 0),
          thickness_inches: Number(data.thickness_inches || data.thicknessInches || 0),
          pieces_count: Math.max(1, parseInt(data.logsCount || data.pieces_count || 1, 10)),
          volume_cbf: parseFloat(String(data.volume || data.volume_cbf || 0).replace(/[^0-9.]/g, '')) || 0,
          unit: data.unit || 'CFT',
          unit_price: parseFloat(data.pricePerCFT || data.unit_price || 0),
          total_price: parseFloat(data.totalCost || data.total_price || 0),
        }];
      } else {
        throw new AppError('At least one purchase item is required.', 400, 'EMPTY_PURCHASE_ITEMS');
      }
    }

    const items = [];
    let calculatedSubtotal = 0;

    for (let i = 0; i < rawItems.length; i++) {
      const it = rawItems[i];
      let species = typeof it.species === 'string' ? it.species.trim() : '';
      let woodTypeId = null;
      if (it.wood_type_id !== undefined && it.wood_type_id !== null && it.wood_type_id !== '') {
        woodTypeId = Number(it.wood_type_id);
        if (!Number.isSafeInteger(woodTypeId) || woodTypeId < 1) {
          throw new AppError(`Item #${i + 1} must select a valid wood type.`, 400, 'INVALID_WOOD_TYPE_ID');
        }
        const [woodTypes] = await query('SELECT common_name_en FROM wood_types WHERE id = ?', [woodTypeId]);
        if (!woodTypes[0]) throw new AppError(`Item #${i + 1} wood type was not found.`, 404, 'WOOD_TYPE_NOT_FOUND');
        species = woodTypes[0].common_name_en;
      }
      if (!species) {
        throw new AppError(`Item #${i + 1} must specify a timber species.`, 400, 'VALIDATION_ERROR');
      }

      const timberType = it.timber_type === 'sawn_timber' || it.timberType === 'sawn_timber'
        ? 'sawn_timber'
        : 'raw_log';

      const piecesCount = Math.max(1, parseInt(it.pieces_count || it.piecesCount || 1, 10));
      const lengthFeet = Math.max(0, Number(it.length_feet ?? it.lengthFeet ?? 0));
      const widthInches = Math.max(0, Number(it.width_inches ?? it.widthInches ?? 0));
      const thicknessInches = Math.max(0, Number(it.thickness_inches ?? it.thicknessInches ?? 0));
      const girthInches = Math.max(0, Number(it.girth_inches ?? it.girthInches ?? 0));
      const unitPrice = Math.max(0, Number(it.unit_price ?? it.pricePerCFT ?? 0));

      let volumeCbf = Number(it.volume_cbf ?? it.volume ?? 0);
      if (volumeCbf <= 0) {
        if (timberType === 'raw_log' && girthInches > 0 && lengthFeet > 0) {
          const calc = calculateLogVolumeHoppus({ girthInches, lengthFeet, piecesCount });
          volumeCbf = calc.volumeCbf;
        } else if (timberType === 'sawn_timber' && thicknessInches > 0 && widthInches > 0 && lengthFeet > 0) {
          const calc = calculateRectangularVolume({ thicknessInches, widthInches, lengthFeet, piecesCount });
          volumeCbf = calc.volumeCbf;
        }
      }

      let lineTotal = Number(it.total_price ?? it.totalPrice ?? 0);
      if (lineTotal <= 0) {
        if (volumeCbf > 0 && unitPrice > 0) {
          lineTotal = Number((volumeCbf * unitPrice).toFixed(2));
        } else if (piecesCount > 0 && unitPrice > 0) {
          lineTotal = Number((piecesCount * unitPrice).toFixed(2));
        }
      }

      calculatedSubtotal += lineTotal;

      const formattedDims = formatDimensions({
        timberType,
        thicknessInches,
        widthInches,
        lengthFeet,
        girthInches,
      });

      items.push({
        timber_type: timberType,
        species,
        wood_type_id: woodTypeId,
        grade: it.grade || 'Select & Better',
        dimensions_text: it.dimensions_text || formattedDims,
        length_feet: lengthFeet,
        width_inches: widthInches,
        thickness_inches: thicknessInches,
        girth_inches: girthInches,
        pieces_count: piecesCount,
        volume_cbf: volumeCbf,
        unit: it.unit || 'CFT',
        unit_price: unitPrice,
        total_price: lineTotal,
      });
    }

    // Purchase calculations
    const subtotal = calculatedSubtotal;
    const discountAmount = Math.max(0, Number(data.discount_amount ?? data.discountAmount ?? 0));
    const taxRate = Math.max(0, Number(data.tax_rate ?? data.taxRate ?? 0));
    const taxableAmount = Math.max(0, subtotal - discountAmount);
    const taxAmount = Number(((taxableAmount * taxRate) / 100).toFixed(2));
    const totalCost = Number((taxableAmount + taxAmount).toFixed(2));

    const status = data.status || 'draft';
    const paymentStatus = data.payment_status || data.paymentStatus || 'pending';

    const result = await withTransaction(async (conn) => {
      const purchaseNumber = await purchaseRepository.generatePurchaseNumber(conn);

      const purchaseData = {
        purchase_number: purchaseNumber,
        supplier_id: supplierId,
        status,
        payment_status: paymentStatus,
        payment_method: data.payment_method || data.paymentMethod || 'Bank Wire Transfer',
        expected_delivery_date: data.expected_delivery_date || data.expectedDeliveryDate || data.deliveryDate || null,
        actual_delivery_date: null,
        subtotal,
        discount_amount: discountAmount,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total_cost: totalCost,
        paid_amount: paymentStatus === 'Paid' || paymentStatus === 'paid' ? totalCost : 0.00,
        invoice_ref: data.invoice_ref || data.invoiceRef || null,
        notes: data.notes || null,
      };

      const purchaseId = await purchaseRepository.createPurchase(purchaseData, items, conn);
      return { purchaseId, purchaseNumber };
    });

    const created = await purchaseRepository.findById(result.purchaseId);

    await audit.log({
      userId: actorId,
      action: 'PURCHASE_ORDER_CREATED',
      tableName: 'purchases',
      recordId: result.purchaseId,
      description: `Created purchase order ${result.purchaseNumber} for ${supplier.company_name} (Total: $${totalCost.toLocaleString()})`,
    });

    return created;
  }

  /**
   * Receive goods for a purchase order.
   *
   * BUSINESS RULES:
   * 1. Uses a MySQL transaction with row-level locking (`FOR UPDATE`).
   * 2. Prevents duplicate receipt attempts (`status === 'received'`).
   * 3. Creates traceable timber batches in `timber_batches`.
   * 4. Records immutable movements in `stock_movements`.
   * 5. Updates `purchase_items` with `generated_batch_id`.
   * 6. Transitions `purchases` status to `'received'`.
   */
  async receivePurchaseGoods(id, receiptData = {}, actorId = null) {
    const purchaseId = parseInt(id, 10);
    if (!purchaseId || isNaN(purchaseId)) {
      throw new AppError('Valid Purchase ID is required.', 400, 'INVALID_PURCHASE_ID');
    }

    const receiptResult = await withTransaction(async (conn) => {
      // 1. Acquire row-level lock on purchase
      const purchase = await purchaseRepository.findByIdForUpdate(purchaseId, conn);
      if (!purchase) {
        throw new AppError(`Purchase order #${purchaseId} not found.`, 404, 'PURCHASE_NOT_FOUND');
      }

      // 2. Prevent duplicate receipt processing!
      if (purchase.status === 'received') {
        throw new AppError(
          `Purchase order ${purchase.purchase_number} has already been received and processed into inventory.`,
          400,
          'DUPLICATE_RECEIPT'
        );
      }

      if (purchase.status === 'cancelled') {
        throw new AppError(
          `Cannot receive goods for cancelled purchase order ${purchase.purchase_number}.`,
          400,
          'PURCHASE_CANCELLED'
        );
      }

      // 3. Fetch purchase line items
      const items = await purchaseRepository.getPurchaseItems(purchaseId, conn);
      if (!items || items.length === 0) {
        throw new AppError(
          `Purchase order ${purchase.purchase_number} has no line items to receive.`,
          400,
          'EMPTY_PURCHASE_ITEMS'
        );
      }

      const generatedBatches = [];

      // 4. For each line item, generate traceable batch & record stock movement
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const batchCode = `BATCH-${purchase.purchase_number}-${(i + 1).toString().padStart(2, '0')}`;
        const qty = Number(item.volume_cbf) > 0 ? Number(item.volume_cbf) : Number(item.pieces_count);

        const category = item.timber_type === 'raw_log' ? 'Round Logs' : 'Dimensional Lumber';
        const name = `${item.species} (${item.timber_type === 'raw_log' ? 'Raw Log' : 'Sawn Lumber'})`;

        const batchData = {
          batch_code: batchCode,
          name,
          timber_type: item.timber_type,
          category,
          species: item.species,
          wood_type_id: item.wood_type_id || null,
          grade: item.grade || 'Select & Better',
          dimensions_text: item.dimensions_text,
          length_feet: item.length_feet,
          width_inches: item.width_inches,
          thickness_inches: item.thickness_inches,
          girth_inches: item.girth_inches,
          unit: item.unit || 'CFT',
          pieces_count: item.pieces_count,
          calculated_volume_cbf: item.volume_cbf,
          calculated_board_feet: Number((item.volume_cbf * 12).toFixed(3)),
          quantity_total: qty,
          quantity_available: qty,
          yard_location: receiptData.yard_location || receiptData.yardLocation || 'Receiving Yard Bay A-1',
          cost_price: item.unit_price,
          selling_price: Number((item.unit_price * 1.35).toFixed(2)),
          notes: `Intake from PO ${purchase.purchase_number}. Scaled: ${qty} ${item.unit}`,
        };

        const batchId = await purchaseRepository.createTimberBatch(batchData, conn);

        // Record stock movement
        await purchaseRepository.recordStockMovement({
          batch_id: batchId,
          movement_type: 'receipt',
          quantity: qty,
          previous_quantity: 0,
          new_quantity: qty,
          unit: item.unit || 'CFT',
          source_transaction_type: 'purchase',
          source_transaction_id: purchase.purchase_number,
          reason: `Goods receipt for Purchase Order ${purchase.purchase_number}`,
          authorized_by_id: actorId,
          notes: receiptData.notes || `Log intake from supplier. Batch: ${batchCode}`,
        }, conn);

        // Update purchase item with reference to generated batch
        await purchaseRepository.updatePurchaseItemBatch(item.id, batchId, conn);

        generatedBatches.push({
          batchId,
          batchCode,
          species: item.species,
          quantity: qty,
          unit: item.unit,
        });
      }

      // 5. Mark purchase as received
      const actualDeliveryDate = receiptData.actual_delivery_date || receiptData.deliveryDate || new Date().toISOString().split('T')[0];
      await purchaseRepository.markPurchaseReceived(
        purchaseId,
        {
          actualDeliveryDate,
          receivedById: actorId,
        },
        conn
      );

      return {
        purchaseId,
        purchaseNumber: purchase.purchase_number,
        generatedBatches,
        totalItemsReceived: items.length,
      };
    });

    const updatedPurchase = await purchaseRepository.findById(purchaseId);

    await audit.log({
      userId: actorId,
      action: 'PURCHASE_GOODS_RECEIVED',
      tableName: 'purchases',
      recordId: purchaseId,
      description: `Received goods for ${receiptResult.purchaseNumber} (${receiptResult.totalItemsReceived} line items intake into inventory)`,
    });

    return {
      purchase: updatedPurchase,
      receiptSummary: receiptResult,
    };
  }
}

module.exports = new PurchaseService();
