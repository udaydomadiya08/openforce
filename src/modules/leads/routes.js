import { Router } from 'express';
import { getDb } from '../../db/index.js';
import { authMiddleware } from '../../middleware/auth.js';
import { requireWriteAccess, requireRole } from '../../middleware/rbac.js';

const router = Router();
router.use(authMiddleware);

/**
 * List leads with status filter, search, pagination
 */
router.get('/', (req, res) => {
  const db = req.db || getDb();
  const { status, source, rating, is_converted, q, page = 1, limit = 25, sort = 'created_at', order = 'DESC' } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const offset = (pageNum - 1) * limitNum;

  let whereClause = 'WHERE l.organization_id = ?';
  const params = [req.orgId];

  // Default: hide converted leads unless explicitly queried
  if (is_converted !== undefined) {
    whereClause += ' AND l.is_converted = ?';
    params.push(is_converted === 'true' || is_converted === '1' ? 1 : 0);
  } else {
    whereClause += ' AND l.is_converted = 0';
  }

  if (status) {
    whereClause += ' AND l.status = ?';
    params.push(status);
  }

  if (source) {
    whereClause += ' AND l.source = ?';
    params.push(source);
  }

  if (rating) {
    whereClause += ' AND l.rating = ?';
    params.push(rating);
  }

  if (q && q.trim()) {
    whereClause += ' AND (l.first_name LIKE ? OR l.last_name LIKE ? OR l.company LIKE ? OR l.email LIKE ?)';
    const searchPattern = `%${q.trim()}%`;
    params.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  const validSorts = ['first_name', 'last_name', 'company', 'status', 'created_at', 'rating'];
  const sortCol = validSorts.includes(sort) ? sort : 'created_at';
  const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const countRow = db.get(
    `SELECT COUNT(*) as total FROM leads l ${whereClause}`,
    params
  );
  const total = countRow ? countRow.total : 0;

  const query = `
    SELECT 
      l.*,
      u.first_name as assigned_first,
      u.last_name as assigned_last
    FROM leads l
    LEFT JOIN users u ON u.id = l.assigned_to
    ${whereClause}
    ORDER BY l.${sortCol} ${sortOrder}
    LIMIT ? OFFSET ?
  `;

  const leads = db.all(query, [...params, limitNum, offset]);

  res.json({
    leads,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum)
    }
  });
});

/**
 * Get lead detail by ID
 */
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const db = req.db || getDb();

  const lead = db.get(
    `SELECT l.*, 
            u.first_name as assigned_first, u.last_name as assigned_last,
            acc.name as converted_account_name,
            c.first_name as converted_contact_first, c.last_name as converted_contact_last,
            o.name as converted_opportunity_name
     FROM leads l
     LEFT JOIN users u ON u.id = l.assigned_to
     LEFT JOIN accounts acc ON acc.id = l.converted_account_id
     LEFT JOIN contacts c ON c.id = l.converted_contact_id
     LEFT JOIN opportunities o ON o.id = l.converted_opportunity_id
     WHERE l.id = ? AND l.organization_id = ?`,
    [id, req.orgId]
  );

  if (!lead) {
    return res.status(404).json({ error: 'Lead not found' });
  }

  const activities = db.all(
    `SELECT act.*, u.first_name as author_first, u.last_name as author_last
     FROM activities act
     LEFT JOIN users u ON u.id = act.created_by
     WHERE act.related_to_type = 'Lead' AND act.related_to_id = ? AND act.organization_id = ?
     ORDER BY act.created_at DESC`,
    [id, req.orgId]
  );

  res.json({ lead, activities });
});

/**
 * Create a new lead
 */
