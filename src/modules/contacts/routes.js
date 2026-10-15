import { Router } from 'express';
import { getDb } from '../../db/index.js';
import { authMiddleware } from '../../middleware/auth.js';
import { requireWriteAccess, requireRole } from '../../middleware/rbac.js';

const router = Router();
router.use(authMiddleware);

/**
 * List contacts with search, account filter, pagination
 */
router.get('/', (req, res) => {
  const db = req.db || getDb();
  const { q, account_id, page = 1, limit = 25, sort = 'last_name', order = 'ASC' } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const offset = (pageNum - 1) * limitNum;

  const validSorts = ['first_name', 'last_name', 'email', 'title', 'created_at'];
  const sortCol = validSorts.includes(sort) ? sort : 'last_name';
  const sortOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  let whereClause = 'WHERE c.organization_id = ?';
  const params = [req.orgId];

  if (account_id) {
    whereClause += ' AND c.account_id = ?';
    params.push(account_id);
  }

  if (q && q.trim()) {
    whereClause += ' AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR c.title LIKE ? OR a.name LIKE ?)';
    const searchPattern = `%${q.trim()}%`;
    params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
  }

  const countRow = db.get(
    `SELECT COUNT(*) as total FROM contacts c LEFT JOIN accounts a ON a.id = c.account_id ${whereClause}`,
    params
  );
  const total = countRow ? countRow.total : 0;

  const query = `
    SELECT 
      c.*,
      a.name as account_name
    FROM contacts c
    LEFT JOIN accounts a ON a.id = c.account_id AND a.organization_id = c.organization_id
    ${whereClause}
    ORDER BY c.${sortCol} ${sortOrder}
    LIMIT ? OFFSET ?
  `;

  const contacts = db.all(query, [...params, limitNum, offset]);

  res.json({
    contacts,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum)
    }
  });
});

/**
 * Get contact detail by ID
 */
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const db = req.db || getDb();

  const contact = db.get(
    `SELECT c.*, a.name as account_name, a.industry as account_industry, a.phone as account_phone
     FROM contacts c
     LEFT JOIN accounts a ON a.id = c.account_id AND a.organization_id = c.organization_id
     WHERE c.id = ? AND c.organization_id = ?`,
    [id, req.orgId]
  );

  if (!contact) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  const activities = db.all(
    `SELECT act.*, u.first_name as author_first, u.last_name as author_last
     FROM activities act
     LEFT JOIN users u ON u.id = act.created_by
     WHERE act.related_to_type = 'Contact' AND act.related_to_id = ? AND act.organization_id = ?
     ORDER BY act.created_at DESC`,
    [id, req.orgId]
  );

  res.json({ contact, activities });
});

/**
 * Create a new contact
 */
router.post('/', requireWriteAccess, (req, res) => {
  const { first_name, last_name, email, phone, title, department, account_id, is_primary = 0 } = req.body;
  if (!first_name || !last_name) {
    return res.status(400).json({ error: 'First name and last name are required' });
  }

  const db = req.db || getDb();

  // If account_id provided, verify it belongs to this organization
  if (account_id) {
    const acc = db.get('SELECT id FROM accounts WHERE id = ? AND organization_id = ?', [account_id, req.orgId]);
    if (!acc) {
      return res.status(400).json({ error: 'Specified account does not belong to this organization.' });
    }
  }

  const result = db.run(
    `INSERT INTO contacts (organization_id, account_id, first_name, last_name, email, phone, title, department, is_primary, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.orgId,
      account_id || null,
      first_name.trim(),
      last_name.trim(),
      email?.trim() || null,
      phone?.trim() || null,
      title?.trim() || null,
      department?.trim() || null,
      is_primary ? 1 : 0,
      req.user.id
    ]
  );

  const contact = db.get('SELECT * FROM contacts WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json({ message: 'Contact created successfully', contact });
});

/**
 * Update contact
 */
router.put('/:id', requireWriteAccess, (req, res) => {
  const { id } = req.params;
  const { first_name, last_name, email, phone, title, department, account_id, is_primary } = req.body;
  const db = req.db || getDb();

  const existing = db.get('SELECT id FROM contacts WHERE id = ? AND organization_id = ?', [id, req.orgId]);
  if (!existing) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  if (account_id) {
    const acc = db.get('SELECT id FROM accounts WHERE id = ? AND organization_id = ?', [account_id, req.orgId]);
    if (!acc) {
      return res.status(400).json({ error: 'Invalid account ID' });
    }
  }

  db.run(
    `UPDATE contacts
     SET first_name = COALESCE(?, first_name),
         last_name = COALESCE(?, last_name),
         email = COALESCE(?, email),
         phone = COALESCE(?, phone),
         title = COALESCE(?, title),
         department = COALESCE(?, department),
         account_id = COALESCE(?, account_id),
         is_primary = COALESCE(?, is_primary),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND organization_id = ?`,
    [
      first_name ? first_name.trim() : null,
      last_name ? last_name.trim() : null,
      email !== undefined ? email : null,
      phone !== undefined ? phone : null,
      title !== undefined ? title : null,
      department !== undefined ? department : null,
      account_id !== undefined ? (account_id || null) : null,
      is_primary !== undefined ? (is_primary ? 1 : 0) : null,
      id,
      req.orgId
    ]
  );

  const updated = db.get('SELECT * FROM contacts WHERE id = ?', [id]);
  res.json({ message: 'Contact updated successfully', contact: updated });
});

/**
 * Delete contact
 */
router.delete('/:id', requireRole('Admin', 'Manager'), (req, res) => {
  const { id } = req.params;
  const db = req.db || getDb();

  const existing = db.get('SELECT id FROM contacts WHERE id = ? AND organization_id = ?', [id, req.orgId]);
  if (!existing) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  db.run('DELETE FROM contacts WHERE id = ? AND organization_id = ?', [id, req.orgId]);
  res.json({ message: 'Contact deleted successfully' });
});

export default router;
