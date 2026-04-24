<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		CaiplVersionMismatch,
		createCaiplSession,
		getCaiplSession,
		resolveCaiplDecision,
		sendCaiplTurn,
		type CaiplArtefact,
		type CaiplDecisionPoint,
		type CaiplInteractionTurn,
		type CaiplPlanGraph,
		type SessionSnapshotResponse
	} from '$lib/api/caipl';
	import CaiplPlanGraphView from '$lib/components/ai/CaiplPlanGraph.svelte';
	import ActionSurface from '$lib/components/lina/ActionSurface.svelte';
	import ModeWheel from '$lib/components/lina/ModeWheel.svelte';
	import RoleSelector from '$lib/components/lina/RoleSelector.svelte';
	import { actorStore } from '$lib/stores/actorStore';
	import {
		selectedLinaActionId,
		selectedLinaMode,
		selectedLinaRole,
		setLinaActions
	} from '$lib/stores/linaUiState';
	import { LINA_MODE_OPTIONS, LINA_ROLE_OPTIONS, type LinaActionOption, type LinaMode } from '$lib/types/lina';

	interface PageData {
		sessionId: string | null;
	}

	export let data: PageData;

	let sessionId = data.sessionId;
	let loading = false;
	let errorMessage = '';
	let goalText = 'Plan and execute a constitutional ERP workflow';
	let turnText = '';
	let selectedGraphNodeId: string | null = null;
	let selectedModeId: LinaMode = LINA_MODE_OPTIONS[0].id;
	let selectedRoleId = LINA_ROLE_OPTIONS[0].id;

	let sessionVersion = 0;
	let turns: CaiplInteractionTurn[] = [];
	let decisions: CaiplDecisionPoint[] = [];
	let notebook: CaiplArtefact[] = [];
	let planGraph: CaiplPlanGraph = { nodes: [], edges: [] };
	let actionOptions: LinaActionOption[] = [];
	let currentActionId: string | null = null;

	$: if (data.sessionId !== sessionId) {
		sessionId = data.sessionId;
		if (sessionId) {
			void hydrateSession(sessionId);
		}
	}

	$: pendingDecisions = decisions.filter((item) => item.status === 'pending');
	$: {
		const decisionActionOptions = pendingDecisions.flatMap((decision) =>
			decision.options.map((option) => ({
				id: `${decision.id}:${option.id}`,
				label: option.label,
				description: option.description
			}))
		);

		actionOptions = decisionActionOptions.length > 0 ? decisionActionOptions : fallbackActionsForMode(selectedModeId);
		setLinaActions(actionOptions);
		if (!currentActionId || !actionOptions.some((item) => item.id === currentActionId)) {
			currentActionId = actionOptions[0]?.id ?? null;
		}
	}

	$: selectedLinaRole.set(selectedRoleId);
	$: selectedLinaMode.set(selectedModeId);
	$: selectedLinaActionId.set(currentActionId);

	async function hydrateSession(id: string): Promise<void> {
		loading = true;
		errorMessage = '';
		try {
			const snapshot = await getCaiplSession($actorStore, id);
			applySnapshot(snapshot);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load Lina session';
		} finally {
			loading = false;
		}
	}

	function applySnapshot(snapshot: SessionSnapshotResponse): void {
		sessionId = snapshot.session.id;
		sessionVersion = snapshot.session.version;
		turns = snapshot.turns;
		decisions = snapshot.decisions;
		notebook = snapshot.notebook;
		planGraph = snapshot.planGraph;
		selectedGraphNodeId = planGraph.nodes[0]?.id ?? null;
	}

	function fallbackActionsForMode(mode: LinaMode): LinaActionOption[] {
		switch (mode) {
			case 'create':
				return [
					{ id: 'create_project', label: 'Create Project', description: 'Start a new project context.' },
					{ id: 'create_purchase_order', label: 'Create Purchase Order', description: 'Draft a PO proposal.' }
				];
			case 'select':
				return [
					{ id: 'select_project', label: 'Select Project', description: 'Focus an existing project.' },
					{ id: 'select_inventory_item', label: 'Select Inventory Item', description: 'Inspect stock item state.' }
				];
			case 'investigate':
				return [
					{ id: 'investigate_blocker', label: 'Investigate Blocker', description: 'Trace dependencies and causes.' }
				];
			case 'fix':
				return [
					{ id: 'fix_exception', label: 'Fix Exception', description: 'Resolve pending or failed decision.' }
				];
			case 'advance':
				return [
					{ id: 'advance_workflow', label: 'Advance Workflow', description: 'Move to next actionable step.' }
				];
			default:
				return [];
		}
	}

	async function handleCreateSession(): Promise<void> {
		loading = true;
		errorMessage = '';
		try {
			const result = await createCaiplSession($actorStore, {
				userId: $actorStore.actorId,
				currentGoal: goalText.trim() || 'Start planning',
				roleContext: selectedRoleId,
				mode: selectedModeId
			});
			applySnapshot({
				session: result.session,
				turns: result.initialTurns,
				decisions: result.decisions,
				planGraph: result.planGraph,
				notebook: result.notebookSnapshot
			});
			await goto(`/lina/workspace/${result.session.id}`);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to create Lina session';
		} finally {
			loading = false;
		}
	}

	async function handleExecuteAction(actionId: string): Promise<void> {
		currentActionId = actionId;
		const action = actionOptions.find((item) => item.id === actionId);
		if (!action) {
			return;
		}
		turnText = action.label;
		await handleSendTurn();
	}

	async function handleSendTurn(): Promise<void> {
		if (!sessionId || !turnText.trim()) {
			return;
		}

		loading = true;
		errorMessage = '';
		try {
			const response = await sendCaiplTurn($actorStore, sessionId, {
				actor: 'user',
				messageText: turnText.trim(),
				sessionVersion,
				roleContext: selectedRoleId,
				mode: selectedModeId
			});
			turns = [...turns, ...response.newTurns];
			decisions = response.decisionPoints;
			sessionVersion = response.session.version;
			if (response.graphDelta.addedNodes.length > 0) {
				planGraph = {
					...planGraph,
					nodes: [...planGraph.nodes, ...response.graphDelta.addedNodes],
					edges: [...planGraph.edges, ...response.graphDelta.addedEdges]
				};
			}
			notebook = [...notebook, ...response.notebookDelta.added];
			turnText = '';
		} catch (error) {
			await handleVersionMismatch(error);
		} finally {
			loading = false;
		}
	}

	async function handleResolveDecision(
		decision: CaiplDecisionPoint,
		action: 'confirm' | 'reject' | 'amend'
	): Promise<void> {
		if (!sessionId) {
			return;
		}

		loading = true;
		errorMessage = '';
		try {
			const response = await resolveCaiplDecision($actorStore, decision.id, {
				action,
				actorId: $actorStore.actorId,
				sessionVersion,
				decisionVersion: decision.version
			});
			decisions = decisions.map((entry) =>
				entry.id === response.updatedDecision.id ? response.updatedDecision : entry
			);
			turns = [...turns, ...response.newTurns];
			notebook = [...notebook, ...response.notebookDelta.added];
			sessionVersion = response.session.version;
		} catch (error) {
			await handleVersionMismatch(error);
		} finally {
			loading = false;
		}
	}

	async function handleVersionMismatch(error: unknown): Promise<void> {
		if (error instanceof CaiplVersionMismatch && error.payload.sessionId) {
			errorMessage = `${error.message} Refreshing session state.`;
			await hydrateSession(error.payload.sessionId);
			return;
		}

		errorMessage = error instanceof Error ? error.message : 'Request failed';
	}

	function formatNotebookContent(content: Record<string, unknown> | string): string {
		if (typeof content === 'string') {
			return content;
		}

		return JSON.stringify(content, null, 2);
	}
