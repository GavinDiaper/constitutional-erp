# Identity Deployment Runbook (Render + Cloudflare + Google)

This runbook is the execution guide for deploying identity with real OAuth under the provisia.co.uk domain.

## 1. Scope and target

Target state:

- Identity API on `identity-api.provisia.co.uk`
- Identity UI on `identity.provisia.co.uk`
- Main application UI on `app.provisia.co.uk`
- Website/root on `www.provisia.co.uk`

Success criteria:

- Unauthenticated app users are redirected to identity UI
- Google login succeeds end to end
- Callback returns to app and session is established
- Protected routes work after login and are blocked again after logout

## 2. Service to hostname mapping

Use explicit DNS records (wildcard is not required).

| Hostname | Render service | Purpose |
|---|---|---|
| `www.provisia.co.uk` | website/root service | Public entry |
| `app.provisia.co.uk` | `apps/ui-sveltekit` | Main application UI |
| `identity.provisia.co.uk` | `apps/user-identity` | Hosted login UI |
| `identity-api.provisia.co.uk` | `services/user-identity` | OAuth callback, token lifecycle |

Optional:

| Hostname | Render service | Purpose |
|---|---|---|
| `api.provisia.co.uk` | API gateway edge | Future public API edge |

## 3. Cloudflare checklist

1. Create DNS records for each hostname above to Render-provided targets.
2. SSL/TLS mode: `Full (strict)`.
3. Enable `Always Use HTTPS`.
4. Keep proxy enabled after verification.
5. If callback debugging is needed, temporarily switch one hostname to DNS-only and revert after diagnosis.

## 4. Render custom domain checklist

For each service:

1. Attach the corresponding custom domain.
2. Wait for certificate status to become active.
3. Verify each URL returns over HTTPS.

## 5. Google OAuth setup checklist

Create or update a Google OAuth Web application.

Authorized redirect URIs:

- `https://identity-api.provisia.co.uk/auth/callback/google`

Authorized JavaScript origins:

- `https://identity.provisia.co.uk`
- `https://app.provisia.co.uk`

Collect and store:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

## 6. Production environment matrix

### 6.1 services/user-identity

Required production values:

- `NODE_ENV=production`
- `OAUTH_MOCK_ENABLED=false`
- `COOKIE_SECURE=true`
- `GOOGLE_CLIENT_ID=<google client id>`
- `GOOGLE_CLIENT_SECRET=<google client secret>`
- `GOOGLE_REDIRECT_URI=https://identity-api.provisia.co.uk/auth/callback/google`
- `GOOGLE_AUTHORIZATION_URL=https://accounts.google.com/o/oauth2/v2/auth`
- `GOOGLE_TOKEN_URL=https://oauth2.googleapis.com/token`
- `GOOGLE_USERINFO_URL=https://openidconnect.googleapis.com/v1/userinfo`
- `GOOGLE_SCOPES=openid email profile`
- `GOOGLE_JWKS_URL=https://www.googleapis.com/oauth2/v3/certs`
- `GOOGLE_EXPECTED_ISSUER=https://accounts.google.com`
- `GOOGLE_EXPECTED_ISSUER_PREFIX=`
- `JWT_ISSUER=constitutionalerp-user-identity`
- `JWT_AUDIENCE=constitutionalerp-clients`
- `JWT_SIGNING_SECRET=<strong shared secret>`
- `FOUNDATION_ERP_URL=<foundation endpoint>/api/v1`
- `FOUNDATION_ERP_API_KEY=<foundation api key>`
- `FOUNDATION_ERP_INGRESS_ID=foundation-ingress`
- `H2R_AUTO_LINK_ENABLED=true` (or `false` if deferred)
- `H2R_LOOKUP_TIMEOUT_MS=1500`

### 6.2 apps/user-identity

- `IDENTITY_BASE_URL=https://identity-api.provisia.co.uk`
- `UI_SVELTEKIT_BASE_URL=https://app.provisia.co.uk`
- `UI_CALLBACK_PATH=/auth/callback`

### 6.3 apps/ui-sveltekit

- `UI_IDENTITY_LOGIN_PATH=https://identity.provisia.co.uk`
- `IDENTITY_BASE_URL=https://identity-api.provisia.co.uk`
- Use the same JWT issuer/audience/signing trust contract as identity consumers

### 6.4 mesh-gateway and integration-hub

These values must exactly match identity service token issuer settings:

- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `JWT_SIGNING_SECRET`

## 7. Verification gates

### Gate A: URL and cert sanity

1. Open:
	- `https://identity-api.provisia.co.uk/health`
	- `https://identity.provisia.co.uk`
	- `https://app.provisia.co.uk`
2. Confirm valid certs and HTTPS.

### Gate B: login flow

1. Navigate to `https://app.provisia.co.uk/dashboard` while signed out.
2. Confirm redirect to `https://identity.provisia.co.uk`.
3. Click Google login.
4. Confirm redirect to Google and back to:
	- `https://identity-api.provisia.co.uk/auth/callback/google`
5. Confirm callback redirects to app callback and then dashboard.

### Gate C: session behavior

1. Confirm protected routes are accessible after login.
2. Perform logout.
3. Confirm redirect to identity UI and protected routes are blocked again.

### Gate D: token trust and propagation

1. Confirm mesh-gateway and integration-hub accept identity JWT.
2. Confirm actor metadata appears in downstream logs/events where expected.

## 8. Troubleshooting quick map

`redirect_uri_mismatch`

- Verify exact string match of `GOOGLE_REDIRECT_URI` with Google console redirect URI.

Login loop between app and identity

- Verify `UI_IDENTITY_LOGIN_PATH` and `IDENTITY_BASE_URL` are set correctly in app services.

Token rejected downstream

- Verify `JWT_ISSUER`, `JWT_AUDIENCE`, and `JWT_SIGNING_SECRET` are aligned across identity, mesh, and integration-hub.

Cookie/session not persisting

- Ensure HTTPS is used and `COOKIE_SECURE=true` in production.

## 9. Rollback plan

If production OAuth fails after cutover:

1. Keep domains and DNS unchanged.
2. Temporarily set `OAUTH_MOCK_ENABLED=true` in identity service.
3. Restart identity service.
4. Validate login path for internal testing.
5. Reapply production OAuth values after fix and retest Gate B and Gate C.

## 10. Mobile handoff condition

Start Capacitor auth implementation only after all verification gates pass in production domain setup.

Mobile handoff artifacts:

1. Stable hostnames (`app`, `identity`, `identity-api`)
2. Stable callback contract
3. Stable JWT trust settings
4. Verified login/logout/session lifecycle in deployed environment