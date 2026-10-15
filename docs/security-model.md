# Security & RBAC Model

## 1. Multi-Tenant Isolation
Tenant isolation is non-negotiable in OpenForce:
- Every relational query MUST explicitly filter by `organization_id = ?`.
- Tenant context is established strictly from authenticated cryptographically-signed JWT session claims (`req.user.organization_id`), never from client query parameters or request body values.
- Automatic query scoping middleware verifies that any resource requested by ID (`/api/accounts/:id`) belongs to the requesting user's organization. Access attempts across tenants yield `404 Not Found` or `403 Forbidden`.

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
- **Password Hashing**: Passwords are saved using standard cryptographic hashing (SHA-256 with cryptographically generated salt / bcrypt compatible).
- **Session Tokens**: JWT (JSON Web Tokens) with HMAC-SHA256 signatures, containing `userId`, `orgId`, and `role`, with configurable expiration.
- **Input Sanitization**: All queries use parameterized prepared statements (`?` parameters), preventing SQL injection vulnerabilities.
- **XSS & Content Security**: Strict JSON API responses, sanitized DOM rendering, HTML entity encoding for dynamic content.
- **CORS & Rate Limiting**: Local and configurable CORS headers, basic rate limiting on authentication endpoints to prevent brute force attacks.
