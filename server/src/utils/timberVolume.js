'use strict';
/**
 * utils/timberVolume.js
 *
 * Professional sawmill volumetric calculation and dimensional conversion utility.
 *
 * Implements standard timber industry formulas:
 *   1. Rectangular sawn lumber (Dimensional boards, beams, cants, slabs):
 *      - Volume (Cubic Feet / CFT) = (Thickness [in] * Width [in] * Length [ft] * Pieces) / 144
 *      - Volume (Board Feet / BF)  = (Thickness [in] * Width [in] * Length [ft] * Pieces) / 12
 *      - 1 CFT = 12 Board Feet
 *
 *   2. Raw round logs:
 *      - Quarter-Girth / Hoppus formula:
 *        Volume (CFT) = ((Girth [in] / 4)^2 * Length [ft]) / 144 = (Girth^2 * Length) / 2304
 *      - Cylindrical Volume (CFT) = (π * (Girth / (2 * π))^2 * Length) / 144
 *
 *   3. Metric conversions:
 *      - 1 CFT = 0.0283168 m³
 *      - 1 m³  = 35.3147 CFT
 */

/**
 * Calculate volume of rectangular dimensional timber.
 * @param {Object} params
 * @param {number} params.thicknessInches
 * @param {number} params.widthInches
 * @param {number} params.lengthFeet
 * @param {number} [params.piecesCount=1]
 * @returns {{ volumeCbf: number, boardFeet: number, cubicMeters: number }}
 */
function calculateRectangularVolume({
  thicknessInches = 0,
  widthInches = 0,
  lengthFeet = 0,
  piecesCount = 1,
}) {
  const t = Math.max(0, Number(thicknessInches) || 0);
  const w = Math.max(0, Number(widthInches) || 0);
  const l = Math.max(0, Number(lengthFeet) || 0);
  const p = Math.max(1, parseInt(piecesCount, 10) || 1);

  if (t <= 0 || w <= 0 || l <= 0) {
    return { volumeCbf: 0, boardFeet: 0, cubicMeters: 0 };
  }

  // Volume in CFT = (T" * W" * L' * P) / 144
  const volumeCbf = Number(((t * w * l * p) / 144).toFixed(3));
  // Board Feet = (T" * W" * L' * P) / 12
  const boardFeet = Number(((t * w * l * p) / 12).toFixed(3));
  // Cubic Meters = CFT * 0.0283168
  const cubicMeters = Number((volumeCbf * 0.0283168).toFixed(4));

  return { volumeCbf, boardFeet, cubicMeters };
}

/**
 * Calculate volume of round log using Hoppus (Quarter-Girth) formula.
 * @param {Object} params
 * @param {number} params.girthInches
 * @param {number} params.lengthFeet
 * @param {number} [params.piecesCount=1]
 * @returns {{ volumeCbf: number, boardFeet: number, cubicMeters: number }}
 */
function calculateLogVolumeHoppus({
  girthInches = 0,
  lengthFeet = 0,
  piecesCount = 1,
}) {
  const g = Math.max(0, Number(girthInches) || 0);
  const l = Math.max(0, Number(lengthFeet) || 0);
  const p = Math.max(1, parseInt(piecesCount, 10) || 1);

  if (g <= 0 || l <= 0) {
    return { volumeCbf: 0, boardFeet: 0, cubicMeters: 0 };
  }

  // Hoppus Quarter Girth Formula: ( (G / 4)^2 * L ) / 144
  const quarterGirth = g / 4;
  const singleLogCbf = (quarterGirth * quarterGirth * l) / 144;
  const volumeCbf = Number((singleLogCbf * p).toFixed(3));
  const boardFeet = Number((volumeCbf * 12).toFixed(3));
  const cubicMeters = Number((volumeCbf * 0.0283168).toFixed(4));

  return { volumeCbf, boardFeet, cubicMeters };
}

/**
 * Parse human readable dimensions string (e.g. '2" x 6" x 14 ft' or '12 ft x 36" girth').
 * @param {string} text
 * @returns {{ thicknessInches?: number, widthInches?: number, lengthFeet?: number, girthInches?: number }}
 */
function parseDimensionString(text) {
  if (!text || typeof text !== 'string') return {};
  const clean = text.trim();

  // Check for log format: e.g. "12 ft x 36 in girth" or "36" girth, 14 ft"
  const logMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:ft|')\s*(?:x|,)\s*(\d+(?:\.\d+)?)\s*(?:in|"|inches)?\s*girth/i);
  if (logMatch) {
    return {
      lengthFeet: parseFloat(logMatch[1]),
      girthInches: parseFloat(logMatch[2]),
    };
  }

  // Check for 3-part rectangular: "2" x 6" x 14 ft" or "2 x 6 x 14"
  const rectMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:in|"|inches)?\s*(?:x|×|\*)\s*(\d+(?:\.\d+)?)\s*(?:in|"|inches)?\s*(?:x|×|\*)\s*(\d+(?:\.\d+)?)\s*(?:ft|'|feet)?/i);
  if (rectMatch) {
    return {
      thicknessInches: parseFloat(rectMatch[1]),
      widthInches: parseFloat(rectMatch[2]),
      lengthFeet: parseFloat(rectMatch[3]),
    };
  }

  return {};
}

/**
 * Format dimensions cleanly into standardized notation.
 */
function formatDimensions({ timberType = 'sawn_timber', thicknessInches, widthInches, lengthFeet, girthInches }) {
  if (timberType === 'raw_log') {
    if (lengthFeet && girthInches) {
      return `${lengthFeet} ft × ${girthInches}" girth`;
    }
  }
  if (thicknessInches && widthInches && lengthFeet) {
    return `${thicknessInches}" × ${widthInches}" × ${lengthFeet} ft`;
  }
  return '';
}

module.exports = {
  calculateRectangularVolume,
  calculateLogVolumeHoppus,
  parseDimensionString,
  formatDimensions,
};
