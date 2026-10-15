import { Router } from 'express';
import { getDb } from '../../db/index.js';
import { authMiddleware } from '../../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

/**
 * Global search across Accounts, Contacts, Leads, and Opportunities
 */
router.get('/', (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim() || q.trim().length < 2) {
    return res.json({ accounts: [], contacts: [], leads: [], opportunities: [] });
  }

  const db = req.db || getDb();
  const pattern = `%${q.trim()}%`;

  const accounts = db.all(
    `SELECT id, name, industry, billing_city
     FROM accounts
     WHERE organization_id = ? AND (name LIKE ? OR industry LIKE ? OR billing_city LIKE ?)
     LIMIT 5`,
    [req.orgId, pattern, pattern, pattern]
  );

  const contacts = db.all(
    `SELECT c.id, c.first_name, c.last_name, c.email, c.title, a.name as account_name
     FROM contacts c
     LEFT JOIN accounts a ON a.id = c.account_id
     WHERE c.organization_id = ? AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ?)
     LIMIT 5`,
    [req.orgId, pattern, pattern, pattern]
  );

  const leads = db.all(
    `SELECT id, first_name, last_name, company, email, status
     FROM leads
     WHERE organization_id = ? AND is_converted = 0 AND (first_name LIKE ? OR last_name LIKE ? OR company LIKE ? OR email LIKE ?)
     LIMIT 5`,
    [req.orgId, pattern, pattern, pattern, pattern]
  );

  const opportunities = db.all(
    `SELECT o.id, o.name, o.amount, ps.name as stage_name, a.name as account_name
     FROM opportunities o
     JOIN pipeline_stages ps ON ps.id = o.stage_id
     JOIN accounts a ON a.id = o.account_id
     WHERE o.organization_id = ? AND (o.name LIKE ? OR a.name LIKE ?)
     LIMIT 5`,
    [req.orgId, pattern, pattern]
  );

  res.json({
    accounts,
    contacts,
    leads,
    opportunities,
    total_matches: accounts.length + contacts.length + leads.length + opportunities.length
  });
});

export default router;
