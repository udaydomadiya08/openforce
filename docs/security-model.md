# Security & RBAC Model

## 1. Multi-Tenant Isolation
Tenant isolation is non-negotiable in OpenForce:
- Every relational query MUST explicitly filter by `organization_id = ?`.
- Tenant context is established strictly from authenticated cryptographically-signed JWT session claims (`req.user.organization_id`), never from client query parameters or request body values.
- Automatic query scoping middleware verifies that any resource requested by ID (`/api/accounts/:id`) belongs to the requesting user's organization. Access attempts across tenants yield `404 Not Found` or `403 Forbidden`.
- Relationship validation: compound workflows (such as Lead conversion, Contact creation, Opportunity stage movement) strictly validate foreign key references against the authenticated tenant's `organization_id` before committing database writes.

## 2. Role-Based Access Control (RBAC) Matrix

| Permission Area | Admin | Manager | Standard User | Read-Only |
| :--- | :---: | :---: | :---: | :---: |
| **Manage Users & Org Settings** | ✅ Full | ❌ No | ❌ No | ❌ No |
| **Configure Pipeline Stages** | ✅ Full | ❌ No | ❌ No | ❌ No |
| **Export Data (CSV)** | ✅ Full | ✅ Full | ✅ Full | ❌ No |
| **Import Data (CSV)** | ✅ Full | ✅ Full | ✅ Full | ❌ No |
| **Create/Edit Accounts & Contacts** | ✅ Full | ✅ Full | ✅ Full | ❌ No |
| **Delete Accounts & Contacts** | ✅ Full | ✅ Full | ❌ No (Soft) | ❌ No |
| **Convert Leads** | ✅ Full | ✅ Full | ✅ Full | ❌ No |
| **Update Opportunity Stages** | ✅ Full | ✅ Full | ✅ Full | ❌ No |
| **Log Activities & Notes** | ✅ Full | ✅ Full | ✅ Full | ❌ No |
| **View Dashboards & Reports** | ✅ Full | ✅ Full | ✅ Full | ✅ View Only |

## 3. Cryptography & Authentication
- **Password Hashing**: Passwords are saved using standard cryptographic hashing (scrypt with cryptographically generated 16-byte random salt and constant-time verification).
- **Session Tokens**: JWT (JSON Web Tokens) with HMAC-SHA256 signatures, containing `userId`, `orgId`, and `role`. Lifetime is configurable via `JWT_EXPIRES_IN_SECONDS` (default: 7 days).
- **Production Secret Enforcement**: In production (`NODE_ENV=production`), `JWT_SECRET` MUST be explicitly set via environment variables with a minimum of 32 characters and cannot be a default development key. The server halts startup immediately if missing or insecure.
- **Input Sanitization**: All queries use parameterized prepared statements (`?` parameters), preventing SQL injection vulnerabilities.
- **XSS & Content Security**: Frontend UI applies mandatory HTML entity encoding (`escapeHtml`) on all user-controlled strings and URL protocol sanitization (`sanitizeUrl`) to prevent Stored and Reflected XSS.
- **Demo Seeding Protection**: `AUTO_SEED` defaults to `false` in production. Demo credentials can only be initialized via explicit environment opt-in (`AUTO_SEED=true`).

## 4. HTTP Security Headers
All HTTP responses carry defensive security headers configured via `src/middleware/security-headers.js`:
- `X-Content-Type-Options: nosniff` — Prevents browsers from MIME-sniffing away from declared content types.
- `X-Frame-Options: DENY` — Prevents clickjacking by prohibiting framing in iframes.
- `Referrer-Policy: strict-origin-when-cross-origin` — Protects internal URI paths from leaking on outbound requests.
- `Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=()` — Restricts unauthorized browser hardware APIs.
- `Content-Security-Policy` — Enforces script and asset boundaries compatible with the SPA architecture (`default-src 'self'`).
- `X-Powered-By` header is explicitly disabled to avoid leaking server runtime information.

## 5. Rate Limiting & Proxy Spoofing Defense
- **Authentication Limiting**: Strict sliding-window rate limiting on `/api/auth/login` and `/api/auth/register` (configurable via `RATE_LIMIT_AUTH_MAX`, default 10 requests per 15 minutes). Exceeded thresholds return `429 Too Many Requests` with a standard `Retry-After` header.
- **General API Limiting**: `/api/*` routes are protected with general rate limiting (default 100 requests per 15 minutes).
- **IP Spoofing Protection**: Client IP extraction respects `TRUST_PROXY`. When `TRUST_PROXY=false` (default), the remote socket address is used directly, preventing attackers from bypassing rate limits by spoofing `X-Forwarded-For` or `Client-IP` headers.

## 6. Token Revocation & Logout
- **Revocation Table**: Calling `POST /api/auth/logout` revokes the bearer token immediately by computing a cryptographic SHA-256 digest of the token and inserting it into a lightweight SQLite `revoked_tokens` table along with its expiry.
- **Authentication Check**: Every protected request checks `isTokenRevoked(token)` before permitting access. Revoked tokens are immediately rejected with `401 Unauthorized`.
- **Pruning**: Expired token digests are automatically purged on write operations to ensure zero storage bloat.
- **Known Limitation**: In single-instance deployments, SQLite-backed revocation provides instant invalidation. In multi-instance or horizontal cluster environments without shared storage, a centralized store (e.g. Redis) is required for cross-node token revocation.

## 7. Production Error Masking
In `NODE_ENV=production`, internal 500 server errors are masked to return `{ "error": "Internal Server Error" }`, ensuring stack traces, database schema details, and filesystem paths are never leaked to external clients. Detailed errors remain logged only to server stdout.
