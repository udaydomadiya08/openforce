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
- Node.js 20+ (Node 22 LTS recommended)
- Git
- (Optional) Docker & Docker Compose for containerized PostgreSQL deployment

### 1. Local Development (Instant SQLite Mode)
Zero setup required. OpenForce uses embedded SQLite with zero external database daemons:

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

#### Demo Credentials
- **Admin**: `admin@openforce.local` / `AdminPass123!`
- **Sales Rep**: `sarah@openforce.local` / `SarahPass123!`

---

### 2. Docker Deployment (PostgreSQL Mode)
To launch with Docker Compose:

```bash
docker compose up -d --build
```
Access OpenForce at **http://localhost:3000**.

---

## Documentation Index

Detailed specifications and architectural guides are available in `/docs`:
- [Product Specification](docs/product-spec.md)
- [System Architecture](docs/architecture.md)
- [Security & RBAC Model](docs/security-model.md)
- [Salesforce Parity Assessment](docs/feature-parity.md)
- [Testing Strategy](docs/testing-strategy.md)
- [Product Roadmap & Backlog](docs/roadmap.md)
- [Active Milestone Plan](plans/current-milestone.md)

---

## License
MIT License. Free and open source for personal and commercial use.
