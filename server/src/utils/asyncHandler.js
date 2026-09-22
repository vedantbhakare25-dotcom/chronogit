/**
 * Express does not catch rejected promises from async handlers on its own.
 * Wrapping a handler in this forwards any thrown/rejected error to next(),
 * so the centralized error middleware in app.js handles it instead of the
 * request hanging or crashing the process.
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};