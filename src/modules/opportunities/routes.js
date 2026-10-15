import { Router } from 'express';
import { getDb } from '../../db/index.js';
import { authMiddleware } from '../../middleware/auth.js';
import { requireWriteAccess, requireRole } from '../../middleware/rbac.js';

const router = Router();
router.use(authMiddleware);

/**
 * Get Opportunity Pipeline Kanban data
 * Returns stages with aggregated deal count, totals, and nested deals
 */
router.get('/pipeline', (req, res) => {
  const db = req.db || getDb();

  // 1. Fetch all pipeline stages for this organization
  const stages = db.all(
    'SELECT * FROM pipeline_stages WHERE organization_id = ? ORDER BY stage_order ASC',
    [req.orgId]
  );

  // 2. Fetch all opportunities with account and assignee details
  const opps = db.all(
    `SELECT 
       o.*,
       a.name as account_name,
       u.first_name as assigned_first,
       u.last_name as assigned_last
     FROM opportunities o
     JOIN accounts a ON a.id = o.account_id AND a.organization_id = o.organization_id
     LEFT JOIN users u ON u.id = o.assigned_to
     WHERE o.organization_id = ?
     ORDER BY o.close_date ASC, o.created_at DESC`,
    [req.orgId]
  );

  // 3. Group opportunities by stage and calculate sums
  let totalPipelineValue = 0;
  let weightedPipelineValue = 0;
  let totalOpenCount = 0;

  const stageBuckets = stages.map(stage => {
    const stageOpps = opps.filter(o => o.stage_id === stage.id);
    const stageTotal = stageOpps.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);

    if (!stage.is_won && !stage.is_lost) {
      totalPipelineValue += stageTotal;
      totalOpenCount += stageOpps.length;
    }

    stageOpps.forEach(o => {
      weightedPipelineValue += (Number(o.amount) || 0) * ((o.probability || 0) / 100);
    });

    return {
      ...stage,
      total_amount: stageTotal,
      deals_count: stageOpps.length,
      deals: stageOpps
    };
  });

  res.json({
    stages: stageBuckets,
    summary: {
      total_pipeline_value: totalPipelineValue,
      weighted_pipeline_value: Math.round(weightedPipelineValue),
      total_open_count: totalOpenCount
    }
  });
});

/**
 * List opportunities (tabular view)
 */
router.get('/', (req, res) => {
  const db = req.db || getDb();
  const { stage_id, account_id, q, page = 1, limit = 25, sort = 'close_date', order = 'ASC' } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const offset = (pageNum - 1) * limitNum;

  let whereClause = 'WHERE o.organization_id = ?';
  const params = [req.orgId];

  if (stage_id) {
    whereClause += ' AND o.stage_id = ?';
    params.push(stage_id);
  }

  if (account_id) {
    whereClause += ' AND o.account_id = ?';
    params.push(account_id);
  }

  if (q && q.trim()) {
    whereClause += ' AND (o.name LIKE ? OR a.name LIKE ?)';
    const searchPattern = `%${q.trim()}%`;
    params.push(searchPattern, searchPattern);
  }

  const validSorts = ['name', 'amount', 'close_date', 'probability', 'created_at'];
  const sortCol = validSorts.includes(sort) ? sort : 'close_date';
  const sortOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const countRow = db.get(
    `SELECT COUNT(*) as total FROM opportunities o JOIN accounts a ON a.id = o.account_id ${whereClause}`,
    params
  );
  const total = countRow ? countRow.total : 0;

  const query = `
    SELECT 
      o.*,
      a.name as account_name,
      ps.name as stage_name,
      ps.probability as default_prob,
      ps.is_won,
      ps.is_lost,
      u.first_name as assigned_first,
      u.last_name as assigned_last
    FROM opportunities o
    JOIN accounts a ON a.id = o.account_id AND a.organization_id = o.organization_id
    JOIN pipeline_stages ps ON ps.id = o.stage_id
    LEFT JOIN users u ON u.id = o.assigned_to
    ${whereClause}
    ORDER BY o.${sortCol} ${sortOrder}
    LIMIT ? OFFSET ?
  `;

  const opportunities = db.all(query, [...params, limitNum, offset]);

  res.json({
    opportunities,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum)
    }
  });
});

/**
 * Get opportunity detail by ID
 */
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const db = req.db || getDb();

  const opportunity = db.get(
    `SELECT o.*,
            a.name as account_name,
            a.industry as account_industry,
            ps.name as stage_name,
            ps.probability as stage_prob,
            ps.is_won,
            ps.is_lost,
            u.first_name as assigned_first,
            u.last_name as assigned_last
     FROM opportunities o
     JOIN accounts a ON a.id = o.account_id AND a.organization_id = o.organization_id
     JOIN pipeline_stages ps ON ps.id = o.stage_id
     LEFT JOIN users u ON u.id = o.assigned_to
     WHERE o.id = ? AND o.organization_id = ?`,
    [id, req.orgId]
  );

  if (!opportunity) {
    return res.status(404).json({ error: 'Opportunity not found' });
  }

  const activities = db.all(
    `SELECT act.*, u.first_name as author_first, u.last_name as author_last
     FROM activities act
     LEFT JOIN users u ON u.id = act.created_by
     WHERE act.related_to_type = 'Opportunity' AND act.related_to_id = ? AND act.organization_id = ?
     ORDER BY act.created_at DESC`,
    [id, req.orgId]
  );

  res.json({ opportunity, activities });
});

/**
 * Create a new opportunity
 */
