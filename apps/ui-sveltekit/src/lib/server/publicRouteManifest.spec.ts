import { describe, expect, it } from 'vitest';

import { isPublicRequest } from './publicRouteManifest';

describe('isPublicRequest', () => {
	it('allows home and documentation pages', () => {
		expect(isPublicRequest('/', 'GET')).toBe(true);
		expect(isPublicRequest('/documentation', 'GET')).toBe(true);
		expect(isPublicRequest('/documentation/content', 'GET')).toBe(true);
		expect(isPublicRequest('/documentation/content/identity', 'GET')).toBe(true);
	});

	it('allows public page data endpoints for whitelisted pages', () => {
		expect(isPublicRequest('/documentation/__data.json', 'GET')).toBe(true);
		expect(isPublicRequest('/documentation/content/identity/__data.json', 'GET')).toBe(true);
	});

	it('denies protected pages by default', () => {
		expect(isPublicRequest('/dashboard', 'GET')).toBe(false);
		expect(isPublicRequest('/admin', 'GET')).toBe(false);
	});

	it('denies api routes by default', () => {
		expect(isPublicRequest('/api/hub/events', 'GET')).toBe(false);
		expect(isPublicRequest('/api/navigator/health', 'GET')).toBe(false);
	});

	it('always allows options requests', () => {
		expect(isPublicRequest('/dashboard', 'OPTIONS')).toBe(true);
		expect(isPublicRequest('/api/hub/events', 'OPTIONS')).toBe(true);
	});
});
