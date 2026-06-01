# ERPMappingTool

Standalone SvelteKit UI for viewing and editing ERP mapping V2 tables.

## Local development

1. Copy `.env.example` to `.env` and adjust values if needed.
2. Start API: `npm --workspace services/erp-mapping-tool-api run dev`
3. Start UI: `npm --workspace apps/ERPMappingTool run dev`
4. Open `http://localhost:5175`

Or run both from repo root:

`npm run start:erp-mapping-tool`

## Scripts

- `npm run dev` - Run Vite dev server on port 5175
- `npm run build` - Build production bundle
- `npm run start` - Start built Node adapter output
- `npm run check` - Type check Svelte code

## Environment variables

- `PUBLIC_ERP_MAPPING_API_URL` - API base URL
- `PUBLIC_ERP_MAPPING_API_KEY` - API key header used by UI

## v1 scope

- View V2 mapping comparison tabs
- Create field mappings
- Edit field mappings
- Delete and bulk import/export are intentionally excluded in v1
