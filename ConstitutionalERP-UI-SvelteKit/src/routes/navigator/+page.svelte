<script lang="ts">
	import { resolve } from '$app/paths';
	import { actorStore } from '$lib/stores/actorStore';
	import { rankActions, explainAction, type NavigatorContext, type RankedAction } from '$lib/api/navigator';

	const DOMAINS = ['O2C', 'P2P', 'R2R', 'H2R'];

	let domain = 'O2C';
	let aggregateType = '';
	let aggregateId = '';

	let loading = false;
	let errorMessage = '';

	let rankedActions: RankedAction[] = [];
	let selectedActionId = '';
	let explanation = '';
	let explanationLoading = false;
	let explanationError = '';

	function buildContext(): NavigatorContext {
		return {
			domain,
			aggregateType: aggregateType.trim(),
			aggregateId: aggregateId.trim(),
			actorId: $actorStore.actorId
		};
	}

	async function handleRank(): Promise<void> {
		if (!aggregateType.trim() || !aggregateId.trim()) {
			errorMessage = 'Aggregate type and ID are required.';
			return;
		}

		loading = true;
		errorMessage = '';
		rankedActions = [];
		selectedActionId = '';
		explanation = '';
		explanationError = '';

		try {
			const result = await rankActions(buildContext(), $actorStore);
			rankedActions = result.rankedActions ?? [];
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Rank request failed.';
		} finally {
			loading = false;
		}
	}

	async function handleExplain(actionId: string | undefined = undefined): Promise<void> {
		explanationLoading = true;
		explanationError = '';
		explanation = '';

		try {
			const result = await explainAction(buildContext(), actionId, $actorStore);
			explanation = result.explanation ?? '';
		} catch (err) {
			explanationError = err instanceof Error ? err.message : 'Explain request failed.';
		} finally {
			explanationLoading = false;
		}
	}
</script>

<section class="glass-panel p-6">
	<h2 class="text-2xl font-semibold">Navigator AI</h2>
	<p class="muted mt-2 text-sm">Rank and explore available actions for any aggregate in the system using the Navigator AI subsystem.</p>

	<div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<div>
			<label class="mb-1 block text-xs text-white/70" for="nav-domain">Domain</label>
			<select
				id="nav-domain"
				class="w-full rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm"
				bind:value={domain}
			>
					{#each DOMAINS as d (d)}
						<option value={d}>{d}</option>
					{/each}
			</select>
		</div>

		<div>
			<label class="mb-1 block text-xs text-white/70" for="nav-aggregate-type">Aggregate Type</label>
			<input
				id="nav-aggregate-type"
				class="w-full rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm"
				placeholder="e.g. SalesOrder"
				bind:value={aggregateType}
			/>
		</div>

		<div>
			<label class="mb-1 block text-xs text-white/70" for="nav-aggregate-id">Aggregate ID</label>
			<input
				id="nav-aggregate-id"
				class="w-full rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm"
				placeholder="e.g. so-001"
				bind:value={aggregateId}
			/>
		</div>

		<div class="flex items-end">
			<button
				class="w-full rounded-md border border-white/35 px-4 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50"
				disabled={loading}
				on:click={handleRank}
			>
				{loading ? 'Ranking...' : 'Rank Actions'}
			</button>
		</div>
	</div>

	{#if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{/if}

	{#if rankedActions.length > 0}
		<div class="mt-6">
			<h3 class="mb-3 text-sm font-semibold uppercase tracking-[0.15em] text-white/70">Ranked Actions</h3>
			<div class="overflow-x-auto">
				<table class="min-w-full text-left text-sm">
					<thead>
						<tr class="border-b border-white/15 text-xs uppercase tracking-[0.15em] text-white/70">
							<th class="px-3 py-2">Action</th>
							<th class="px-3 py-2">Label</th>
							<th class="px-3 py-2">Score</th>
							<th class="px-3 py-2">Rationale</th>
							<th class="px-3 py-2">Explain</th>
						</tr>
					</thead>
					<tbody>
						{#each rankedActions as action (action.actionId)}
							<tr class="border-b border-white/10">
								<td class="px-3 py-3 font-mono text-xs">{action.actionId}</td>
								<td class="px-3 py-3 text-xs">{action.label ?? '—'}</td>
								<td class="px-3 py-3 text-xs">{action.score != null ? action.score.toFixed(2) : '—'}</td>
								<td class="px-3 py-3 text-xs text-white/70">{action.rationale ?? '—'}</td>
								<td class="px-3 py-3">
									<button
										class="rounded-md border border-white/35 px-2 py-1 text-xs text-white hover:bg-white/10 disabled:opacity-50"
										disabled={explanationLoading}
										on:click={() => { selectedActionId = action.actionId; void handleExplain(action.actionId); }}
									>
										Explain
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="mt-3 flex gap-2">
				<button
					class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-50"
					disabled={explanationLoading}
					on:click={() => { selectedActionId = ''; void handleExplain(); }}
				>
					{explanationLoading ? 'Loading...' : 'Explain All (Overview)'}
				</button>
			</div>
		</div>
	{/if}

	{#if explanationError}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{explanationError}</p>
	{/if}

	{#if explanation}
		<div class="mt-4 rounded-md border border-white/15 bg-white/5 p-4">
			<p class="mb-1 text-xs text-white/60">
				Explanation{selectedActionId ? ` for ${selectedActionId}` : ' (overview)'}
			</p>
			<p class="text-sm leading-relaxed">{explanation}</p>
		</div>
	{/if}

	<div class="mt-8 border-t border-white/10 pt-4">
		<a
			class="text-xs text-white/60 hover:text-white"
			href={resolve('/navigator/sessions')}
		>
			View Navigator Sessions &rarr;
		</a>
	</div>
</section>