</script>

<section class="page-shell space-y-4">
	<header class="glass-panel p-4">
		<h1 class="text-2xl font-semibold">Lina Workspace</h1>
		<p class="muted mt-1 text-sm">Directional, option-first CAIPL workspace.</p>

		<div class="mt-4 grid gap-3 xl:grid-cols-2">
			<RoleSelector selectedRoleId={selectedRoleId} on:select={(event) => (selectedRoleId = event.detail.roleId)} />
			<ModeWheel selectedModeId={selectedModeId} on:select={(event) => (selectedModeId = event.detail.modeId)} />
		</div>

		<div class="mt-4 flex flex-wrap gap-2">
			<input class="input-base min-w-[280px] flex-1" bind:value={goalText} placeholder="Goal for this session" />
			<button class="ui-soft-button px-4 py-2 text-sm" on:click={handleCreateSession} disabled={loading}>
				{loading ? 'Working...' : 'Create Session'}
			</button>
		</div>

		{#if sessionId}
			<p class="mt-2 text-xs ui-muted">Session: {sessionId} | Version: {sessionVersion}</p>
		{/if}
		{#if errorMessage}
			<p class="mt-3 rounded-md border border-red-500/45 bg-red-500/10 p-2 text-sm text-red-200">{errorMessage}</p>
		{/if}
	</header>

	<div class="grid gap-4 xl:grid-cols-[1.1fr_1fr_1fr]">
		<ActionSurface
			actions={actionOptions}
			selectedActionId={currentActionId}
			loading={loading}
			on:select={(event) => (currentActionId = event.detail.actionId)}
			on:execute={(event) => void handleExecuteAction(event.detail.actionId)}
		/>

		<section class="glass-panel p-4">
			<h2 class="text-lg font-semibold">Plan View</h2>
			<div class="mt-3">
				<CaiplPlanGraphView
					nodes={planGraph.nodes}
					edges={planGraph.edges}
					selectedNodeId={selectedGraphNodeId}
					on:select={(event) => (selectedGraphNodeId = event.detail.nodeId)}
				/>
			</div>
			<div class="mt-3 flex gap-2">
				<input class="input-base flex-1" bind:value={turnText} placeholder="Optional manual turn text" />
				<button class="ui-soft-button px-3 py-2 text-sm" on:click={handleSendTurn} disabled={!sessionId || loading}>
					Send
				</button>
			</div>
			<div class="mt-3 max-h-[220px] space-y-2 overflow-auto">
				{#if turns.length === 0}
					<p class="text-sm ui-muted">No turns yet.</p>
				{:else}
					{#each turns as turn (turn.id)}
						<article class="item-card rounded-md p-2 text-xs">
							<p class="font-semibold uppercase tracking-wide">{turn.actor}</p>
							<p class="mt-1">{turn.messageText}</p>
						</article>
					{/each}
				{/if}
			</div>
		</section>

		<section class="glass-panel p-4">
			<h2 class="text-lg font-semibold">Decisions + Notebook</h2>
			<div class="mt-3 space-y-2">
				{#if pendingDecisions.length === 0}
					<p class="text-sm ui-muted">No pending decisions.</p>
				{:else}
					{#each pendingDecisions as decision (decision.id)}
						<article class="item-card rounded-md p-3">
							<p class="text-sm font-semibold">{decision.type}</p>
							<p class="mt-1 text-xs ui-muted">Status: {decision.status}</p>
							<div class="mt-2 flex gap-2">
								<button class="ui-soft-button px-2 py-1 text-xs" on:click={() => handleResolveDecision(decision, 'confirm')} disabled={loading}>Confirm</button>
								<button class="ui-soft-button px-2 py-1 text-xs" on:click={() => handleResolveDecision(decision, 'reject')} disabled={loading}>Reject</button>
								<button class="ui-soft-button px-2 py-1 text-xs" on:click={() => handleResolveDecision(decision, 'amend')} disabled={loading}>Amend</button>
							</div>
						</article>
					{/each}
				{/if}
			</div>
			<div class="mt-3 max-h-[280px] space-y-2 overflow-auto">
				{#if notebook.length === 0}
					<p class="text-sm ui-muted">Notebook is empty.</p>
				{:else}
					{#each notebook as item (item.id)}
						<article class="section-card p-2 text-xs">
							<p class="font-semibold uppercase tracking-wide">{item.type}</p>
							<pre class="mt-1 overflow-auto whitespace-pre-wrap break-words ui-muted">{formatNotebookContent(item.content)}</pre>
						</article>
					{/each}
				{/if}
			</div>
		</section>
	</div>
</section>
