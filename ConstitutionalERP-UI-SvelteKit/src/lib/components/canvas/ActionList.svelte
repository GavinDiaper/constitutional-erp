<script lang="ts">
	import GovernanceBadge from '$lib/components/canvas/GovernanceBadge.svelte';
	import type { HubActionLink } from '$lib/types/hub';

	export let actions: Array<{ name: string; link: HubActionLink }> = [];
	export let onExecute: ((action: { name: string; link: HubActionLink }, payload: Record<string, unknown>) => Promise<void>) | null = null;
	export let executingActionName = '';

	let inputValues: Record<string, Record<string, string>> = {};
	// undefined = not yet fetched; null = fetch failed/empty; [...] = fetched with results
	let lookupOptions: Record<string, Array<{ value: string; label: string }> | null> = {};

	function parseEntityIdFromActionHref(href: string): string | null {
		const match = href.match(/\/process\/[^/]+\/([^/]+)\/actions\//i);
		if (!match || !match[1]) {
			return null;
		}
		return decodeURIComponent(match[1]);
	}

	function resolveLookupUrl(lookup: string | undefined, action: { name: string; link: HubActionLink }): string | undefined {
		if (!lookup) {
			return undefined;
		}

		let resolved = lookup;
		if (resolved.includes('{entityId}')) {
			const entityId = parseEntityIdFromActionHref(action.link.href);
			if (!entityId) {
				return undefined;
			}
			resolved = resolved.replaceAll('{entityId}', encodeURIComponent(entityId));
		}

		if (resolved === 'p2p/suppliers') {
			return `${resolved}?activeOnly=true`;
		}

		return resolved;
	}

	function mapLookupRows(rows: unknown[]): Array<{ value: string; label: string }> {
		return (rows as Record<string, string>[])
			.filter((r) => !r.status || !['Suspended', 'Inactive'].includes(r.status))
			.map((r) => {
				const value =
					r.value ??
					r.taxCodeId ??
					r.tax_code_id ??
					r.supplier_id ??
					r.id ??
					String(r);

				const label =
					r.label ??
					(r.supplier_name
						? `${r.supplier_name} (${r.supplier_id ?? r.id})`
						: r.code && r.ratePercent
							? `${r.label ?? r.code} [${r.code}]`
							: String(value));

				return { value: String(value), label: String(label) };
			});
	}

	async function fetchLookups(currentActions: typeof actions): Promise<void> {
		for (const action of currentActions) {
			for (const schema of Object.values(action.link.inputSchema?.properties ?? {})) {
				const lookup = schema['x-lookup'];
				const lookupUrl = resolveLookupUrl(lookup, action);
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
							let mapped = mapLookupRows(rows);

							if (lookupUrl === 'p2p/suppliers?activeOnly=true' && mapped.length === 0) {
								const fallbackRes = await fetch('/api/hub/p2p/suppliers');
								if (fallbackRes.ok) {
									const fallbackJson = await fallbackRes.json();
									const fallbackRows: unknown[] = Array.isArray(fallbackJson.data) ? fallbackJson.data : [];
									mapped = mapLookupRows(fallbackRows);
								}
							}
						lookupOptions = {
							...lookupOptions,
								[lookupUrl]: mapped
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

	function isReady(
		action: { name: string; link: HubActionLink },
		vals: typeof inputValues
	): boolean {
		const required = action.link.inputSchema?.required ?? [];
		return required.every((field) => (vals[action.name]?.[field] ?? '').trim() !== '');
	}

	function coerceValue(rawValue: string, schema: { type?: string } | undefined): unknown {
		if (schema?.type === 'number' || schema?.type === 'integer') {
			const numeric = Number(rawValue);
			return Number.isFinite(numeric) ? numeric : rawValue;
		}

		if (schema?.type === 'boolean') {
			if (rawValue === 'true') return true;
			if (rawValue === 'false') return false;
		}

		return rawValue;
	}

	function getInputType(schema: { type?: string } | undefined): 'text' | 'number' {
		return schema?.type === 'number' || schema?.type === 'integer' ? 'number' : 'text';
	}

		function hasEnum(schema: { enum?: string[] } | undefined): boolean {
			return Array.isArray(schema?.enum) && schema.enum.length > 0;
		}

	function handleRun(action: { name: string; link: HubActionLink }): void {
		const payload: Record<string, unknown> = {};
		for (const field of Object.keys(action.link.inputSchema?.properties ?? {})) {
			const val = inputValues[action.name]?.[field];
			if (val !== undefined && val.trim() !== '') {
				payload[field] = coerceValue(val, action.link.inputSchema?.properties?.[field]);
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
										{@const lookupKey = resolveLookupUrl(xLookup, action)}
										{@const fetchedOptions = lookupKey ? lookupOptions[lookupKey] : undefined}
										<label class="block">
											<span class="mb-0.5 block text-xs font-medium text-white/80"
												>{field} <span class="text-red-400">*</span></span
											>
												{#if hasEnum(fieldSchema)}
													<select
														class="w-full rounded border border-white/20 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-white/40"
														value={getInput(action.name, field)}
														on:change={(e) => setInput(action.name, field, (e.target as HTMLSelectElement).value)}
														on:input={(e) => setInput(action.name, field, (e.target as HTMLSelectElement).value)}
													>
														<option value="">— select —</option>
														{#each fieldSchema?.enum ?? [] as enumValue}
															<option value={enumValue}>{enumValue}</option>
														{/each}
													</select>
												{:else if xLookup && fetchedOptions === undefined}
												<select
													class="w-full rounded border border-white/20 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-white/40"
													disabled
												>
													<option value="">Loading...</option>
												</select>
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
											{:else if xLookup}
												<select
													class="w-full rounded border border-white/20 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-white/40"
													disabled
												>
													<option value="">No lookup options available</option>
												</select>
											{:else}
												<input
													type={getInputType(fieldSchema)}
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
										{@const lookupKey = resolveLookupUrl(xLookup, action)}
										{@const fetchedOptions = lookupKey ? lookupOptions[lookupKey] : undefined}
										<label class="block">
											<span class="mb-0.5 block text-xs font-medium text-white/60">{field}</span>
												{#if hasEnum(fieldSchema)}
													<select
														class="w-full rounded border border-white/20 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-white/40"
														value={getInput(action.name, field)}
														on:change={(e) => setInput(action.name, field, (e.target as HTMLSelectElement).value)}
														on:input={(e) => setInput(action.name, field, (e.target as HTMLSelectElement).value)}
													>
														<option value="">— optional —</option>
														{#each fieldSchema?.enum ?? [] as enumValue}
															<option value={enumValue}>{enumValue}</option>
														{/each}
													</select>
												{:else if xLookup && fetchedOptions !== null && fetchedOptions !== undefined && fetchedOptions.length > 0}
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
											{:else if xLookup && fetchedOptions === undefined}
												<select
													class="w-full rounded border border-white/20 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-white/40"
													disabled
												>
													<option value="">Loading...</option>
												</select>
											{:else if xLookup}
												<select
													class="w-full rounded border border-white/20 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-white/40"
													disabled
												>
													<option value="">No lookup options available</option>
												</select>
											{:else}
												<input
													type={getInputType(fieldSchema)}
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
						<div class="flex shrink-0 flex-col items-end gap-1">
							<div class="flex items-center gap-2">
								<GovernanceBadge
									riskLevel={action.link.governance?.riskLevel}
									requiredTier={action.link.governance?.requiredTier}
								/>
								<button
									type="button"
									class="rounded-md border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold text-white enabled:hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
									on:click={() => handleRun(action)}
									disabled={!onExecute || executingActionName === action.name || !isReady(action, inputValues)}
								>
									{executingActionName === action.name ? 'Running...' : 'Run'}
								</button>
							</div>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>
