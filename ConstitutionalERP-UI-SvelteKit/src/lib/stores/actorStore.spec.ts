import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { actorStore, setActorById } from '$lib/stores/actorStore';

describe('actorStore', () => {
	it('selects a configured actor by id', () => {
		setActorById('actor.ap');

		expect(get(actorStore).actorId).toBe('actor.ap');
		expect(get(actorStore).authorityTier).toBe(3);
	});

	it('falls back to principal.system when actor id is unknown', () => {
		setActorById('does-not-exist');

		expect(get(actorStore).actorId).toBe('principal.system');
		expect(get(actorStore).authorityTier).toBe(5);
	});
});