router.post('/', requireWriteAccess, (req, res) => {
  const { name, account_id, stage_id, amount, probability, close_date, type = 'New Business', assigned_to } = req.body;
  if (!name || !account_id || !stage_id) {
    return res.status(400).json({ error: 'Name, account_id, and stage_id are required' });
  }

  const db = req.db || getDb();

  // Validate account belongs to this organization
  const account = db.get('SELECT id FROM accounts WHERE id = ? AND organization_id = ?', [account_id, req.orgId]);
  if (!account) {
    return res.status(400).json({ error: 'Invalid account ID' });
  }

  // Validate stage belongs to this organization
  const stage = db.get('SELECT id, probability FROM pipeline_stages WHERE id = ? AND organization_id = ?', [stage_id, req.orgId]);
  if (!stage) {
    return res.status(400).json({ error: 'Invalid stage ID' });
  }

  const finalProb = probability !== undefined ? probability : stage.probability;
  const finalClose = close_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const result = db.run(
    `INSERT INTO opportunities (organization_id, account_id, name, stage_id, amount, probability, close_date, type, assigned_to, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.orgId,
      account_id,
      name.trim(),
      stage_id,
      Number(amount) || 0,
      parseInt(finalProb, 10),
      finalClose,
      type,
      assigned_to || req.user.id,
      req.user.id
    ]
  );

  const opp = db.get('SELECT * FROM opportunities WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json({ message: 'Opportunity created successfully', opportunity: opp });
});

/**
 * Update opportunity details
 */
router.put('/:id', requireWriteAccess, (req, res) => {
  const { id } = req.params;
  const { name, account_id, stage_id, amount, probability, close_date, type, assigned_to } = req.body;
  const db = req.db || getDb();

  const existing = db.get('SELECT id FROM opportunities WHERE id = ? AND organization_id = ?', [id, req.orgId]);
  if (!existing) {
    return res.status(404).json({ error: 'Opportunity not found' });
  }

  db.run(
    `UPDATE opportunities
     SET name = COALESCE(?, name),
         account_id = COALESCE(?, account_id),
         stage_id = COALESCE(?, stage_id),
         amount = COALESCE(?, amount),
         probability = COALESCE(?, probability),
         close_date = COALESCE(?, close_date),
         type = COALESCE(?, type),
         assigned_to = COALESCE(?, assigned_to),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND organization_id = ?`,
    [
      name ? name.trim() : null,
      account_id !== undefined ? account_id : null,
      stage_id !== undefined ? stage_id : null,
      amount !== undefined ? Number(amount) : null,
      probability !== undefined ? parseInt(probability, 10) : null,
      close_date !== undefined ? close_date : null,
      type !== undefined ? type : null,
      assigned_to !== undefined ? assigned_to : null,
      id,
      req.orgId
    ]
  );

  const updated = db.get('SELECT * FROM opportunities WHERE id = ?', [id]);
  res.json({ message: 'Opportunity updated successfully', opportunity: updated });
});

/**
 * Fast Stage Update (for Kanban drag-and-drop)
 */
router.patch('/:id/stage', requireWriteAccess, (req, res) => {
  const { id } = req.params;
  const { stage_id } = req.body;
  if (!stage_id) {
    return res.status(400).json({ error: 'stage_id is required' });
  }

  const db = req.db || getDb();
  const existing = db.get('SELECT o.*, ps.name as old_stage_name FROM opportunities o JOIN pipeline_stages ps ON ps.id = o.stage_id WHERE o.id = ? AND o.organization_id = ?', [id, req.orgId]);
  if (!existing) {
    return res.status(404).json({ error: 'Opportunity not found' });
  }

  const newStage = db.get('SELECT * FROM pipeline_stages WHERE id = ? AND organization_id = ?', [stage_id, req.orgId]);
  if (!newStage) {
    return res.status(400).json({ error: 'Invalid target stage' });
  }

  db.transaction(() => {
    // Update opportunity stage and update probability to match stage default
    db.run(
      `UPDATE opportunities
       SET stage_id = ?,
           probability = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND organization_id = ?`,
      [stage_id, newStage.probability, id, req.orgId]
    );

    // Record stage movement activity
    db.run(
      `INSERT INTO activities (organization_id, activity_type, subject, description, status, related_to_type, related_to_id, created_by)
       VALUES (?, 'Note', 'Stage Updated', ?, 'Completed', 'Opportunity', ?, ?)`,
      [
        req.orgId,
        `Stage transitioned from "${existing.old_stage_name}" to "${newStage.name}" (${newStage.probability}% probability).`,
        id,
        req.user.id
      ]
    );
  });

  const updated = db.get(
    `SELECT o.*, ps.name as stage_name, ps.probability as stage_prob, ps.is_won, ps.is_lost
     FROM opportunities o
     JOIN pipeline_stages ps ON ps.id = o.stage_id
     WHERE o.id = ?`,
    [id]
  );

  res.json({ message: 'Stage updated successfully', opportunity: updated });
});

/**
 * Delete opportunity
 */
router.delete('/:id', requireRole('Admin', 'Manager'), (req, res) => {
  const { id } = req.params;
  const db = req.db || getDb();

  const existing = db.get('SELECT id FROM opportunities WHERE id = ? AND organization_id = ?', [id, req.orgId]);
  if (!existing) {
    return res.status(404).json({ error: 'Opportunity not found' });
  }

  db.run('DELETE FROM opportunities WHERE id = ? AND organization_id = ?', [id, req.orgId]);
  res.json({ message: 'Opportunity deleted successfully' });
});

export default router;
