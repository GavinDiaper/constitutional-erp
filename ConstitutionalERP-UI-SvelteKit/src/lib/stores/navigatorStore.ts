import { writable } from 'svelte/store';

export interface NavigatorEntry {
	id: string;
	type: 'proposal' | 'simulation' | 'decision' | 'execution';
	message: string;
	timestamp: string;
}

export const navigatorStore = writable<NavigatorEntry[]>([]);
