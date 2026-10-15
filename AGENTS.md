# Agent Operating Instructions — OpenForce

## Mission & Principles
OpenForce is an open-source, self-hostable CRM inspired by core Salesforce business workflows.
Engineered for fast, reliable, low-overhead operation on resource-constrained systems (e.g., MacBook Air 8GB RAM).

### Anti-Loop & Bounded Execution Policy
1. **Zero-Loop Verification**: Once a technical decision or research step is finished, proceed immediately to implementation. Do not reopen settled decisions without a verified runtime blocker.
2. **Defect Repair Limit**: Max TWO repair attempts per isolated defect. If unresolved, implement a resilient fallback, record the issue, and continue.
3. **Evidence-Based Done**: No feature is "done" without running test execution or verified UI interaction.
4. **Scope Control**: Strictly adhere to the Phase boundaries. Do not implement Phase 5/backlog items during Phases 1–4.
5. **Multi-Tenant Boundary**: Every data access operation must be scoped to the authenticated user's `organization_id`.
6. **No Paid Services**: Strictly $0 budget. Use local engines, native libraries, and open-source packages.

### Tech Stack Standards
- **Runtime**: Node.js (v20+ / v22 LTS)
- **Architecture**: Modular Monolith
- **Database**: SQLite (Node built-in `node:sqlite` / SQLite3) for zero-daemon local dev + PostgreSQL adapter for Docker production
- **Security**: Argon2/Bcrypt password hashing, JWT/Signed bearer tokens, parameterized SQL queries, RBAC enforcement
- **Frontend**: Vanilla Modern Responsive SPA with custom CSS design system (CSS variables, glassmorphic accents, responsive grid, dynamic state)
- **Testing**: Built-in test runner (`node:test`, `node:assert`) with automated API & tenant isolation suites
