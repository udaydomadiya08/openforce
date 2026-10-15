import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseClient } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { createApp } from '../src/app.js';
import http from 'node:http';

describe('Leads Lifecycle & Lead Conversion Engine', () => {
  let db;
  let server;
  let baseUrl;
  let token;
  let leadId;

  before(async () => {
    db = new DatabaseClient(':memory:');
    runMigrations(db);

    const app = createApp(db);
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    // Register organization
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'sales@apex.test',
        password: 'SalesPassword123!',
        first_name: 'Jordan',
        last_name: 'Miller',
        org_name: 'Apex Sales Corp'
      })
    });
    const data = await res.json();
    token = data.token;
  });

  after(() => {
    server.close();
    db.close();
  });

  test('POST /api/leads creates a new unqualified lead', async () => {
    const res = await fetch(`${baseUrl}/api/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        first_name: 'Marcus',
        last_name: 'Vance',
        company: 'Vance Refrigeration',
        email: 'marcus@vanceref.com',
        phone: '+1 (555) 789-0123',
        title: 'President & CEO',
        source: 'Web',
        rating: 'Hot'
      })
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.lead.company, 'Vance Refrigeration');
    assert.equal(body.lead.status, 'New');
    assert.equal(body.lead.is_converted, 0);
    leadId = body.lead.id;
  });

  test('POST /api/leads/:id/convert converts lead into Account, Contact, and Deal atomically', async () => {
    const res = await fetch(`${baseUrl}/api/leads/${leadId}/convert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        create_opportunity: true,
        opportunity_name: 'Vance Refrigeration Commercial HVAC Contract',
        opportunity_amount: 150000
      })
    });

    assert.equal(res.status, 200);
    const body = await res.json();

    // 1. Check Account
    assert.ok(body.account);
    assert.equal(body.account.name, 'Vance Refrigeration');

    // 2. Check Contact
    assert.ok(body.contact);
    assert.equal(body.contact.first_name, 'Marcus');
    assert.equal(body.contact.last_name, 'Vance');
    assert.equal(body.contact.email, 'marcus@vanceref.com');
    assert.equal(body.contact.account_id, body.account.id);

    // 3. Check Opportunity
    assert.ok(body.opportunity);
    assert.equal(body.opportunity.name, 'Vance Refrigeration Commercial HVAC Contract');
    assert.equal(body.opportunity.amount, 150000);
    assert.equal(body.opportunity.account_id, body.account.id);

    // 4. Check Lead status in database
    const leadInDb = db.get('SELECT * FROM leads WHERE id = ?', [leadId]);
    assert.equal(leadInDb.is_converted, 1);
    assert.equal(leadInDb.status, 'Qualified');
    assert.equal(leadInDb.converted_account_id, body.account.id);
    assert.equal(leadInDb.converted_contact_id, body.contact.id);
    assert.equal(leadInDb.converted_opportunity_id, body.opportunity.id);

    // 5. Check Converted lead is excluded from active leads list by default
    const activeLeadsRes = await fetch(`${baseUrl}/api/leads`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const activeLeads = await activeLeadsRes.json();
    const found = activeLeads.leads.some(l => l.id === leadId);
    assert.equal(found, false);
  });

  test('Attempting to re-convert an already converted lead fails', async () => {
    const res = await fetch(`${baseUrl}/api/leads/${leadId}/convert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        create_opportunity: false
      })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /already been converted/i);
  });
});
