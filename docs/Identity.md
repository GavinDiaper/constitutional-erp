# ⭐ Why a Separate Identity App Is a Good Idea

### **1. It isolates risk**
Identity is sensitive.  
You don’t want to destabilize:

- Canvas  
- Integrations (hub or mesh)  
- Governance  
- Event sourcing  
- Domain services  

By building identity in a separate app, you can test:

- OAuth flows  
- Token validation  
- Identity ↔ H2R linking  
- Session handling  
- Refresh tokens  
- Logout flows  

…without touching the main ERP.

This is exactly how large platforms evolve identity safely.

---

### **2. It gives you a clean, constitutional identity boundary**
Identity becomes its own constitutional service:

- `identity_user`  
- OAuth provider integration  
- Token validation  
- Identity resolution  
- H2R linking  

This keeps identity **pure**, **stable**, and **replay‑safe**.

---

### **3. It accelerates mobile development**
Once the Identity App is working:

- SvelteKit web app plugs into it  
- Capacitor mobile app plugs into it  
- Future desktop clients plug into it  
- External integrations plug into it  

You get a **single source of truth** for authentication.

---

### **4. It allows you to test OAuth flows without Canvas**
Canvas is hypermedia‑driven and complex.  
Identity is not.

Testing identity in isolation means:

- Faster iteration  
- Easier debugging  
- Cleaner logs  
- No governance noise  
- No domain events interfering  

This is exactly how identity should be tested.

---

### **5. It aligns with your constitutional philosophy**
FoundationERP’s constitutional layer is built on:

- separation of concerns  
- stable primitives  
- event‑sourced auditability  
- governance metadata  
- hypermedia workflows  

Identity fits perfectly as a **separate constitutional capability**.

---

# ⭐ What the Separate Identity App Should Do

Here’s the minimal feature set for the standalone Identity App:

## **1. OAuth2/OIDC Login**
Support:

- Google  
- Microsoft  
- Apple (optional)  
- Enterprise IdPs (future)  

## **2. Token Validation**
- Validate ID token signature  
- Validate issuer  
- Validate audience  
- Extract email + subject  

## **3. Identity Resolution**
- Look up or create `identity_user`  
- Link to H2R employee by email  
- Store last login timestamp  

## **4. Session Management**
- Issue short‑lived session token  
- Store refresh token (if needed)  
- Provide logout endpoint  

## **5. Identity API**
Endpoints like:

- `GET /identity/me`  
- `GET /identity/h2r-link`  
- `POST /identity/link`  
- `GET /identity/authorities` (future)  

## **6. Event Metadata Injection**
When the web/mobile app calls Integrations (hub or mesh):

- identity_id  
- email  
- authority tier  
- risk metadata  

This becomes part of the event log.

---

# ⭐ How It Integrates With FoundationERP

### **Web App (SvelteKit)**
- Redirects to Identity App for login  
- Receives session token  
- Calls Integrations (hub or mesh) with identity context  

### **Mobile App (Capacitor)**
- Uses Identity App’s OAuth flow  
- Stores tokens in secure storage  
- Calls Integrations (hub or mesh) with identity context  

### **Integrations (hub or mesh)**
- Validates session token  
- Resolves identity_user  
- Injects identity metadata into events  

### **H2R**
- Provides employee linkage  
- Provides authority tier (future)  

---

# ⭐ Recommended Implementation Sequence

### **Phase 1 — Build Identity App**
- OAuth login  (with own pages, separate from SvelteKit)
- Token validation  
- identity_user table  
- H2R linking  
- Session token issuing  

### **Phase 2 — Integrate Web App**
- Replace local login with OAuth  
- Pass ID token to backend  
- Backend resolves identity_user  

### **Phase 3 — Build Capacitor Mobile App**
- Use Identity App for login  
- Store tokens securely  
- Pass identity to Integrations (hub or mesh)  

### **Phase 4 — Add Governance Enhancements**
- Biometric confirmation  
- Risk‑aware UI  
- Authority tier enforcement  

---

