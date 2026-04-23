# MCP Catalog and Invocation Guide

## Overview

The Integration Hub publishes a Model Context Protocol (MCP) function catalog that provides governed access to Constitutional ERP operations.

This guide summarizes:

- where MCP function definitions are maintained,
- what domains are currently covered,
- how function metadata is used by UI and orchestration layers,
- and what to update when new business capabilities are added.

## Source of truth

MCP function definitions are maintained in two places and should stay aligned:

- `services/foundation-erp/src/api/mcp/catalog.ts`
- `services/integration-hub/src/domain/mcpCatalog.ts`

The Foundation ERP catalog defines server-side operation contracts. The Integration Hub catalog publishes rich function metadata used by orchestration and AI-assisted action selection.

## Current domain coverage

Catalog coverage includes core and extended domains:

- O2C (order to cash)
- P2P (procure to pay)
- R2R (record to report)
- H2R (hire to retire)
- INV (inventory)
- PROJ (projects)

Recent expansion added full Inventory and Projects operation sets so those domains are now first-class in MCP alongside legacy domains.

## Metadata model

Each function entry should include:

- stable function name,
- operation type (`create`, `query`, `transition`),
- domain and aggregate hints,
- input schema,
- governance metadata,
- risk classification.

This metadata enables consistent rendering in admin and canvas experiences and supports policy-aware invocation.

## Typical invocation flow

1. Client requests MCP catalog.
2. Client selects a function by domain and intent.
3. Input payload is validated against the declared schema.
4. Integration Hub routes invocation to the correct backend adapter.
5. Response is normalized and returned with trace metadata.

## Governance expectations

- Keep catalog names stable to avoid client breakage.
- Add new operations as additive changes where possible.
- Ensure risk level and operation type are explicitly set.
- Keep Integration Hub and Foundation ERP catalogs in parity.

## Update checklist for new capabilities

1. Add function definitions in Foundation ERP MCP catalog.
2. Add mirrored definitions in Integration Hub MCP catalog.
3. Add action routing in any adapter switch logic.
4. Validate end-to-end invocation from UI/canvas.
5. Update docs and test coverage for new domain operations.

## Validation queries and checks

Recommended checks after catalog updates:

- Confirm catalog endpoint returns newly added functions.
- Confirm operation metadata includes domain, type, and risk.
- Confirm no catalog-only functions exist without executable route handlers.
- Confirm Inventory and Projects functions are discoverable and invokable.

## Related documentation

- `docs/Integration Hub Subsystem – Developer Specification (v1).md`
- `docs/Admin Interface – Design Specification (v1)`
- `docs/AdminDataUI.md`
