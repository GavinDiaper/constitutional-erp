# Navigator REPL

An interactive command-line interface for the Navigator AI decision-making service. Use this REPL to rank actions, simulate outcomes, and execute decisions based on Constitutional ERP governance rules.

## Installation

```bash
npm install
```

## Running the REPL

```bash
npm run dev      # Development mode with hot reload
npm run start    # Production mode
npm run build    # Compile TypeScript
```

## Configuration

Create a `.env` file in the navigator-repl directory:

```env
NAVIGATOR_API_URL=http://localhost:4016
ACTOR_ID=system
```

See `.env.example` for all available options.

## Quick Start

1. Start the navigator-ai service on port 4016
2. Start the REPL: `npm run dev`
3. Set an actor ID:
   ```
   navigator> set actor system
   ```

4. Select a business domain and aggregate:
   ```
   navigator> use O2C order SO-001
   ```

5. Propose actions:
   ```
   navigator> propose
   ```

## Commands Reference

### Session Setup

**`set actor <actorId>`**
- Sets the current actor/user making decisions
- Example: `set actor john.doe`, `set actor procurement-manager`

**`use <domain> <aggregateType> <aggregateId>`**
- Selects the business context for analysis
- **Domains:** P2P (Procure-to-Pay), O2C (Order-to-Cash), H2R (Hire-to-Retire), R2R (Record-to-Report)
- Example: `use O2C order SO-2024-001`
- Tip: Use menu selection with just `use` for interactive domain/type selection

**`show`**
- Displays current session context (actor, domain, aggregate)

**`context`**
- Shows detailed context information

### Decision Support

**`propose`**
- Generates ranked action proposals for the current aggregate
- Returns: Actions ranked by impact, feasibility, and governance alignment

**`explain [actionId]`**
- Explains reasoning for a specific action
- Shows: Governance constraints, predicting factors, risk assessment
- Example: `explain ACT-123`

**`simulate <actionId>`**
- Simulates potential outcome of executing an action
- Shows: Expected state changes, cascading effects, estimated impact
- Example: `simulate ACT-123`

**`decide`**
- Ranks all proposed actions and recommends the optimal decision
- Integrates: Governance rules, process constraints, business context

**`execute [actionId]`**
- Executes the chosen action in the system
- If no actionId provided, executes the top-ranked decision
- Logs execution trace for audit and learning

### History & Learning

**`history`**
- Shows previous decisions made in this session
- Returns: Timestamp, action, outcome, actor

**`navlog`**
- Displays navigator's internal decision log
- Shows: Ranking decisions, simulation runs, governance evaluations

**`replay`**
- Replays previous multi-step navigation sequences
- Useful for understanding decision chains and outcomes

### System

**`help`**
- Prints command reference

**`quit` or `exit`**
- Closes the REPL session

## Example Workflows

### Order Processing (O2C)

```
navigator> set actor sales-manager
navigator> use O2C order SO-2024-567
navigator> propose
navigator> explain ACT-001
navigator> simulate ACT-001
navigator> decide
navigator> execute
```

### Purchase Requisition (P2P)

```
navigator> set actor procurement-officer
navigator> use P2P requisition REQ-2024-1234
navigator> propose
navigator> history
```

### Employee Onboarding (H2R)

```
navigator> set actor hr-admin
navigator> use H2R employee EMP-2024-5678
navigator> propose
navigator> simulate ACT-002
navigator> execute ACT-002
```

## Domain & Aggregate Type Reference

### P2P (Procure-to-Pay)
- `requisition` – Purchase requisitions
- `purchaseOrder` – Purchase orders
- `receipt` – Goods receipts
- `invoice` – Vendor invoices
- `payment` – Payments
- `supplier` – Supplier master data

### O2C (Order-to-Cash)
- `quote` – Sales quotes
- `order` – Sales orders
- `invoice` – Customer invoices
- `payment` – Customer payments
- `customer` – Customer master data

### H2R (Hire-to-Retire)
- `employee` – Employee records
- `position` – Job positions
- `assignment` – Role assignments
- `credential` – Certifications/credentials
- `authorityRule` – Authorization rules

### R2R (Record-to-Report)
- `account` – General ledger accounts
- `journal` – Journal entries
- `fiscal` – Fiscal periods and close processes

## Interactive Menu Selection

You can use the REPL with interactive menus instead of typing commands:

```
navigator> use
? Select domain:
  > P2P (Procure-to-Pay)
    O2C (Order-to-Cash)
    H2R (Hire-to-Retire)
    R2R (Record-to-Report)

? Select aggregate type:
  > requisition
    purchaseOrder
    receipt
    ...

? Enter aggregate ID: REQ-2024-1001
```

## Tips & Tricks

- **Tab completion** is not yet available but planned
- **Session persistence** – All decisions and explanations are logged to navigator-ai's SQLite database
- **Concurrent sessions** – Each actor can maintain independent REPL sessions
- **Audit trail** – Every command and its output is automatically recorded for compliance
- **Direct input** – Type commands normally or use `menu` command to switch to interactive mode

## Troubleshooting

### Connection refused on localhost:4016
- Ensure navigator-ai service is running: `npm run start` in navigator-ai directory
- Check port 4016 is not blocked by firewall

### "Unknown command" errors
- Type `help` to see available commands
- Ensure correct syntax (space-separated arguments)

### Actions not proposed
- Verify you've set an actor: `set actor <name>`
- Verify you've selected an aggregate: `use <domain> <type> <id>`
- Check navigator-ai logs for governance constraint issues

## Architecture

**Components:**
- `src/index.ts` – Main REPL loop and command routing
- `src/client/navigatorClient.ts` – HTTP client for navigator-ai API
- `src/state/session.ts` – Session context management
- `src/format/renderer.ts` – Output formatting
- `src/config/env.ts` – Configuration loading

**API Integration:**
The REPL communicates with navigator-ai via REST API at endpoints:
- `POST /api/v1/rank` – Ranking service
- `POST /api/v1/explain` – Explanations
- `POST /api/v1/simulate` – Simulations
- `POST /api/v1/decide` – Decision engine
- `POST /api/v1/execute` – Execution service
- `GET /api/v1/history` – Decision history
- `GET /api/v1/navlog` – Navigation logs
- `POST /api/v1/transcript` – Audit logging

## Development

```bash
# Watch and rebuild on changes
npm run dev

# Type check
npm run lint

# Build for production
npm run build
```

## License

Constitutional ERP – See LICENSE for details
