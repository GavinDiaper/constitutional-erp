<script lang="ts">
	import GovernanceBadge from '$lib/components/canvas/GovernanceBadge.svelte';
	import type { HubActionLink } from '$lib/types/hub';

	export let actions: Array<{ name: string; link: HubActionLink }> = [];
	export let onExecute: ((action: { name: string; link: HubActionLink }, payload: Record<string, unknown>) => Promise<void>) | null = null;
	export let executingActionName = '';

	let inputValues: Record<string, Record<string, string>> = {};

	function getInput(actionName: string, field: string): string {
		return inputValues[actionName]?.[field] ?? '';
	}

	function setInput(actionName: string, field: string, value: string): void {
		inputValues = {
			...inputValues,
			[actionName]: { ...inputValues[actionName], [field]: value }
		};
	}

	function isReady(action: { name: string; link: HubActionLink }): boolean {
		const required = action.link.inputSchema?.required ?? [];
		return required.every((field) => (inputValues[action.name]?.[field] ?? '').trim() !== '');
	}

	function handleRun(action: { name: string; link: HubActionLink }): void {
		const payload: Record<string, unknown> = {};
		for (const field of Object.keys(action.link.inputSchema?.properties ?? {})) {
			const val = inputValues[action.name]?.[field];
			if (val !== undefined && val.trim() !== '') {
				payload[field] = val;
			}
		}
		onExecute?.(action, payload);
	}
</script>

<section class="glass-panel p-4">
	<h3 class="text-lg font-semibold">Allowed Actions</h3>
	{#if actions.length === 0}
		<p class="muted mt-2 text-sm">No actionable links available.</p>
	{:else}
		<ul class="mt-3 space-y-3">
			{#each actions as action (action.name)}
				{@const requiredFields = action.link.inputSchema?.required ?? []}
				{@const allFields = Object.keys(action.link.inputSchema?.properties ?? {})}
				{@const optionalFields = allFields.filter((f) => !requiredFields.includes(f))}
				<li class="rounded-md border border-white/15 bg-white/5 p-3">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<p class="font-semibold">{action.name}</p>
							<p class="muted mt-1 text-xs">{action.link.method ?? 'GET'} {action.link.href}</p>
							{#if requiredFields.length > 0 || optionalFields.length > 0}
								<div class="mt-2 space-y-1.5">
									{#each requiredFields as field}
										<label class="block">
											<span class="mb-0.5 block text-xs font-medium text-white/80"
												>{field} <span class="text-red-400">*</span></span
											>
											<input
												type="text"
												class="w-full rounded border border-white/20 bg-white/10 px-2 py-1 text-xs text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-white/40"
												placeholder={action.link.inputSchema?.properties?.[field]?.description ?? field}
												value={getInput(action.name, field)}
												on:input={(e) => setInput(action.name, field, (e.target as HTMLInputElement).value)}
											/>
										</label>
									{/each}
									{#each optionalFields as field}
										<label class="block">
											<span class="mb-0.5 block text-xs font-medium text-white/60">{field}</span>
											<input
												type="text"
												class="w-full rounded border border-white/20 bg-white/10 px-2 py-1 text-xs text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-white/40"
												placeholder={action.link.inputSchema?.properties?.[field]?.description ?? field}
												value={getInput(action.name, field)}
												on:input={(e) => setInput(action.name, field, (e.target as HTMLInputElement).value)}
											/>
										</label>
									{/each}
								</div>
							{/if}
						</div>
						<div class="flex shrink-0 items-center gap-2">
							<GovernanceBadge
								riskLevel={action.link.governance?.riskLevel}
								requiredTier={action.link.governance?.requiredTier}
							/>
							<button
								type="button"
								class="rounded-md border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold text-white enabled:hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
								on:click={() => handleRun(action)}
								disabled={!onExecute || executingActionName === action.name || !isReady(action)}
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
