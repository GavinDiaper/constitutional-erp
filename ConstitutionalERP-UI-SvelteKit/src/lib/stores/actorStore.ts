import { writable } from 'svelte/store';

export interface ActorContext {
	actorId: string;
	authorityTier: number;
}

export const actorOptions: ActorContext[] = [
	{ actorId: 'principal.system', authorityTier: 5 },
	{ actorId: 'actor.ap', authorityTier: 3 },
	{ actorId: 'actor.sales', authorityTier: 2 },
	{ actorId: 'actor.finance', authorityTier: 4 },
	{ actorId: 'actor.hr', authorityTier: 3 }
];

export const actorStore = writable<ActorContext>(actorOptions[0]);

export function setActorById(actorId: string): void {
	const selected = actorOptions.find((actor) => actor.actorId === actorId) ?? actorOptions[0];
	actorStore.set(selected);
}
