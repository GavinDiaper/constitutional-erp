# erp-mapping-tool-api

Standalone API and SQLite data layer for ERP mapping V2 exploration and editing.

## Local development

1. Copy `.env.example` to `.env`
2. Run migrations and start API:

`npm run dev`

The app runs migrations at startup. Default health endpoint is:

`GET /health`

## Scripts

- `npm run dev` - Run API with tsx
- `npm run migrate` - Apply migrations manually
- `npm run build` - Compile to `dist`
- `npm run start` - Start compiled server

## Endpoints

- `GET /api/v1/query/:table`
- `GET /api/v1/query/:table/:id`
- `POST /api/v1/mappings`
- `PUT /api/v1/mappings/:id`

All `/api/v1/*` endpoints require `x-api-key` header.
