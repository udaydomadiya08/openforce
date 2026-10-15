import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TEST_CONTAINER_NAME = 'openforce_persist_smoke_test';
const TEST_VOLUME_NAME = 'openforce_persist_test_volume';
const TEST_BACKUP_PATH = path.resolve('/tmp', 'openforce_test_backup.db');
const TEST_RESTORED_PATH = path.resolve('/tmp', 'openforce_test_restored.db');
const TEST_PORT = 3005;
const STRONG_SECRET = 'a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e';

async function req(url, options = {}) {
  const headers = { ...(options.headers || {}), Connection: 'close' };
  return fetch(url, { ...options, headers });
}

describe('Docker & SQLite Data Persistence & Reliability', () => {
  before(() => {
    try { execSync(`docker rm -f ${TEST_CONTAINER_NAME}`, { stdio: 'ignore' }); } catch {}
    try { execSync(`docker volume rm ${TEST_VOLUME_NAME}`, { stdio: 'ignore' }); } catch {}
    if (fs.existsSync(TEST_BACKUP_PATH)) fs.unlinkSync(TEST_BACKUP_PATH);
    if (fs.existsSync(TEST_RESTORED_PATH)) fs.unlinkSync(TEST_RESTORED_PATH);

    execSync(`docker volume create ${TEST_VOLUME_NAME}`, { stdio: 'ignore' });
  });

  after(() => {
    try { execSync(`docker rm -f ${TEST_CONTAINER_NAME}`, { stdio: 'ignore' }); } catch {}
    try { execSync(`docker volume rm ${TEST_VOLUME_NAME}`, { stdio: 'ignore' }); } catch {}
    if (fs.existsSync(TEST_BACKUP_PATH)) fs.unlinkSync(TEST_BACKUP_PATH);
    if (fs.existsSync(TEST_RESTORED_PATH)) fs.unlinkSync(TEST_RESTORED_PATH);
  });

  test('Docker container starts with production configuration and persistent named volume', () => {
    const runCmd = [
      'docker run -d',
      `--name ${TEST_CONTAINER_NAME}`,
      `-p ${TEST_PORT}:3000`,
      `-e NODE_ENV=production`,
      `-e JWT_SECRET=${STRONG_SECRET}`,
      `-e DATABASE_PATH=/app/data/openforce.db`,
      `-v ${TEST_VOLUME_NAME}:/app/data`,
      'openforce:test'
    ].join(' ');

    execSync(runCmd, { stdio: 'ignore' });

    // Wait for container to be ready
    let isReady = false;
    for (let i = 0; i < 15; i++) {
      try {
        const out = execSync(`curl -s http://127.0.0.1:${TEST_PORT}/health`, { encoding: 'utf8' });
        if (out.includes('healthy')) {
          isReady = true;
          break;
        }
      } catch {}
      execSync('sleep 1');
    }

    assert.equal(isReady, true, 'Container should become healthy on port ' + TEST_PORT);
  });

  test('Demo seeding remains disabled by default in production container', async () => {
    // Attempt demo admin login -> must fail 401
    const res = await req(`http://127.0.0.1:${TEST_PORT}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@openforce.local', password: 'AdminPass123!' })
    });
    assert.equal(res.status, 401, 'Demo credentials must not exist in fresh production container');
  });

  let userToken;

  test('Creates user account and CRM records inside running container', async () => {
    // Register
    const regRes = await req(`http://127.0.0.1:${TEST_PORT}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'ops@persist-corp.org',
        password: 'PersistentPassword2026!',
        first_name: 'Marcus',
        last_name: 'Vance',
        org_name: 'Vance Persistent Systems'
      })
    });
    assert.equal(regRes.status, 201);
    const regData = await regRes.json();
    userToken = regData.token;

    // Create an account
    const accRes = await req(`http://127.0.0.1:${TEST_PORT}/api/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({
        name: 'Dunder Mifflin Paper Co',
        industry: 'Paper & Distribution',
        annual_revenue: 12500000
      })
    });
    assert.equal(accRes.status, 201);
    const accData = await accRes.json();
    assert.equal(accData.account.name, 'Dunder Mifflin Paper Co');
  });

  test('Data survives full container stop, removal, and recreation with same volume', async () => {
    // Stop and remove the container
    execSync(`docker stop ${TEST_CONTAINER_NAME}`, { stdio: 'ignore' });
    execSync(`docker rm ${TEST_CONTAINER_NAME}`, { stdio: 'ignore' });

    // Start a brand new container mounting the EXACT same named volume
    const newRunCmd = [
      'docker run -d',
      `--name ${TEST_CONTAINER_NAME}`,
      `-p ${TEST_PORT}:3000`,
      `-e NODE_ENV=production`,
      `-e JWT_SECRET=${STRONG_SECRET}`,
      `-e DATABASE_PATH=/app/data/openforce.db`,
      `-v ${TEST_VOLUME_NAME}:/app/data`,
      'openforce:test'
    ].join(' ');

    execSync(newRunCmd, { stdio: 'ignore' });

    // Wait for health
    let isReady = false;
    for (let i = 0; i < 15; i++) {
      try {
        const out = execSync(`curl -s http://127.0.0.1:${TEST_PORT}/health`, { encoding: 'utf8' });
        if (out.includes('healthy')) {
          isReady = true;
          break;
        }
      } catch {}
      execSync('sleep 1');
    }
    assert.equal(isReady, true);
    execSync('sleep 1');

    // Verify existing user can log in
    const loginRes = await req(`http://127.0.0.1:${TEST_PORT}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'ops@persist-corp.org',
        password: 'PersistentPassword2026!'
      })
    });
    assert.equal(loginRes.status, 200, 'User created before container restart must authenticate successfully');
    const loginData = await loginRes.json();

    // Verify account record persisted
    const accListRes = await req(`http://127.0.0.1:${TEST_PORT}/api/accounts`, {
      headers: { Authorization: `Bearer ${loginData.token}` }
    });
    assert.equal(accListRes.status, 200);
    const accListData = await accListRes.json();
    const found = accListData.accounts.some(a => a.name === 'Dunder Mifflin Paper Co');
    assert.equal(found, true, 'Account created before restart must still exist');
  });

  test('SQLite backup creation via docker cp and restoration verification', () => {
    // 1. Snapshot database from container
    execSync(`docker cp ${TEST_CONTAINER_NAME}:/app/data/openforce.db ${TEST_BACKUP_PATH}`, { stdio: 'ignore' });
    assert.ok(fs.existsSync(TEST_BACKUP_PATH));
    const backupStat = fs.statSync(TEST_BACKUP_PATH);
    assert.ok(backupStat.size > 0, 'Backup file must contain data');

    // 2. Restore to a new location and verify data integrity
    fs.copyFileSync(TEST_BACKUP_PATH, TEST_RESTORED_PATH);
    assert.ok(fs.existsSync(TEST_RESTORED_PATH));

    const checkScript = `
      import { DatabaseClient } from './src/db/index.js';
      const db = new DatabaseClient('${TEST_RESTORED_PATH}');
      const accounts = db.all('SELECT name FROM accounts');
      if (!accounts.some(a => a.name === 'Dunder Mifflin Paper Co')) {
        throw new Error('Restored database missing account');
      }
      db.close();
    `;

    execSync(`node -e "${checkScript.replace(/\n/g, ' ')}"`, { stdio: 'inherit' });
  });
});
