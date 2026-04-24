<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { LINA_ROLE_OPTIONS } from '$lib/types/lina';

	export let selectedRoleId = LINA_ROLE_OPTIONS[0].id;

	const dispatch = createEventDispatcher<{ select: { roleId: string } }>();

	function choose(roleId: string): void {
		dispatch('select', { roleId });
	}
</script>

<section class="section-card p-3">
	<p class="text-xs uppercase tracking-[0.16em] ui-muted">Role</p>
	<div class="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
		{#each LINA_ROLE_OPTIONS as role (role.id)}
			<button
				type="button"
				class="item-card rounded-md p-3 text-left"
				class:btn-ghost-active={selectedRoleId === role.id}
				on:click={() => choose(role.id)}
			>
				<p class="text-sm font-semibold">{role.label}</p>
				<p class="mt-1 text-xs ui-muted">{role.description}</p>
			</button>
		{/each}
	</div>
</section>
