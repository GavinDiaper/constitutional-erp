<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		actorOptions,
		actorStore,
		setActorById,
		type ActorContext
	} from '$lib/stores/actorStore';
	import {
		decide,
		executeAction,
		explainAction,
		getActions,
		getResource,
		rankActions,
		simulateAction,
		type ActionOption,
		type CanonicalResource,
		type DecisionOutcome,
		type ExecutionResult,
		type NavigatorContext,
		type RankedAction,
		type SimulationResult
	} from '$lib/api/navigator';

	const DOMAINS = ['P2P', 'O2C', 'R2R', 'H2R'] as const;
	const AGGREGATE_TYPES: Record<(typeof DOMAINS)[number], string[]> = {
		P2P: ['requisition', 'purchase-order', 'supplier-invoice', 'ap-payment'],
		O2C: ['quote', 'sales-order', 'ar-invoice', 'ar-payment'],
		R2R: ['journal', 'fiscal-period'],
		H2R: ['employee', 'leave-request']
	};
	const AGGREGATE_IDS: Record<string, string[]> = {
		requisition: ['REQ-1775572652080-38928', 'REQ-1775570608743-95731', 'REQ-1'],
		'purchase-order': ['PO-1775570609188-27416', 'PO-1', 'PO-001'],
		'supplier-invoice': ['SI-1'],
		'ap-payment': ['APP-1'],
		quote: ['Q-1'],
		'sales-order': ['SO-1', 'SO-402'],
		'ar-invoice': ['ARI-1'],
		'ar-payment': ['ARP-1'],
		journal: ['JNL-1775570617772-73064'],
		'fiscal-period': ['FP-1'],
		employee: ['EMP-1'],
		'leave-request': ['LV-1']
	};

	let domain: (typeof DOMAINS)[number] = 'P2P';
	let aggregateType = 'requisition';
	let aggregateId = 'REQ-1775572652080-38928';
	let actorId = 'principal.system';

	let loading = false;
	let errorMessage = '';
	let resourceLoading = false;
	let resourceError = '';
	let resource: CanonicalResource | null = null;
	let actionOptions: ActionOption[] = [];

	let rankedActions: RankedAction[] = [];
	let selectedActionId = '';
	let explanation = '';
	let explanationLoading = false;
	let explanationError = '';
	let simulation: SimulationResult | null = null;
	let simulationLoading = false;
	let simulationError = '';
	let decision: DecisionOutcome | null = null;
	let decisionLoading = false;
	let decisionError = '';
	let execution: ExecutionResult | null = null;
	let executionLoading = false;
	let executionError = '';

	$: if (!getAggregateTypeOptions(domain).includes(aggregateType)) {
		aggregateType = getAggregateTypeOptions(domain)[0] ?? '';
	}

	$: if (getAggregateIdOptions(aggregateType).length > 0 && !getAggregateIdOptions(aggregateType).includes(aggregateId)) {
		aggregateId = getAggregateIdOptions(aggregateType)[0] ?? '';
	}

	$: if ($actorStore.actorId !== actorId) {
		setActorById(actorId);
	}

	function buildContext(): NavigatorContext {
		return {
			domain,
			aggregateType: aggregateType.trim(),
			aggregateId: aggregateId.trim(),
			actorId: actorId.trim()
		};
	}

	function getAggregateTypeOptions(currentDomain: (typeof DOMAINS)[number]): string[] {
		return AGGREGATE_TYPES[currentDomain] ?? [];
	}

	function getAggregateIdOptions(currentAggregateType: string): string[] {
		return AGGREGATE_IDS[currentAggregateType] ?? [];
	}

	function clearDownstreamState(): void {
		actionOptions = [];
		rankedActions = [];
		selectedActionId = '';
		explanation = '';
		explanationError = '';
		simulation = null;
		simulationError = '';
		decision = null;
		decisionError = '';
		execution = null;
		executionError = '';
	}

	function selectedActor(): ActorContext {
		return actorOptions.find((actor) => actor.actorId === actorId) ?? actorOptions[0];
	}

	function formatAttributeValue(value: unknown): string {
		if (value == null) {
			return 'null';
		}

		if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
			return String(value);
		}

		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return String(value);
		}
	}

	function formatAttributeDisplay(key: string, value: unknown): string {
		if (
			key === 'rankedActions' &&
			Array.isArray(value) &&
			value.every(
				(item) =>
					typeof item === 'object' &&
					item !== null &&
					'actionId' in item &&
					typeof (item as { actionId?: unknown }).actionId === 'string'
			)
		) {
			return value
				.map((item) => (item as { actionId: string }).actionId)
				.join(', ');
		}

		return formatAttributeValue(value);
	}

	function isStructuredValue(value: unknown): boolean {
		return typeof value === 'object' && value !== null;
	}

	async function handleLoadResource(): Promise<void> {
		if (!aggregateType.trim() || !aggregateId.trim() || !actorId.trim()) {
			resourceError = 'Aggregate type, aggregate ID, and actor ID are required.';
			return;
		}

		resourceLoading = true;
		resourceError = '';
		errorMessage = '';
		resource = null;
		clearDownstreamState();

		try {
			const context = buildContext();
			resource = await getResource(context, selectedActor());
			actionOptions = await getActions(context, selectedActor());
		} catch (err) {
			resourceError = err instanceof Error ? err.message : 'Resource request failed.';
		} finally {
			resourceLoading = false;
		}
	}

	async function handleRank(): Promise<void> {
		if (!aggregateType.trim() || !aggregateId.trim() || !actorId.trim()) {
			errorMessage = 'Aggregate type, aggregate ID, and actor ID are required.';
			return;
		}

		loading = true;
		errorMessage = '';
		rankedActions = [];
		selectedActionId = '';
		explanation = '';
		explanationError = '';
		simulation = null;
		simulationError = '';
		decision = null;
		decisionError = '';
		execution = null;
		executionError = '';

		try {
			const result = await rankActions(buildContext(), selectedActor());
			rankedActions = result.rankedActions ?? [];
			actionOptions = result.actionOptions ?? actionOptions;
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
			const result = await explainAction(buildContext(), actionId, selectedActor());
			explanation = result.explanation ?? '';
		} catch (err) {
			explanationError = err instanceof Error ? err.message : 'Explain request failed.';
		} finally {
			explanationLoading = false;
		}
	}

	async function handleSimulate(actionId: string): Promise<void> {
		simulationLoading = true;
		simulationError = '';
		simulation = null;

		try {
			simulation = await simulateAction(buildContext(), actionId, selectedActor());
			selectedActionId = actionId;
		} catch (err) {
			simulationError = err instanceof Error ? err.message : 'Simulate request failed.';
		} finally {
			simulationLoading = false;
		}
	}

	async function handleDecide(): Promise<void> {
		decisionLoading = true;
		decisionError = '';
		decision = null;

		try {
			decision = await decide(buildContext(), selectedActor());
		} catch (err) {
			decisionError = err instanceof Error ? err.message : 'Decide request failed.';
		} finally {
			decisionLoading = false;
		}
	}

	async function handleExecute(actionId?: string): Promise<void> {
		executionLoading = true;
		executionError = '';
		execution = null;

		const candidateAction = actionId ?? decision?.action?.actionId ?? selectedActionId;
		const actionToExecute = candidateAction ? candidateAction : undefined;

		try {
			execution = await executeAction(buildContext(), actionToExecute, selectedActor());
		} catch (err) {
			executionError = err instanceof Error ? err.message : 'Execute request failed.';
		} finally {
			executionLoading = false;
		}
	}

	function optionForAction(actionId: string): ActionOption | undefined {
		return actionOptions.find((option) => option.id === actionId);
	}
