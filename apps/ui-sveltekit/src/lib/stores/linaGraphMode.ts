import { derived } from 'svelte/store';
import { selectedLinaMode } from '$lib/stores/linaUiState';

export type LinaGraphMode = 'plan' | 'explore' | 'status';

export function mapLinaModeToGraphMode(mode: 'create' | 'select' | 'investigate' | 'fix' | 'advance'): LinaGraphMode {
	switch (mode) {
		case 'create':
		case 'select':
			return 'explore';
		case 'fix':
			return 'status';
		case 'investigate':
		case 'advance':
		default:
			return 'plan';
	}
}

export const linaGraphMode = derived(selectedLinaMode, (mode) => mapLinaModeToGraphMode(mode));
