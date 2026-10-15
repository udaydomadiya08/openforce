import { Router } from 'express';
import { getDb } from '../../db/index.js';
import { hashPassword, verifyPassword, generateToken } from '../../utils/crypto.js';
import { authMiddleware } from '../../middleware/auth.js';
import { requireAdmin } from '../../middleware/rbac.js';

const router = Router();

export const DEFAULT_STAGES = [
  { name: 'Prospecting', stage_order: 1, probability: 10, is_won: 0, is_lost: 0 },
  { name: 'Qualification', stage_order: 2, probability: 25, is_won: 0, is_lost: 0 },
  { name: 'Proposal / Quote', stage_order: 3, probability: 50, is_won: 0, is_lost: 0 },
  { name: 'Negotiation', stage_order: 4, probability: 75, is_won: 0, is_lost: 0 },
  { name: 'Closed Won', stage_order: 5, probability: 100, is_won: 1, is_lost: 0 },
  { name: 'Closed Lost', stage_order: 6, probability: 0, is_won: 0, is_lost: 1 }
];

export function initializeOrgStages(db, orgId) {
  for (const stage of DEFAULT_STAGES) {
    db.run(
      `INSERT INTO pipeline_stages (organization_id, name, stage_order, probability, is_won, is_lost)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [orgId, stage.name, stage.stage_order, stage.probability, stage.is_won, stage.is_lost]
    );
  }
}

/**
 * Register a new organization and admin user
 */
router.post('/register', (req, res) => {
  const { email, password, first_name, last_name, org_name } = req.body;

  if (!email || !password || !first_name || !last_name) {
    return res.status(400).json({ error: 'Please provide email, password, first_name, and last_name.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  const db = req.db || getDb();
  const normalizedEmail = email.trim().toLowerCase();

  const existing = db.get('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
  if (existing) {
    return res.status(400).json({ error: 'A user with this email address already exists.' });
  }

  try {
    const result = db.transaction(() => {
      // 1. Create Organization
      const orgName = org_name?.trim() || `${first_name}'s Organization`;
      const orgRes = db.run(
        'INSERT INTO organizations (name, currency_code, currency_symbol) VALUES (?, ?, ?)',
        [orgName, 'USD', '$']
      );
      const orgId = orgRes.lastInsertRowid;

      // 2. Initialize Pipeline Stages
      initializeOrgStages(db, orgId);

      // 3. Create Admin User
      const passwordHash = hashPassword(password);
      const userRes = db.run(
        `INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role, status)
         VALUES (?, ?, ?, ?, ?, 'Admin', 'Active')`,
        [orgId, normalizedEmail, passwordHash, first_name.trim(), last_name.trim()]
      );
      const userId = userRes.lastInsertRowid;

      const user = db.get('SELECT id, organization_id, email, first_name, last_name, role FROM users WHERE id = ?', [userId]);
      const org = db.get('SELECT id, name, currency_code, currency_symbol FROM organizations WHERE id = ?', [orgId]);

      const token = generateToken({ userId, organizationId: orgId, role: 'Admin' });

      return { user, org, token };
    });

    res.status(201).json({
      message: 'Account and organization created successfully.',
      ...result
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

/**
 * Sign in to an existing account
 */
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Please provide email and password.' });
  }

  const db = req.db || getDb();
  const normalizedEmail = email.trim().toLowerCase();

  const user = db.get('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const isValid = verifyPassword(password, user.password_hash);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (user.status !== 'Active') {
    return res.status(403).json({ error: 'Account is deactivated. Contact your administrator.' });
  }

  const org = db.get('SELECT id, name, currency_code, currency_symbol FROM organizations WHERE id = ?', [user.organization_id]);
  const token = generateToken({
    userId: user.id,
    organizationId: user.organization_id,
    role: user.role
  });

  const safeUser = {
    id: user.id,
    organization_id: user.organization_id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    role: user.role
  };

  res.json({
    message: 'Login successful.',
    user: safeUser,
    org,
    token
  });
});

/**
 * Get current session profile
 */
router.get('/me', authMiddleware, (req, res) => {
  const db = req.db || getDb();
  const org = db.get('SELECT id, name, currency_code, currency_symbol FROM organizations WHERE id = ?', [req.orgId]);
  res.json({
    user: req.user,
    org
  });
});

/**
 * List team members in the organization
 */
router.get('/users', authMiddleware, (req, res) => {
  const db = req.db || getDb();
  const users = db.all(
    'SELECT id, organization_id, email, first_name, last_name, role, status, created_at FROM users WHERE organization_id = ? ORDER BY first_name ASC',
    [req.orgId]
  );
  res.json({ users });
});

/**
 * Create/invite new user to current organization (Admin only)
 */
router.post('/users', authMiddleware, requireAdmin, (req, res) => {
  const { email, password, first_name, last_name, role = 'Standard' } = req.body;
  if (!email || !password || !first_name || !last_name) {
    return res.status(400).json({ error: 'Please provide email, password, first_name, last_name, and role.' });
  }

  const validRoles = ['Admin', 'Manager', 'Standard', 'ReadOnly'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
  }

  const db = req.db || getDb();
  const normalizedEmail = email.trim().toLowerCase();

  const existing = db.get('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
  if (existing) {
    return res.status(400).json({ error: 'A user with this email address already exists.' });
  }

  const passwordHash = hashPassword(password);
  const result = db.run(
    `INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role, status)
     VALUES (?, ?, ?, ?, ?, ?, 'Active')`,
    [req.orgId, normalizedEmail, passwordHash, first_name.trim(), last_name.trim(), role]
  );

  const newUser = db.get(
    'SELECT id, organization_id, email, first_name, last_name, role, status, created_at FROM users WHERE id = ?',
    [result.lastInsertRowid]
  );

  res.status(201).json({
    message: 'User created successfully.',
    user: newUser
  });
});

export default router;