</script>

<section class="glass-panel p-6">
	<h2 class="text-2xl font-semibold">Navigator AI</h2>
	<p class="muted mt-2 text-sm">Run the full Navigator workflow with domain-aligned dropdowns and Postman-compatible fixture values.</p>

	<div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
			<select
				id="nav-aggregate-type"
				class="w-full rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm"
				bind:value={aggregateType}
			>
				{#each getAggregateTypeOptions(domain) as type (type)}
					<option value={type}>{type}</option>
				{/each}
			</select>
		</div>

		<div>
			<label class="mb-1 block text-xs text-white/70" for="nav-aggregate-id">Aggregate ID</label>
			<select
				id="nav-aggregate-id"
				class="w-full rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm"
				bind:value={aggregateId}
			>
				{#each getAggregateIdOptions(aggregateType) as id (id)}
					<option value={id}>{id}</option>
				{/each}
			</select>
		</div>

		<div>
			<label class="mb-1 block text-xs text-white/70" for="nav-actor-id">Actor ID</label>
			<select
				id="nav-actor-id"
				class="w-full rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm"
				bind:value={actorId}
			>
				{#each actorOptions as actor (actor.actorId)}
					<option value={actor.actorId}>{actor.actorId}</option>
				{/each}
			</select>
		</div>

		<div class="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
			<p class="font-semibold text-white/80">Selected Actor Tier</p>
			<p class="mt-1">{selectedActor().authorityTier}</p>
		</div>

		<div class="flex items-end">
			<button
				class="w-full rounded-md border border-white/35 px-4 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50"
				disabled={resourceLoading}
				on:click={handleLoadResource}
			>
				{resourceLoading ? 'Loading...' : 'Load Resource'}
			</button>
		</div>

		<div class="flex items-end">
			<button
				class="w-full rounded-md border border-white/35 px-4 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50"
				disabled={loading}
				on:click={handleRank}
			>
				{loading ? 'Ranking...' : 'Propose Actions'}
			</button>
		</div>
	</div>

	<p class="mt-3 text-xs text-white/55">
		Default values are aligned to the working Navigator Postman flow for P2P requisition ranking.
	</p>

	{#if resourceError}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{resourceError}</p>
	{/if}

	{#if resource}
		<div class="mt-6 rounded-md border border-white/15 bg-white/5 p-4">
			<h3 class="text-sm font-semibold uppercase tracking-[0.15em] text-white/70">Canonical Resource</h3>
			<p class="mt-2 text-sm font-medium">
				{resource.domain} / {resource.type} / {resource.id} (state: {resource.state})
			</p>

			{#if Object.entries(resource.attributes ?? {}).length > 0}
				<div class="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
					{#each Object.entries(resource.attributes ?? {}) as [key, value] (key)}
						<div class="rounded border border-white/10 bg-white/5 px-2 py-1">
							<p class="text-white/60">{key}:</p>
							{#if key === 'rankedActions'}
								<p class="mt-1 text-white/90">{formatAttributeDisplay(key, value)}</p>
							{:else if isStructuredValue(value)}
								<pre class="mt-1 overflow-x-auto rounded border border-white/10 bg-[#112946] p-2 text-[11px] text-white/90">{formatAttributeDisplay(key, value)}</pre>
							{:else}
								<p class="mt-1 text-white/90">{formatAttributeDisplay(key, value)}</p>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	{#if actionOptions.length > 0}
		<div class="mt-6">
			<h3 class="mb-3 text-sm font-semibold uppercase tracking-[0.15em] text-white/70">Available Actions</h3>
			<div class="overflow-x-auto">
				<table class="min-w-full text-left text-sm">
					<thead>
						<tr class="border-b border-white/15 text-xs uppercase tracking-[0.15em] text-white/70">
							<th class="px-3 py-2">Action</th>
							<th class="px-3 py-2">Method</th>
							<th class="px-3 py-2">Requires Approval</th>
							<th class="px-3 py-2">Required Tier</th>
						</tr>
					</thead>
					<tbody>
						{#each actionOptions as option (option.id)}
							<tr class="border-b border-white/10">
								<td class="px-3 py-3 font-mono text-xs">{option.id}</td>
								<td class="px-3 py-3 text-xs">{option.method}</td>
								<td class="px-3 py-3 text-xs">{option.requiresApproval ? 'Yes' : 'No'}</td>
								<td class="px-3 py-3 text-xs">{option.requiredTier ?? '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

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
							<th class="px-3 py-2">Rank</th>
							<th class="px-3 py-2">Action</th>
							<th class="px-3 py-2">Score</th>
							<th class="px-3 py-2">Approval</th>
							<th class="px-3 py-2">Tier</th>
							<th class="px-3 py-2">Rationale</th>
							<th class="px-3 py-2">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each rankedActions as action, index (action.actionId)}
							{@const option = optionForAction(action.actionId)}
							<tr class="border-b border-white/10">
								<td class="px-3 py-3 text-xs">{index + 1}</td>
								<td class="px-3 py-3 font-mono text-xs">{action.actionId}</td>
								<td class="px-3 py-3 text-xs">{action.score != null ? action.score.toFixed(2) : '—'}</td>
								<td class="px-3 py-3 text-xs">{option?.requiresApproval ? 'Yes' : 'No'}</td>
								<td class="px-3 py-3 text-xs">{option?.requiredTier ?? '—'}</td>
								<td class="px-3 py-3 text-xs text-white/70">{action.rationale ?? '—'}</td>
								<td class="px-3 py-3">
									<div class="flex flex-wrap gap-2">
										<button
											class="rounded-md border border-white/35 px-2 py-1 text-xs text-white hover:bg-white/10 disabled:opacity-50"
											disabled={explanationLoading}
											on:click={() => { selectedActionId = action.actionId; void handleExplain(action.actionId); }}
										>
											Explain
										</button>
										<button
											class="rounded-md border border-white/35 px-2 py-1 text-xs text-white hover:bg-white/10 disabled:opacity-50"
											disabled={simulationLoading}
											on:click={() => void handleSimulate(action.actionId)}
										>
											Simulate
										</button>
										<button
											class="rounded-md border border-white/35 px-2 py-1 text-xs text-white hover:bg-white/10 disabled:opacity-50"
											disabled={decisionLoading}
											on:click={() => { selectedActionId = action.actionId; void handleDecide(); }}
										>
											Decide
										</button>
										<button
											class="rounded-md border border-white/35 px-2 py-1 text-xs text-white hover:bg-white/10 disabled:opacity-50"
											disabled={executionLoading}
											on:click={() => void handleExecute(action.actionId)}
										>
											Execute
										</button>
									</div>
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
				<button
					class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-50"
					disabled={decisionLoading}
					on:click={handleDecide}
				>
					{decisionLoading ? 'Deciding...' : 'Run Decide'}
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

	{#if simulationError}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{simulationError}</p>
	{/if}

	{#if simulation}
		<div class="mt-4 rounded-md border border-white/15 bg-white/5 p-4">
			<p class="mb-2 text-xs text-white/60">Simulation{selectedActionId ? ` for ${selectedActionId}` : ''}</p>
			<div class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
				<p><span class="text-white/60">Predicted State:</span> {simulation.predictedState}</p>
				<p><span class="text-white/60">Risk:</span> {simulation.riskSummary}</p>
				<p><span class="text-white/60">Financial Impact:</span> {simulation.financialImpact ?? 'n/a'}</p>
				<p><span class="text-white/60">Transitions:</span> {simulation.predictedTransitions.join(', ') || 'n/a'}</p>
			</div>
			<p class="mt-3 text-sm leading-relaxed text-white/90">{simulation.narrative}</p>
		</div>
	{/if}

	{#if decisionError}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{decisionError}</p>
	{/if}

	{#if decision}
		<div class="mt-4 rounded-md border border-white/15 bg-white/5 p-4">
			<p class="mb-1 text-xs text-white/60">Decision</p>
			<p class="text-sm"><span class="text-white/60">Mode:</span> {decision.mode}</p>
			<p class="text-sm"><span class="text-white/60">Chosen Action:</span> {decision.action?.actionId ?? 'none'}</p>
			<p class="mt-2 text-sm leading-relaxed">{decision.explanation}</p>
			{#if decision.mode === 'EXECUTE' || decision.mode === 'REQUEST_APPROVAL'}
				<button
					class="mt-3 rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-50"
					disabled={executionLoading}
					on:click={() => void handleExecute(decision?.action?.actionId)}
				>
					{executionLoading ? 'Executing...' : 'Execute Decision Action'}
				</button>
			{/if}
		</div>
	{/if}

	{#if executionError}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{executionError}</p>
	{/if}

	{#if execution}
		<div class="mt-4 rounded-md border border-white/15 bg-white/5 p-4">
			<p class="mb-1 text-xs text-white/60">Execution Result</p>
			<p class="text-sm"><span class="text-white/60">Mode:</span> {execution.mode}</p>
			<p class="text-sm"><span class="text-white/60">Action:</span> {execution.actionId}</p>
			<p class="text-sm"><span class="text-white/60">Status:</span> {execution.statusCode}</p>
			<pre class="mt-3 overflow-x-auto rounded border border-white/10 bg-[#112946] p-3 text-xs text-white/85">{JSON.stringify(execution.responseBody, null, 2)}</pre>
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
