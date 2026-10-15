import { getDb } from './index.js';

export const SCHEMA_SQL = `
-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  currency_code TEXT DEFAULT 'USD',
  currency_symbol TEXT DEFAULT '$',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Standard', -- 'Admin', 'Manager', 'Standard', 'ReadOnly'
  status TEXT DEFAULT 'Active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Pipeline Stages table
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stage_order INTEGER NOT NULL,
  probability INTEGER NOT NULL DEFAULT 10,
  is_won INTEGER DEFAULT 0,
  is_lost INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Accounts (Companies) table
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  industry TEXT,
  website TEXT,
  phone TEXT,
  annual_revenue REAL DEFAULT 0,
  employees INTEGER DEFAULT 0,
  billing_city TEXT,
  billing_country TEXT,
  billing_address TEXT,
  status TEXT DEFAULT 'Active',
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  title TEXT,
  department TEXT,
  is_primary INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Leads table
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  company TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  title TEXT,
  status TEXT DEFAULT 'New', -- 'New', 'Contacted', 'Qualified', 'Unqualified'
  source TEXT DEFAULT 'Web', -- 'Web', 'Referral', 'Inbound', 'Event', 'Cold Outreach'
  rating TEXT DEFAULT 'Warm', -- 'Hot', 'Warm', 'Cold'
  is_converted INTEGER DEFAULT 0,
  converted_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  converted_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  converted_opportunity_id INTEGER REFERENCES opportunities(id) ON DELETE SET NULL,
  converted_at DATETIME,
  assigned_to INTEGER REFERENCES users(id),
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Opportunities (Deals) table
CREATE TABLE IF NOT EXISTS opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  stage_id INTEGER NOT NULL REFERENCES pipeline_stages(id),
  amount REAL DEFAULT 0,
  probability INTEGER DEFAULT 10,
  close_date DATE,
  type TEXT DEFAULT 'New Business', -- 'New Business', 'Existing Customer', 'Renewal'
  assigned_to INTEGER REFERENCES users(id),
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Activities table (Tasks, Calls, Meetings, Notes)
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL, -- 'Task', 'Call', 'Meeting', 'Note'
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'Pending', -- 'Pending', 'In Progress', 'Completed'
  priority TEXT DEFAULT 'Medium', -- 'Low', 'Medium', 'High'
  due_date DATETIME,
  related_to_type TEXT, -- 'Account', 'Contact', 'Lead', 'Opportunity'
  related_to_id INTEGER,
  assigned_to INTEGER REFERENCES users(id),
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Organization tenant indexes for ultra-fast multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_stages_org ON pipeline_stages(organization_id);
CREATE INDEX IF NOT EXISTS idx_accounts_org ON accounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_leads_org ON leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_opps_org ON opportunities(organization_id);
CREATE INDEX IF NOT EXISTS idx_activities_org ON activities(organization_id);
CREATE INDEX IF NOT EXISTS idx_activities_related ON activities(related_to_type, related_to_id);
`;

export function runMigrations(db = null) {
  const client = db || getDb();
  client.exec(SCHEMA_SQL);
  return true;
}

// Allow direct execution
if (process.argv[1]?.endsWith('migrate.js')) {
  console.log('Running database migrations...');
  runMigrations();
  console.log('Migrations completed successfully.');
}
