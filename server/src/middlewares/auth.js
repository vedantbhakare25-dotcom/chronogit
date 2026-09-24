import { AppError } from '../utils/AppError.js';

/**
 * Middleware for server-to-server calls from Next.js BFF.
 * In local/test runs without INTERNAL_API_SECRET configured, it falls back
 * gracefully to a test user ID so unit tests do not break.
 */
export function requireInternalAuth({ requireUserId = true } = {}) {
  return (req, res, next) => {
    const secret = process.env.INTERNAL_API_SECRET;

  // In production / when secret is set, verify it
    if (process.env.NODE_ENV === 'production' && !secret) {
      return next(new AppError(500, 'Internal service authentication is not configured'));
    }
    if (secret) {
      const providedSecret = req.headers['x-internal-secret'];
      if (!providedSecret || providedSecret !== secret) {
        return next(new AppError(401, 'Invalid or missing internal service secret'));
      }
    }

    const userId = req.headers['x-user-id'];
    if (userId) {
      req.userId = userId;
    } else if (!secret && process.env.NODE_ENV !== 'production') {
      // Test/dev fallback for single-user testing & legacy test suites
      req.userId = '000000000000000000000001';
    } else if (requireUserId) {
      return next(new AppError(401, 'Missing x-user-id header'));
    }

    next();
  };
}
