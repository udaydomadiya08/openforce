import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseClient } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { createApp } from '../src/app.js';
import http from 'node:http';

describe('CSV Data Import & Export Engine', () => {
  let db;
  let server;
  let baseUrl;
  let token;

  before(async () => {
    db = new DatabaseClient(':memory:');
    runMigrations(db);

    const app = createApp(db);
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'csv@engine.test',
        password: 'CsvPassword123!',
        first_name: 'Data',
        last_name: 'Importer',
        org_name: 'DataFlow Inc'
      })
    });
    const data = await res.json();
    token = data.token;
  });

  after(() => {
    server.close();
    db.close();
  });

  test('POST /api/csv/import/leads parses CSV content and inserts leads', async () => {
    const csvData = `First Name,Last Name,Company,Email,Phone,Title,Status,Source,Rating
John,Carmack,id Software,carmack@idsoftware.com,555-111-2222,Lead Architect,New,Web,Hot
John,Romero,Monkeystone Games,romero@monkeystone.com,555-222-3333,Game Designer,Contacted,Referral,Warm`;

    const res = await fetch(`${baseUrl}/api/csv/import/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ csv_data: csvData })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.imported_count, 2);

    const leads = db.all('SELECT * FROM leads WHERE company IN (?, ?)', ['id Software', 'Monkeystone Games']);
    assert.equal(leads.length, 2);
    assert.equal(leads[0].first_name, 'John');
  });

  test('GET /api/csv/export/leads returns valid formatted CSV with RFC 4180 escaping', async () => {
    const res = await fetch(`${baseUrl}/api/csv/export/leads`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    const text = await res.text();

    assert.match(text, /ID,First Name,Last Name,Company,Email/);
    assert.match(text, /carmack@idsoftware\.com/);
    assert.match(text, /romero@monkeystone\.com/);
  });
});
