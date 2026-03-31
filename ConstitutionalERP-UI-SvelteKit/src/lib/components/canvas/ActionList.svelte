<script lang="ts">
	import GovernanceBadge from '$lib/components/canvas/GovernanceBadge.svelte';
	import type { HubActionLink } from '$lib/types/hub';

	export let actions: Array<{ name: string; link: HubActionLink }> = [];
	export let onExecute: ((action: { name: string; link: HubActionLink }, payload: Record<string, unknown>) => Promise<void>) | null = null;
	export let executingActionName = '';

	let inputValues: Record<string, Record<string, string>> = {};
	// undefined = not yet fetched; null = fetch failed/empty; [...] = fetched with results
	let lookupOptions: Record<string, Array<{ value: string; label: string }> | null> = {};

	async function fetchLookups(currentActions: typeof actions): Promise<void> {
		for (const action of currentActions) {
			for (const schema of Object.values(action.link.inputSchema?.properties ?? {})) {
				const lookup = schema['x-lookup'];
				const lookupUrl = lookup === 'p2p/suppliers' ? `${lookup}?activeOnly=true` : lookup;
				// Skip if already fetched (key present in lookupOptions, even as null)
				if (!lookup || !lookupUrl || lookupUrl in lookupOptions) {
					continue;
				}
				// Mark as in-flight by setting undefined-equivalent — use a sentinel value
				// by not setting it yet; concurrent calls are safe because we check above
				try {
					const res = await fetch(`/api/hub/${lookupUrl}`);
					if (res.ok) {
						const json = await res.json();
						const rows: unknown[] = Array.isArray(json.data) ? json.data : [];
						lookupOptions = {
							...lookupOptions,
							[lookupUrl]: (rows as Record<string, string>[])
								.filter((r) => !r.status || !['Suspended', 'Inactive'].includes(r.status))
								.map((r) => ({
									value: r.supplier_id ?? r.id ?? String(r),
									label: r.supplier_name
										? `${r.supplier_name} (${r.supplier_id ?? r.id})`
										: String(r.supplier_id ?? r.id ?? r)
								}))
						};
					} else {
						lookupOptions = { ...lookupOptions, [lookupUrl]: null };
					}
				} catch {
					lookupOptions = { ...lookupOptions, [lookupUrl]: null };
				}
			}
		}
	}

	$: void fetchLookups(actions);

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
										{@const fieldSchema = action.link.inputSchema?.properties?.[field]}
										{@const xLookup = fieldSchema?.['x-lookup']}
										{@const lookupKey = xLookup === 'p2p/suppliers' ? `${xLookup}?activeOnly=true` : xLookup}
										{@const fetchedOptions = lookupKey ? lookupOptions[lookupKey] : undefined}
										<label class="block">
											<span class="mb-0.5 block text-xs font-medium text-white/80"
												>{field} <span class="text-red-400">*</span></span
											>
											{#if xLookup && fetchedOptions === undefined}
												<input
													type="text"
													class="w-full rounded border border-white/20 bg-white/10 px-2 py-1 text-xs text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-white/40"
													placeholder="Loading…"
													disabled
												/>
											{:else if xLookup && fetchedOptions !== null && fetchedOptions !== undefined && fetchedOptions.length > 0}
												<select
													class="w-full rounded border border-white/20 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-white/40"
													value={getInput(action.name, field)}
													on:change={(e) => setInput(action.name, field, (e.target as HTMLSelectElement).value)}
													on:input={(e) => setInput(action.name, field, (e.target as HTMLSelectElement).value)}
												>
													<option value="">— select —</option>
													{#each fetchedOptions as opt}
														<option value={opt.value}>{opt.label}</option>
													{/each}
												</select>
											{:else}
												<input
													type="text"
													class="w-full rounded border border-white/20 bg-white/10 px-2 py-1 text-xs text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-white/40"
													placeholder={fieldSchema?.description ?? field}
													value={getInput(action.name, field)}
													on:input={(e) => setInput(action.name, field, (e.target as HTMLInputElement).value)}
												/>
											{/if}
										</label>
									{/each}
									{#each optionalFields as field}
										{@const fieldSchema = action.link.inputSchema?.properties?.[field]}
										{@const xLookup = fieldSchema?.['x-lookup']}
										{@const lookupKey = xLookup === 'p2p/suppliers' ? `${xLookup}?activeOnly=true` : xLookup}
										{@const fetchedOptions = lookupKey ? lookupOptions[lookupKey] : undefined}
										<label class="block">
											<span class="mb-0.5 block text-xs font-medium text-white/60">{field}</span>
											{#if xLookup && fetchedOptions !== null && fetchedOptions !== undefined && fetchedOptions.length > 0}
												<select
													class="w-full rounded border border-white/20 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-white/40"
													value={getInput(action.name, field)}
													on:change={(e) => setInput(action.name, field, (e.target as HTMLSelectElement).value)}
													on:input={(e) => setInput(action.name, field, (e.target as HTMLSelectElement).value)}
												>
													<option value="">— optional —</option>
													{#each fetchedOptions as opt}
														<option value={opt.value}>{opt.label}</option>
													{/each}
												</select>
											{:else}
												<input
													type="text"
													class="w-full rounded border border-white/20 bg-white/10 px-2 py-1 text-xs text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-white/40"
													placeholder={fieldSchema?.description ?? field}
													value={getInput(action.name, field)}
													on:input={(e) => setInput(action.name, field, (e.target as HTMLInputElement).value)}
												/>
											{/if}
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
