# Product Specification: OpenForce CRM MVP

## 1. Product Summary
OpenForce is an open-source, self-hostable CRM designed to capture the core revenue and relationship management workflows established by Salesforce Sales Cloud. It eliminates heavy runtime complexity while preserving the core relational model: Organization -> Users -> Accounts -> Contacts -> Leads -> Opportunities -> Activities.

## 2. Personas & Roles
- **System / Org Administrator**: Configures the organization, manages users, sets stage definitions, exports data, and audits settings.
- **Sales Manager**: Views team pipeline, evaluates win/loss metrics, oversees all accounts and opportunities.
- **Sales Representative (Standard User)**: Manages owned leads, converts qualified leads, moves deals through pipeline stages, logs activities.
- **Auditor / Read-Only**: Observes reports, accounts, and contact records without modification permissions.

## 3. Core Business Workflows

### 3.1 Organization & Tenant Isolation
- Every core entity contains `organization_id`.
- Users sign in to an organization workspace context.
- Cross-tenant data leakage is prevented via mandatory middleware scoping and database query constraints.

### 3.2 Account & Contact Management
- **Accounts**: Represent companies or institutions. Key fields: `name`, `industry`, `website`, `phone`, `annual_revenue`, `employees`, `billing_address`, `shipping_address`, `status`.
- **Contacts**: Individual people linked to Accounts. Key fields: `first_name`, `last_name`, `email`, `phone`, `title`, `account_id`, `department`, `is_primary`.
- Account detail view displays linked contacts, associated opportunities, and consolidated activity history.

### 3.3 Lead Lifecycle & Conversion Flow
- **Leads**: Unqualified prospects. Fields: `first_name`, `last_name`, `company`, `email`, `phone`, `status` (`New`, `Contacted`, `Qualified`, `Unqualified`), `source` (`Web`, `Referral`, `Inbound`, `Event`, `Cold Outreach`).
- **Conversion Workflow (Salesforce-Parity Core)**:
  - When status changes to `Qualified`, the user can trigger the **Convert Lead** action.
  - Conversion atomically creates or links:
    1. An **Account** (from `company`).
    2. A **Contact** (from lead name, email, phone, linked to Account).
    3. An **Opportunity** (optional deal creation with initial amount and stage).
  - The Lead is marked as `Converted` (`is_converted = 1`, `converted_account_id`, `converted_contact_id`, `converted_opportunity_id`) and archived from the active lead view.

### 3.4 Opportunity Pipeline & Kanban Management
- **Opportunities**: Revenue deals with specific stages and expected close dates.
  - Fields: `name`, `account_id`, `amount`, `stage` (`Prospecting`, `Qualification`, `Proposal/Quote`, `Negotiation`, `Closed Won`, `Closed Lost`), `probability` (0–100%), `close_date`, `type` (`New Business`, `Expansion`, `Renewal`).
- **Pipeline Kanban**:
  - Columns represent stages in sequential order.
  - Cards show deal name, account, value ($), expected close date, and owner.
  - Instant stage transition with automatic probability adjustment.
  - Column headers summarize deal count and total aggregate value.

### 3.5 Activities, Tasks & Timeline
- Multi-purpose activity records linked polymorphically or relationally to Accounts, Contacts, Leads, or Opportunities.
- Types: `Task`, `Call`, `Meeting`, `Note`.
- Fields: `subject`, `activity_type`, `due_date`, `status` (`Pending`, `In Progress`, `Completed`), `priority` (`Low`, `Medium`, `High`), `description`.
- Unified reverse-chronological timeline on all record detail panels.

### 3.6 Search, Filtering & Pagination
- **Universal Search**: Header search input querying Leads, Contacts, Accounts, and Opportunities in real time.
- **Table Filters**: Status filter, Stage filter, Owner filter, and text query.
- **Sorting**: Server-side and client-side sorting by Name, Date, Value.
- **Pagination**: Configurable page sizes (10, 25, 50).

### 3.7 CSV Import & Export
- **Import**:
  - Supports CSV format with header row detection.
  - Auto-mapping for common headers (`name`, `email`, `company`, `phone`, etc.).
  - Validation with error preview before committing database writes.
- **Export**:
  - Instant CSV generation of filtered or total lists of Leads, Contacts, Accounts, and Opportunities.

### 3.8 Dashboard & Analytics
- Key Performance Indicators (KPIs):
  - Total Pipeline Value ($)
  - Win Rate (%)
  - Active Opportunities Count
  - Open Leads Count
- Charts & Visualizations:
  - Pipeline by Stage distribution
  - Revenue Forecast (weighted by probability)
  - Lead Acquisition by Source
  - Recent Activities Stream