# ⭐ Final Answer

**Yes — building a separate Identity App first is the right move.**  
It isolates risk, accelerates testing, and gives you a clean constitutional identity layer that both web and mobile can rely on.

Once identity is stable, adding Capacitor becomes trivial.

---

Below is a **complete, constitutional‑grade Identity App Specification** designed specifically for FoundationERP.  
It assumes **the current SvelteKit UI has *no* login or authorization**, and therefore identity must be introduced cleanly, safely, and without destabilizing Canvas, Integrations (hub or mesh), or domain services.

This specification is written so you can hand it directly to developers.

---

# 🧱 **FOUNDATIONERP IDENTITY APP — FULL SPECIFICATION**  
### *A constitutional identity service for OAuth2/OIDC login, H2R linking, governance context, and event auditability*

---

# 1. **Purpose of the Identity App**
The Identity App is a **standalone constitutional service** responsible for:

- Authenticating users via **OAuth2/OIDC** (Google, Microsoft, etc.)  
- Creating and managing **identity_user** records  
- Linking identities to **H2R employees**  
- Issuing **FoundationERP session tokens**  
- Injecting identity metadata into **Integrations (hub or mesh) requests**  
- Providing identity context for **event logs, audit, and replay**  

It does **not** perform authorization (authority tiers come later).  
It does **not** store passwords.  
It does **not** depend on Canvas or domain modules.

---

# 2. **High-Level Architecture**

```
[ Web App (SvelteKit) ] ----\
[ Mobile App (Capacitor) ] ----> [ Identity App ] ----> [ Integrations (hub or mesh) ]
                                      |                     |
                                      |                     |
                                      v                     v
                                [ identity_user ]      [ Domain Services ]
                                      |
                                      v
                                [ H2R Employee ]
```

Identity App is a **constitutional microservice** with:

- Its own database  
- Its own API  
- Stateless token validation  
- Event metadata injection  

---

# 3. **Identity App Responsibilities**

## 3.1. Authentication (OAuth2/OIDC)
Identity App handles:

- Redirect to provider  
- Token exchange  
- ID token validation  
- Extracting email + subject  
- Creating/updating identity_user  

Supported providers:

- Google  
- Microsoft (Entra ID / Windows identity)  
- Apple (optional)  
- Enterprise SSO (future)  

---

## 3.2. Identity Record Management
### **Table: identity_user**
| Field | Type | Description |
|-------|------|-------------|
| identity_id | UUID | Internal canonical identity |
| external_subject | string | OIDC `sub` claim |
| external_provider | enum | google / microsoft / apple / saml |
| email | string | Primary identifier |
| h2r_employee_id | UUID | FK to H2R employee (optional) |
| status | enum | active / disabled |
| created_at | timestamp | First login |
| last_login_at | timestamp | Last login |

**Rules:**

- `email` must be unique  
- `external_subject` + `external_provider` must be unique  
- Linking to H2R is optional at first login  

---

## 3.3. H2R Linking Logic
When a user logs in:

1. Identity App extracts email from ID token  
2. Identity App searches H2R for an employee with matching email  
3. If found → link identity_user.h2r_employee_id  
4. If not found → identity exists but is not an employee  
5. Future: earned authority will attach to H2R employee  

This preserves the separation between **identity** and **employment**.

---

## 3.4. Session Token Issuing
Identity App issues a **FoundationERP session token**:

- JWT signed with platform key  
- Contains:
  - identity_id  
  - email  
  - provider  
  - h2r_employee_id (if linked)  
  - issued_at  
  - expires_at  

Token lifetime: **15 minutes**  
Refresh token lifetime: **7 days**

---

## 3.5. Identity Context Injection (Integrations (hub or mesh) Integration)
Every request from SvelteKit or mobile to Integrations (hub or mesh) must include:

```
Authorization: Bearer <session_token>
```

Integrations (hub or mesh) validates the token and injects:

- `actor_identity_id`  
- `actor_email`  
- `actor_h2r_employee_id`  
- `actor_authority_tier` (future)  
- `actor_risk_level` (from governance engine)  

