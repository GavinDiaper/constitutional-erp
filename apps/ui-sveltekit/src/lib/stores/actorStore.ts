import { writable } from 'svelte/store';

export interface ActorContext {
	actorId: string;
	authorityTier: number;
}

export const actorOptions: ActorContext[] = [
	{ actorId: 'principal.system', authorityTier: 5 },
	{ actorId: 'principal.p2p-tier1', authorityTier: 1 },
	{ actorId: 'principal.p2p-tier3', authorityTier: 3 },
	{ actorId: 'principal.o2c-tier2', authorityTier: 2 },
	{ actorId: 'principal.o2c-tier3', authorityTier: 3 },
	{ actorId: 'principal.o2c-tier4', authorityTier: 4 },
	{ actorId: 'principal.proj-tier1', authorityTier: 1 },
	{ actorId: 'principal.proj-tier2', authorityTier: 2 },
	{ actorId: 'principal.proj-tier3', authorityTier: 3 },
	{ actorId: 'principal.h2r-tier2', authorityTier: 2 },
	{ actorId: 'principal.r2r-tier3', authorityTier: 3 }
];

export const actorStore = writable<ActorContext>(actorOptions[0]);

export function setActorById(actorId: string): void {
	const selected = actorOptions.find((actor) => actor.actorId === actorId) ?? actorOptions[0];
	actorStore.set(selected);
}
