## 1. Architecture overview

**Pattern:** SvelteKit runs as a web app inside a Capacitor WebView. Capacitor provides:

- Native shell (iOS/Android)  
- Access to device APIs (storage, camera, biometrics, notifications)  
- Build tooling for App Store / Play Store  

**Key idea:**  
The mobile app is a **thin native container** around the existing SvelteKit Canvas UI.

---

## 2. Project structure

Recommended layout:

```text
foundationerp/
  apps/
    web/              # existing SvelteKit app
    mobile/           # new Capacitor shell
  packages/
    shared/           # shared types, utilities (optional)
```

- `apps/web` – no structural changes, but we’ll add a mobile build target.
- `apps/mobile` – Capacitor project (iOS + Android) that loads the SvelteKit app.

---

## 3. SvelteKit: mobile build target

### 3.1. Add a static/mobile build

If you’re using SvelteKit with an adapter (e.g., `@sveltejs/adapter-node`), add a **mobile adapter** configuration that builds to static assets for Capacitor to serve locally or via a local web server.

Example `svelte.config.js` snippet:

```js
import adapter from '@sveltejs/adapter-static';

const config = {
  kit: {
    adapter: adapter({
      pages: 'build-mobile',
      assets: 'build-mobile',
      fallback: 'index.html'
    }),
    paths: {
      base: ''
    }
  }
};

export default config;
```

Build command for mobile:

```bash
pnpm build:mobile  # or npm/yarn
# runs: svelte-kit build --config svelte.config.js (mobile variant)
```

Output: `apps/web/build-mobile/` – this is what Capacitor will serve.

---

## 4. Capacitor app setup

### 4.1. Initialize Capacitor project

In `apps/mobile`:

```bash
npm init @capacitor/app
# or
npx @capacitor/cli init foundationerp-mobile com.yourorg.foundationerp
```

Set:

- **App name:** `FoundationERP`
- **App ID:** `com.yourorg.foundationerp`

### 4.2. Configure Capacitor to use SvelteKit build

In `apps/mobile/capacitor.config.ts`:

```ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yourorg.foundationerp',
  appName: 'FoundationERP',
  webDir: '../web/build-mobile',   // relative path to SvelteKit mobile build
  bundledWebRuntime: false
};

export default config;
```

### 4.3. Add platforms

From `apps/mobile`:

```bash
npx cap add ios
npx cap add android
```

---

## 5. Mobile runtime behavior

### 5.1. App startup flow

1. Native app launches (iOS/Android).
2. Capacitor loads `../web/build-mobile/index.html` into WebView.
3. SvelteKit bootstraps as usual.
4. SvelteKit calls existing backend (Mesh, APIs) over HTTPS.

No business logic moves into the mobile shell.

### 5.2. Environment configuration

Use environment variables or config files to distinguish:

- `MOBILE` vs `WEB` runtime
- API base URL (e.g., `https://api.foundationerp.company`)

Example in SvelteKit:

```ts
export const isMobile = typeof navigator !== 'undefined' && navigator.userAgent.includes('Capacitor');
```

Use this to tweak minor UX (e.g., mobile-specific layouts) if needed.

---

## 6. Authentication

### 6.1. Approach

Use the **same auth mechanism** as web (OIDC/OAuth2), but:

- Tokens stored via Capacitor’s secure storage plugin.
- SvelteKit reads tokens via a bridge or via cookie-based auth if backend supports it.

### 6.2. Implementation options

**Option A – Cookie-based auth (simplest):**

- Mobile WebView behaves like a browser.
- Login flow happens inside WebView.
- Backend sets secure cookies.
- No special mobile handling required.

**Option B – Token-based auth with Capacitor Storage:**

1. Use Capacitor `@capacitor/preferences` or secure storage plugin.
2. On login, SvelteKit receives tokens and stores them via JS bridge.
3. All API calls include `Authorization: Bearer <token>`.

For now, **Option A** is usually enough if your backend supports browser-style sessions.

---

## 7. Governance & authority integration

No backend changes.

- Hypermedia responses already include risk and authority metadata.
- SvelteKit already renders governance-aware UI.
- Mobile app simply displays the same Canvas.

If you want mobile-specific affordances:

- Add badges/icons for risk levels.
- Require biometric confirmation (via Capacitor plugin) for high-risk actions:
  - Native side exposes a JS function `requestBiometricConfirm()`.
  - SvelteKit calls it before submitting certain actions.

---

## 8. Offline & caching (optional phase)

### 8.1. Basic caching

- Use Service Worker in SvelteKit mobile build for:
  - Static asset caching
  - Last Canvas state caching

### 8.2. Queued actions

- When offline, store user actions in IndexedDB or Capacitor Storage.
- On reconnect, replay actions to Mesh.
- Ensure idempotency via existing event-sourcing patterns.

This can be a later phase; not required for initial release.

---

## 9. Native capabilities (optional)

Add Capacitor plugins as needed:

- **Push notifications:** approvals, tasks, alerts.
- **Camera:** attach photos to records.
- **File system:** offline attachments.
- **Biometrics:** confirm high-risk actions.

Each plugin is:

1. Installed via npm.
2. Configured in `capacitor.config.ts`.
3. Exposed to SvelteKit via `window.Capacitor` or a small wrapper module.

---

## 10. Build & deployment pipeline

### 10.1. CI steps

1. `pnpm install` (root)
2. `pnpm --filter web build:mobile`
3. `cd apps/mobile`
4. `npx cap sync`
5. For iOS:
   - `npx cap open ios` → Xcode build/archive
6. For Android:
   - `npx cap open android` → Android Studio build/sign

### 10.2. Environments

- `DEV`: points to dev Mesh/API, debug builds.
- `UAT`: staging API, testflight/internal track.
- `PROD`: production API, App Store / Play Store.

Use environment-specific `capacitor.config.*.ts` or runtime config injection.

---

## 11. Phased delivery plan

**Phase 1 – Shell & parity**

- Add mobile build target in SvelteKit.
- Create Capacitor app.
- Load SvelteKit build in WebView.
- Ensure login + basic flows work.

**Phase 2 – Governance-aware UX**

- Add risk/authority visual cues optimized for mobile.
- Optional biometric confirmation for high-risk actions.

**Phase 3 – Offline & notifications**

- Add basic caching.
- Add push notifications for approvals/tasks.
- Optional queued actions.

