# Projects UX Implementation Guide

## Overview

The Projects module provides comprehensive work-in-progress (WIP) management for manufacturing and project-based operations. Organizations can create projects, track WIP materials and labor costs, managed assigned bills of materials (BOMs), and ultimately close projects with finished goods creation.

**Supported Workflow**: Draft → Active → (OnHold ↔ Resume) → Completed / Cancelled

## Key Features

### Project Lifecycle Management

- **Draft**: Initial state with no WIP posting. Create projects with budget allocations and organizational context.
- **Activate**: Move to Active state to begin WIP tracking and BOM assignments.
- **Hold**: Temporarily pause project to suspend BOM assignments and labor posting.
- **Resume**: Restart from OnHold back to Active.
- **Complete**: Close project with final WIP balance calculation and GL posting eligibility.
- **Cancel**: Cancel project at any time, reversing all accumulated WIP.

### Master List View (`/projects`)

The master list provides a dashboard-style overview of all projects with filtering, sorting, and inline operations.

#### KPI Dashboard Cards
- **Total Projects**: Count of all projects across all statuses
- **Active Projects**: Count of projects in Active or OnHold states
- **Draft Projects**: Count of projects in Draft state
- **Completed Projects**: Count of projects in Completed or Cancelled states

#### Project Creation Form
Create new projects with the following fields:
- **Project Name** (required): Unique identifier for the project
- **Project Type**: Type classification (e.g., manufactured, contract, internal)
- **Description**: Narrative description of project scope
- **Budget Amount**: Planned budget in project currency
- **Start Date**: Planned project commencement
- **End Date**: Planned project completion
- **Project Manager**: Actor responsible for project
- **Organization**: legal entity owning the project

#### Filtering and Search
Filter projects by:
- **Status**: Draft, Active, OnHold, Completed, Cancelled
- **Budget Range**: Minimum and maximum budget amounts
- **Date Range**: Filter by creation date or start/end dates

#### Projects Table
Sortable columns:
- Project Name
- Status (with color badges)
- Budget Amount (formatted as currency)
- Actual Cost (WIP total)
- Project Manager
- Created Date
- Actions (edit, delete, view detail)

#### Detail Pane
Selecting a project shows an inline detail panel with:
- Project summary (name, description, dates)
- Current status badge
- Action buttons: View Full Canvas (navigate to detail page)

### Detail Canvas View (`/canvas/projects/{projectId}`)

The detail canvas provides comprehensive project management with tabbed interfaces for different operational areas.

#### Header Section
- Project name and description
- Status badge with color coding
- Actions dropdown menu

#### Actions Menu
Dynamically available based on current status:
- **Activate** (Draft → Active)
- **Hold** (Active → OnHold)
- **Resume** (OnHold → Active)
- **Complete** (Active/OnHold → Completed)
- **Cancel** (Any state → Cancelled)

State transitions that require confirmation display a dialog with:
- **Completion**: Asks for optional CompletionType (normal, early, late)
- **Cancellation**: Asks for Reason why project was cancelled

#### Summary Cards
KPI summary of project financials:
- **Budget**: Total allocated budget
- **Actual Cost**: Total WIP accumulated (materials + labor)
- **WIP Total**: Breakdown by component (materials, labor, overhead)
- **Budget Remaining**: Budget - Actual Cost (may be negative for over-budget projects)

#### Overview Tab
Project-level summary and WIP breakdown:
- Project details: Name, description, dates, status
- Manager and organization information
- WIP Summary Card:
  - Material Balance (from assigned BOMs)
  - Labor Balance (from posted labor entries)
  - Overhead Balance (GL-allocated overhead)
  - Total Balance (sum of all WIP)
- Status timeline showing state transitions

#### BOMs Tab
Manage bills of materials assigned to the project:

**Assign BOM Form**:
- BOM ID: Select from available BOMs
- Quantity Planned: How many units of this BOM to assign
- Status: Assignment status (active, completed, cancelled)

**Assigned BOMs Table**:
- BOM ID
- Quantity Planned
- Quantity Completed
- Status
- Actions: Remove, Update

When a BOM is assigned:
- Material components in the BOM are reserved against project budget
- Labor associated with BOM operations is tracked separately
- Completion granularly tracks finished goods from each BOM assignment

#### Labor Tab
Track direct labor costs posted to the project:

**Post Labor Cost Form**:
- Labor Type: Classification of labor (direct, indirect, overhead)
- Hours: Number of labor hours
- Hourly Rate: Cost per hour
- Description: Optional notes on labor activity

