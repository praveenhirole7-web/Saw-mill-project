'use strict';
/**
 * repositories/cuttingJobRepository.js
 *
 * Data access layer for Sawmill Cutting Jobs, input batches, and finished lumber outputs.
 */
const { query } = require('../config/db');

class CuttingJobRepository {
  /**
   * Generate next sequential job number (e.g. CJ-2026-0001).
   */
  async generateJobNumber(conn = null) {
    const year = new Date().getFullYear();
    const prefix = `CJ-${year}-`;
    const sql = `SELECT job_number FROM cutting_jobs WHERE job_number LIKE ? ORDER BY id DESC LIMIT 1`;
    const [rows] = conn ? await conn.execute(sql, [`${prefix}%`]) : await query(sql, [`${prefix}%`]);

    let seq = 1;
    if (rows && rows.length > 0 && rows[0].job_number) {
      const match = rows[0].job_number.match(/(\d+)$/);
      if (match) {
        seq = parseInt(match[1], 10) + 1;
      }
    }
    return `${prefix}${seq.toString().padStart(4, '0')}`;
  }

  /**
   * Create cutting job record, inputs, and planned outputs within a transaction.
   */
  async createCuttingJob(jobData, inputs = [], outputs = [], conn) {
    const jobSql = `
      INSERT INTO cutting_jobs (
        job_number, job_title, job_type, customer_id, saw_line,
        operator_name, priority, requested_dimensions, kerf_allowance,
        status, input_total_volume, output_total_volume, waste_volume,
        recovery_rate, rate_per_cbf, labour_charges, total_charges,
        ownership, start_date, due_date, notes, created_by_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const jobParams = [
      jobData.job_number,
      jobData.job_title,
      jobData.job_type || 'customer_order',
      jobData.customer_id || null,
      jobData.saw_line || 'Line 1 (60" Band Saw)',
      jobData.operator_name || null,
      jobData.priority || 'Normal',
      jobData.requested_dimensions,
      jobData.kerf_allowance || '0.125"',
      jobData.status || 'draft',
      Number(jobData.input_total_volume || 0).toFixed(3),
      Number(jobData.output_total_volume || 0).toFixed(3),
      Number(jobData.waste_volume || 0).toFixed(3),
      Number(jobData.recovery_rate || 0).toFixed(2),
      Number(jobData.rate_per_cbf || 0).toFixed(2),
      Number(jobData.labour_charges || 0).toFixed(2),
      Number(jobData.total_charges || 0).toFixed(2),
      jobData.ownership || 'mill',
      jobData.start_date || null,
      jobData.due_date || null,
      jobData.notes || null,
      jobData.created_by_id || null,
    ];

    const [jobResult] = await conn.execute(jobSql, jobParams);
    const jobId = jobResult.insertId;

    // Insert inputs
    const inputSql = `
      INSERT INTO cutting_job_inputs (
        cutting_job_id, batch_id, quantity_used, unit
      ) VALUES (?, ?, ?, ?)
    `;

    for (const inp of inputs) {
      await conn.execute(inputSql, [
        jobId,
        inp.batch_id,
        Number(inp.quantity_used || 0).toFixed(3),
        inp.unit || 'CFT',
      ]);
    }

    // Insert planned outputs (if specified)
    const outputSql = `
      INSERT INTO cutting_job_outputs (
        cutting_job_id, product_name, species, dimensions_text,
        thickness_inches, width_inches, length_feet, pieces_count,
        volume_cbf, unit, grade
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const out of outputs) {
      await conn.execute(outputSql, [
        jobId,
        out.product_name,
        out.species,
        out.dimensions_text,
        Number(out.thickness_inches || 0).toFixed(2),
        Number(out.width_inches || 0).toFixed(2),
        Number(out.length_feet || 0).toFixed(2),
        parseInt(out.pieces_count || 1, 10),
        Number(out.volume_cbf || 0).toFixed(3),
        out.unit || 'CFT',
        out.grade || 'Select Structural',
      ]);
    }

    return jobId;
  }

