const IDENTITY_BASE_URL = (process.env.IDENTITY_BASE_URL ?? 'http://localhost:4008').replace(/\/$/, '');
const UI_SVELTEKIT_BASE_URL = (process.env.UI_SVELTEKIT_BASE_URL ?? 'http://localhost:4173').replace(/\/$/, '');
const UI_CALLBACK_PATH = process.env.UI_CALLBACK_PATH ?? '/auth/callback';

export function getIdentityBaseUrl(): string {
	return IDENTITY_BASE_URL;
}

export function buildUiCallbackUrl(): string {
	return `${UI_SVELTEKIT_BASE_URL}${UI_CALLBACK_PATH}`;
}
