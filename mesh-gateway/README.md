# Mesh Gateway

Mesh Gateway is the constitutional enforcement point between clients and backend systems exposed through pluggable adapters.

## Key Guarantees

- Explicit actor identity: all filtered reads and action requests require a dedicated actor header.
- Decision orchestration: Authority and Governance checks run before execution.
- Approval workflow: task lifecycle persisted in SQLite.
- Readiness gating: `/mesh/ready` returns 503 until Authority, Governance, and at least one registered adapter are ready.

## Commands

- `npm install`
- `npm run migrate`
- `npm run dev`
- `npm run build`

## Environment

Copy values from `.env.example` into your local environment.

- `PORT` defaults to `4003`
- `ACTOR_ID_HEADER` defaults to `x-actor-id`
- `FOUNDATION_ADAPTER_BASE_URL` defaults to `http://localhost:3000`
- `AUTHORITY_ENGINE_URL` defaults to `http://localhost:4001`
- `GOVERNANCE_ENGINE_URL` defaults to `http://localhost:4002`

## Routing

- Mesh resource routes require an explicit adapter prefix: `/mesh/:adapterId/:domain/:resource/:id`
- Mesh action routes require an explicit adapter prefix: `/mesh/:adapterId/:domain/:resource/:id/:action`
- Administrative routes remain adapter-agnostic: `/mesh/ready` and `/mesh/approvals/...`
- Future ERP adapters can be registered beside Foundation and selected without changing the canonical Mesh action model
