### Canonical Project domain specification (Foundation ERP v2)

---

## 1. Canonical Project domain model

### 1.1 Entities

**Project**

- **Fields:**
  - `projectId: string`
  - `name: string`
  - `description?: string`
  - `projectType: "Internal" | "Capital" | "Billable"`
  - `customerId?: string` (required for `Billable`)
  - `startDate: date`
  - `endDate?: date`
  - `status: ProjectStatus`
  - `currencyCode: string`
  - `budgetAmount?: number`
  - `actualCostAmount?: number`
  - `projectManagerId?: string`
  - `createdAt: datetime`
  - `updatedAt: datetime`

**ProjectStatus**

- `Draft`
- `Active`
- `OnHold`
- `Completed`
- `Cancelled`

**ProjectTask** (optional but useful backbone)

- `taskId: string`
- `projectId: string`
- `name: string`
- `description?: string`
- `status: ProjectTaskStatus`
- `startDate?: date`
- `endDate?: date`
- `budgetAmount?: number`
- `actualCostAmount?: number`
- `createdAt: datetime`
- `updatedAt: datetime`

**ProjectTaskStatus**

- `Planned`
- `InProgress`
- `Completed`
- `Cancelled`

### 1.2 Relationships

- **P2P**
  - Requisition → `projectId?`
  - PurchaseOrder → `projectId?`
  - Invoice → `projectId?`
- **O2C**
  - SalesOrder → `projectId?` (billable projects)
  - ARInvoice → `projectId?`
- **R2R**
  - JournalLine → `projectId?`
- **H2R**
  - Assignment → `projectId?` (optional)

---

## 2. Canonical Project lifecycle

### 2.1 Project lifecycle states and transitions

**States:**

- `Draft`
- `Active`
- `OnHold`
- `Completed`
- `Cancelled`

**Transitions:**

- `Draft → Active`
- `Active → OnHold`
- `OnHold → Active`
- `Active → Completed`
- `Draft → Cancelled`
- `Active → Cancelled`
- `OnHold → Cancelled`

### 2.2 Lifecycle rules (least common denominator)

- A Project must start in `Draft`.
- Only `Draft` can become `Active` or `Cancelled`.
- Only `Active` can become `OnHold`, `Completed`, or `Cancelled`.
- Only `OnHold` can become `Active` or `Cancelled`.
- `Completed` and `Cancelled` are terminal.

---

## 3. Canonical Project command model

### 3.1 Commands (Project)

- **`createProject`**
  - Input:
    - `name`, `projectType`, `currencyCode`, `startDate`, `customerId?`, `budgetAmount?`
  - Pre:
    - None.
  - Post:
    - Project in `Draft`.

- **`activateProject`**
  - Input:
    - `projectId`
  - Pre:
    - `status = Draft`
  - Post:
    - `status = Active`

- **`holdProject`**
  - Input:
    - `projectId`
  - Pre:
    - `status = Active`
  - Post:
    - `status = OnHold`

- **`resumeProject`**
  - Input:
    - `projectId`
  - Pre:
    - `status = OnHold`
  - Post:
    - `status = Active`

- **`completeProject`**
  - Input:
    - `projectId`
  - Pre:
    - `status = Active`
  - Post:
    - `status = Completed`

- **`cancelProject`**
  - Input:
    - `projectId`
  - Pre:
    - `status ∈ {Draft, Active, OnHold}`
  - Post:
    - `status = Cancelled`

### 3.2 Commands (ProjectTask)

- `createProjectTask`
- `startProjectTask`
- `completeProjectTask`
- `cancelProjectTask`

(Tasks are optional for v2; they can be added incrementally.)

---

## 4. Canonical Project event model

### 4.1 Event envelope

All events follow the canonical envelope:

```json
{
  "eventId": "uuid",
  "eventType": "project.activated",
  "entityType": "Project",
  "entityId": "PRJ-001",
  "timestamp": "2026-03-30T10:00:00Z",
  "actor": {
    "type": "user",
    "id": "actor-123",
    "authorityTier": "T3"
  },
  "correlationId": "corr-xyz",
  "causationId": "cmd-abc",
  "payload": { /* domain-specific */ }
}
```

### 4.2 Project events

- `project.created`
  - Payload: core fields (name, type, currency, startDate, budgetAmount?).
- `project.activated`
  - Payload: `projectId`, previousStatus, newStatus.
- `project.onhold`
- `project.resumed`
- `project.completed`
- `project.cancelled`

### 4.3 ProjectTask events (if implemented)

- `projecttask.created`
- `projecttask.started`
- `projecttask.completed`
- `projecttask.cancelled`

