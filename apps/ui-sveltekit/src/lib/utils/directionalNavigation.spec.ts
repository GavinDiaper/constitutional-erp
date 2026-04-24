import { describe, expect, it } from 'vitest';
import { cycleIndex, toDirectionalKey } from '$lib/utils/directionalNavigation';

describe('directionalNavigation', () => {
	it('maps keys to navigation intents', () => {
		expect(toDirectionalKey('ArrowRight')).toBe('next');
		expect(toDirectionalKey('ArrowUp')).toBe('previous');
		expect(toDirectionalKey('Enter')).toBe('activate');
		expect(toDirectionalKey('x')).toBe('none');
	});

	it('cycles forward and backward', () => {
		expect(cycleIndex(0, 3, 'next')).toBe(1);
		expect(cycleIndex(2, 3, 'next')).toBe(0);
		expect(cycleIndex(0, 3, 'previous')).toBe(2);
	});
});
