'use strict';

const express = require('express');
const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { ok } = require('../utils/respond');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

const router = express.Router();
const LANGUAGE_CODE = /^[a-z]{2,10}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validateWoodType(body, { creating = false, existingScientificName = null } = {}) {
  const errors = [];
  if ((creating || body.common_name_en !== undefined) &&
      (typeof body.common_name_en !== 'string' || body.common_name_en.trim().length < 2 || body.common_name_en.length > 150)) {
    errors.push('English common name is required and must be 2 to 150 characters.');
  }
  if (body.slug !== undefined && (typeof body.slug !== 'string' || !SLUG.test(body.slug))) {
    errors.push('Slug must use lowercase letters, numbers, and hyphens.');
  }
  if (body.scientific_name !== undefined && body.scientific_name !== null &&
      (typeof body.scientific_name !== 'string' || body.scientific_name.length > 200)) {
    errors.push('Scientific name must be 200 characters or fewer.');
  }
  if (body.scientific_name_verified &&
      !String(body.scientific_name === undefined ? existingScientificName || '' : body.scientific_name || '').trim()) {
    errors.push('A scientific name is required before it can be marked verified.');
  }
  if (body.common_name_verified !== undefined && typeof body.common_name_verified !== 'boolean') {
    errors.push('Common-name verification must be true or false.');
  }
  if (body.scientific_name_verified !== undefined && typeof body.scientific_name_verified !== 'boolean') {
    errors.push('Scientific-name verification must be true or false.');
  }
  if (body.image_url !== undefined && body.image_url !== null && body.image_url !== '') {
    try {
      const url = new URL(body.image_url);
      if (!['http:', 'https:'].includes(url.protocol)) errors.push('Image URL must use HTTP or HTTPS.');
    } catch {
      errors.push('Image URL must be a valid HTTP or HTTPS address.');
    }
  }
  if (body.names !== undefined) {
    if (!Array.isArray(body.names) || body.names.length > 300) {
      errors.push('Regional names must be a list with no more than 300 entries.');
    } else {
      for (const [index, name] of body.names.entries()) {
        if (!name || typeof name !== 'object' ||
            !LANGUAGE_CODE.test(name.language_code || '') ||
            typeof name.name !== 'string' || !name.name.trim() || name.name.length > 150 ||
            !['preferred', 'alias'].includes(name.name_kind || 'preferred') ||
            typeof name.verified !== 'boolean') {
          errors.push(`Regional name ${index + 1} has invalid language, text, type, or verification.`);
        }
      }
    }
  }
  if (errors.length) throw new AppError(errors[0], 422, 'VALIDATION_ERROR');
}

async function listNames(woodTypeIds, conn = null) {
  if (!woodTypeIds.length) return [];
  const placeholders = woodTypeIds.map(() => '?').join(', ');
  const [rows] = conn
    ? await conn.execute(
      `SELECT id, wood_type_id, language_code, name, name_kind, verified
       FROM wood_names WHERE wood_type_id IN (${placeholders})
       ORDER BY language_code, name_kind = 'preferred' DESC, name`,
      woodTypeIds
    )
    : await query(
      `SELECT id, wood_type_id, language_code, name, name_kind, verified
       FROM wood_names WHERE wood_type_id IN (${placeholders})
       ORDER BY language_code, name_kind = 'preferred' DESC, name`,
      woodTypeIds
    );
  return rows;
}

function attachNames(rows, names) {
  const byType = new Map();
  for (const name of names) {
    const entries = byType.get(name.wood_type_id) || [];
    entries.push(name);
    byType.set(name.wood_type_id, entries);
  }
  return rows.map((row) => ({ ...row, names: byType.get(row.id) || [] }));
}

async function insertNames(conn, woodTypeId, names) {
  for (const entry of names || []) {
    await conn.execute(
      `INSERT INTO wood_names (wood_type_id, language_code, name, name_kind, verified)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name_kind = VALUES(name_kind),
         verified = VALUES(verified)`,
      [woodTypeId, entry.language_code, entry.name.trim(), entry.name_kind || 'preferred', entry.verified]
    );
  }
}

