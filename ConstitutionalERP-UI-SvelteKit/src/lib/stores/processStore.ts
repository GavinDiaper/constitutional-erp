import { writable } from 'svelte/store';
import type { ProcessResponse } from '$lib/types/hub';

export const emptyProcess: ProcessResponse = {
	entityType: '',
	entityId: '',
	state: '',
	attributes: {},
	_links: {}
};

export const processStore = writable<ProcessResponse>(emptyProcess);
