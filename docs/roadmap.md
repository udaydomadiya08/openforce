# Product Roadmap & Future Architecture

## Version 1.0 (Current MVP Milestone)
- Core CRM Data Model (Orgs, Users, Accounts, Contacts, Leads, Opportunities, Activities)
- Lead Conversion Engine (1-click atomic conversion)
- Opportunity Pipeline Kanban with custom stages
- Activity Timeline (Tasks, Calls, Meetings, Notes)
- Global Search & Table Filters
- CSV Data Import & Export
- Sales Analytics & Forecast Dashboard
- RBAC (Admin, Manager, Standard, Read-Only)
- Multi-Tenant Isolation
- Embedded SQLite for zero-RAM local dev + Docker Compose PostgreSQL for production

## Version 1.1 (Enhancements)
- Custom Fields System (JSON-schema backed dynamic attributes per entity)
- Email Notifications (SMTP integration for task reminders and lead assignments)
- Webhooks API (Outgoing HTTP webhooks on lead creation and opportunity stage change)
- Bulk Actions (Batch delete, batch owner reassign)

## Version 2.0 (Advanced CRM)
- Visual Workflow Builder (Trigger -> Condition -> Action automation)
- RESTful Public Developer API with API keys
- Email Thread Sync (IMAP/SMTP bidirectional sync)
- Advanced Document & Attachment Storage (S3 / Local volume support)
