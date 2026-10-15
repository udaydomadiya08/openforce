# Salesforce Feature Parity & Scope Assessment

## 1. Executive Parity Assessment

OpenForce aims for workflow parity with the core Sales Cloud primitives rather than recreating Salesforce's multi-decade proprietary enterprise ecosystem.

| Domain | Salesforce Sales Cloud | OpenForce MVP | Status |
| :--- | :--- | :--- | :--- |
| **Accounts** | Relational company object with parent/child hierarchies, territory rules | Relational company object with linked contacts, opportunities, and activities | ✅ High Parity |
| **Contacts** | Linked person object with direct account associations | Linked person object with direct account associations and history | ✅ High Parity |
| **Leads** | Unqualified prospects with custom qualification criteria | Unqualified prospects with status tracking and source attribution | ✅ High Parity |
| **Lead Conversion** | Atomic 1-click conversion into Account + Contact + Opportunity | Atomic 1-click conversion into Account + Contact + Opportunity | ✅ Full Parity |
| **Opportunity Stages** | Customizable stages with probabilities and forecast categories | Customizable stages with probabilities, amounts, and close dates | ✅ Full Parity |
| **Pipeline View** | Kanban view with drag-and-drop and aggregate summary values | Kanban view with drag-and-drop and real-time column summaries | ✅ Full Parity |
| **Activity Tracking** | Tasks, Events, Log a Call, Notes with timeline feed | Tasks, Calls, Meetings, Notes with unified chronological timeline | ✅ High Parity |
| **Search** | Global Einstein search across all objects | Instant global debounced search across all core entities | ✅ Targeted Parity |
| **Import / Export** | Data Import Wizard and Data Loader (CSV) | Built-in CSV Import with header auto-mapping & instant CSV Export | ✅ Targeted Parity |
| **Reports & Dashboards**| Multi-matrix drag-and-drop report builder | Essential sales KPIs: pipeline, win rate, stage breakdown, forecast | ⚡ MVP Targeted |
| **Custom Objects** | Declarative schema builder for arbitrary entities | Fixed normalized CRM schema for MVP (Roadmap for custom fields) | ⏳ Out of Scope |
| **Apex / Triggers** | Proprietary proprietary serverless code execution | Direct standard Node.js modular business logic | ❌ Omitted |
| **Flow Builder** | Visual business process automation engine | Deterministic business workflow rules | ⏳ Roadmap |

## 2. Intentional Omissions for MVP
To maintain high reliability, instant responsiveness, and zero-dollar budget compliance, the following are intentionally omitted from MVP:
- Marketing Cloud campaigns and email marketing automations.
- Service Cloud ticket deflection and omnichannel routing.
- Proprietary Apex / Visualforce runtime engines.
- Complex territory hierarchy algorithms.
- Custom marketplace / AppExchange plugins.
