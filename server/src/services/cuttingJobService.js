'use strict';
/**
 * services/cuttingJobService.js
 *
 * Business logic service for Sawmill Cutting Jobs:
 *   - Draft isolation (no stock consumed for drafts)
 *   - Controlled stock reservation and consumption workflows
 *   - Separate recording of actual finished outputs vs input volumes
 *   - Waste & kerf loss discrepancy calculations
 *   - Idempotent completion protection (prevent double-completion)
 *   - Multi-table transaction safety
 *   - Support for customer-owned custom sawing without tainting mill stock
 *   - Backend cutting charge and labour fee calculations
 *   - Comprehensive cutting job reports and authorized corrections
 */
const cuttingJobRepository = require('../repositories/cuttingJobRepository');
const inventoryRepository = require('../repositories/inventoryRepository');
const customerRepository = require('../repositories/customerRepository');
const { withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const audit = require('../utils/audit');
const {
  calculateRectangularVolume,
  formatDimensions,
} = require('../utils/timberVolume');

class CuttingJobService {
  /**
   * List cutting jobs with search, filtering, and pagination.
   */
  async listCuttingJobs({ search, status, sawLine, customerId, page = 1, limit = 50 }) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    return cuttingJobRepository.listCuttingJobs({ search, status, sawLine, customerId, page: p, limit: l });
  }

  /**
   * Get single cutting job with inputs, outputs, and customer info.
   */
  async getCuttingJobDetails(id) {
    const jobId = parseInt(id, 10);
    if (!jobId || isNaN(jobId)) {
      throw new AppError('Valid Cutting Job ID is required.', 400, 'INVALID_JOB_ID');
    }

    const job = await cuttingJobRepository.findById(jobId);
    if (!job) {
      throw new AppError(`Cutting job #${jobId} not found.`, 404, 'JOB_NOT_FOUND');
    }

    return job;
  }

  /**
   * Create a new cutting job.
   *
   * BUSINESS RULE 1: Do not consume stock when a job is only a draft.
   */
  async createCuttingJob(data, actorId = null) {
    const jobTitle = data.job_title || data.jobTitle;
    if (!jobTitle || !jobTitle.trim()) {
      throw new AppError('Job title is required.', 400, 'VALIDATION_ERROR');
    }

    const requestedDimensions = data.requested_dimensions || data.requestedDimensions || data.cuttingSpec;
    if (!requestedDimensions || !requestedDimensions.trim()) {
      throw new AppError('Requested cutting dimensions/specifications are required.', 400, 'VALIDATION_ERROR');
    }

    const jobType = data.job_type || data.jobType || 'customer_order';
    let customerId = data.customer_id || data.customerId ? parseInt(data.customer_id || data.customerId, 10) : null;

    if (jobType === 'customer_order' && customerId) {
      const customer = await customerRepository.findById(customerId);
      if (!customer) {
        throw new AppError(`Customer #${customerId} does not exist.`, 404, 'CUSTOMER_NOT_FOUND');
      }
    }

    // Process input batches
    let rawInputs = data.inputs;
    if (!Array.isArray(rawInputs) || rawInputs.length === 0) {
      // Support quick single log tag from UI
      if (data.batch_id || data.batchId || data.logTag) {
        let bId = data.batch_id || data.batchId;
        if (!bId && data.logTag) {
          const batch = await inventoryRepository.findByBatchCode(data.logTag);
          if (batch) bId = batch.id;
        }

        if (!bId) {
          // If no specific batch found, fallback to first available raw log batch
          const list = await inventoryRepository.listBatches({ limit: 1 });
          if (list.items.length > 0) bId = list.items[0].id;
        }

        const vol = parseFloat(String(data.inputVolume || data.input_volume || 100).replace(/[^0-9.]/g, '')) || 100;
        rawInputs = [{ batch_id: bId, quantity_used: vol }];
      } else {
        throw new AppError('At least one source timber batch input is required.', 400, 'EMPTY_INPUT_BATCHES');
      }
    }

    let inputTotalVolume = 0;
    let jobOwnership = data.ownership || (jobType === 'customer_order' && customerId ? 'customer' : 'mill');
    const inputs = [];

    for (let i = 0; i < rawInputs.length; i++) {
      const inp = rawInputs[i];
      const batchId = parseInt(inp.batch_id || inp.batchId, 10);
      if (!batchId || isNaN(batchId)) {
        throw new AppError(`Input #${i + 1} must specify a valid source timber batch ID.`, 400, 'INVALID_BATCH_ID');
      }

      const batch = await inventoryRepository.findById(batchId);
      if (!batch) {
        throw new AppError(`Source timber batch #${batchId} does not exist.`, 404, 'BATCH_NOT_FOUND');
      }

      const inputUnit = inp.unit || batch.unit || 'CFT';
      if (inputUnit !== (batch.unit || 'CFT')) {
        throw new AppError(`Cutting input unit must match batch ${batch.batch_code} (${batch.unit}). Convert the quantity before saving.`, 422, 'UNIT_MISMATCH');
      }

      const qty = Math.max(0.001, Number(inp.quantity_used || inp.quantity || 0));

      // BUSINESS RULE 2: Validate available input stock
      if (Number(batch.quantity_available) < qty) {
        throw new AppError(
          `Insufficient stock in batch ${batch.batch_code}. Requested: ${qty} ${batch.unit}, Available: ${batch.quantity_available} ${batch.unit}.`,
          400,
          'INSUFFICIENT_STOCK'
        );
      }

      if (batch.ownership === 'customer') {
        jobOwnership = 'customer';
        if (!customerId && batch.customer_id) {
          customerId = batch.customer_id;
        }
      }

      inputTotalVolume += qty;
      inputs.push({
        batch_id: batchId,
        quantity_used: qty,
        unit: inputUnit,
      });
    }

    // Process planned outputs (if provided in creation request)
    const outputs = [];
    if (Array.isArray(data.outputs)) {
      for (const out of data.outputs) {
        const thickness = Math.max(0, Number(out.thickness_inches || out.thicknessInches || 2));
        const width = Math.max(0, Number(out.width_inches || out.widthInches || 6));
        const length = Math.max(0, Number(out.length_feet || out.lengthFeet || 12));
        const pieces = Math.max(1, parseInt(out.pieces_count || out.piecesCount || 1, 10));

        let vol = Number(out.volume_cbf || out.volume || 0);
        if (vol <= 0 && thickness > 0 && width > 0 && length > 0) {
          vol = calculateRectangularVolume({ thicknessInches: thickness, widthInches: width, lengthFeet: length, piecesCount: pieces }).volumeCbf;
        }

        outputs.push({
          product_name: out.product_name || out.productName || `${thickness}" x ${width}" Sawn Lumber`,
          species: out.species || 'Douglas Fir',
          dimensions_text: out.dimensions_text || `${thickness}" × ${width}" × ${length}'`,
          thickness_inches: thickness,
          width_inches: width,
          length_feet: length,
          pieces_count: pieces,
          volume_cbf: vol,
          unit: out.unit || 'CFT',
          grade: out.grade || 'Select Structural',
        });
      }
    }

    // BUSINESS RULE 10: Calculate cutting charges on backend
    const ratePerCbf = Math.max(0, Number(data.rate_per_cbf ?? data.ratePerCbf ?? 15.00));
    const labourCharges = Math.max(0, Number(data.labour_charges ?? data.labourCharges ?? 120.00));
    const cuttingCharges = Number((inputTotalVolume * ratePerCbf).toFixed(2));
    const totalCharges = Number((cuttingCharges + labourCharges).toFixed(2));

    const status = data.status || 'draft';

    const result = await withTransaction(async (conn) => {
      const jobNumber = await cuttingJobRepository.generateJobNumber(conn);

      const jobData = {
        job_number: jobNumber,
        job_title: jobTitle.trim(),
        job_type: jobType,
        customer_id: customerId,
        saw_line: data.saw_line || data.sawLine || 'Line 1 (60" Band Saw)',
        operator_name: data.operator_name || data.operatorName || data.operator || 'Marcus Vance',
        priority: data.priority || 'Normal',
        requested_dimensions: requestedDimensions.trim(),
        kerf_allowance: data.kerf_allowance || data.kerfAllowance || '0.125"',
        status,
        input_total_volume: inputTotalVolume,
        output_total_volume: 0,
        waste_volume: 0,
        recovery_rate: 0,
        rate_per_cbf: ratePerCbf,
        labour_charges: labourCharges,
        total_charges: totalCharges,
        ownership: jobOwnership,
        start_date: data.start_date || data.startDate || null,
        due_date: data.due_date || data.dueDate || null,
        notes: data.notes || null,
        created_by_id: actorId,
      };

      const jobId = await cuttingJobRepository.createCuttingJob(jobData, inputs, outputs, conn);
      return { jobId, jobNumber };
    });

    const created = await cuttingJobRepository.findById(result.jobId);

    await audit.log({
      userId: actorId,
      action: 'CUTTING_JOB_CREATED',
      tableName: 'cutting_jobs',
      recordId: result.jobId,
      description: `Created cutting job ${result.jobNumber} (${jobTitle}) with ${inputs.length} input batches (${inputTotalVolume.toFixed(3)} CFT)`,
    });

    return created;
  }

  /**
   * Start / dispatch a cutting job (transitions status to 'in_progress' and reserves input stock).
   *
   * BUSINESS RULE 2: Controlled workflow reserving stock for in-progress operations.
   */
  async startCuttingJob(id, actorId = null) {
    const jobId = parseInt(id, 10);
    if (!jobId || isNaN(jobId)) {
      throw new AppError('Valid Cutting Job ID is required.', 400, 'INVALID_JOB_ID');
    }

    const result = await withTransaction(async (conn) => {
      const job = await cuttingJobRepository.findByIdForUpdate(jobId, conn);
      if (!job) {
        throw new AppError(`Cutting job #${jobId} not found.`, 404, 'JOB_NOT_FOUND');
      }

      if (job.status === 'completed') {
        throw new AppError('Cannot start an already completed cutting job.', 400, 'JOB_ALREADY_COMPLETED');
      }
      if (job.status === 'cancelled') {
        throw new AppError('Cannot start a cancelled cutting job.', 400, 'JOB_CANCELLED');
      }

      const inputs = await cuttingJobRepository.getJobInputs(jobId, conn);

      // Reserve stock on input batches
      for (const inp of inputs) {
        const batch = await cuttingJobRepository.findBatchForUpdate(inp.batch_id, conn);
        if (!batch) {
          throw new AppError(`Source batch #${inp.batch_id} not found.`, 404, 'BATCH_NOT_FOUND');
        }

        const qty = Number(inp.quantity_used);
        if (Number(batch.quantity_available) < qty) {
          throw new AppError(
            `Insufficient stock in batch ${batch.batch_code} to start run. Available: ${batch.quantity_available}, Required: ${qty}`,
            400,
            'INSUFFICIENT_STOCK'
          );
        }

        // Reserve stock
        await cuttingJobRepository.updateBatchStock(
          inp.batch_id,
          {
            availableDelta: -qty,
            reservedDelta: +qty,
          },
          conn
        );

        // Record stock movement
        await cuttingJobRepository.recordStockMovement(
          {
            batch_id: inp.batch_id,
            movement_type: 'reservation',
            quantity: qty,
            previous_quantity: batch.quantity_available,
            new_quantity: Number(batch.quantity_available) - qty,
            unit: inp.unit,
            source_transaction_type: 'cutting_job',
            source_transaction_id: job.job_number,
            reason: `Reserved stock for cutting run ${job.job_number}`,
            authorized_by_id: actorId,
          },
          conn
        );
      }

      await cuttingJobRepository.updateStatus(jobId, 'in_progress', conn);
      return job.job_number;
    });

    await audit.log({
      userId: actorId,
      action: 'CUTTING_JOB_STARTED',
      tableName: 'cutting_jobs',
      recordId: jobId,
      description: `Dispatched cutting job ${result} into production (Reserved input stock)`,
    });

    return cuttingJobRepository.findById(jobId);
  }

  /**
   * Complete a cutting job and post inventory outputs.
   *
   * BUSINESS RULES:
   * 1. Uses a MySQL transaction.
   * 2. Prevents duplicate completion (idempotency check).
   * 3. Consumes input timber batches.
   * 4. Posts finished lumber batches to inventory separately.
   * 5. Supports customer-owned timber without adding to mill saleable stock.
   * 6. Calculates waste discrepancy and recovery yield %.
   * 7. Calculates final cutting and labour charges on backend.
   */
  async completeCuttingJob(id, completionData = {}, actorId = null) {
    const jobId = parseInt(id, 10);
    if (!jobId || isNaN(jobId)) {
      throw new AppError('Valid Cutting Job ID is required.', 400, 'INVALID_JOB_ID');
    }

    const completionResult = await withTransaction(async (conn) => {
      // 1. Lock cutting job row FOR UPDATE
      const job = await cuttingJobRepository.findByIdForUpdate(jobId, conn);
      if (!job) {
        throw new AppError(`Cutting job #${jobId} not found.`, 404, 'JOB_NOT_FOUND');
      }

      // BUSINESS RULE 5: Prevent completing the same job twice!
      if (job.status === 'completed') {
        throw new AppError(
          `Cutting job ${job.job_number} has already been completed and inventory outputs posted.`,
          400,
          'DUPLICATE_COMPLETION'
        );
      }

      if (job.status === 'cancelled') {
        throw new AppError(
          `Cannot complete cancelled cutting job ${job.job_number}.`,
          400,
          'JOB_CANCELLED'
        );
      }

      // 2. Fetch input batches and consume stock
      const inputs = await cuttingJobRepository.getJobInputs(jobId, conn);
      if (!inputs || inputs.length === 0) {
        throw new AppError(`Cutting job ${job.job_number} has no recorded input batches.`, 400, 'EMPTY_INPUT_BATCHES');
      }

      let totalInputVolume = 0;

      for (const inp of inputs) {
        const batch = await cuttingJobRepository.findBatchForUpdate(inp.batch_id, conn);
        if (!batch) {
          throw new AppError(`Input batch #${inp.batch_id} not found.`, 404, 'BATCH_NOT_FOUND');
        }

        const qty = Number(inp.quantity_used);
        totalInputVolume += qty;

        if (job.status === 'in_progress') {
          // Stock was already reserved: consume reserved stock
          await cuttingJobRepository.updateBatchStock(
            inp.batch_id,
            {
              reservedDelta: -qty,
              consumedDelta: +qty,
              totalDelta: -qty,
            },
            conn
          );
        } else {
          // Job was in draft/scheduled: consume directly from available
          if (Number(batch.quantity_available) < qty) {
            throw new AppError(
              `Insufficient stock in batch ${batch.batch_code}. Required: ${qty}, Available: ${batch.quantity_available}`,
              400,
              'INSUFFICIENT_STOCK'
            );
          }

          await cuttingJobRepository.updateBatchStock(
            inp.batch_id,
            {
              availableDelta: -qty,
              consumedDelta: +qty,
              totalDelta: -qty,
            },
            conn
          );
        }

        // Record stock movement for consumption
        await cuttingJobRepository.recordStockMovement(
          {
            batch_id: inp.batch_id,
            movement_type: 'issue',
            quantity: qty,
            previous_quantity: batch.quantity_available,
            new_quantity: Math.max(0, Number(batch.quantity_available) - qty),
            unit: inp.unit,
            source_transaction_type: 'cutting_job',
            source_transaction_id: job.job_number,
            reason: `Sawing cut consumption for job ${job.job_number}`,
            authorized_by_id: actorId,
            notes: `Milled on ${job.saw_line} by ${job.operator_name || 'Sawyer'}`,
          },
          conn
        );
      }

      // 3. Process and post finished lumber outputs
      let rawOutputs = completionData.outputs;
      if (!Array.isArray(rawOutputs) || rawOutputs.length === 0) {
        rawOutputs = await cuttingJobRepository.getJobOutputs(jobId, conn);
      }

      // If no outputs specified, generate default primary lumber output from input volume & kerf spec
      if (!Array.isArray(rawOutputs) || rawOutputs.length === 0) {
        const estYieldRatio = 0.75; // Standard 75% primary sawn lumber recovery yield
        const primaryVol = Number((totalInputVolume * estYieldRatio).toFixed(3));
        const pieces = Math.max(1, Math.round(primaryVol / 1.5));
        rawOutputs = [
          {
            product_name: `${job.requested_dimensions} Sawn Lumber`,
            species: inputs[0]?.species || 'Douglas Fir',
            dimensions_text: job.requested_dimensions,
            thickness_inches: 2,
            width_inches: 8,
            length_feet: 16,
            pieces_count: pieces,
            volume_cbf: primaryVol,
            unit: 'CFT',
            grade: 'Select Structural',
          }
        ];
      }

      let totalOutputVolume = 0;
      const totalInputCost = inputs.reduce(
        (total, input) => total + Number(input.quantity_used) * Number(input.cost_price || 0),
        0
      );
      const generatedBatches = [];

      for (let i = 0; i < rawOutputs.length; i++) {
        const out = rawOutputs[i];
        const thickness = Math.max(0, Number(out.thickness_inches || out.thicknessInches || 2));
        const width = Math.max(0, Number(out.width_inches || out.widthInches || 6));
        const length = Math.max(0, Number(out.length_feet || out.lengthFeet || 12));
        const pieces = Math.max(1, parseInt(out.pieces_count || out.piecesCount || 1, 10));

        let vol = Number(out.volume_cbf || out.volume || 0);
        if (vol <= 0 && thickness > 0 && width > 0 && length > 0) {
          vol = calculateRectangularVolume({ thicknessInches: thickness, widthInches: width, lengthFeet: length, piecesCount: pieces }).volumeCbf;
        }

        totalOutputVolume += vol;

        const batchCode = `BATCH-${job.job_number}-OUT-${(i + 1).toString().padStart(2, '0')}`;
        const formattedDims = out.dimensions_text || formatDimensions({
          timberType: 'sawn_timber',
          thicknessInches: thickness,
          widthInches: width,
          lengthFeet: length,
        });

        // BUSINESS RULE 7: Support customer-owned timber without adding to mill-owned saleable stock
        const isCustomerOwned = job.ownership === 'customer' || inputs.some(inp => inp.ownership === 'customer');
        const batchOwnership = isCustomerOwned ? 'customer' : 'mill';
        const batchCustomerId = isCustomerOwned ? (job.customer_id || inputs.find(inp => inp.batch_customer_id)?.batch_customer_id || null) : null;

        const batchData = {
          batch_code: batchCode,
          name: out.product_name || `${formattedDims} Sawn Lumber`,
          category: 'Dimensional Lumber',
          species: out.species || inputs[0]?.species || 'Douglas Fir',
          grade: out.grade || 'Select Structural',
          dimensions_text: formattedDims,
          length_feet: length,
          width_inches: width,
          thickness_inches: thickness,
          unit: out.unit || 'CFT',
          pieces_count: pieces,
          calculated_volume_cbf: vol,
          calculated_board_feet: Number((vol * 12).toFixed(3)),
          quantity_total: vol,
          quantity_available: vol,
          ownership: batchOwnership,
          customer_id: batchCustomerId,
          yard_location: isCustomerOwned ? 'Customer Staging Bay C' : 'Finished Lumber Sorting Shed',
          cost_price: 0,
          selling_price: isCustomerOwned ? 0.00 : 45.00,
          notes: `Output produced from Cutting Job ${job.job_number} (Input: ${totalInputVolume.toFixed(2)} CFT)`,
        };

        const batchId = await cuttingJobRepository.createOutputBatch(batchData, conn);

        // Record stock movement for output receipt
        await cuttingJobRepository.recordStockMovement(
          {
            batch_id: batchId,
            movement_type: 'receipt',
            quantity: vol,
            previous_quantity: 0,
            new_quantity: vol,
            unit: out.unit || 'CFT',
            source_transaction_type: 'cutting_job',
            source_transaction_id: job.job_number,
            reason: `Finished lumber generated from cutting run ${job.job_number}`,
            authorized_by_id: actorId,
            notes: `Batch ${batchCode} (${batchOwnership === 'customer' ? 'Customer Owned' : 'Mill Inventory'})`,
          },
          conn
        );

        if (out.id) {
          await cuttingJobRepository.updateOutputGeneratedBatch(out.id, batchId, conn);
        } else {
          await cuttingJobRepository.addJobOutput(jobId, { ...out, generated_batch_id: batchId, volume_cbf: vol }, conn);
        }

        generatedBatches.push({
          batchId,
          batchCode,
          productName: batchData.name,
          volume: vol,
          ownership: batchOwnership,
        });
      }

      if (totalOutputVolume > 0 && totalInputCost > 0) {
        const outputUnitCost = (totalInputCost / totalOutputVolume).toFixed(2);
        for (const batch of generatedBatches) {
          if (batch.ownership === 'mill') {
            await cuttingJobRepository.updateOutputBatchCost(batch.batchId, outputUnitCost, conn);
          }
        }
      }

      // 4. BUSINESS RULES 3 & 4: Calculate waste & recovery rate
      const wasteVolume = Math.max(0, Number((totalInputVolume - totalOutputVolume).toFixed(3)));
      const recoveryRate = totalInputVolume > 0
        ? Number(((totalOutputVolume / totalInputVolume) * 100).toFixed(2))
        : 0.00;

      // 5. BUSINESS RULE 10: Calculate cutting charges on the backend
      const ratePerCbf = Math.max(0, Number(completionData.rate_per_cbf ?? job.rate_per_cbf ?? 15.00));
      const labourCharges = Math.max(0, Number(completionData.labour_charges ?? job.labour_charges ?? 120.00));
      const cuttingCharges = Number((totalInputVolume * ratePerCbf).toFixed(2));
      const totalCharges = Number((cuttingCharges + labourCharges).toFixed(2));

      await cuttingJobRepository.markJobCompleted(
        jobId,
        {
          completion_date: completionData.completionDate || new Date().toISOString().split('T')[0],
          input_total_volume: totalInputVolume,
          output_total_volume: totalOutputVolume,
          waste_volume: wasteVolume,
          recovery_rate: recoveryRate,
          rate_per_cbf: ratePerCbf,
          labour_charges: labourCharges,
          total_charges: totalCharges,
          completed_by_id: actorId,
        },
        conn
      );

      return {
        jobId,
        jobNumber: job.job_number,
        totalInputVolume,
        totalOutputVolume,
        wasteVolume,
        recoveryRate,
        totalCharges,
        generatedBatches,
      };
    });

    const updatedJob = await cuttingJobRepository.findById(jobId);

    await audit.log({
      userId: actorId,
      action: 'CUTTING_JOB_COMPLETED',
      tableName: 'cutting_jobs',
      recordId: jobId,
      description: `Completed run ${completionResult.jobNumber}. Yield: ${completionResult.recoveryRate}% (${completionResult.totalOutputVolume.toFixed(2)} CFT lumber, ${completionResult.wasteVolume.toFixed(2)} CFT waste). Charges: $${completionResult.totalCharges.toLocaleString()}`,
    });

    return {
      job: updatedJob,
      summary: completionResult,
    };
  }

  /**
   * Generate an official cutting job report.
   */
  async getCuttingJobReport(id) {
    const jobId = parseInt(id, 10);
    if (!jobId || isNaN(jobId)) {
      throw new AppError('Valid Cutting Job ID is required.', 400, 'INVALID_JOB_ID');
    }

    const job = await cuttingJobRepository.findById(jobId);
    if (!job) {
      throw new AppError(`Cutting job #${jobId} not found.`, 404, 'JOB_NOT_FOUND');
    }

    const inputVol = Number(job.input_total_volume || 0);
    const outputVol = Number(job.output_total_volume || 0);
    const wasteVol = Number(job.waste_volume || 0);
    const recoveryRate = Number(job.recovery_rate || 0);

    let efficiencyRating = 'Pending Execution';
    if (job.status === 'completed') {
      if (recoveryRate >= 72) efficiencyRating = 'Optimal Recovery (>= 72%)';
      else if (recoveryRate >= 60) efficiencyRating = 'Standard Recovery (60-71%)';
      else efficiencyRating = 'High Kerf / Processing Loss (< 60%)';
    }

    return {
      jobDetails: {
        id: job.id,
        jobNumber: job.job_number,
        title: job.job_title,
        jobType: job.job_type === 'customer_order' ? 'Customer Milling Order' : 'Internal Production',
        customerName: job.customer_name || 'Mill Internal Inventory',
        ownership: job.ownership === 'customer' ? 'Customer Owned Stock' : 'Mill Owned Saleable Stock',
        sawLine: job.saw_line,
        leadSawyer: job.operator_name,
        requestedSpec: job.requested_dimensions,
        kerfAllowance: job.kerf_allowance,
        status: job.status,
        startDate: job.start_date,
        completionDate: job.completion_date,
      },
      yieldAnalysis: {
        totalInputVolumeCbf: inputVol,
        totalOutputVolumeCbf: outputVol,
        wasteVolumeCbf: wasteVol,
        recoveryRatePercent: recoveryRate,
        efficiencyRating,
      },
      financialSummary: {
        ratePerCbf: Number(job.rate_per_cbf || 0),
        millingSubtotal: Number((inputVol * Number(job.rate_per_cbf || 0)).toFixed(2)),
        labourCharges: Number(job.labour_charges || 0),
        totalCuttingCharges: Number(job.total_charges || 0),
      },
      sourceBatches: job.inputs || [],
      producedLumber: job.outputs || [],
    };
  }

  /**
   * Apply authorized correction to a completed job.
   *
   * BUSINESS RULE 8: Require authorized corrections for completed jobs.
   */
  async correctCompletedJob(id, { reason }, actorId, actorRole) {
    if (actorRole !== 'admin' && actorRole !== 'manager') {
      throw new AppError('Only administrators or mill managers can authorize corrections on completed cutting jobs.', 403, 'INSUFFICIENT_ROLE');
    }

    if (!reason || !reason.trim()) {
      throw new AppError('A valid authorization reason is required to correct a completed job.', 400, 'REASON_REQUIRED');
    }

    const jobId = parseInt(id, 10);
    const job = await cuttingJobRepository.findById(jobId);
    if (!job) {
      throw new AppError(`Cutting job #${jobId} not found.`, 404, 'JOB_NOT_FOUND');
    }

    if (job.status !== 'completed') {
      throw new AppError('Corrections can only be applied to completed cutting runs.', 400, 'JOB_NOT_COMPLETED');
    }

    await cuttingJobRepository.saveCorrection(jobId, { authorizedById: actorId, reason: reason.trim() });

    await audit.log({
      userId: actorId,
      action: 'CUTTING_JOB_CORRECTION',
      tableName: 'cutting_jobs',
      recordId: jobId,
      description: `Authorized correction applied to ${job.job_number}: ${reason.trim()}`,
    });

    return cuttingJobRepository.findById(jobId);
  }
}

module.exports = new CuttingJobService();