This metadata is written into:

- event log  
- navlog  
- transcript  
- governance decision log  

This gives you **perfect replay and auditability**.

---

# 4. **Identity App API Specification**

## 4.1. `GET /auth/providers`
Returns list of supported OAuth providers.

## 4.2. `GET /auth/login/:provider`
Redirects user to provider login page.

## 4.3. `GET /auth/callback/:provider`
Handles OAuth callback:

- Validates ID token  
- Creates/updates identity_user  
- Issues session token  
- Redirects back to SvelteKit/mobile with token  

## 4.4. `POST /auth/refresh`
Exchanges refresh token for new session token.

## 4.5. `POST /auth/logout`
Invalidates refresh token.

## 4.6. `GET /identity/me`
Returns:

- identity_id  
- email  
- provider  
- h2r_employee_id  
- status  

## 4.7. `POST /identity/link-h2r`
Manually link identity to H2R employee (admin only).

---

# 5. **SvelteKit Integration Specification**

### **5.1. Replace current login with OAuth redirect**
Add a “Sign in with Google/Microsoft” button.

### **5.2. After callback, store session token**
Use:

- localStorage sqlite (web)  
- secure storage (mobile)

### **5.3. Add a SvelteKit hook**
`hooks.server.ts`:

- Read session token  
- Validate via Identity App  
- Inject identity into `locals`  
- Pass identity to Canvas rendering  

### **5.4. All API calls include session token**
SvelteKit → Integrations (hub or mesh):

```
Authorization: Bearer <session_token>
```

---

# 6. **Mobile (Capacitor) Integration Specification**

### **6.1. Use Capacitor Browser API for OAuth**
Flow:

1. Open OAuth login in native browser  
2. Provider redirects to Identity App callback  
3. Identity App redirects to custom URL scheme:  
   `foundationerp://auth/callback?token=...`  
4. Capacitor intercepts  
5. Store token in secure storage  

### **6.2. Use secure storage**
- iOS Keychain  
- Android Keystore  

### **6.3. Pass token to SvelteKit mobile build**
Inject via:

- JS bridge  
- Or cookie injection  

---

# 7. **Security Requirements**

### **7.1. No passwords stored**
Identity App only stores:

- external_subject  
- provider  
- email  

### **7.2. Token validation**
- Validate signature  
- Validate issuer  
- Validate audience  
- Validate nonce  

### **7.3. HTTPS only**
All identity endpoints must be HTTPS.

### **7.4. CSRF protection**
Use state parameter in OAuth flow.

---

# 8. **Event Metadata Specification**

Every event emitted by any domain service must include:

```
actor_identity_id
actor_email
actor_h2r_employee_id
actor_authority_tier (future)
actor_risk_level (from governance)
```

This is constitutional and required for:

- replay  
- audit  
- compliance  
- governance  
- AI-driven UI personalization  

---

# 9. **Rollout Plan**

### **Phase 1 — Identity App**
- Build identity_user table  
- Implement OAuth login  
- Implement session tokens  
- Implement H2R linking  

### **Phase 2 — SvelteKit Integration**
- Replace login with OAuth  
- Add identity-aware Canvas  
- Pass identity to Integrations (hub or mesh)  

### **Phase 3 — Mobile Integration**
- Add OAuth login via Capacitor  
- Store tokens securely  
- Pass identity to Integrations (hub or mesh)  

### **Phase 4 — Governance Enhancements**
- Biometric confirmation  
- Risk-aware UI  
- Earned authority  

---

# 10. **What Developers Can Start Building Immediately**

### **Backend (Identity App)**
- identity_user table  
- OAuth provider integration  
- Token issuing  
- Token validation  
- Identity resolution  
- H2R linking  

### **Frontend (SvelteKit)**
- OAuth login button  
- Callback handler  
- Session token storage  
- Integrations (hub or mesh) request identity injection  

### **Mobile (Capacitor)**
- OAuth login via Browser API  
- Token storage  
- Token injection into SvelteKit  







