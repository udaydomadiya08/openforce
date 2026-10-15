# OpenForce ⚡

> A fast, free, self-hostable, open-source CRM inspired by the essential business workflows of Salesforce.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Runtime](https://img.shields.io/badge/Node.js-22%2B-green.svg)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](docker-compose.yml)
[![Architecture](https://img.shields.io/badge/Architecture-Modular%20Monolith-orange.svg)](#architecture)

---

## Overview

OpenForce provides small businesses, sales teams, and developers with a lightweight, dependable CRM without vendor lock-in, per-seat fees, or heavyweight infrastructure requirements. It runs smoothly on a modest laptop (e.g. MacBook Air 8GB RAM) as well as inside containerized production environments.

### Core Highlights
- 🏢 **Multi-Tenant Organization Model** — Secure workspace isolation, workspace profiles, custom currencies.
- 🔐 **Role-Based Access Control (RBAC)** — Granular roles: `Admin`, `Manager`, `Standard`, and `Read-Only`.
- 👥 **Companies & Accounts** — Complete 360° company profiles with linked contacts, opportunities, and timeline.
- 📇 **Contacts** — Rich contact directory, direct account association, activity history.
- 🎯 **Leads & 1-Click Conversion** — Structured qualification lifecycle with seamless 1-click conversion into Account + Contact + Opportunity.
- 📊 **Opportunity Pipeline & Kanban** — Visual sales board with customizable stages, deal values, probabilities, and real-time column totals.
- 📝 **Activities & Timeline** — Log calls, tasks, meetings, and notes with priority and due date tracking.
- 🔍 **Universal Search & Filters** — Global cross-entity search bar and instant tabular filtering.
- 📥 **CSV Import & Export** — Zero-friction migration of Leads, Contacts, and Accounts with intelligent column mapping.
- 📈 **Executive Dashboard & Reports** — Real-time metrics: pipeline value, win rate, stage breakdowns, lead velocity.
- 🐳 **Docker & Local Ready** — Instant local setup via zero-dependency SQLite and production setup via Docker Compose (PostgreSQL).

---

## Quickstart

### Prerequisites
- **Local Dev**: Node.js 20+ (Node 22 LTS recommended), Git, modern Chromium-based browser (Google Chrome or Chromium) for browser tests.
- **Production**: Docker Engine 24+ and Docker Compose v2.

---

### 1. Local Development (Instant SQLite Mode)
OpenForce uses embedded SQLite with zero external database daemons:

```bash
# Clone the repository
git clone https://github.com/your-org/openforce.git
cd openforce

# Install dependencies
npm install

# Run database migration & seed initial demo data
npm run db:migrate
npm run db:seed

# Start the application server
npm run start
```
Visit **http://localhost:3000** in your browser.

#### Demo Credentials (Development Only)
- **Admin**: `admin@openforce.local` / `AdminPass123!`
- **Sales Rep**: `sarah@openforce.local` / `SarahPass123!`

---

### 2. Production Docker Deployment (Persistent Storage)
In production, demo accounts are disabled by default (`AUTO_SEED=false`), and a strong 32+ character JWT secret is strictly required.

```bash
# 1. Create your production environment file
cp .env.example .env

# 2. Generate and set a cryptographically secure 256-bit JWT secret
JWT_SECRET=$(openssl rand -hex 32)
sed -i "s|change_this_to_a_secure_random_string_in_production_32chars|$JWT_SECRET|g" .env

# 3. Launch container with persistent named volume
docker compose up -d --build
```
Access OpenForce at **http://localhost:3000**.

#### Secure First-Administrator Provisioning
Because demo accounts are disabled in production, navigate to `http://localhost:3000` or send a registration request to initialize the initial administrator:
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@yourcompany.com",
    "password": "YourStrongPasswordHere123!",
    "first_name": "Primary",
    "last_name": "Admin",
    "org_name": "Your Organization"
  }'
```
The first registrant in an organization receives the `Admin` role automatically.

> [!IMPORTANT]
> **Private Beta**: OpenForce is currently in **Controlled Private Beta**. It has undergone internal automated testing, multi-tenant boundary checks, and browser E2E verification, but has **not** undergone a formal external third-party security audit. It is intended for private evaluation, testing, and staging environments.

---

### 3. Backup and Restoration

#### Backup
Flush SQLite WAL pages and create a consistent snapshot from the running container:
```bash
# Checkpoint WAL
docker compose exec openforce node -e "import { getDb } from './src/db/index.js'; getDb().checkpoint();"

# Snapshot database
docker cp openforce_crm:/app/data/openforce.db ./backup_$(date +%Y%m%d).db
```

#### Restoration
```bash
docker compose stop openforce
docker cp ./backup_20261015.db openforce_crm:/app/data/openforce.db
docker compose run --rm --entrypoint rm openforce -f /app/data/openforce.db-wal /app/data/openforce.db-shm
docker compose start openforce
```

---

### 4. Running Automated & Browser Tests

OpenForce features a built-in test runner requiring zero third-party runners:

```bash
# Run the complete test suite (Unit, Integration, Security, Browser E2E, Docker Persistence)
npm test

# Run individual test suites
node --test tests/security-hardening.test.js
node --test tests/browser-e2e.test.js
node --test tests/docker-storage.test.js
```

---

## Architecture & Release Maturity

OpenForce is an early-stage, self-hostable CRM designed for fast, low-overhead operation on resource-constrained systems.

### Known Limitations
- **Private Beta Status**: Software is under active development. No compliance certifications (SOC2, HIPAA, ISO) are held, and no formal external security audit has been performed.
- **Single-Writer Concurrency**: Embedded SQLite handles high read throughput with WAL mode, but serializes write transactions (`busy_timeout = 5000ms`). Recommended for teams up to ~50 concurrent active users.
- **Single-Host Storage (No Multi-Node Clustering)**: SQLite binds to a single persistent volume. Running multi-container clusters behind a load balancer is unsupported without an external database adapter.
- **Stateless Token Revocation**: Logout revocation is persisted in the local SQLite `revoked_tokens` table. In multi-server deployments without shared storage, a centralized store (e.g. Redis) is required.
- **Reverse Proxy Headers**: Ensure `TRUST_PROXY=true` is only set when running behind a trusted reverse proxy (Nginx, Caddy, Cloudflare) that sanitizes `X-Forwarded-For` headers.

---

## Documentation Index

Detailed specifications and architectural guides are available in `/docs`:
- [Deployment & Operations Guide](docs/deployment.md)
- [Security & RBAC Model](docs/security-model.md)
- [Product Specification](docs/product-spec.md)
- [System Architecture](docs/architecture.md)
- [Salesforce Parity Assessment](docs/feature-parity.md)
- [Testing Strategy](docs/testing-strategy.md)
- [Product Roadmap & Backlog](docs/roadmap.md)
- [Active Milestone Plan](plans/current-milestone.md)

---

## License
MIT License. Free and open source for personal and commercial use.
