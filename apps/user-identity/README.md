# user-identity app

Hosted login UI for Constitutional ERP identity flows.

## Run

```bash
npm install
npm run dev --workspace constitutionalerp-user-identity
```

Default URL: `http://localhost:4174`

## Environment

- `IDENTITY_BASE_URL` (default `http://localhost:4008`)
- `UI_CALLBACK_PATH` (default `/auth/callback`)

## Routes

- `/` provider selection
- `/login/:provider` redirect to identity service login
- `/auth/callback` callback handoff page
