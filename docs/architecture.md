# OpenForce Architecture Specification

## 1. Architectural Philosophy
OpenForce adopts a **Modular Monolith** pattern. All business modules run within a unified runtime process, eliminating inter-service network latency, complex distributed state, and excessive RAM overhead. This design comfortably operates within 100MB RAM on a modest 8GB MacBook Air while easily scaling to millions of records.

```
+-------------------------------------------------------------+
|                  Client / Web Interface                     |
|    (Modern Vanilla JS SPA, Custom Design System, Icons)    |
+-------------------------------------------------------------+
                               |
                       REST API / JSON
                               v
+-------------------------------------------------------------+
|                 OpenForce Application Server                |
|                                                             |
|  [Security & Tenant Middleware]  -->  [RBAC Guard]          |
|                                                             |
|  +-------------------------------------------------------+  |
|  | Modules:                                              |  |
|  | - Auth & Users          - Accounts / Companies        |  |
|  | - Organizations         - Contacts                    |  |
|  | - Leads & Conversion    - Opportunities & Pipeline    |  |
|  | - Activities & Tasks    - Reports & Dashboard         |  |
|  | - CSV Import / Export   - Settings & Custom Stages    |  |
|  +-------------------------------------------------------+  |
|                                                             |
|  [Data Access Layer: Parameterized Relational Queries]      |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                     Database Engine                         |
|  - Development / Local: Embedded SQLite (node:sqlite)       |
|  - Production / Docker: PostgreSQL (via pg connection pool) |
+-------------------------------------------------------------+
```

## 2. Directory Structure
```
openforce/
├── AGENTS.md                 # Agent execution guidelines
├── README.md                 # Setup & quickstart guide
├── package.json              # Dependency declarations
├── docker-compose.yml        # Multi-container production deployment
├── Dockerfile                # Production container definition
├── docs/                     # Specifications and architectural docs
│   ├── product-spec.md
│   ├── architecture.md
│   ├── security-model.md
│   ├── feature-parity.md
│   ├── testing-strategy.md
│   └── roadmap.md
├── plans/                    # Milestone tracking
│   └── current-milestone.md
├── src/
│   ├── config/               # App configuration & environment loader
│   ├── db/                   # Database connection, migrations, seed runner
│   │   ├── migrations/       # Sequential SQL migrations
│   │   ├── index.js          # DB client abstraction
│   │   └── seed.js           # Seed data generator
│   ├── middleware/           # Auth, Tenant Isolation, RBAC, Error Handling
│   │   ├── auth.js
│   │   ├── tenant.js
│   │   ├── rbac.js
│   │   └── error.js
│   ├── modules/              # Domain-specific modules
│   │   ├── auth/
│   │   ├── orgs/
│   │   ├── accounts/
│   │   ├── contacts/
│   │   ├── leads/
│   │   ├── opportunities/
│   │   ├── activities/
│   │   ├── reports/
│   │   └── csv/
│   ├── app.js                # Express/HTTP application factory
│   └── server.js             # Process bootstrapper
├── public/                   # Frontend SPA (HTML, CSS, JS client)
│   ├── index.html
│   ├── css/
│   │   ├── design-tokens.css
│   │   ├── layout.css
│   │   └── components.css
│   └── js/
│       ├── api.js
│       ├── state.js
│       ├── router.js
│       ├── components/
│       └── views/
└── tests/                    # Automated test suites
    ├── auth.test.js
    ├── tenant-isolation.test.js
    ├── leads-conversion.test.js
    ├── opportunities-kanban.test.js
    ├── activities.test.js
    └── csv-engine.test.js
```

## 3. Database Schema Design & Normalization

### Tables
1. **`organizations`**: `id`, `name`, `currency_code`, `currency_symbol`, `created_at`, `updated_at`.
2. **`users`**: `id`, `organization_id`, `email`, `password_hash`, `first_name`, `last_name`, `role`, `status`, `created_at`.
3. **`accounts`**: `id`, `organization_id`, `name`, `industry`, `website`, `phone`, `annual_revenue`, `employees`, `billing_address`, `shipping_address`, `created_by`, `created_at`, `updated_at`.
4. **`contacts`**: `id`, `organization_id`, `account_id`, `first_name`, `last_name`, `email`, `phone`, `title`, `department`, `is_primary`, `created_by`, `created_at`, `updated_at`.
5. **`leads`**: `id`, `organization_id`, `first_name`, `last_name`, `company`, `email`, `phone`, `status`, `source`, `rating`, `is_converted`, `converted_account_id`, `converted_contact_id`, `converted_opportunity_id`, `converted_at`, `assigned_to`, `created_at`, `updated_at`.
6. **`pipeline_stages`**: `id`, `organization_id`, `name`, `stage_order`, `default_probability`, `is_won`, `is_lost`, `created_at`.
7. **`opportunities`**: `id`, `organization_id`, `account_id`, `lead_id`, `name`, `stage_id`, `amount`, `probability`, `close_date`, `type`, `assigned_to`, `created_at`, `updated_at`.
8. **`activities`**: `id`, `organization_id`, `activity_type` (Task, Call, Meeting, Note), `subject`, `description`, `status`, `priority`, `due_date`, `related_to_type` (Account, Contact, Lead, Opportunity), `related_to_id`, `assigned_to`, `created_by`, `created_at`, `updated_at`.
