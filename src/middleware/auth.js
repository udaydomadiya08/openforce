import { verifyToken } from '../utils/crypto.js';
import { isTokenRevoked } from '../utils/token-revocation.js';
import { getDb } from '../db/index.js';

/**
 * Authentication middleware that verifies JWT and attaches user context
 */
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. No Bearer token provided.' });
  }

  const token = authHeader.split(' ')[1];
  const db = req.db || getDb();

  // Check if token has been revoked (e.g. via logout)
  if (isTokenRevoked(db, token)) {
    return res.status(401).json({ error: 'Session token has been revoked. Please sign in again.' });
  }

  const decoded = verifyToken(token);

  if (!decoded || !decoded.userId || !decoded.organizationId) {
    return res.status(401).json({ error: 'Invalid or expired session token.' });
  }

  // Verify user still exists in database and is active
  const user = db.get(
    'SELECT id, organization_id, email, first_name, last_name, role, status FROM users WHERE id = ? AND organization_id = ?',
    [decoded.userId, decoded.organizationId]
  );

  if (!user || user.status !== 'Active') {
    return res.status(401).json({ error: 'User account not found or suspended.' });
  }

  req.user = user;
  req.orgId = user.organization_id;
  next();
}

/**
 * Optional auth middleware for routes that work for both guests and authenticated users
 */
export function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (decoded && decoded.userId && decoded.organizationId) {
      const db = req.db || getDb();
      const user = db.get(
        'SELECT id, organization_id, email, first_name, last_name, role, status FROM users WHERE id = ? AND organization_id = ?',
        [decoded.userId, decoded.organizationId]
      );
      if (user && user.status === 'Active') {
        req.user = user;
        req.orgId = user.organization_id;
      }
    }
  }
  next();
}
