/**
 * Role-Based Access Control Middleware
 * Roles hierarchy:
 * - Admin: Full access to all actions and org configuration
 * - Manager: Full CRM read/write, reports, export/import (no org admin/billing)
 * - Standard: Read/write on accounts, contacts, leads, deals, activities
 * - ReadOnly: Read access only, no mutations
 */

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (allowedRoles.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json({
      error: `Access denied. Role '${req.user.role}' is not authorized for this operation. Required: ${allowedRoles.join(', ')}`
    });
  };
}

/**
 * Guard preventing read-only users from performing write operations
 */
export function requireWriteAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role === 'ReadOnly') {
    return res.status(403).json({ error: 'Access denied. Read-only users cannot modify data.' });
  }

  next();
}

/**
 * Guard requiring Admin role specifically
 */
export function requireAdmin(req, res, next) {
  return requireRole('Admin')(req, res, next);
}
