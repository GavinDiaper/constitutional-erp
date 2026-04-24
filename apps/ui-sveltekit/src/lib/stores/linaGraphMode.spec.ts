import { describe, expect, it } from 'vitest';
import { mapLinaModeToGraphMode } from '$lib/stores/linaGraphMode';

describe('mapLinaModeToGraphMode', () => {
	it('maps create/select to explore', () => {
		expect(mapLinaModeToGraphMode('create')).toBe('explore');
		expect(mapLinaModeToGraphMode('select')).toBe('explore');
	});

	it('maps investigate/advance to plan', () => {
		expect(mapLinaModeToGraphMode('investigate')).toBe('plan');
		expect(mapLinaModeToGraphMode('advance')).toBe('plan');
	});

	it('maps fix to status', () => {
		expect(mapLinaModeToGraphMode('fix')).toBe('status');
	});
});
