import { writable } from 'svelte/store';

export type LinaConsoleLevel = 'info' | 'error';

export interface LinaConsoleEntry {
	id: string;
	timestamp: string;
	level: LinaConsoleLevel;
	scope: 'session' | 'turn' | 'decision' | 'ui';
	message: string;
	payload?: unknown;
}

const MAX_ENTRIES = 250;

export const linaDevConsoleVisible = writable(false);
export const linaDevConsoleEntries = writable<LinaConsoleEntry[]>([]);

function nextId(): string {
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function addLinaConsoleEntry(
	level: LinaConsoleLevel,
	scope: LinaConsoleEntry['scope'],
	message: string,
	payload?: unknown
): void {
	const entry: LinaConsoleEntry = {
		id: nextId(),
		timestamp: new Date().toISOString(),
		level,
		scope,
		message,
		payload
	};

	linaDevConsoleEntries.update((items) => {
		const next = [entry, ...items];
		return next.slice(0, MAX_ENTRIES);
	});
}

export function clearLinaConsoleEntries(): void {
	linaDevConsoleEntries.set([]);
}