router.post('/', requireWriteAccess, (req, res) => {
  const { first_name, last_name, company, email, phone, title, status = 'New', source = 'Web', rating = 'Warm', assigned_to } = req.body;
  if (!first_name || !last_name || !company) {
    return res.status(400).json({ error: 'First name, last name, and company are required.' });
  }

  const db = req.db || getDb();
  const assignedUserId = assigned_to || req.user.id;

  const result = db.run(
    `INSERT INTO leads (organization_id, first_name, last_name, company, email, phone, title, status, source, rating, assigned_to, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.orgId,
      first_name.trim(),
      last_name.trim(),
      company.trim(),
      email?.trim() || null,
      phone?.trim() || null,
      title?.trim() || null,
      status || 'New',
      source || 'Web',
      rating || 'Warm',
      assignedUserId,
      req.user.id
    ]
  );

  const lead = db.get('SELECT * FROM leads WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json({ message: 'Lead created successfully', lead });
});

/**
 * Update lead
 */
router.put('/:id', requireWriteAccess, (req, res) => {
  const { id } = req.params;
  const { first_name, last_name, company, email, phone, title, status, source, rating, assigned_to } = req.body;
  const db = req.db || getDb();

  const existing = db.get('SELECT id FROM leads WHERE id = ? AND organization_id = ?', [id, req.orgId]);
  if (!existing) {
    return res.status(404).json({ error: 'Lead not found' });
  }

  db.run(
    `UPDATE leads
     SET first_name = COALESCE(?, first_name),
         last_name = COALESCE(?, last_name),
         company = COALESCE(?, company),
         email = COALESCE(?, email),
         phone = COALESCE(?, phone),
         title = COALESCE(?, title),
         status = COALESCE(?, status),
         source = COALESCE(?, source),
         rating = COALESCE(?, rating),
         assigned_to = COALESCE(?, assigned_to),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND organization_id = ?`,
    [
      first_name ? first_name.trim() : null,
      last_name ? last_name.trim() : null,
      company ? company.trim() : null,
      email !== undefined ? email : null,
      phone !== undefined ? phone : null,
      title !== undefined ? title : null,
      status !== undefined ? status : null,
      source !== undefined ? source : null,
      rating !== undefined ? rating : null,
      assigned_to !== undefined ? assigned_to : null,
      id,
      req.orgId
    ]
  );

  const updated = db.get('SELECT * FROM leads WHERE id = ?', [id]);
  res.json({ message: 'Lead updated successfully', lead: updated });
});

/**
 * Delete lead
 */
router.delete('/:id', requireRole('Admin', 'Manager'), (req, res) => {
  const { id } = req.params;
  const db = req.db || getDb();

  const existing = db.get('SELECT id FROM leads WHERE id = ? AND organization_id = ?', [id, req.orgId]);
  if (!existing) {
    return res.status(404).json({ error: 'Lead not found' });
  }

  db.run('DELETE FROM leads WHERE id = ? AND organization_id = ?', [id, req.orgId]);
  res.json({ message: 'Lead deleted successfully' });
});

/**
 * CONVERT LEAD (Salesforce-Parity Workflow)
 * Converts lead into Account, Contact, and Opportunity atomically
 */
router.post('/:id/convert', requireWriteAccess, (req, res) => {
  const { id } = req.params;
  const { 
    account_id, 
    account_name,
    create_opportunity = true, 
    opportunity_name, 
    opportunity_amount = 0, 
    opportunity_stage_id,
    close_date 
  } = req.body;

  const db = req.db || getDb();
  const lead = db.get('SELECT * FROM leads WHERE id = ? AND organization_id = ?', [id, req.orgId]);

  if (!lead) {
    return res.status(404).json({ error: 'Lead not found' });
  }

  if (lead.is_converted) {
    return res.status(400).json({ error: 'This lead has already been converted.' });
  }

  try {
    const conversionResult = db.transaction(() => {
      let finalAccountId = account_id;

      // 1. Account: Link existing or create new Account
      if (!finalAccountId) {
        const companyName = account_name?.trim() || lead.company;
        // Check if an account with this name already exists in org
        const existingAcc = db.get(
          'SELECT id FROM accounts WHERE LOWER(name) = LOWER(?) AND organization_id = ?',
          [companyName, req.orgId]
        );

        if (existingAcc) {
          finalAccountId = existingAcc.id;
        } else {
          const accRes = db.run(
            `INSERT INTO accounts (organization_id, name, phone, created_by)
             VALUES (?, ?, ?, ?)`,
            [req.orgId, companyName, lead.phone, req.user.id]
          );
          finalAccountId = accRes.lastInsertRowid;
        }
      }

      // 2. Contact: Create new Contact linked to Account
      const contactRes = db.run(
        `INSERT INTO contacts (organization_id, account_id, first_name, last_name, email, phone, title, is_primary, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [req.orgId, finalAccountId, lead.first_name, lead.last_name, lead.email, lead.phone, lead.title, req.user.id]
      );
      const finalContactId = contactRes.lastInsertRowid;

      // 3. Opportunity: Create if requested
      let finalOppId = null;
      if (create_opportunity) {
        // Resolve stage
        let stageId = opportunity_stage_id;
        if (!stageId) {
          const firstStage = db.get(
            'SELECT id FROM pipeline_stages WHERE organization_id = ? ORDER BY stage_order ASC LIMIT 1',
            [req.orgId]
          );
          stageId = firstStage ? firstStage.id : 1;
        }

        const stage = db.get('SELECT probability FROM pipeline_stages WHERE id = ?', [stageId]);
        const defaultProb = stage ? stage.probability : 25;

        // Default close date 30 days ahead if not provided
        const defaultClose = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const oppName = opportunity_name?.trim() || `${lead.company} - Deal`;

        const oppRes = db.run(
          `INSERT INTO opportunities (organization_id, account_id, lead_id, name, stage_id, amount, probability, close_date, assigned_to, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.orgId,
            finalAccountId,
            lead.id,
            oppName,
            stageId,
            Number(opportunity_amount) || 0,
            defaultProb,
            close_date || defaultClose,
            lead.assigned_to || req.user.id,
            req.user.id
          ]
        );
        finalOppId = oppRes.lastInsertRowid;
      }

      // 4. Update Lead to Converted
      db.run(
        `UPDATE leads
         SET is_converted = 1,
             converted_account_id = ?,
             converted_contact_id = ?,
             converted_opportunity_id = ?,
             converted_at = CURRENT_TIMESTAMP,
             status = 'Qualified',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND organization_id = ?`,
        [finalAccountId, finalContactId, finalOppId, lead.id, req.orgId]
      );

      // 5. Log activity
      db.run(
        `INSERT INTO activities (organization_id, activity_type, subject, description, status, related_to_type, related_to_id, created_by)
         VALUES (?, 'Task', 'Lead Converted', ?, 'Completed', 'Account', ?, ?)`,
        [
          req.orgId,
          `Lead ${lead.first_name} ${lead.last_name} (${lead.company}) was successfully converted into Account, Contact, and Deal.`,
          finalAccountId,
          req.user.id
        ]
      );

      const account = db.get('SELECT * FROM accounts WHERE id = ?', [finalAccountId]);
      const contact = db.get('SELECT * FROM contacts WHERE id = ?', [finalContactId]);
      const opportunity = finalOppId ? db.get('SELECT * FROM opportunities WHERE id = ?', [finalOppId]) : null;

      return { account, contact, opportunity };
    });

    res.json({
      message: 'Lead converted successfully.',
      ...conversionResult
    });
  } catch (err) {
    console.error('Lead conversion error:', err);
    res.status(500).json({ error: 'Failed to convert lead: ' + err.message });
  }
});

export default router;
