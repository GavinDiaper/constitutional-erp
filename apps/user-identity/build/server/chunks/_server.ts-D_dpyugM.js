import { r as redirect } from './index-DD4jk626.js';

const IDENTITY_BASE_URL = (process.env.IDENTITY_BASE_URL ?? "http://localhost:4008").replace(/\/$/, "");
const UI_SVELTEKIT_BASE_URL = (process.env.UI_SVELTEKIT_BASE_URL ?? "http://localhost:4173").replace(/\/$/, "");
const UI_CALLBACK_PATH = process.env.UI_CALLBACK_PATH ?? "/auth/callback";
function getIdentityBaseUrl() {
  return IDENTITY_BASE_URL;
}
function buildUiCallbackUrl() {
  return `${UI_SVELTEKIT_BASE_URL}${UI_CALLBACK_PATH}`;
}
const GET = async ({ params, url }) => {
  const provider = params.provider;
  if (!["google", "microsoft", "apple"].includes(provider)) {
    throw redirect(302, "/");
  }
  const nextPath = url.searchParams.get("next")?.trim() || "/dashboard";
  const callbackUrl = new URL(buildUiCallbackUrl());
  callbackUrl.searchParams.set("next", nextPath.startsWith("/") ? nextPath : "/dashboard");
  const loginUrl = new URL(`${getIdentityBaseUrl()}/auth/login/${provider}`);
  loginUrl.searchParams.set("next", callbackUrl.toString());
  loginUrl.searchParams.set("email", url.searchParams.get("email") ?? `demo.${provider}@constitutionalerp.local`);
  throw redirect(302, loginUrl.toString());
};

export { GET };
//# sourceMappingURL=_server.ts-D_dpyugM.js.map
