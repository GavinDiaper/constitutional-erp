import { derived, writable } from 'svelte/store';
import {
	LINA_MODE_OPTIONS,
	LINA_ROLE_OPTIONS,
	type LinaActionOption,
	type LinaMode
} from '$lib/types/lina';

export const selectedLinaRole = writable<string>(LINA_ROLE_OPTIONS[0].id);
export const selectedLinaMode = writable<LinaMode>(LINA_MODE_OPTIONS[0].id);
export const selectedLinaActionId = writable<string | null>(null);
export const linaActionOptions = writable<LinaActionOption[]>([]);

export const selectedLinaRoleLabel = derived(selectedLinaRole, (roleId) => {
	return LINA_ROLE_OPTIONS.find((item) => item.id === roleId)?.label ?? roleId;
});

export const selectedLinaModeLabel = derived(selectedLinaMode, (modeId) => {
	return LINA_MODE_OPTIONS.find((item) => item.id === modeId)?.label ?? modeId;
});

export function setLinaActions(actions: LinaActionOption[]): void {
	linaActionOptions.set(actions);
	selectedLinaActionId.set(actions[0]?.id ?? null);
}