### 4.4 Replayability

- Replaying all `project.*` events in order must reconstruct:
  - Project state
  - Status
  - Budget vs actuals (when cost events are included)
- No vendor‑specific fields in canonical payloads.

---

## 5. Mapping table (Canonical → SAP / Oracle Fusion / Dynamics 365)

### 5.1 Entity mapping

| Canonical | SAP (PS) | Oracle Fusion PPM | Dynamics 365 Project Ops |
|----------|----------|-------------------|--------------------------|
| `Project` | WBS Element (top-level) or Project Definition | Project | Project |
| `ProjectTask` | WBS Element (lower-level) / Network Activity | Task | Task |

### 5.2 Field mapping (Project)

| Canonical Field | SAP | Oracle Fusion | Dynamics 365 |
|-----------------|-----|--------------|--------------|
| `projectId` | `PROJ-DEF` / `PSPNR` | `projectId` | `ProjectId` |
| `name` | `POST1` | `name` | `Name` |
| `description` | `POST1`/`POST2` | `description` | `Description` |
| `projectType` | Project Profile / Investment Profile | `projectType` | `ProjectType` |
| `customerId` | Partner Function (Customer) | `customerId` | `CustomerAccount` |
| `startDate` | `PLFAZ` | `startDate` | `StartDate` |
| `endDate` | `PLSEZ` | `endDate` | `EndDate` |
| `status` | System/User Status | `statusCode` | `ProjectStage/Status` |
| `currencyCode` | `WAERS` | `currencyCode` | `CurrencyCode` |
| `budgetAmount` | Budget in IM/PS | `budgetAmount` | `BudgetAmount` |
| `actualCostAmount` | Actuals in CO/PS | `actualCostAmount` | `ActualCostAmount` |
| `projectManagerId` | Person Responsible | `projectManagerId` | `ProjectManager` |

### 5.3 Status mapping

| Canonical Status | SAP | Oracle Fusion | Dynamics 365 |
|------------------|-----|--------------|--------------|
| `Draft` | Created, not released | Draft / Pending Approval | Draft |
| `Active` | Released | Approved / Active | In Progress / Active |
| `OnHold` | User Status “On Hold” | On Hold | On Hold |
| `Completed` | TECO (Technically Complete) / CLSD | Completed | Completed |
| `Cancelled` | Closed / Deactivated | Cancelled | Cancelled |

### 5.4 Command mapping (high‑level)

| Canonical Command | SAP | Oracle Fusion | Dynamics 365 |
|-------------------|-----|--------------|--------------|
| `createProject` | Create Project Definition / WBS | Create Project | Create Project |
| `activateProject` | Set System/User Status to Released | Approve/Activate Project | Set to Active/In Progress |
| `holdProject` | Set User Status “On Hold” | Set status to On Hold | Set status to On Hold |
| `resumeProject` | Remove “On Hold” status | Set status to Active | Set status to Active |
| `completeProject` | TECO / CLSD | Complete Project | Set status to Completed |
| `cancelProject` | Close/Deactivate | Cancel Project | Cancel Project |

Mesh adapters will encapsulate these vendor‑specific operations behind the canonical commands.

---

## 6. PGE process graph for Projects

### 6.1 States

- `Draft`
- `Active`
- `OnHold`
- `Completed`
- `Cancelled`

### 6.2 Transitions (edges)

- `Draft → Active` (`activateProject`)
- `Draft → Cancelled` (`cancelProject`)
- `Active → OnHold` (`holdProject`)
- `OnHold → Active` (`resumeProject`)
- `Active → Completed` (`completeProject`)
- `Active → Cancelled` (`cancelProject`)
- `OnHold → Cancelled` (`cancelProject`)

### 6.3 PGE representation (conceptual)

Nodes:

- `Draft`
- `Active`
- `OnHold`
- `Completed` (terminal)
- `Cancelled` (terminal)

Edges:

- `Draft --activateProject--> Active`
- `Draft --cancelProject--> Cancelled`
- `Active --holdProject--> OnHold`
- `OnHold --resumeProject--> Active`
- `Active --completeProject--> Completed`
- `Active --cancelProject--> Cancelled`
- `OnHold --cancelProject--> Cancelled`

Each edge in PGE:

- References:
  - `commandId` (canonical command)
  - `mcpFunctionId` (Integration Hub)
  - `riskLevel`
  - `requiredAuthorityTier`

This gives Navigator and Integration Hub a clean, portable, enterprise‑grade but least‑common‑denominator Project model that can be replayed and mapped across SAP, Oracle Fusion, and Dynamics.
