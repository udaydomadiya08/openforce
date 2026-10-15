import { Router } from 'express';
import { getDb } from '../../db/index.js';
import { authMiddleware } from '../../middleware/auth.js';
import { requireWriteAccess } from '../../middleware/rbac.js';

const router = Router();
router.use(authMiddleware);

/**
 * Helper to escape CSV values according to RFC 4180
 */
function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Basic CSV parser supporting quotes and commas
 */
function parseCsv(text) {
  const lines = [];
  let currentRow = [];
  let currentField = '';
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n of \r\n
      }
      currentRow.push(currentField.trim());
      if (currentRow.some(col => col.length > 0)) {
        lines.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(col => col.length > 0)) {
      lines.push(currentRow);
    }
  }

  return lines;
}

/**
 * Export data as CSV
 */
router.get('/export/:entity', (req, res) => {
  const { entity } = req.params;
  const db = req.db || getDb();

  let rows = [];
  let headers = [];

  if (entity === 'accounts') {
    headers = ['ID', 'Name', 'Industry', 'Website', 'Phone', 'Annual Revenue', 'Employees', 'Billing City', 'Billing Country', 'Status', 'Created At'];
    const data = db.all('SELECT * FROM accounts WHERE organization_id = ? ORDER BY name ASC', [req.orgId]);
    rows = data.map(d => [
      d.id, d.name, d.industry, d.website, d.phone, d.annual_revenue, d.employees, d.billing_city, d.billing_country, d.status, d.created_at
    ]);
  } else if (entity === 'contacts') {
    headers = ['ID', 'First Name', 'Last Name', 'Email', 'Phone', 'Title', 'Department', 'Account ID', 'Is Primary', 'Created At'];
    const data = db.all('SELECT * FROM contacts WHERE organization_id = ? ORDER BY last_name ASC', [req.orgId]);
    rows = data.map(d => [
      d.id, d.first_name, d.last_name, d.email, d.phone, d.title, d.department, d.account_id, d.is_primary, d.created_at
    ]);
  } else if (entity === 'leads') {
    headers = ['ID', 'First Name', 'Last Name', 'Company', 'Email', 'Phone', 'Title', 'Status', 'Source', 'Rating', 'Is Converted', 'Created At'];
    const data = db.all('SELECT * FROM leads WHERE organization_id = ? ORDER BY created_at DESC', [req.orgId]);
    rows = data.map(d => [
      d.id, d.first_name, d.last_name, d.company, d.email, d.phone, d.title, d.status, d.source, d.rating, d.is_converted, d.created_at
    ]);
  } else if (entity === 'opportunities') {
    headers = ['ID', 'Deal Name', 'Account Name', 'Stage', 'Amount', 'Probability', 'Close Date', 'Type', 'Created At'];
    const data = db.all(
      `SELECT o.*, a.name as account_name, ps.name as stage_name
       FROM opportunities o
       JOIN accounts a ON a.id = o.account_id
       JOIN pipeline_stages ps ON ps.id = o.stage_id
       WHERE o.organization_id = ?
       ORDER BY o.close_date ASC`,
      [req.orgId]
    );
    rows = data.map(d => [
      d.id, d.name, d.account_name, d.stage_name, d.amount, d.probability, d.close_date, d.type, d.created_at
    ]);
  } else {
    return res.status(400).json({ error: 'Unsupported entity for export. Supported: accounts, contacts, leads, opportunities' });
  }

  const csvContent = [
    headers.map(escapeCsv).join(','),
    ...rows.map(row => row.map(escapeCsv).join(','))
  ].join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="openforce_${entity}_${Date.now()}.csv"`);
  res.send(csvContent);
});

/**
 * Import records from CSV text
 */
router.post('/import/:entity', requireWriteAccess, (req, res) => {
  const { entity } = req.params;
  const { csv_data } = req.body;

  if (!csv_data || typeof csv_data !== 'string' || !csv_data.trim()) {
    return res.status(400).json({ error: 'Please provide CSV content in the csv_data field.' });
  }

  const parsed = parseCsv(csv_data.trim());
  if (parsed.length < 2) {
    return res.status(400).json({ error: 'CSV file must contain a header row and at least one data row.' });
  }

  const headers = parsed[0].map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));
  const dataRows = parsed.slice(1);
  const db = req.db || getDb();

  const errors = [];
  let importedCount = 0;

  try {
    db.transaction(() => {
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const rowNum = i + 2;
        const rowObj = {};
        headers.forEach((h, idx) => {
          rowObj[h] = row[idx] || '';
        });

        if (entity === 'leads') {
          const firstName = rowObj['firstname'] || rowObj['first_name'] || rowObj['first'] || '';
          const lastName = rowObj['lastname'] || rowObj['last_name'] || rowObj['last'] || '';
          const company = rowObj['company'] || rowObj['companyname'] || rowObj['organization'] || '';
          const email = rowObj['email'] || rowObj['emailaddress'] || '';
          const phone = rowObj['phone'] || rowObj['phonenumber'] || '';
          const title = rowObj['title'] || rowObj['jobtitle'] || '';
          const status = rowObj['status'] || 'New';
          const source = rowObj['source'] || 'Web';
          const rating = rowObj['rating'] || 'Warm';

          if (!firstName || !lastName || !company) {
            errors.push(`Row ${rowNum}: missing required first_name, last_name, or company`);
            continue;
          }

          db.run(
            `INSERT INTO leads (organization_id, first_name, last_name, company, email, phone, title, status, source, rating, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.orgId, firstName, lastName, company, email || null, phone || null, title || null, status, source, rating, req.user.id]
          );
          importedCount++;
        } else if (entity === 'contacts') {
          const firstName = rowObj['firstname'] || rowObj['first_name'] || '';
          const lastName = rowObj['lastname'] || rowObj['last_name'] || '';
          const email = rowObj['email'] || '';
          const phone = rowObj['phone'] || '';
          const title = rowObj['title'] || '';
          const dept = rowObj['department'] || '';

          if (!firstName || !lastName) {
            errors.push(`Row ${rowNum}: missing required first_name or last_name`);
            continue;
          }

          db.run(
            `INSERT INTO contacts (organization_id, first_name, last_name, email, phone, title, department, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.orgId, firstName, lastName, email || null, phone || null, title || null, dept || null, req.user.id]
          );
          importedCount++;
        } else if (entity === 'accounts') {
          const name = rowObj['name'] || rowObj['company'] || rowObj['accountname'] || '';
          const industry = rowObj['industry'] || '';
          const website = rowObj['website'] || '';
          const phone = rowObj['phone'] || '';
          const revenue = Number(rowObj['annualrevenue'] || rowObj['annual_revenue'] || rowObj['revenue']) || 0;
          const employees = parseInt(rowObj['employees'] || '0', 10) || 0;
          const city = rowObj['billingcity'] || rowObj['city'] || '';
          const country = rowObj['billingcountry'] || rowObj['country'] || '';

          if (!name) {
            errors.push(`Row ${rowNum}: missing required company/account name`);
            continue;
          }

          db.run(
            `INSERT INTO accounts (organization_id, name, industry, website, phone, annual_revenue, employees, billing_city, billing_country, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.orgId, name, industry || null, website || null, phone || null, revenue, employees, city || null, country || null, req.user.id]
          );
          importedCount++;
        } else {
          throw new Error('Unsupported import entity');
        }
      }
    });

    res.json({
      message: `Imported ${importedCount} records successfully.`,
      imported_count: importedCount,
      errors: errors.slice(0, 20),
      total_rows: dataRows.length
    });
  } catch (err) {
    res.status(500).json({ error: 'Import failed: ' + err.message });
  }
});

export default router;
