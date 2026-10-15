import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseClient } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { createApp } from '../src/app.js';
import http from 'node:http';

describe('Authentication & User Management', () => {
  let db;
  let server;
  let baseUrl;

  before(async () => {
    // In-memory test database
    db = new DatabaseClient(':memory:');
    runMigrations(db);

    const app = createApp(db);
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(() => {
    server.close();
    db.close();
  });

  test('POST /api/auth/register creates new organization, admin user, and pipeline stages', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'founder@quantum.test',
        password: 'Password123!',
        first_name: 'Ada',
        last_name: 'Lovelace',
        org_name: 'Quantum Corp'
      })
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.token);
    assert.equal(body.user.email, 'founder@quantum.test');
    assert.equal(body.user.role, 'Admin');
    assert.equal(body.org.name, 'Quantum Corp');

    // Verify pipeline stages were initialized
    const stages = db.all('SELECT * FROM pipeline_stages WHERE organization_id = ?', [body.org.id]);
    assert.equal(stages.length, 6);
  });

  test('POST /api/auth/login validates credentials correctly', async () => {
    // 1. Success login
    const successRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'founder@quantum.test',
        password: 'Password123!'
      })
    });
    assert.equal(successRes.status, 200);
    const body = await successRes.json();
    assert.ok(body.token);

    // 2. Failed login with wrong password
    const failRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'founder@quantum.test',
        password: 'WrongPassword!'
      })
    });
    assert.equal(failRes.status, 401);
  });

  test('GET /api/auth/me returns authenticated profile', async () => {
    // Login first
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'founder@quantum.test',
        password: 'Password123!'
      })
    });
    const { token } = await loginRes.json();

    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(meRes.status, 200);
    const meBody = await meRes.json();
    assert.equal(meBody.user.email, 'founder@quantum.test');
  });

  test('RBAC: Admin can create users, Standard user cannot', async () => {
    // 1. Admin logs in
    const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'founder@quantum.test', password: 'Password123!' })
    });
    const { token: adminToken } = await adminLogin.json();

    // 2. Admin creates Standard user
    const createRes = await fetch(`${baseUrl}/api/auth/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        email: 'rep@quantum.test',
        password: 'RepPassword123!',
        first_name: 'Bob',
        last_name: 'Smith',
        role: 'Standard'
      })
    });
    assert.equal(createRes.status, 201);

    // 3. Standard user logs in
    const repLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rep@quantum.test', password: 'RepPassword123!' })
    });
    const { token: repToken } = await repLogin.json();

    // 4. Standard user tries to invite another user (should be 403 Forbidden)
    const unauthorizedRes = await fetch(`${baseUrl}/api/auth/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${repToken}`
      },
      body: JSON.stringify({
        email: 'intruder@quantum.test',
        password: 'Password123!',
        first_name: 'Eve',
        last_name: 'Hacker',
        role: 'Admin'
      })
    });
    assert.equal(unauthorizedRes.status, 403);
  });
});
