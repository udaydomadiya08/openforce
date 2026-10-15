import { Router } from 'express';
import { getDb } from '../../db/index.js';
import { authMiddleware } from '../../middleware/auth.js';
import { requireWriteAccess, requireRole } from '../../middleware/rbac.js';

const router = Router();
router.use(authMiddleware);

/**
 * List accounts with optional search, sorting, and pagination
 */
router.get('/', (req, res) => {
  const db = req.db || getDb();
  const { q, page = 1, limit = 25, sort = 'name', order = 'ASC' } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const offset = (pageNum - 1) * limitNum;

  const validSorts = ['name', 'annual_revenue', 'employees', 'created_at', 'billing_city'];
  const sortCol = validSorts.includes(sort) ? sort : 'name';
  const sortOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  let whereClause = 'WHERE a.organization_id = ?';
  const params = [req.orgId];

  if (q && q.trim()) {
    whereClause += ' AND (a.name LIKE ? OR a.industry LIKE ? OR a.billing_city LIKE ?)';
    const searchPattern = `%${q.trim()}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  // Count total matching
  const countRow = db.get(
    `SELECT COUNT(*) as total FROM accounts a ${whereClause}`,
    params
  );
  const total = countRow ? countRow.total : 0;

  // Query with linked metrics (contacts count, opps count, total pipeline)
  const query = `
    SELECT 
      a.*,
      COUNT(DISTINCT c.id) as contacts_count,
      COUNT(DISTINCT o.id) as opportunities_count,
      COALESCE(SUM(DISTINCT CASE WHEN ps.is_won = 0 AND ps.is_lost = 0 THEN o.amount ELSE 0 END), 0) as pipeline_value
    FROM accounts a
    LEFT JOIN contacts c ON c.account_id = a.id AND c.organization_id = a.organization_id
    LEFT JOIN opportunities o ON o.account_id = a.id AND o.organization_id = a.organization_id
    LEFT JOIN pipeline_stages ps ON ps.id = o.stage_id
    ${whereClause}
    GROUP BY a.id
    ORDER BY a.${sortCol} ${sortOrder}
    LIMIT ? OFFSET ?
  `;

  const accounts = db.all(query, [...params, limitNum, offset]);

  res.json({
    accounts,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum)
    }
  });
});

/**
 * Get account detail by ID with linked contacts, opportunities, and activities
 */
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const db = req.db || getDb();

  const account = db.get('SELECT * FROM accounts WHERE id = ? AND organization_id = ?', [id, req.orgId]);
  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }

  const contacts = db.all(
    'SELECT * FROM contacts WHERE account_id = ? AND organization_id = ? ORDER BY is_primary DESC, first_name ASC',
    [id, req.orgId]
  );

  const opportunities = db.all(
    `SELECT o.*, ps.name as stage_name, ps.probability as stage_prob, ps.is_won, ps.is_lost
     FROM opportunities o
     JOIN pipeline_stages ps ON ps.id = o.stage_id
     WHERE o.account_id = ? AND o.organization_id = ?
     ORDER BY o.created_at DESC`,
    [id, req.orgId]
  );

  const activities = db.all(
    `SELECT act.*, u.first_name as author_first, u.last_name as author_last
     FROM activities act
     LEFT JOIN users u ON u.id = act.created_by
     WHERE act.related_to_type = 'Account' AND act.related_to_id = ? AND act.organization_id = ?
     ORDER BY act.created_at DESC`,
    [id, req.orgId]
  );

  res.json({ account, contacts, opportunities, activities });
});

/**
 * Create a new account
 */
router.post('/', requireWriteAccess, (req, res) => {
  const { name, industry, website, phone, annual_revenue, employees, billing_city, billing_country, billing_address, status = 'Active' } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Account name is required' });
  }

  const db = req.db || getDb();
  const result = db.run(
    `INSERT INTO accounts (organization_id, name, industry, website, phone, annual_revenue, employees, billing_city, billing_country, billing_address, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.orgId,
      name.trim(),
      industry?.trim() || null,
      website?.trim() || null,
      phone?.trim() || null,
      Number(annual_revenue) || 0,
      parseInt(employees, 10) || 0,
      billing_city?.trim() || null,
      billing_country?.trim() || null,
      billing_address?.trim() || null,
      status || 'Active',
      req.user.id
    ]
  );

  const account = db.get('SELECT * FROM accounts WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json({ message: 'Account created successfully', account });
});

/**
 * Update an account
 */
router.put('/:id', requireWriteAccess, (req, res) => {
  const { id } = req.params;
  const { name, industry, website, phone, annual_revenue, employees, billing_city, billing_country, billing_address, status } = req.body;
  const db = req.db || getDb();

  const existing = db.get('SELECT id FROM accounts WHERE id = ? AND organization_id = ?', [id, req.orgId]);
  if (!existing) {
    return res.status(404).json({ error: 'Account not found' });
  }

  db.run(
    `UPDATE accounts
     SET name = COALESCE(?, name),
         industry = COALESCE(?, industry),
         website = COALESCE(?, website),
         phone = COALESCE(?, phone),
         annual_revenue = COALESCE(?, annual_revenue),
         employees = COALESCE(?, employees),
         billing_city = COALESCE(?, billing_city),
         billing_country = COALESCE(?, billing_country),
         billing_address = COALESCE(?, billing_address),
         status = COALESCE(?, status),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND organization_id = ?`,
    [
      name ? name.trim() : null,
      industry !== undefined ? industry : null,
      website !== undefined ? website : null,
      phone !== undefined ? phone : null,
      annual_revenue !== undefined ? Number(annual_revenue) : null,
      employees !== undefined ? parseInt(employees, 10) : null,
      billing_city !== undefined ? billing_city : null,
      billing_country !== undefined ? billing_country : null,
      billing_address !== undefined ? billing_address : null,
      status !== undefined ? status : null,
      id,
      req.orgId
    ]
  );

  const updated = db.get('SELECT * FROM accounts WHERE id = ?', [id]);
  res.json({ message: 'Account updated successfully', account: updated });
});

/**
 * Delete an account (Admin or Manager only)
 */
router.delete('/:id', requireRole('Admin', 'Manager'), (req, res) => {
  const { id } = req.params;
  const db = req.db || getDb();

  const existing = db.get('SELECT id FROM accounts WHERE id = ? AND organization_id = ?', [id, req.orgId]);
  if (!existing) {
    return res.status(404).json({ error: 'Account not found' });
  }

  db.run('DELETE FROM accounts WHERE id = ? AND organization_id = ?', [id, req.orgId]);
  res.json({ message: 'Account deleted successfully' });
});

export default router;