**Labor Entries Table**:
- Labor Type
- Hours
- Rate per Hour
- Total Cost (Hours × Rate)
- Posted Date
- Actor (who posted)
- Actions: Edit, Delete

Labor entries accumulate in the project's WIP labor balance and are available for GL journal entry creation.

#### Finished Items Tab
Create finished goods tracking for project completion:

**Create Finished Item Form**:
- SKU ID: Select finished good to track
- Quantity Produced: Number of units finished
- Cost Basis: Link to specific WIP component (materials, labor)

**Finished Items Table**:
- SKU ID
- Quantity Produced
- WIP Cost per Unit
- Total Finished Item Cost
- Created Date
- Actions: Delete, View

Finished items represent the culmination of project WIP—they convert accumulated WIP into finished goods inventory that can be sold or transferred.

## Data Model

### Core Entities

#### Project
```typescript
{
  projectId: string;
  projectName: string;
  projectDescription?: string;
  projectType: string;
  budgetAmount: number;
  startDate: DateTime;
  endDate?: DateTime;
  status: 'Draft' | 'Active' | 'OnHold' | 'Completed' | 'Cancelled';
  projectManagerId: string;
  organizationId: string;
  createdBy: string;
  createdAt: DateTime;
  version: number;
}
```

#### Project WIP Summary
```typescript
{
  wipId: string;
  projectId: string;
  wipMaterialBalance: number;
  wipLaborBalance: number;
  wipOverheadBalance: number;
  wipTotalBalance: number;
  status: 'Draft' | 'Active' | 'OnHold' | 'Completed' | 'Cancelled';
  closedAt?: DateTime;
  closeCompletionType?: 'normal' | 'early' | 'late';
}
```

#### BOM Assignment
```typescript
{
  assignmentId: string;
  projectId: string;
  bomId: string;
  quantityPlanned: number;
  quantityCompleted: number;
  status: 'active' | 'completed' | 'cancelled';
}
```

#### Labor Entry
```typescript
{
  entryId: string;
  projectId: string;
  laborType: string;
  hours: number;
  hourlyRate: number;
  totalCost: number;
  description?: string;
  postedBy: string;
  postedAt: DateTime;
}
```

#### Finished Item
```typescript
{
  finishedItemId: string;
  projectId: string;
  skuId: string;
  quantityProduced: number;
  wipCostPerUnit: number;
  totalWipCost: number;
  createdAt: DateTime;
}
```

## API Integration

All Projects UX operations integrate with the Foundation ERP `/api/v1/projects` REST endpoints.

### Project Operations

#### List Projects
```
GET /api/v1/projects
Headers: X-Actor-Id, X-Actor-Tier
Response: DataListResponse<Project>
```

#### Get Project Detail
```
GET /api/v1/projects/{projectId}
Response: DataResponse<Project>
```

#### Create Project
```
POST /api/v1/projects
Body: { projectName, projectType, description, budgetAmount, startDate, endDate, projectManagerId, organizationId }
Response: DataResponse<Project>
```

#### Activate Project
```
POST /api/v1/projects/{projectId}/activate
Response: DataResponse<Project>
```

#### Hold Project
```
POST /api/v1/projects/{projectId}/hold
Response: DataResponse<Project>
```

#### Resume Project
```
POST /api/v1/projects/{projectId}/resume
Response: DataResponse<Project>
```

#### Complete Project
```
POST /api/v1/projects/{projectId}/complete
Body: { completionType: 'normal' | 'early' | 'late' }
Response: DataResponse<Project>
```

#### Cancel Project
```
POST /api/v1/projects/{projectId}/cancel
Body: { reason: string }
Response: DataResponse<Project>
```

### WIP Summary Operations

#### Get WIP Summary
```
GET /api/v1/projects/{projectId}/wip
Response: DataResponse<ProjectWIP>
```

### BOM Assignment Operations

#### Assign BOM to Project
```
POST /api/v1/projects/{projectId}/bom-assignments
Body: { bomId, quantityPlanned, status }
Response: DataResponse<BomAssignment>
```

#### List BOM Assignments
```
GET /api/v1/projects/{projectId}/bom-assignments
Response: DataListResponse<BomAssignment>
```

### Labor Posting Operations

#### Post Labor Cost
```
POST /api/v1/projects/{projectId}/labor-entries
Body: { laborType, hours, hourlyRate, description }
Response: DataResponse<LaborEntry>
```

#### List Labor Entries
```
GET /api/v1/projects/{projectId}/labor-entries
Response: DataListResponse<LaborEntry>
```

### Finished Goods Operations

#### Create Finished Item
```
POST /api/v1/projects/{projectId}/finished-items
Body: { skuId, quantityProduced, wipCostPerUnit }
Response: DataResponse<FinishedItem>
```

