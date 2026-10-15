import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { DatabaseClient } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { createApp } from '../src/app.js';
import { resetRateLimiter } from '../src/middleware/rate-limiter.js';
import { generateToken } from '../src/utils/crypto.js';
import { cleanupRevokedTokens } from '../src/utils/token-revocation.js';

describe('Security Hardening — Release Phase 1 Regression Suite', () => {
  let db;
  let server;
  let baseUrl;
  let testUserToken;
  let otherUserToken;

  before(async () => {
    db = new DatabaseClient(':memory:');
    runMigrations(db);

    const app = createApp(db);
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    resetRateLimiter();

    // Register User 1
    const res1 = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'hardened1@test.org',
        password: 'Password123!',
        first_name: 'Security',
        last_name: 'Officer',
        org_name: 'SecOps Corp'
      })
    });
    const data1 = await res1.json();
    testUserToken = data1.token;

    // Register User 2
    const res2 = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'hardened2@test.org',
        password: 'Password123!',
        first_name: 'Audit',
        last_name: 'Officer',
        org_name: 'Audit Corp'
      })
    });
    const data2 = await res2.json();
    otherUserToken = data2.token;
  });

  after(() => {
    server.close();
    db.close();
    resetRateLimiter();
  });

  // =========================================================================
  // 1. HTTP Security Headers
  // =========================================================================
  describe('HTTP Security Headers', () => {
    test('Responses include X-Content-Type-Options: nosniff', async () => {
      const res = await fetch(`${baseUrl}/health`);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    });

    test('Responses include clickjacking protection (X-Frame-Options: DENY)', async () => {
      const res = await fetch(`${baseUrl}/health`);
      assert.equal(res.headers.get('x-frame-options'), 'DENY');
    });

    test('Responses include Content-Security-Policy with required directives', async () => {
      const res = await fetch(`${baseUrl}/health`);
      const csp = res.headers.get('content-security-policy') || '';
      assert.ok(csp.includes("default-src 'self'"), 'CSP must define default-src self');
      assert.ok(csp.includes("frame-ancestors 'none'"), 'CSP must block frame embedding');
      assert.ok(csp.includes("base-uri 'self'"), 'CSP must define base-uri self');
      assert.ok(csp.includes("form-action 'self'"), 'CSP must define form-action self');
    });

    test('Responses include Referrer-Policy and Permissions-Policy', async () => {
      const res = await fetch(`${baseUrl}/health`);
      assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
      assert.ok(res.headers.get('permissions-policy')?.includes('geolocation=()'));
    });

    test('X-Powered-By header is disabled', async () => {
      const res = await fetch(`${baseUrl}/health`);
      assert.equal(res.headers.get('x-powered-by'), null);
    });
  });

  // =========================================================================
  // 2. Authentication Rate Limiting & IP Spoofing Prevention
  // =========================================================================
  describe('Authentication Rate Limiting & Spoofing Resistance', () => {
    test('Rate limiter blocks rapid repeated authentication attempts and sets Retry-After', async () => {
      resetRateLimiter();
      const testEnvMax = 5;
      process.env.RATE_LIMIT_AUTH_MAX = String(testEnvMax);

      let wasBlocked = false;
      let blockedRes;

      for (let i = 0; i < testEnvMax + 3; i++) {
        const res = await fetch(`${baseUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'nobody@nowhere.com', password: 'badpassword' })
        });

        if (res.status === 429) {
          wasBlocked = true;
          blockedRes = res;
          break;
        }
      }

      assert.equal(wasBlocked, true, 'Rapid login attempts must be throttled with HTTP 429');
      assert.ok(blockedRes.headers.get('retry-after'), 'Must include Retry-After header');
      const body = await blockedRes.json();
      assert.match(body.error, /Too many authentication attempts/i);

      delete process.env.RATE_LIMIT_AUTH_MAX;
      resetRateLimiter();
    });

    test('Does not trust spoofed X-Forwarded-For headers when TRUST_PROXY is disabled', async () => {
      resetRateLimiter();
      const testEnvMax = 3;
      process.env.RATE_LIMIT_AUTH_MAX = String(testEnvMax);
      delete process.env.TRUST_PROXY;

      let wasBlocked = false;

      // An attacker attempts to rotate X-Forwarded-For on every request
      for (let i = 0; i < testEnvMax + 2; i++) {
        const fakeIp = `198.51.100.${i + 1}`;
        const res = await fetch(`${baseUrl}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': fakeIp
          },
          body: JSON.stringify({ email: 'nobody@nowhere.com', password: 'badpassword' })
        });

        if (res.status === 429) {
          wasBlocked = true;
          break;
        }
      }

      assert.equal(
        wasBlocked,
        true,
        'Spoofed X-Forwarded-For headers must be ignored when TRUST_PROXY is not enabled'
      );

      delete process.env.RATE_LIMIT_AUTH_MAX;
      resetRateLimiter();
    });
  });

  // =========================================================================
  // 3. JWT Expiry, Verification & Logout Revocation
  // =========================================================================
  describe('JWT Verification & Logout Revocation', () => {
    test('Token is valid and authenticated before logout', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${testUserToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.user.email, 'hardened1@test.org');
    });

    test('POST /api/auth/logout revokes session token immediately', async () => {
      const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${testUserToken}` }
      });
      assert.equal(logoutRes.status, 200);
      const logoutBody = await logoutRes.json();
      assert.match(logoutBody.message, /Logged out successfully/i);

      // Subsequent access with revoked token is rejected with 401
      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${testUserToken}` }
      });
      assert.equal(meRes.status, 401);
      const meBody = await meRes.json();
      assert.match(meBody.error, /revoked/i);
    });

    test('Revoking one user token does not impact other active user tokens', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${otherUserToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.user.email, 'hardened2@test.org');
    });

    test('Expired tokens are rejected', async () => {
      // Create a token expired 10 seconds ago
      const expiredToken = generateToken({ userId: 1, organizationId: 1, role: 'Admin' }, -10);
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${expiredToken}` }
      });
      assert.equal(res.status, 401);
    });

    test('cleanupRevokedTokens purges expired records while preserving active revocations', () => {
      const now = Math.floor(Date.now() / 1000);
      db.run('INSERT OR REPLACE INTO revoked_tokens (token_hash, expires_at) VALUES (?, ?)', ['hash_active', now + 3600]);
      db.run('INSERT OR REPLACE INTO revoked_tokens (token_hash, expires_at) VALUES (?, ?)', ['hash_expired', now - 3600]);

      cleanupRevokedTokens(db);

      const activeFound = db.get('SELECT 1 FROM revoked_tokens WHERE token_hash = ?', ['hash_active']);
      const expiredFound = db.get('SELECT 1 FROM revoked_tokens WHERE token_hash = ?', ['hash_expired']);
      assert.ok(activeFound, 'Active revoked token must be preserved');
      assert.equal(expiredFound, null, 'Expired revoked token must be purged');
    });
  });

  // =========================================================================
  // 4. Production Error Handling & Tenant Isolation
  // =========================================================================
  describe('Production Error Masking & Configuration', () => {
    test('Production mode masks internal error messages on 500 status', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const prodApp = createApp(db, (app) => {
        app.get('/test-error', (req, res, next) => {
          next(new Error('Sensitive database column connection leak: SELECT secret_key FROM db'));
        });
      });

      const prodServer = http.createServer(prodApp);
      await new Promise(resolve => prodServer.listen(0, resolve));
      const testPort = prodServer.address().port;

      const res = await fetch(`http://127.0.0.1:${testPort}/test-error`);
      assert.equal(res.status, 500);
      const body = await res.json();
      assert.equal(body.error, 'Internal Server Error');
      assert.equal(JSON.stringify(body).includes('secret_key'), false);

      prodServer.close();
      process.env.NODE_ENV = originalEnv;
    });
  });
});
