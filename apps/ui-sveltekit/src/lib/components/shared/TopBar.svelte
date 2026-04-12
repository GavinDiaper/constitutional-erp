<script lang="ts">
	import { resolve } from '$app/paths';
	import { actorOptions, actorStore, setActorById } from '$lib/stores/actorStore';
	import { themeStore } from '$lib/stores/themeStore';

	function onActorChange(event: Event): void {
		const target = event.target as HTMLSelectElement;
		setActorById(target.value);
	}
</script>

<header class="glass-panel mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
	<div>
		<p class="text-xs uppercase tracking-[0.24em] opacity-70">ConstitutionalERP</p>
		<h1 class="text-xl font-semibold">Canvas Operations Center</h1>
	</div>

	<div class="flex items-center gap-3">
		<!-- Theme toggle -->
		<button
			type="button"
			class="btn-ghost flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs"
			title={$themeStore === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
			on:click={() => themeStore.toggleTheme()}
			aria-label="Toggle theme"
		>
			{#if $themeStore === 'dark'}
				<!-- Sun icon -->
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<circle cx="12" cy="12" r="4"/>
					<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
				</svg>
				<span>Light</span>
			{:else}
				<!-- Moon icon -->
				<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
				</svg>
				<span>Dark</span>
			{/if}
		</button>

		<label class="text-sm opacity-80" for="actor-picker">Actor</label>
		<select
			id="actor-picker"
			class="input-base"
			on:change={onActorChange}
			value={$actorStore.actorId}
		>
			{#each actorOptions as actor (actor.actorId)}
				<option value={actor.actorId}>{actor.actorId} (Tier {actor.authorityTier})</option>
			{/each}
		</select>

		<a
			href={resolve('/auth/logout')}
			data-sveltekit-preload-data="off"
			class="btn-ghost rounded-md px-2.5 py-1.5 text-xs"
			title="Sign out"
		>
			Sign out
		</a>
	</div>
</header>
