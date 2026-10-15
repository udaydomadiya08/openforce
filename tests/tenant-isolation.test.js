import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseClient } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { createApp } from '../src/app.js';
import http from 'node:http';

describe('Multi-Tenant Data Isolation & Security Boundaries', () => {
  let db;
  let server;
  let baseUrl;
  let org1Token;
  let org2Token;
  let org1AccountId;

  before(async () => {
    db = new DatabaseClient(':memory:');
    runMigrations(db);

    const app = createApp(db);
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    // Register Org 1
    const res1 = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@alpha.org',
        password: 'AlphaPassword123!',
        first_name: 'Alpha',
        last_name: 'Lead',
        org_name: 'Alpha Corporation'
      })
    });
    const data1 = await res1.json();
    org1Token = data1.token;

    // Register Org 2
    const res2 = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@beta.org',
        password: 'BetaPassword123!',
        first_name: 'Beta',
        last_name: 'Lead',
        org_name: 'Beta Technologies'
      })
    });
    const data2 = await res2.json();
    org2Token = data2.token;

    // Create an account inside Org 1
    const accRes = await fetch(`${baseUrl}/api/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${org1Token}`
      },
      body: JSON.stringify({
        name: 'Alpha Secret Client Inc',
        industry: 'Defense & Aerospace',
        annual_revenue: 5000000
      })
    });
    const accData = await accRes.json();
    org1AccountId = accData.account.id;
  });

  after(() => {
    server.close();
    db.close();
  });

  test('Org 2 cannot view Org 1 account by ID (returns 404)', async () => {
    const res = await fetch(`${baseUrl}/api/accounts/${org1AccountId}`, {
      headers: { Authorization: `Bearer ${org2Token}` }
    });
    assert.equal(res.status, 404);
  });

  test('Org 2 accounts list does not leak Org 1 accounts', async () => {
    const res = await fetch(`${baseUrl}/api/accounts`, {
      headers: { Authorization: `Bearer ${org2Token}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const found = body.accounts.some(a => a.id === org1AccountId || a.name.includes('Alpha Secret Client'));
    assert.equal(found, false);
  });

  test('Org 2 cannot modify or update Org 1 account', async () => {
    const res = await fetch(`${baseUrl}/api/accounts/${org1AccountId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${org2Token}`
      },
      body: JSON.stringify({ name: 'Hacked by Org 2' })
    });
    assert.equal(res.status, 404);

    // Verify account name in Org 1 remains untouched
    const verifyRes = await fetch(`${baseUrl}/api/accounts/${org1AccountId}`, {
      headers: { Authorization: `Bearer ${org1Token}` }
    });
    const verifyData = await verifyRes.json();
    assert.equal(verifyData.account.name, 'Alpha Secret Client Inc');
  });

  test('Org 2 cannot delete Org 1 account', async () => {
    const res = await fetch(`${baseUrl}/api/accounts/${org1AccountId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${org2Token}` }
    });
    assert.equal(res.status, 404);

    // Verify account still exists for Org 1
    const verifyRes = await fetch(`${baseUrl}/api/accounts/${org1AccountId}`, {
      headers: { Authorization: `Bearer ${org1Token}` }
    });
    assert.equal(verifyRes.status, 200);
  });

  test('Unauthenticated requests are strictly rejected with 401', async () => {
    const endpoints = [
      '/api/accounts',
      '/api/contacts',
      '/api/leads',
      '/api/opportunities',
      '/api/opportunities/pipeline',
      '/api/reports/dashboard',
      '/api/org'
    ];

    for (const ep of endpoints) {
      const res = await fetch(`${baseUrl}${ep}`);
      assert.equal(res.status, 401, `Endpoint ${ep} should reject unauthenticated request`);
    }
  });
});
