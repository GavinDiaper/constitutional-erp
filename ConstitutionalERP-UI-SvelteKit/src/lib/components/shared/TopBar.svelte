<script lang="ts">
	import { actorOptions, actorStore, setActorById } from '$lib/stores/actorStore';

	function onActorChange(event: Event): void {
		const target = event.target as HTMLSelectElement;
		setActorById(target.value);
	}
</script>

<header class="glass-panel mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
	<div>
		<p class="text-xs uppercase tracking-[0.24em] text-white/70">ConstitutionalERP</p>
		<h1 class="text-xl font-semibold">Canvas Operations Center</h1>
	</div>

	<div class="flex items-center gap-2">
		<label class="text-sm text-white/80" for="actor-picker">Actor</label>
		<select
			id="actor-picker"
			class="rounded-md border border-white/30 bg-[#112946] px-3 py-2 text-sm"
			on:change={onActorChange}
			value={$actorStore.actorId}
		>
			{#each actorOptions as actor (actor.actorId)}
				<option value={actor.actorId}>{actor.actorId} (Tier {actor.authorityTier})</option>
			{/each}
		</select>
	</div>
</header>
