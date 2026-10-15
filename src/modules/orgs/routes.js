import { Router } from 'express';
import { getDb } from '../../db/index.js';
import { authMiddleware } from '../../middleware/auth.js';
import { requireAdmin } from '../../middleware/rbac.js';

const router = Router();

// Apply authMiddleware to all org routes
router.use(authMiddleware);

/**
 * Get current organization profile
 */
router.get('/', (req, res) => {
  const db = req.db || getDb();
  const org = db.get('SELECT * FROM organizations WHERE id = ?', [req.orgId]);
  const stages = db.all('SELECT * FROM pipeline_stages WHERE organization_id = ? ORDER BY stage_order ASC', [req.orgId]);
  res.json({ org, stages });
});

/**
 * Update organization settings (Admin only)
 */
router.put('/', requireAdmin, (req, res) => {
  const { name, currency_code, currency_symbol } = req.body;
  const db = req.db || getDb();

  db.run(
    `UPDATE organizations 
     SET name = COALESCE(?, name),
         currency_code = COALESCE(?, currency_code),
         currency_symbol = COALESCE(?, currency_symbol),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [name?.trim() || null, currency_code?.trim() || null, currency_symbol?.trim() || null, req.orgId]
  );

  const updatedOrg = db.get('SELECT * FROM organizations WHERE id = ?', [req.orgId]);
  res.json({ message: 'Organization updated successfully', org: updatedOrg });
});

/**
 * List pipeline stages
 */
router.get('/stages', (req, res) => {
  const db = req.db || getDb();
  const stages = db.all(
    'SELECT * FROM pipeline_stages WHERE organization_id = ? ORDER BY stage_order ASC',
    [req.orgId]
  );
  res.json({ stages });
});

/**
 * Create a new pipeline stage (Admin only)
 */
router.post('/stages', requireAdmin, (req, res) => {
  const { name, stage_order, probability = 10, is_won = 0, is_lost = 0 } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Stage name is required.' });
  }

  const db = req.db || getDb();
  const maxOrderRow = db.get(
    'SELECT MAX(stage_order) as max_order FROM pipeline_stages WHERE organization_id = ?',
    [req.orgId]
  );
  const order = stage_order !== undefined ? stage_order : (maxOrderRow?.max_order || 0) + 1;

  const result = db.run(
    `INSERT INTO pipeline_stages (organization_id, name, stage_order, probability, is_won, is_lost)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.orgId, name.trim(), order, probability, is_won ? 1 : 0, is_lost ? 1 : 0]
  );

  const stage = db.get('SELECT * FROM pipeline_stages WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json({ message: 'Pipeline stage created', stage });
});

/**
 * Update a pipeline stage (Admin only)
 */
router.put('/stages/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, stage_order, probability, is_won, is_lost } = req.body;
  const db = req.db || getDb();

  const existing = db.get('SELECT id FROM pipeline_stages WHERE id = ? AND organization_id = ?', [id, req.orgId]);
  if (!existing) {
    return res.status(404).json({ error: 'Pipeline stage not found' });
  }

  db.run(
    `UPDATE pipeline_stages
     SET name = COALESCE(?, name),
         stage_order = COALESCE(?, stage_order),
         probability = COALESCE(?, probability),
         is_won = COALESCE(?, is_won),
         is_lost = COALESCE(?, is_lost)
     WHERE id = ? AND organization_id = ?`,
    [
      name ? name.trim() : null,
      stage_order !== undefined ? stage_order : null,
      probability !== undefined ? probability : null,
      is_won !== undefined ? (is_won ? 1 : 0) : null,
      is_lost !== undefined ? (is_lost ? 1 : 0) : null,
      id,
      req.orgId
    ]
  );

  const stage = db.get('SELECT * FROM pipeline_stages WHERE id = ?', [id]);
  res.json({ message: 'Stage updated successfully', stage });
});

/**
 * Delete a pipeline stage (Admin only)
 */
router.delete('/stages/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const db = req.db || getDb();

  const existing = db.get('SELECT id FROM pipeline_stages WHERE id = ? AND organization_id = ?', [id, req.orgId]);
  if (!existing) {
    return res.status(404).json({ error: 'Pipeline stage not found' });
  }

  // Check if any opportunities reference this stage
  const oppCount = db.get(
    'SELECT COUNT(*) as count FROM opportunities WHERE stage_id = ? AND organization_id = ?',
    [id, req.orgId]
  );
  if (oppCount && oppCount.count > 0) {
    return res.status(400).json({
      error: `Cannot delete stage: ${oppCount.count} active opportunities are currently in this stage. Please reassign them first.`
    });
  }

  db.run('DELETE FROM pipeline_stages WHERE id = ? AND organization_id = ?', [id, req.orgId]);
  res.json({ message: 'Stage deleted successfully' });
});

export default router;
