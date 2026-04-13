Great call. Here is a concrete, deployment-first checklist for Render + Google OAuth, aligned to your current config.

**Target Outcome**
1. User can click Google login in hosted identity UI.
2. Google redirects to your public identity callback URL.
3. Identity service validates token and redirects to UI callback.
4. UI sets session cookies and protected routes work.

**A. Pick Public URLs First**
1. Choose final Render public URLs (or custom domains), for example:
- Identity API: https://identity-api.onrender.com
- Identity UI app: https://identity-ui.onrender.com
- Main UI (SvelteKit): https://ui.onrender.com
2. Keep these fixed before Google setup. Google is strict about exact redirect URI matching.

**B. Render Services to Deploy**
1. Deploy service from user-identity.
2. Deploy app from user-identity.
3. Deploy app from ui-sveltekit.
4. Ensure internal service-to-service reachability for your backend stack (or public/private URLs as needed).

**C. Google Cloud OAuth Setup**
1. In Google Cloud Console, create/select project.
2. Configure OAuth consent screen.
3. Create OAuth Client ID (Web application).
4. Add Authorized redirect URI:
- https://identity-api.onrender.com/auth/callback/google
5. Add Authorized JavaScript origins if needed for browser interactions:
- https://identity-ui.onrender.com
- https://ui.onrender.com
6. Save Client ID and Client Secret.

**D. Render Environment Variables (Exact Mapping)**

Use .env.example as source of truth.

For user-identity service:
1. OAUTH_MOCK_ENABLED=false
2. NODE_ENV=production
3. COOKIE_SECURE=true
4. GOOGLE_CLIENT_ID=<from Google>
5. GOOGLE_CLIENT_SECRET=<from Google>
6. GOOGLE_REDIRECT_URI=https://identity-api.onrender.com/auth/callback/google
7. GOOGLE_AUTHORIZATION_URL=https://accounts.google.com/o/oauth2/v2/auth
8. GOOGLE_TOKEN_URL=https://oauth2.googleapis.com/token
9. GOOGLE_USERINFO_URL=https://openidconnect.googleapis.com/v1/userinfo
10. GOOGLE_SCOPES=openid email profile
11. GOOGLE_JWKS_URL=https://www.googleapis.com/oauth2/v3/certs
12. GOOGLE_EXPECTED_ISSUER=https://accounts.google.com
13. GOOGLE_EXPECTED_ISSUER_PREFIX=
14. JWT_ISSUER=constitutionalerp-user-identity
15. JWT_AUDIENCE=constitutionalerp-clients
16. JWT_SIGNING_SECRET=<strong secret>
17. FOUNDATION_ERP_URL=<reachable foundation URL>/api/v1
18. FOUNDATION_ERP_API_KEY=<matching key>
19. FOUNDATION_ERP_INGRESS_ID=foundation-ingress
20. H2R_AUTO_LINK_ENABLED=true (or false if you want to defer)
21. H2R_LOOKUP_TIMEOUT_MS=1500

For user-identity app:
1. IDENTITY_BASE_URL=https://identity-api.onrender.com
2. UI_SVELTEKIT_BASE_URL=https://ui.onrender.com
3. UI_CALLBACK_PATH=/auth/callback

For ui-sveltekit:
1. UI_IDENTITY_LOGIN_PATH=https://identity-ui.onrender.com
2. IDENTITY_BASE_URL=https://identity-api.onrender.com
3. Keep JWT_ISSUER/JWT_AUDIENCE/JWT_SIGNING_SECRET aligned with downstream validators.

For mesh-gateway and integration-hub:
1. JWT_ISSUER must match user-identity.
2. JWT_AUDIENCE must match user-identity.
3. JWT_SIGNING_SECRET must match user-identity.

This alignment is critical for token acceptance.

**E. Post-Deploy Verification Checklist**
1. Open https://identity-ui.onrender.com.
2. Click Google login.
3. Confirm redirect goes to accounts.google.com and returns to:
- https://identity-api.onrender.com/auth/callback/google
4. Confirm callback then redirects to:
- https://ui.onrender.com/auth/callback?...
5. Confirm UI callback sets session and redirects to /dashboard.
6. Confirm protected page works after login.
7. Confirm logout returns to identity-ui and protected route is blocked again.

**F. Fast Troubleshooting**
1. Error redirect_uri_mismatch:
- Check exact GOOGLE_REDIRECT_URI equals Google console redirect entry.
2. Token rejected in backend:
- Check issuer/audience/signing secret alignment across identity, mesh, integration-hub.
3. Login loop:
- Check UI_IDENTITY_LOGIN_PATH and UI_SVELTEKIT_BASE_URL consistency.
4. Secure cookie issues:
- Ensure HTTPS and COOKIE_SECURE=true in production.

**G. After This Is Stable**
1. Then start Capacitor phase using this real OAuth contract.
2. You avoid major auth rework in mobile later.

If you want, next I can produce a Render-ready variable matrix you can paste service-by-service (identity-api, identity-ui, ui-sveltekit, mesh-gateway, integration-hub).