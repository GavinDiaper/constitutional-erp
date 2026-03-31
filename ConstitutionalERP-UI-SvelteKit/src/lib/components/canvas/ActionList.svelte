<script lang="ts">
	import GovernanceBadge from '$lib/components/canvas/GovernanceBadge.svelte';
	import type { HubActionLink } from '$lib/types/hub';

	export let actions: Array<{ name: string; link: HubActionLink }> = [];
	export let onExecute: ((action: { name: string; link: HubActionLink }) => Promise<void>) | null = null;
	export let executingActionName = '';
</script>

<section class="glass-panel p-4">
	<h3 class="text-lg font-semibold">Allowed Actions</h3>
	{#if actions.length === 0}
		<p class="muted mt-2 text-sm">No actionable links available.</p>
	{:else}
		<ul class="mt-3 space-y-3">
			{#each actions as action (action.name)}
				<li class="rounded-md border border-white/15 bg-white/5 p-3">
					<div class="flex items-start justify-between gap-3">
						<div>
							<p class="font-semibold">{action.name}</p>
							<p class="muted mt-1 text-xs">{action.link.method ?? 'GET'} {action.link.href}</p>
						</div>
						<div class="flex items-center gap-2">
							<GovernanceBadge
								riskLevel={action.link.governance?.riskLevel}
								requiredTier={action.link.governance?.requiredTier}
							/>
							<button
								type="button"
								class="rounded-md border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold text-white enabled:hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
								on:click={() => onExecute?.(action)}
								disabled={!onExecute || executingActionName === action.name}
							>
								{executingActionName === action.name ? 'Running...' : 'Run'}
							</button>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>
