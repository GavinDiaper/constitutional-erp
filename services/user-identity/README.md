# user-identity

User identity service for Constitutional ERP.

## Features

- OAuth provider discovery/login endpoints (mock callback mode available)
- Identity resolution and persistence (`identity_user`)
- Access token + refresh token issuance and rotation
- Session refresh/logout endpoints
- `GET /identity/me`
- Admin-protected `POST /identity/link-h2r`
- Break-glass admin session endpoint

## Local development

```bash
npm install
npm run migrate --workspace user-identity
npm run dev --workspace user-identity
```

## Environment

Copy `.env.example` to `.env` and update values as needed.

Key settings:

- `PORT` (default `4008`)
- `DATABASE_PATH`
- `JWT_SIGNING_SECRET`
- `ACCESS_TOKEN_TTL_SECONDS`
- `REFRESH_TOKEN_TTL_SECONDS`
- `ADMIN_SECRET`
- `OAUTH_MOCK_ENABLED`

## Endpoints

- `GET /health`
- `GET /auth/providers`
- `GET /auth/login/:provider`
- `GET /auth/callback/:provider`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/break-glass`
- `GET /identity/me`
- `POST /identity/link-h2r`
