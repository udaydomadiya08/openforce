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
- **Session Tokens**: JWT (JSON Web Tokens) with HMAC-SHA256 signatures, containing `userId`, `orgId`, and `role`.
- **Production Secret Enforcement**: In production (`NODE_ENV=production`), `JWT_SECRET` MUST be explicitly set via environment variables with a minimum of 32 characters and cannot be a default development key. The server halts startup immediately if missing or insecure.
- **Input Sanitization**: All queries use parameterized prepared statements (`?` parameters), preventing SQL injection vulnerabilities.
- **XSS & Content Security**: Frontend UI applies mandatory HTML entity encoding (`escapeHtml`) on all user-controlled strings and URL protocol sanitization (`sanitizeUrl`) to prevent Stored and Reflected XSS.
- **Demo Seeding Protection**: `AUTO_SEED` defaults to `false` in production. Demo credentials can only be initialized via explicit environment opt-in (`AUTO_SEED=true`).