  /**
   * List cutting jobs with search, filtering, and pagination.
   */
  async listCuttingJobs({ search = '', status = null, sawLine = null, customerId = null, page = 1, limit = 50 } = {}) {
    const conditions = ['1=1'];
    const params = [];

    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      conditions.push('(LOWER(cj.job_number) LIKE ? OR LOWER(cj.job_title) LIKE ? OR LOWER(COALESCE(c.name, "")) LIKE ? OR LOWER(COALESCE(cj.operator_name, "")) LIKE ?)');
      params.push(term, term, term, term);
    }

    if (status && status !== 'All') {
      conditions.push('cj.status = ?');
      params.push(status);
    }

    if (sawLine && sawLine !== 'All') {
      conditions.push('cj.saw_line LIKE ?');
      params.push(`%${sawLine}%`);
    }

    if (customerId) {
      conditions.push('cj.customer_id = ?');
      params.push(Number(customerId));
    }

    const whereClause = conditions.join(' AND ');

    // 1. Total count
    const [countRows] = await query(
      `SELECT COUNT(*) AS total
       FROM   cutting_jobs cj
       LEFT JOIN customers c ON cj.customer_id = c.id
       WHERE  ${whereClause}`,
      params
    );
    const total = countRows[0]?.total || 0;

    // 2. Fetch paginated records
    const offset = Math.max(0, (page - 1) * limit);
    const queryParams = [...params, Number(limit), Number(offset)];

    const [rows] = await query(
      `SELECT cj.*,
              c.name AS customer_name,
              c.phone AS customer_phone,
              COALESCE((SELECT COUNT(*) FROM cutting_job_inputs cji WHERE cji.cutting_job_id = cj.id), 0) AS inputs_count,
              COALESCE((SELECT COUNT(*) FROM cutting_job_outputs cjo WHERE cjo.cutting_job_id = cj.id), 0) AS outputs_count,
              u.username AS created_by_username
       FROM   cutting_jobs cj
       LEFT JOIN customers c ON cj.customer_id = c.id
       LEFT JOIN users u ON cj.created_by_id = u.id
       WHERE  ${whereClause}
       ORDER BY cj.created_at DESC
       LIMIT ? OFFSET ?`,
      queryParams
    );

