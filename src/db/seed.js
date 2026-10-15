import { getDb } from './index.js';
import { runMigrations } from './migrate.js';
import { hashPassword } from '../utils/crypto.js';
import { initializeOrgStages } from '../modules/auth/routes.js';

export function seedDatabase(db = null) {
  const client = db || getDb();
  runMigrations(client);

  return client.transaction(() => {
    // Check if already seeded
    const existingOrg = client.get('SELECT id FROM organizations WHERE name = ?', ['Apex Dynamics']);
    if (existingOrg) {
      console.log('Database already contains seed organization.');
      return existingOrg.id;
    }

    console.log('Seeding demo CRM data...');

    // 1. Create Organization
    const orgRes = client.run(
      'INSERT INTO organizations (name, currency_code, currency_symbol) VALUES (?, ?, ?)',
      ['Apex Dynamics', 'USD', '$']
    );
    const orgId = orgRes.lastInsertRowid;

    // 2. Initialize default pipeline stages
    initializeOrgStages(client, orgId);
    const stages = client.all('SELECT * FROM pipeline_stages WHERE organization_id = ? ORDER BY stage_order ASC', [orgId]);
    const stageMap = {};
    for (const s of stages) {
      stageMap[s.name] = s.id;
    }

    // 3. Create Users
    const adminPass = hashPassword('AdminPass123!');
    const sarahPass = hashPassword('SarahPass123!');
    const marcusPass = hashPassword('MarcusPass123!');
    const auditPass = hashPassword('AuditPass123!');

    const adminRes = client.run(
      `INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role, status)
       VALUES (?, 'admin@openforce.local', ?, 'Alex', 'Vance', 'Admin', 'Active')`,
      [orgId, adminPass]
    );
    const adminId = adminRes.lastInsertRowid;

    const repRes = client.run(
      `INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role, status)
       VALUES (?, 'sarah@openforce.local', ?, 'Sarah', 'Connor', 'Standard', 'Active')`,
      [orgId, sarahPass]
    );
    const repId = repRes.lastInsertRowid;

    const mgrRes = client.run(
      `INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role, status)
       VALUES (?, 'marcus@openforce.local', ?, 'Marcus', 'Aurelius', 'Manager', 'Active')`,
      [orgId, marcusPass]
    );
    const mgrId = mgrRes.lastInsertRowid;

    client.run(
      `INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role, status)
       VALUES (?, 'auditor@openforce.local', ?, 'Elena', 'Rostova', 'ReadOnly', 'Active')`,
      [orgId, auditPass]
    );

    // 4. Create Accounts
    const accounts = [
      { name: 'Acme Cloud Solutions', industry: 'Software & Technology', website: 'https://acmecloud.io', phone: '+1 (555) 234-5678', revenue: 12500000, employees: 140, city: 'San Francisco', country: 'USA' },
      { name: 'Meridian Global Health', industry: 'Healthcare', website: 'https://meridianhealth.org', phone: '+1 (555) 345-6789', revenue: 45000000, employees: 420, city: 'Boston', country: 'USA' },
      { name: 'Nova Robotics Inc', industry: 'Hardware / Robotics', website: 'https://novarobotics.ai', phone: '+1 (555) 456-7890', revenue: 8200000, employees: 65, city: 'Austin', country: 'USA' },
      { name: 'Stratum Financial Partners', industry: 'Financial Services', website: 'https://stratumcap.com', phone: '+1 (555) 567-8901', revenue: 28000000, employees: 180, city: 'New York', country: 'USA' },
      { name: 'Zenith Logistics Hub', industry: 'Supply Chain & Freight', website: 'https://zenithlogistics.com', phone: '+1 (555) 678-9012', revenue: 64000000, employees: 550, city: 'Chicago', country: 'USA' }
    ];

    const accountIds = [];
    for (const acc of accounts) {
      const res = client.run(
        `INSERT INTO accounts (organization_id, name, industry, website, phone, annual_revenue, employees, billing_city, billing_country, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orgId, acc.name, acc.industry, acc.website, acc.phone, acc.revenue, acc.employees, acc.city, acc.country, repId]
      );
      accountIds.push(res.lastInsertRowid);
    }

    // 5. Create Contacts
    const contacts = [
      { accIdx: 0, first: 'David', last: 'Kim', email: 'dkim@acmecloud.io', phone: '+1 (555) 234-1101', title: 'VP of Engineering', dept: 'Engineering', is_primary: 1 },
      { accIdx: 0, first: 'Rachel', last: 'Green', email: 'rgreen@acmecloud.io', phone: '+1 (555) 234-1102', title: 'Director of Procurement', dept: 'Operations', is_primary: 0 },
      { accIdx: 1, first: 'Dr. Gregory', last: 'House', email: 'ghouse@meridianhealth.org', phone: '+1 (555) 345-2201', title: 'Chief Medical Officer', dept: 'Clinical', is_primary: 1 },
      { accIdx: 2, first: 'Elena', last: 'Torres', email: 'etorres@novarobotics.ai', phone: '+1 (555) 456-3301', title: 'Head of Product', dept: 'Product', is_primary: 1 },
      { accIdx: 3, first: 'Arthur', last: 'Pendleton', email: 'apendleton@stratumcap.com', phone: '+1 (555) 567-4401', title: 'Managing Director', dept: 'Executive', is_primary: 1 },
      { accIdx: 4, first: 'Marcus', last: 'Brody', email: 'mbrody@zenithlogistics.com', phone: '+1 (555) 678-5501', title: 'VP of Global Operations', dept: 'Logistics', is_primary: 1 }
    ];

    const contactIds = [];
    for (const c of contacts) {
      const res = client.run(
        `INSERT INTO contacts (organization_id, account_id, first_name, last_name, email, phone, title, department, is_primary, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orgId, accountIds[c.accIdx], c.first, c.last, c.email, c.phone, c.title, c.dept, c.is_primary, repId]
      );
      contactIds.push(res.lastInsertRowid);
    }

    // 6. Create Leads
    const leads = [
      { first: 'Samantha', last: 'Blake', company: 'Hyperion BioTech', email: 'sblake@hyperionbio.com', phone: '+1 (555) 901-2345', title: 'CTO', status: 'New', source: 'Web', rating: 'Hot' },
      { first: 'Jordan', last: 'Bell', company: 'Apex Fintech Lab', email: 'jordan@apexfin.io', phone: '+1 (555) 912-3456', title: 'Operations Lead', status: 'Contacted', source: 'Referral', rating: 'Warm' },
      { first: 'Maya', last: 'Lin', company: 'Terra Solar Grid', email: 'mlin@terrasolar.com', phone: '+1 (555) 923-4567', title: 'Director of Infrastructure', status: 'Qualified', source: 'Inbound', rating: 'Hot' },
      { first: 'Trevor', last: 'Philips', company: 'Desert Industries', email: 'trevor@desertind.com', phone: '+1 (555) 934-5678', title: 'Purchasing Agent', status: 'Unqualified', source: 'Cold Outreach', rating: 'Cold' },
      { first: 'Olivia', last: 'Wilde', company: 'Quantum Compute Labs', email: 'olivia@quantumlab.tech', phone: '+1 (555) 945-6789', title: 'Research Director', status: 'New', source: 'Event', rating: 'Warm' }
    ];

    for (const l of leads) {
      client.run(
        `INSERT INTO leads (organization_id, first_name, last_name, company, email, phone, title, status, source, rating, assigned_to, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orgId, l.first, l.last, l.company, l.email, l.phone, l.title, l.status, l.source, l.rating, repId, repId]
      );
    }

    // 7. Create Opportunities
    const opps = [
      { accIdx: 0, name: 'Acme Cloud Platform License', stage: 'Proposal / Quote', amount: 85000, prob: 50, date: '2026-11-15', type: 'New Business' },
      { accIdx: 1, name: 'Meridian Hospital EHR Integration', stage: 'Negotiation', amount: 240000, prob: 75, date: '2026-12-01', type: 'New Business' },
      { accIdx: 2, name: 'Nova AI Telemetry Pipeline', stage: 'Qualification', amount: 65000, prob: 25, date: '2026-11-30', type: 'Expansion' },
      { accIdx: 3, name: 'Stratum Wealth Advisory Portal', stage: 'Prospecting', amount: 120000, prob: 10, date: '2027-01-20', type: 'New Business' },
      { accIdx: 4, name: 'Zenith Global Fleet Tracking', stage: 'Closed Won', amount: 350000, prob: 100, date: '2026-10-01', type: 'New Business' },
      { accIdx: 0, name: 'Acme Legacy Module Migration', stage: 'Closed Lost', amount: 30000, prob: 0, date: '2026-09-15', type: 'Renewal' }
    ];

    const oppIds = [];
    for (const o of opps) {
      const stageId = stageMap[o.stage] || stages[0].id;
      const res = client.run(
        `INSERT INTO opportunities (organization_id, account_id, name, stage_id, amount, probability, close_date, type, assigned_to, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orgId, accountIds[o.accIdx], o.name, stageId, o.amount, o.prob, o.date, o.type, repId, repId]
      );
      oppIds.push(res.lastInsertRowid);
    }

    // 8. Create Activities
    const activities = [
      { type: 'Call', subject: 'Initial Discovery Call with VP David Kim', desc: 'Discussed architectural requirements and security compliance needs. David was very receptive.', status: 'Completed', priority: 'High', relType: 'Account', relId: accountIds[0], due: '2026-10-10 14:00:00' },
      { type: 'Task', subject: 'Send revised enterprise pricing quote', desc: 'Prepare PDF with 3-year term discount structure and SLA tiers.', status: 'Pending', priority: 'High', relType: 'Opportunity', relId: oppIds[0], due: '2026-10-18 17:00:00' },
      { type: 'Meeting', subject: 'Executive Demo with Meridian Health Stakeholders', desc: 'Present real-time analytics dashboards and HIPAA compliance guarantees.', status: 'Pending', priority: 'High', relType: 'Opportunity', relId: oppIds[1], due: '2026-10-22 10:00:00' },
      { type: 'Note', subject: 'Key Decision Maker Insights', desc: 'Dr. Gregory House is the technical influencer, but procurement signs off. Emphasize fast onboarding.', status: 'Completed', priority: 'Medium', relType: 'Contact', relId: contactIds[2], due: null },
      { type: 'Call', subject: 'Qualify Terra Solar Grid inbound request', desc: 'Inquired about enterprise multi-user seat licensing.', status: 'Completed', priority: 'Medium', relType: 'Lead', relId: 3, due: '2026-10-12 11:30:00' }
    ];

    for (const a of activities) {
      client.run(
        `INSERT INTO activities (organization_id, activity_type, subject, description, status, priority, due_date, related_to_type, related_to_id, assigned_to, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orgId, a.type, a.subject, a.desc, a.status, a.priority, a.due, a.relType, a.relId, repId, repId]
      );
    }

    console.log(`Seeding complete. Created Org (ID: ${orgId}), 4 Users, 5 Accounts, 6 Contacts, 5 Leads, 6 Opportunities, 5 Activities.`);
    return orgId;
  });
}

// Allow direct execution
if (process.argv[1]?.endsWith('seed.js')) {
  seedDatabase();
}