router.get('/', async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    const language = typeof req.query.language === 'string' && LANGUAGE_CODE.test(req.query.language)
      ? req.query.language
      : null;
    const params = [];
    let where = '';
    if (search) {
      const term = `%${search}%`;
      where = `WHERE wt.common_name_en LIKE ?
        OR wt.scientific_name LIKE ?
        OR EXISTS (SELECT 1 FROM wood_names wn
                   WHERE wn.wood_type_id = wt.id
                     AND (? IS NULL OR wn.language_code = ?)
                     AND wn.name LIKE ?)`;
      params.push(term, term, language, language, term);
    }
    const [rows] = await query(
      `SELECT wt.id, wt.slug, wt.common_name_en, wt.scientific_name,
              wt.scientific_name_verified, wt.common_name_verified, wt.image_url
         FROM wood_types wt
         ${where}
        ORDER BY wt.common_name_en
        LIMIT 500`,
      params
    );
    const names = await listNames(rows.map((row) => row.id));
    return ok(res, { items: attachNames(rows, names) });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new AppError('Valid wood type ID is required.', 400, 'INVALID_WOOD_TYPE_ID');
    const [rows] = await query(
      `SELECT id, slug, common_name_en, scientific_name,
              scientific_name_verified, common_name_verified, image_url
         FROM wood_types WHERE id = ?`,
      [id]
    );
    if (!rows[0]) throw new AppError('Wood type not found.', 404, 'WOOD_TYPE_NOT_FOUND');
    const names = await listNames([id]);
    return ok(res, attachNames(rows, names)[0]);
  } catch (error) {
    return next(error);
  }
});

router.post('/', authenticate, authorize.role('admin'), async (req, res, next) => {
  try {
    validateWoodType(req.body, { creating: true });
    const commonName = req.body.common_name_en.trim();
    const slug = (req.body.slug || commonName.toLowerCase().normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).slice(0, 100);
    if (!SLUG.test(slug)) throw new AppError('Enter a unique English slug for this wood type.', 422, 'VALIDATION_ERROR');

    const id = await withTransaction(async (conn) => {
      const [result] = await conn.execute(
        `INSERT INTO wood_types
           (slug, common_name_en, scientific_name, scientific_name_verified, common_name_verified, image_url)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          slug,
          commonName,
          req.body.scientific_name?.trim() || null,
          req.body.scientific_name_verified || false,
          req.body.common_name_verified || false,
          req.body.image_url || null
        ]
      );
      await insertNames(conn, result.insertId, req.body.names || []);
      return result.insertId;
    });
    const [rows] = await query(
      `SELECT id, slug, common_name_en, scientific_name,
              scientific_name_verified, common_name_verified, image_url
         FROM wood_types WHERE id = ?`,
      [id]
    );
    return ok(res, { ...rows[0], names: await listNames([id]) }, 'Wood type added.', 201);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return next(new AppError('A wood type with this slug already exists. Use a distinct slug for a different species.', 409, 'WOOD_TYPE_EXISTS'));
    }
    return next(error);
  }
});

router.patch('/:id', authenticate, authorize.role('admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new AppError('Valid wood type ID is required.', 400, 'INVALID_WOOD_TYPE_ID');
    await withTransaction(async (conn) => {
      const [existing] = await conn.execute('SELECT id, scientific_name FROM wood_types WHERE id = ? FOR UPDATE', [id]);
      if (!existing[0]) throw new AppError('Wood type not found.', 404, 'WOOD_TYPE_NOT_FOUND');
      validateWoodType(req.body, { existingScientificName: existing[0].scientific_name });

      const fields = [];
      const values = [];
      for (const [key, column] of [
        ['slug', 'slug'],
        ['common_name_en', 'common_name_en'],
        ['scientific_name', 'scientific_name'],
        ['scientific_name_verified', 'scientific_name_verified'],
        ['common_name_verified', 'common_name_verified'],
        ['image_url', 'image_url']
      ]) {
        if (Object.hasOwn(req.body, key)) {
          fields.push(`${column} = ?`);
          values.push(typeof req.body[key] === 'string' ? req.body[key].trim() || null : req.body[key]);
        }
      }
      if (fields.length) {
        values.push(id);
        await conn.execute(`UPDATE wood_types SET ${fields.join(', ')} WHERE id = ?`, values);
      }
      if (req.body.names !== undefined) {
        await conn.execute('DELETE FROM wood_names WHERE wood_type_id = ?', [id]);
        await insertNames(conn, id, req.body.names);
      }
    });
    const [rows] = await query(
      `SELECT id, slug, common_name_en, scientific_name,
              scientific_name_verified, common_name_verified, image_url
         FROM wood_types WHERE id = ?`,
      [id]
    );
    return ok(res, { ...rows[0], names: await listNames([id]) }, 'Wood type updated.');
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return next(new AppError('A wood type with this slug already exists. Use a distinct slug for a different species.', 409, 'WOOD_TYPE_EXISTS'));
    }
    return next(error);
  }
});

module.exports = router;
