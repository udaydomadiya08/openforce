# Testing Strategy & Quality Assurance

## 1. Testing Framework
OpenForce uses Node.js native test runner (`node:test` and `node:assert/strict`), which provides sub-millisecond execution, zero native binary dependencies, and zero RAM bloat.

## 2. Test Tiers
1. **Tier 1: Unit & Domain Logic**
   - Password hashing and token generation/verification.
   - Lead conversion atomic transaction simulation.
   - CSV parser and field mapper validations.
   - Stage probability calculation and weighted revenue forecasting.

2. **Tier 2: API & Integration Tests**
   - Authentication endpoints (`/api/auth/register`, `/api/auth/login`, `/api/auth/me`).
   - CRUD operations for Accounts, Contacts, Leads, Opportunities, and Activities.
   - Lead conversion endpoint (`/api/leads/:id/convert`) verifying linked object generation.
   - Pipeline Kanban endpoint (`/api/opportunities/pipeline`) and stage transitions.
   - CSV export endpoints ensuring valid CSV format generation.

3. **Tier 3: Security & Multi-Tenant Isolation Tests**
   - Cross-tenant data isolation tests: User A from Org 1 attempts to access/mutate Org 2's Account, Lead, Contact, or Deal. Must return 404 or 403.
   - Role-Based Access Control tests: Read-Only user attempts POST/PUT/DELETE. Must return 403 Forbidden.
   - Unauthenticated request rejection.

## 3. Running the Test Suite
```bash
# Run all tests
npm test

# Run specific suite
node --test tests/tenant-isolation.test.js
```
All tests must execute against an ephemeral in-memory or test SQLite database to guarantee clean state and instantaneous feedback.
