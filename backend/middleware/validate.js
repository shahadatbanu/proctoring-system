/**
 * middleware/validate.js
 * Lightweight validation middleware factory.
 * Usage: router.post('/route', validate(['field1','field2']), handler)
 */

/**
 * Require that all listed fields are present and non-empty in req.body.
 * @param {string[]} fields
 */
function requireFields(fields) {
  return (req, res, next) => {
    const missing = fields.filter(f => {
      const val = req.body[f];
      return val === undefined || val === null || val === '';
    });
    if (missing.length) {
      return res.status(400).json({
        error: `Missing required fields: ${missing.join(', ')}`,
      });
    }
    next();
  };
}

/**
 * Validate that imageBase64 field looks like a real base64/data-URI string.
 */
function requireImage(req, res, next) {
  const img = req.body.imageBase64;
  if (!img || typeof img !== 'string' || img.length < 100) {
    return res.status(400).json({ error: 'imageBase64 is required and must be a valid image string' });
  }
  next();
}

/**
 * Validate MongoDB ObjectId format.
 * @param {string} paramName - the req.params key to validate
 */
function validObjectId(paramName) {
  return (req, res, next) => {
    const id  = req.params[paramName];
    const hex = /^[a-f\d]{24}$/i;
    if (!id || !hex.test(id)) {
      return res.status(400).json({ error: `Invalid ${paramName}: must be a 24-character hex string` });
    }
    next();
  };
}

module.exports = { requireFields, requireImage, validObjectId };