#### List Finished Items
```
GET /api/v1/projects/{projectId}/finished-items
Response: DataListResponse<FinishedItem>
```

## State Management

The Projects UX uses a centralized Svelte store (`projectStore`) to manage project data and UI state.

### Store Structure
```typescript
projectStore: {
  currentProject?: Project;
  projectWIP?: ProjectWIP;
  bomAssignments: BomAssignment[];
  laborEntries: LaborEntry[];
  finishedItems: FinishedItem[];
  isLoading: boolean;
  error?: string;
}

projectStatusBadge (derived store):
  status → { color, label }
```

### Store Operations

#### Load Project (Parallel Fetch)
Loads a complete project context in parallel:
```typescript
loadProject(projectId: string)
  → Promise.all([
    getProjectById(),
    getProjectWIPSummary(),
    listProjectBomAssignments(),
    listLaborEntries(),
    listProjectFinishedItems()
  ])
```

#### Reload Current Project
Refreshes data using stored projectId:
```typescript
reloadCurrentProject()
```

#### Clear Store
Reset to initial state:
```typescript
clearProjectStore()
```

#### Mutation Helpers
Add/update items without full reload:
- `addBomAssignment(assignment)`
- `addLaborEntry(entry)`
- `addFinishedItem(item)`
- `updateCurrentProject(project)`
- `updateWIPSummary(wip)`
- `setProjectError(error)`

## Styling and UI Conventions

### Color Scheme (Status Badges)
- **Draft**: Gray (slate-500)
- **Active**: Green (emerald-500)
- **OnHold**: Amber (amber-500)
- **Completed**: Blue (blue-500)
- **Cancelled**: Red (red-500)

### Layout Patterns
- KPI cards use consistent Card component with title, value, href
- Forms use Tailwind utility classes with label-for associations for accessibility
- Tables use sortable columns with hover states
- Modal dialogs for confirmations and state transitions
- Tab-based interfaces for multi-section detail views

### Responsive Design
- Master list: Responsive grid layout (grid-auto-fit)
- Detail canvas: Full-width with collapsible sections on mobile
- Forms: Single-column input layout with proper spacing
- Tables: Horizontal scroll on small screens

## Navigation Integration

### Dashboard Integration
Projects KPI cards on main dashboard link to:
- **Draft Projects** → `/projects` (filtered by status=Draft)
- **Active Projects** → `/projects` (filtered by status=Active)
- **Completed Projects** → `/projects` (filtered by status=Completed)

### Breadcrumb Navigation
- `/projects` → Master list
- `/canvas/projects/{projectId}` → Detail canvas
- Actions menu in detail view provides quick links to related processes (GL posting, inventory, etc.)

## Permissions and Access Control

All Projects operations require ActorContext:
- **X-Actor-Id**: Authenticated user/actor ID
- **X-Actor-Tier**: Authorization tier determining accessible projects and operations

Operations respect actor authority:
- Project creation/modification restricted by organizational scope
- Sensitive operations (Complete, Cancel) may require approval/governance
- WIP posting logged to audit trail

## Known Limitations and Future Enhancements

### Current Limitations
- Single currency per project (no multi-currency support)
- WIP allocation to GL accounts requires separate configuration
- No multi-project dependencies or critical path analysis
- Labor rate consistency not validated (rate can change per entry)

### Planned Enhancements
- WBS (Work Breakdown Structure) phase 2 with sub-projects
- Resource allocation and capacity planning
- Variance analysis (budget vs. actual)
- Project forecasting and trend analysis
- Integration with procurement and inventory forecasts
- Gantt chart timeline view
- Multi-project portfolio dashboards

## Troubleshooting

### Projects don't appear on dashboard
- Verify `proj_project` table exists in Foundation ERP database
- Check ActorContext headers (X-Actor-Id, X-Actor-Tier) are sent correctly
- Confirm user has organization access permissions

### WIP balance not updating
- Ensure labor entries and BOM assignments were successfully posted
- Check project status is Active or OnHold (not Draft or Completed)
- Review browser console for API error messages

### Transitions fail with permission errors
- Verify actor tier has governance approval authority
- Check if project requires approval before state transition
- Review Authority Engine rules for project domain

### Finished items not showing cost basis
- Ensure WIP has sufficient balance to allocate to finished items
- Verify SKU exists in inventory master
- Check finished item posts have matching WIP component

## Support and Contact

For Projects implementation questions or issues:
- Technical: Foundation ERP services team
- Product: Projects domain owner
- Operations: Projects process administrator