    return { items: rows, total, page: Number(page), limit: Number(limit) };
  }

  /**
   * Find single cutting job by ID with full inputs, outputs, and customer info.
   */
  async findById(id, conn = null) {
    const sql = `
      SELECT cj.*,
             c.name AS customer_name,
             c.phone AS customer_phone,
             c.email AS customer_email,
             c.company_name AS customer_company,
             u.username AS created_by_username,
             u2.username AS completed_by_username
      FROM   cutting_jobs cj
      LEFT JOIN customers c ON cj.customer_id = c.id
      LEFT JOIN users u ON cj.created_by_id = u.id
      LEFT JOIN users u2 ON cj.completed_by_id = u2.id
      WHERE  cj.id = ?
    `;
    const [rows] = conn ? await conn.execute(sql, [id]) : await query(sql, [id]);
    if (!rows || rows.length === 0) return null;

    const job = rows[0];

    // Fetch inputs with source batch details
    const inputSql = `
      SELECT cji.*,
             tb.batch_code,
             tb.name AS batch_name,
             tb.timber_type,
             tb.species,
             tb.dimensions_text,
             tb.quantity_available AS batch_available,
             tb.ownership AS batch_ownership
      FROM   cutting_job_inputs cji
      JOIN   timber_batches tb ON cji.batch_id = tb.id
      WHERE  cji.cutting_job_id = ?
      ORDER BY cji.id ASC
    `;
    const [inputs] = conn ? await conn.execute(inputSql, [id]) : await query(inputSql, [id]);

    // Fetch outputs with generated batch details
    const outputSql = `
      SELECT cjo.*,
             tb.batch_code AS generated_batch_code,
             tb.quantity_available AS generated_batch_available
      FROM   cutting_job_outputs cjo
      LEFT JOIN timber_batches tb ON cjo.generated_batch_id = tb.id
      WHERE  cjo.cutting_job_id = ?
      ORDER BY cjo.id ASC
    `;
    const [outputs] = conn ? await conn.execute(outputSql, [id]) : await query(outputSql, [id]);

    return {
      ...job,
      inputs,
      outputs,
    };
  }

  /**
   * Find single cutting job locked FOR UPDATE.
   */
  async findByIdForUpdate(id, conn) {
    const [rows] = await conn.execute(
      'SELECT * FROM cutting_jobs WHERE id = ? FOR UPDATE',
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Get job inputs inside transaction.
   */
  async getJobInputs(jobId, conn) {
    const sql = `
      SELECT cji.*,
             tb.batch_code,
             tb.species,
             tb.timber_type,
             tb.ownership,
             tb.customer_id AS batch_customer_id,
             tb.cost_price,
             tb.quantity_available,
             tb.quantity_reserved,
             tb.quantity_consumed,
             tb.quantity_total
      FROM   cutting_job_inputs cji
      JOIN   timber_batches tb ON cji.batch_id = tb.id
      WHERE  cji.cutting_job_id = ?
      ORDER BY cji.id ASC
    `;
    const [rows] = await conn.execute(sql, [jobId]);
    return rows;
  }

  /**
   * Get job outputs inside transaction.
   */
  async getJobOutputs(jobId, conn) {
    const [rows] = await conn.execute(
      'SELECT * FROM cutting_job_outputs WHERE cutting_job_id = ? ORDER BY id ASC',
      [jobId]
    );
    return rows;
  }

  /**
   * Lock timber batch row for update.
   */
  async findBatchForUpdate(batchId, conn) {
    const [rows] = await conn.execute(
      'SELECT * FROM timber_batches WHERE id = ? FOR UPDATE',
      [batchId]
    );
    return rows[0] || null;
  }

  /**
   * Update timber batch stock quantities.
   */
  async updateBatchStock(batchId, { availableDelta = 0, reservedDelta = 0, consumedDelta = 0, totalDelta = 0 }, conn) {
    const sql = `
      UPDATE timber_batches SET
        quantity_available = quantity_available + ?,
        quantity_reserved  = quantity_reserved + ?,
        quantity_consumed  = quantity_consumed + ?,
        quantity_total     = quantity_total + ?
      WHERE id = ?
    `;
    const [result] = await conn.execute(sql, [
      Number(availableDelta).toFixed(3),
      Number(reservedDelta).toFixed(3),
      Number(consumedDelta).toFixed(3),
      Number(totalDelta).toFixed(3),
      batchId,
    ]);
    return result.affectedRows > 0;
  }

  /**
   * Insert new finished lumber batch into timber_batches table.
   */
  async createOutputBatch(batchData, conn) {
    const sql = `
      INSERT INTO timber_batches (
        batch_code, name, timber_type, category, species, grade,
        dimensions_text, length_feet, width_inches, thickness_inches, girth_inches,
        unit, pieces_count, calculated_volume_cbf, calculated_board_feet,
        quantity_total, quantity_available, quantity_reserved, quantity_consumed,
        ownership, customer_id, status, yard_location, cost_price, selling_price, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 'In Stock', ?, ?, ?, ?)
    `;

    const params = [
      batchData.batch_code,
      batchData.name,
      'sawn_timber',
      batchData.category || 'Dimensional Lumber',
      batchData.species,
      batchData.grade || 'Select Structural',
      batchData.dimensions_text || null,
      Number(batchData.length_feet || 0),
      Number(batchData.width_inches || 0),
      Number(batchData.thickness_inches || 0),
      0, // girth
      batchData.unit || 'CFT',
      Number(batchData.pieces_count || 1),
      Number(batchData.calculated_volume_cbf || 0),
      Number(batchData.calculated_board_feet || 0),
      Number(batchData.quantity_total || 0),
      Number(batchData.quantity_available || 0),
      batchData.ownership || 'mill',
      batchData.customer_id || null,
      batchData.yard_location || 'Finished Lumber Sorting Shed',
      Number(batchData.cost_price || 0),
      Number(batchData.selling_price || 0),
      batchData.notes || null,
    ];

    const [result] = await conn.execute(sql, params);
    return result.insertId;
  }

  async updateOutputBatchCost(batchId, costPrice, conn) {
    await conn.execute(
      'UPDATE timber_batches SET cost_price = ? WHERE id = ?',
      [Number(costPrice).toFixed(2), batchId]
    );
  }

  /**
   * Link generated batch ID to cutting_job_outputs row.
   */
  async updateOutputGeneratedBatch(outputId, generatedBatchId, conn) {
    const sql = 'UPDATE cutting_job_outputs SET generated_batch_id = ? WHERE id = ?';
    const [result] = await conn.execute(sql, [generatedBatchId, outputId]);
    return result.affectedRows > 0;
  }

  /**
   * Insert cutting job output inside transaction.
   */
  async addJobOutput(jobId, out, conn) {
    const sql = `
      INSERT INTO cutting_job_outputs (
        cutting_job_id, generated_batch_id, product_name, species, dimensions_text,
        thickness_inches, width_inches, length_feet, pieces_count,
        volume_cbf, unit, grade
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      jobId,
      out.generated_batch_id || null,
      out.product_name,
      out.species,
      out.dimensions_text,
      Number(out.thickness_inches || 0).toFixed(2),
      Number(out.width_inches || 0).toFixed(2),
      Number(out.length_feet || 0).toFixed(2),
      parseInt(out.pieces_count || 1, 10),
      Number(out.volume_cbf || 0).toFixed(3),
      out.unit || 'CFT',
      out.grade || 'Select Structural',
    ];
    const [result] = await conn.execute(sql, params);
    return result.insertId;
  }

  /**
   * Record stock movement into immutable stock_movements ledger.
   */
  async recordStockMovement(movementData, conn) {
    const sql = `
      INSERT INTO stock_movements (
        batch_id, movement_type, quantity, previous_quantity, new_quantity,
        unit, source_transaction_type, source_transaction_id, reason,
        authorized_by_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      movementData.batch_id,
      movementData.movement_type,
      Number(movementData.quantity || 0),
      Number(movementData.previous_quantity || 0),
      Number(movementData.new_quantity || 0),
      movementData.unit || 'CFT',
      movementData.source_transaction_type || 'cutting_job',
      movementData.source_transaction_id || null,
      movementData.reason || 'Cutting job sawing operation',
      movementData.authorized_by_id || null,
      movementData.notes || null,
    ];

    const [result] = await conn.execute(sql, params);
    return result.insertId;
  }

  /**
   * Mark cutting job completed with calculated waste and charges.
   */
  async markJobCompleted(id, completionData, conn) {
    const sql = `
      UPDATE cutting_jobs SET
        status = 'completed',
        completion_date = COALESCE(?, CURRENT_DATE),
        input_total_volume = ?,
        output_total_volume = ?,
        waste_volume = ?,
        recovery_rate = ?,
        rate_per_cbf = ?,
        labour_charges = ?,
        total_charges = ?,
        completed_by_id = ?
      WHERE id = ?
    `;

    const params = [
      completionData.completion_date || null,
      Number(completionData.input_total_volume || 0).toFixed(3),
      Number(completionData.output_total_volume || 0).toFixed(3),
      Number(completionData.waste_volume || 0).toFixed(3),
      Number(completionData.recovery_rate || 0).toFixed(2),
      Number(completionData.rate_per_cbf || 0).toFixed(2),
      Number(completionData.labour_charges || 0).toFixed(2),
      Number(completionData.total_charges || 0).toFixed(2),
      completionData.completed_by_id || null,
      id,
    ];

    const [result] = await conn.execute(sql, params);
    return result.affectedRows > 0;
  }

  /**
   * Update job status (e.g. from draft to scheduled or in_progress).
   */
  async updateStatus(id, status, conn = null) {
    const sql = `UPDATE cutting_jobs SET status = ? WHERE id = ?`;
    const [result] = conn ? await conn.execute(sql, [status, id]) : await query(sql, [status, id]);
    return result.affectedRows > 0;
  }

  /**
   * Apply authorized correction to completed cutting job.
   */
  async saveCorrection(id, data, conn = null) {
    const sql = `
      UPDATE cutting_jobs SET
        notes = CONCAT(COALESCE(notes, ''), '\n[CORRECTION by user #', ?, ' at ', CURRENT_TIMESTAMP, ']: ', ?)
      WHERE id = ?
    `;
    const [result] = conn
      ? await conn.execute(sql, [data.authorizedById, data.reason, id])
      : await query(sql, [data.authorizedById, data.reason, id]);
    return result.affectedRows > 0;
  }
}

module.exports = new CuttingJobRepository();
