import { describe, expect, it } from 'vitest';
import { buildHubHeaders, resolveHubConfig } from '$lib/server/hubProxy';

describe('resolveHubConfig', () => {
	it('uses provided env values', () => {
		const config = resolveHubConfig({
			HUB_BASE_URL: 'http://localhost:4321/api/v1',
			HUB_API_KEY: 'test-key',
			HUB_INGRESS_ID: 'test-ingress'
		});

		expect(config.baseUrl).toBe('http://localhost:4321/api/v1');
		expect(config.apiKey).toBe('test-key');
		expect(config.ingressId).toBe('test-ingress');
	});

	it('falls back to defaults when env values are missing', () => {
		const config = resolveHubConfig({});

		expect(config.baseUrl).toBe('http://localhost:3000/api/v1');
		expect(config.apiKey).toBe('change-me');
		expect(config.ingressId).toBe('foundation-ingress');
	});
});

describe('buildHubHeaders', () => {
	it('injects required defaults and actor context', () => {
		const headers = new Headers({
			'x-actor-id': 'principal.o2c-tier2',
			'x-actor-tier': '2'
		});

		const forwarded = buildHubHeaders(headers, {
			baseUrl: 'http://localhost:3000/api/v1',
			apiKey: 'api-key',
			ingressId: 'foundation-ingress'
		});

		expect(forwarded.get('x-api-key')).toBe('api-key');
		expect(forwarded.get('x-ingress-id')).toBe('foundation-ingress');
		expect(forwarded.get('x-actor-id')).toBe('principal.o2c-tier2');
		expect(forwarded.get('x-actor-tier')).toBe('2');
	});
});
