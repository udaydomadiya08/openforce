import { Router } from 'express';
import { getDb } from '../../db/index.js';
import { authMiddleware } from '../../middleware/auth.js';
import { requireWriteAccess, requireRole } from '../../middleware/rbac.js';

const router = Router();
router.use(authMiddleware);

/**
 * List activities with filters
 */
router.get('/', (req, res) => {
  const db = req.db || getDb();
  const { related_to_type, related_to_id, status, activity_type, page = 1, limit = 50 } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (pageNum - 1) * limitNum;

  let whereClause = 'WHERE act.organization_id = ?';
  const params = [req.orgId];

  if (related_to_type) {
    whereClause += ' AND act.related_to_type = ?';
    params.push(related_to_type);
  }

  if (related_to_id) {
    whereClause += ' AND act.related_to_id = ?';
    params.push(related_to_id);
  }

  if (status) {
    whereClause += ' AND act.status = ?';
    params.push(status);
  }

  if (activity_type) {
    whereClause += ' AND act.activity_type = ?';
    params.push(activity_type);
  }

  const countRow = db.get(`SELECT COUNT(*) as total FROM activities act ${whereClause}`, params);
  const total = countRow ? countRow.total : 0;

  const query = `
    SELECT 
      act.*,
      u.first_name as author_first,
      u.last_name as author_last,
      assignee.first_name as assigned_first,
      assignee.last_name as assigned_last
    FROM activities act
    LEFT JOIN users u ON u.id = act.created_by
    LEFT JOIN users assignee ON assignee.id = act.assigned_to
    ${whereClause}
    ORDER BY act.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const activities = db.all(query, [...params, limitNum, offset]);

  res.json({
    activities,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum)
    }
  });
});

/**
 * Create a new activity
 */
router.post('/', requireWriteAccess, (req, res) => {
  const { activity_type, subject, description, priority = 'Medium', status = 'Pending', due_date, related_to_type, related_to_id, assigned_to } = req.body;
  if (!activity_type || !subject) {
    return res.status(400).json({ error: 'Activity type and subject are required' });
  }

  const validTypes = ['Task', 'Call', 'Meeting', 'Note'];
  if (!validTypes.includes(activity_type)) {
    return res.status(400).json({ error: `Invalid activity_type. Must be one of: ${validTypes.join(', ')}` });
  }

  const db = req.db || getDb();
  const result = db.run(
    `INSERT INTO activities (organization_id, activity_type, subject, description, priority, status, due_date, related_to_type, related_to_id, assigned_to, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.orgId,
      activity_type,
      subject.trim(),
      description?.trim() || null,
      priority || 'Medium',
      status || 'Pending',
      due_date || null,
      related_to_type || null,
      related_to_id ? parseInt(related_to_id, 10) : null,
      assigned_to || req.user.id,
      req.user.id
    ]
  );

  const activity = db.get('SELECT * FROM activities WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json({ message: 'Activity created successfully', activity });
});

/**
 * Toggle activity status (e.g. mark Task completed)
 */
router.patch('/:id/status', requireWriteAccess, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'status is required' });
  }

  const db = req.db || getDb();
  const existing = db.get('SELECT id FROM activities WHERE id = ? AND organization_id = ?', [id, req.orgId]);
  if (!existing) {
    return res.status(404).json({ error: 'Activity not found' });
  }

  db.run(
    'UPDATE activities SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND organization_id = ?',
    [status, id, req.orgId]
  );

  const updated = db.get('SELECT * FROM activities WHERE id = ?', [id]);
  res.json({ message: 'Status updated', activity: updated });
});

/**
 * Delete activity
 */
router.delete('/:id', requireWriteAccess, (req, res) => {
  const { id } = req.params;
  const db = req.db || getDb();

  const existing = db.get('SELECT id FROM activities WHERE id = ? AND organization_id = ?', [id, req.orgId]);
  if (!existing) {
    return res.status(404).json({ error: 'Activity not found' });
  }

  db.run('DELETE FROM activities WHERE id = ? AND organization_id = ?', [id, req.orgId]);
  res.json({ message: 'Activity deleted successfully' });
});

export default router;
