'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { query } = require('../config/db');
const { ok } = require('../utils/respond');
const router = express.Router();

router.get('/products', async (req, res, next) => {
  try {
    const conditions = [
      "tb.timber_type = 'sawn_timber'",
      "tb.ownership = 'mill'",
      "tb.quantity_available > 0",
      "tb.status IN ('In Stock', 'Low Stock')"
    ];
    const params = [];
    if (typeof req.query.search === 'string' && req.query.search.trim()) {
      const search = `%${req.query.search.trim().slice(0, 100)}%`;
      conditions.push(`(
        tb.name LIKE ? OR tb.species LIKE ? OR tb.category LIKE ? OR
        tb.dimensions_text LIKE ? OR wt.scientific_name LIKE ? OR
        EXISTS (
          SELECT 1
            FROM wood_names wn
            JOIN wood_types matched_type ON matched_type.id = wn.wood_type_id
           WHERE (matched_type.id = tb.wood_type_id OR
                  (tb.wood_type_id IS NULL AND LOWER(matched_type.common_name_en) = LOWER(tb.species)
                   AND (SELECT COUNT(*) FROM wood_types same_name
                         WHERE LOWER(same_name.common_name_en) = LOWER(tb.species)) = 1))
             AND wn.name LIKE ?
        )
      )`);
      params.push(search, search, search, search, search, search);
    }
    if (typeof req.query.category === 'string' && req.query.category.trim()) {
      conditions.push('tb.category = ?');
      params.push(req.query.category.trim().slice(0, 60));
    }

    const [rows] = await query(
      `SELECT tb.name, tb.species, tb.category, tb.grade, tb.dimensions_text,
              tb.unit, tb.selling_price, tb.timber_type,
              COALESCE(tb.wood_type_id, matched_type.id) AS wood_type_id,
              matched_type.common_name_en, matched_type.scientific_name,
              matched_type.scientific_name_verified, matched_type.common_name_verified,
              COALESCE(tb.image_url, matched_type.image_url) AS image_url
         FROM timber_batches tb
         LEFT JOIN wood_types wt
           ON wt.id = COALESCE(
             tb.wood_type_id,
             (SELECT fallback_type.id FROM wood_types fallback_type
               WHERE LOWER(fallback_type.common_name_en) = LOWER(tb.species)
                 AND (SELECT COUNT(*) FROM wood_types same_name
                       WHERE LOWER(same_name.common_name_en) = LOWER(tb.species)) = 1
               ORDER BY fallback_type.id LIMIT 1)
           )
         LEFT JOIN wood_types matched_type ON matched_type.id = wt.id
        WHERE ${conditions.join(' AND ')}
        GROUP BY tb.name, tb.species, tb.category, tb.grade, tb.dimensions_text,
                 tb.unit, tb.selling_price, tb.timber_type, tb.wood_type_id,
                 matched_type.id, matched_type.common_name_en, matched_type.scientific_name,
                 matched_type.scientific_name_verified, matched_type.common_name_verified,
                 tb.image_url, matched_type.image_url
        ORDER BY tb.category, tb.species, tb.name
       LIMIT 200`,
      params
    );

    const woodTypeIds = [...new Set(rows.map((product) => product.wood_type_id).filter(Boolean))];
    let regionalNames = [];
    if (woodTypeIds.length) {
      const placeholders = woodTypeIds.map(() => '?').join(', ');
      [regionalNames] = await query(
        `SELECT wood_type_id, language_code, name, name_kind, verified
           FROM wood_names
          WHERE wood_type_id IN (${placeholders})
          ORDER BY language_code, name_kind = 'preferred' DESC, name`,
        woodTypeIds
      );
    }
    const namesByType = new Map();
    for (const name of regionalNames) {
      const entries = namesByType.get(name.wood_type_id) || [];
      entries.push(name);
      namesByType.set(name.wood_type_id, entries);
    }

    const items = rows.map((product) => ({
      ...product,
      names: namesByType.get(product.wood_type_id) || [],
      id: crypto.createHash('sha256')
        .update([product.name, product.species, product.wood_type_id, product.category, product.grade, product.dimensions_text, product.unit, product.selling_price].join('|'))
        .digest('hex')
        .slice(0, 24),
      indicativePrice: Number(product.selling_price) > 0 ? Number(product.selling_price) : null,
      availability: 'In stock'
    }));
    return ok(res, { items });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
