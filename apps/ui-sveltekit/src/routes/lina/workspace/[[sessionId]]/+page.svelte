<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		CaiplVersionMismatch,
		createCaiplSession,
		getCaiplSession,
		resolveCaiplDecision,
		sendCaiplTurn,
		type CaiplDecisionOption,
		type CaiplArtefact,
		type CaiplGraphDelta,
		type CaiplNotebookDelta,
		type CaiplDecisionPoint,
		type CaiplInteractionTurn,
		type CaiplPlanGraph,
		type SessionSnapshotResponse
	} from '$lib/api/caipl';
	import CaiplPlanGraphView from '$lib/components/ai/CaiplPlanGraph.svelte';
	import ActionSurface from '$lib/components/lina/ActionSurface.svelte';
	import DecisionSurface from '$lib/components/lina/DecisionSurface.svelte';
	import DeveloperConsole from '$lib/components/lina/DeveloperConsole.svelte';
	import FormSurface from '$lib/components/lina/FormSurface.svelte';
	import GraphModeSelector from '$lib/components/lina/GraphModeSelector.svelte';
	import ModeWheel from '$lib/components/lina/ModeWheel.svelte';
	import NotebookPanel from '$lib/components/lina/NotebookPanel.svelte';
	import RoleSelector from '$lib/components/lina/RoleSelector.svelte';
	import { actorStore } from '$lib/stores/actorStore';
	import type { LinaGraphMode } from '$lib/stores/linaGraphMode';
	import { mapLinaModeToGraphMode } from '$lib/stores/linaGraphMode';
	import { addLinaConsoleEntry } from '$lib/stores/linaDevConsole';
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
	let selectedDecisionId: string | null = null;
	let selectedOptionId: string | null = null;
	let showDeveloperConsole = false;
	let graphModeOverride: LinaGraphMode | null = null;
	let mobilePanel: 'actions' | 'graph' | 'insights' = 'actions';

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
	$: selectedDecision = pendingDecisions.find((item) => item.id === selectedDecisionId) ?? pendingDecisions[0] ?? null;
	$: selectedOption =
		selectedDecision?.options.find((item) => item.id === selectedOptionId) ?? selectedDecision?.options[0] ?? null;
	$: derivedGraphMode = mapLinaModeToGraphMode(selectedModeId);
	$: graphMode = graphModeOverride ?? derivedGraphMode;
	$: {
		const decisionActionOptions = pendingDecisions.flatMap((decision) =>
			decision.options.map((option) => ({
				id: `${decision.id}:${option.id}`,
				label: option.label,
				description: option.description
			}))
		);

		actionOptions =
			decisionActionOptions.length > 0
				? decisionActionOptions
				: fallbackActionsForModeAndRole(selectedModeId, selectedRoleId);
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
			addLinaConsoleEntry('info', 'session', 'Hydrated Lina session snapshot', { sessionId: id });
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load Lina session';
			addLinaConsoleEntry('error', 'session', 'Failed to hydrate Lina session', { error: errorMessage });
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

	function applyGraphDelta(delta: CaiplGraphDelta): void {
		if (delta.removedNodes.length > 0) {
			planGraph = {
				...planGraph,
				nodes: planGraph.nodes.filter((node) => !delta.removedNodes.includes(node.id))
			};
		}

		if (delta.updatedNodes.length > 0) {
			const map = new Map(delta.updatedNodes.map((node) => [node.id, node]));
			planGraph = {
				...planGraph,
				nodes: planGraph.nodes.map((node) => map.get(node.id) ?? node)
			};
		}

		if (delta.addedNodes.length > 0) {
			planGraph = {
				...planGraph,
				nodes: [...planGraph.nodes, ...delta.addedNodes]
			};
		}

		if (delta.removedEdges.length > 0) {
			planGraph = {
				...planGraph,
				edges: planGraph.edges.filter((edge) => !delta.removedEdges.includes(edge.edgeId))
			};
		}

		if (delta.addedEdges.length > 0) {
			planGraph = {
				...planGraph,
				edges: [...planGraph.edges, ...delta.addedEdges]
			};
		}
	}

	function applyNotebookDelta(delta: CaiplNotebookDelta): void {
		if (delta.removed.length > 0) {
			notebook = notebook.filter((item) => !delta.removed.includes(item.id));
		}

		if (delta.updated.length > 0) {
			const map = new Map(delta.updated.map((item) => [item.id, item]));
			notebook = notebook.map((item) => map.get(item.id) ?? item);
		}

		if (delta.added.length > 0) {
			notebook = [...notebook, ...delta.added];
		}
	}

	function fallbackActionsForModeAndRole(mode: LinaMode, roleId: string): LinaActionOption[] {
		const roleCreateActions: Record<string, LinaActionOption[]> = {
			o2c_operator: [
				{ id: 'create_customer', label: 'Create Customer', description: 'Create a customer profile for O2C.' },
				{ id: 'create_quote', label: 'Create Quote', description: 'Prepare a sales quote with customer context.' },
				{ id: 'register_ar_payment', label: 'Register AR Payment', description: 'Record incoming customer payment.' }
			],
			buyer: [
				{ id: 'create_requisition', label: 'Create Requisition', description: 'Start procurement request flow.' },
				{ id: 'create_purchase_order', label: 'Create Purchase Order', description: 'Draft a PO for supplier fulfillment.' },
				{ id: 'create_supplier', label: 'Create Supplier', description: 'Onboard a new supplier for P2P.' }
			],
			accountant: [
				{ id: 'create_journal', label: 'Create Journal', description: 'Draft a manual journal entry.' },
				{ id: 'start_period_close', label: 'Start Period Close', description: 'Begin period close checks and reconciliations.' },
				{ id: 'review_trial_balance', label: 'Review Trial Balance', description: 'Inspect current trial balance state.' }
			],
			warehouse: [
				{ id: 'create_goods_receipt', label: 'Create Goods Receipt', description: 'Record received goods against PO.' },
				{ id: 'post_inventory_movement', label: 'Post Inventory Movement', description: 'Register inventory issue/receipt movement.' },
				{ id: 'create_cycle_count', label: 'Create Cycle Count', description: 'Start stock-count verification workflow.' }
			],
			hr: [
				{ id: 'create_employee', label: 'Create Employee', description: 'Create a new employee profile.' },
				{ id: 'create_assignment', label: 'Create Assignment', description: 'Assign employee to position/workflow.' },
				{ id: 'issue_credential', label: 'Issue Credential', description: 'Issue access credential to employee.' }
			],
			project_manager: [
				{ id: 'create_project', label: 'Create Project', description: 'Start a new project context.' },
				{ id: 'assign_project_bom', label: 'Assign Project BOM', description: 'Attach BOM to project plan.' },
				{ id: 'post_project_labor', label: 'Post Project Labor', description: 'Capture labor cost into project WIP.' }
			],
			admin: [
				{ id: 'create_legal_entity', label: 'Create Legal Entity', description: 'Define legal entity for operations.' },
				{ id: 'create_inventory_org', label: 'Create Inventory Organization', description: 'Create organization/warehouse scope.' },
				{ id: 'create_authority_rule', label: 'Create Authority Rule', description: 'Define governance and approval policy.' }
			]
		};

		const roleSelectActions: Record<string, LinaActionOption[]> = {
			o2c_operator: [
				{ id: 'select_quote', label: 'Select Quote', description: 'Focus a quote for conversion or update.' },
				{ id: 'select_sales_order', label: 'Select Sales Order', description: 'Inspect order status and next action.' }
			],
			buyer: [
				{ id: 'select_requisition', label: 'Select Requisition', description: 'Open requisition for review.' },
				{ id: 'select_purchase_order', label: 'Select Purchase Order', description: 'Inspect PO progression.' }
			],
			accountant: [
				{ id: 'select_journal', label: 'Select Journal', description: 'Inspect journal and posting readiness.' },
				{ id: 'select_fiscal_period', label: 'Select Fiscal Period', description: 'Inspect close status by period.' }
			],
			warehouse: [
				{ id: 'select_inventory_item', label: 'Select Inventory Item', description: 'Inspect stock and movement history.' },
				{ id: 'select_goods_receipt', label: 'Select Goods Receipt', description: 'Inspect receipt exceptions and acceptance.' }
			],
			hr: [
				{ id: 'select_employee', label: 'Select Employee', description: 'Inspect employee status and assignments.' },
				{ id: 'select_assignment', label: 'Select Assignment', description: 'Inspect current assignment lifecycle.' }
			],
			project_manager: [
				{ id: 'select_project', label: 'Select Project', description: 'Focus an existing project.' },
				{ id: 'select_project_wip', label: 'Select Project WIP', description: 'Inspect project WIP balances.' }
			],
			admin: [
				{ id: 'select_policy', label: 'Select Policy', description: 'Inspect governance policy nodes.' },
				{ id: 'select_system_entity', label: 'Select System Entity', description: 'Inspect configuration entities.' }
			]
		};

		switch (mode) {
			case 'create':
				return roleCreateActions[roleId] ?? roleCreateActions.project_manager;
			case 'select':
				return roleSelectActions[roleId] ?? roleSelectActions.project_manager;
			case 'investigate':
				return [
					{ id: 'investigate_blocker', label: 'Investigate Blocker', description: 'Trace dependencies and causes.' },
					{ id: 'investigate_data_gap', label: 'Investigate Data Gap', description: 'Identify missing or inconsistent slot values.' }
				];
			case 'fix':
				return [
					{ id: 'fix_exception', label: 'Fix Exception', description: 'Resolve pending or failed decision.' },
					{ id: 'fix_field_mapping', label: 'Fix Field Mapping', description: 'Correct mapping/default mismatch before execution.' }
				];
			case 'advance':
				return [
					{ id: 'advance_workflow', label: 'Advance Workflow', description: 'Move to next actionable step.' },
					{ id: 'advance_with_lookup', label: 'Advance With Lookup', description: 'Advance using lookup-complete data set.' }
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
			addLinaConsoleEntry('info', 'session', 'Created Lina session', {
				roleContext: selectedRoleId,
				mode: selectedModeId,
				sessionId: result.session.id
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
			addLinaConsoleEntry('error', 'session', 'Failed to create Lina session', { error: errorMessage });
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
			applyGraphDelta(response.graphDelta);
			applyNotebookDelta(response.notebookDelta);
			addLinaConsoleEntry('info', 'turn', 'Submitted Lina turn', {
				sessionId,
				graphAdded: response.graphDelta.addedNodes.length,
				notebookAdded: response.notebookDelta.added.length
			});
			turnText = '';
		} catch (error) {
			await handleVersionMismatch(error);
			addLinaConsoleEntry('error', 'turn', 'Failed to submit Lina turn', { error: errorMessage });
		} finally {
			loading = false;
		}
	}

	async function handleResolveDecision(
		decision: CaiplDecisionPoint,
		action: 'confirm' | 'reject' | 'amend',
		optionId?: string,
		formInput?: Record<string, unknown>
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
				decisionVersion: decision.version,
				optionId,
				formInput
			});
			decisions = decisions.map((entry) =>
				entry.id === response.updatedDecision.id ? response.updatedDecision : entry
			);
			turns = [...turns, ...response.newTurns];
			applyGraphDelta(response.graphDelta);
			applyNotebookDelta(response.notebookDelta);
			sessionVersion = response.session.version;
			addLinaConsoleEntry('info', 'decision', 'Resolved decision', {
				decisionId: decision.id,
				action,
				optionId,
				hasFormInput: Boolean(formInput)
			});
		} catch (error) {
			await handleVersionMismatch(error);
			addLinaConsoleEntry('error', 'decision', 'Failed to resolve decision', {
				decisionId: decision.id,
				error: errorMessage
			});
		} finally {
			loading = false;
		}
	}

	async function handleFormSubmit(event: CustomEvent<{ optionId: string; formInput: Record<string, unknown> }>): Promise<void> {
		if (!selectedDecision) {
			return;
		}

		await handleResolveDecision(selectedDecision, 'confirm', event.detail.optionId, event.detail.formInput);
	}

	async function handleVersionMismatch(error: unknown): Promise<void> {
		if (error instanceof CaiplVersionMismatch && error.payload.sessionId) {
			errorMessage = `${error.message} Refreshing session state.`;
			await hydrateSession(error.payload.sessionId);
			return;
		}

		errorMessage = error instanceof Error ? error.message : 'Request failed';
	}

	function handleDecisionResolve(event: CustomEvent<{ decisionId: string; action: 'confirm' | 'reject' | 'amend' }>): void {
		const decision = pendingDecisions.find((item) => item.id === event.detail.decisionId);
		if (!decision) {
			return;
		}

		void handleResolveDecision(decision, event.detail.action, selectedOptionId ?? undefined);
	}

	function handleSelectDecision(event: CustomEvent<{ decisionId: string }>): void {
		selectedDecisionId = event.detail.decisionId;
	}

	function handleSelectOption(event: CustomEvent<{ decisionId: string; optionId: string }>): void {
		selectedDecisionId = event.detail.decisionId;
		selectedOptionId = event.detail.optionId;
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
			<button class="btn-ghost rounded-md px-3 py-2 text-sm" type="button" on:click={() => (showDeveloperConsole = !showDeveloperConsole)}>
				{showDeveloperConsole ? 'Hide Console' : 'Show Console'}
			</button>
		</div>

		{#if sessionId}
			<p class="mt-2 text-xs ui-muted">Session: {sessionId} | Version: {sessionVersion}</p>
		{/if}
		{#if errorMessage}
			<p class="mt-3 rounded-md border border-red-500/45 bg-red-500/10 p-2 text-sm text-red-200">{errorMessage}</p>
		{/if}

		<DeveloperConsole visible={showDeveloperConsole} />

		<div class="mt-4 flex gap-2 md:hidden">
			<button
				type="button"
				class="btn-ghost flex-1 rounded px-3 py-2 text-xs"
				class:btn-ghost-active={mobilePanel === 'actions'}
				on:click={() => (mobilePanel = 'actions')}
			>
				Actions
			</button>
			<button
				type="button"
				class="btn-ghost flex-1 rounded px-3 py-2 text-xs"
				class:btn-ghost-active={mobilePanel === 'graph'}
				on:click={() => (mobilePanel = 'graph')}
			>
				Graph
			</button>
			<button
				type="button"
				class="btn-ghost flex-1 rounded px-3 py-2 text-xs"
				class:btn-ghost-active={mobilePanel === 'insights'}
				on:click={() => (mobilePanel = 'insights')}
			>
				Insights
			</button>
		</div>
	</header>

	<div class="grid gap-4 xl:grid-cols-[1.1fr_1fr_1fr]">
		<div class="md:block" class:hidden={mobilePanel !== 'actions'}>
			<ActionSurface
				actions={actionOptions}
				selectedActionId={currentActionId}
				loading={loading}
				on:select={(event) => (currentActionId = event.detail.actionId)}
				on:execute={(event) => void handleExecuteAction(event.detail.actionId)}
			/>
		</div>

		<section class="glass-panel p-4 md:block" class:hidden={mobilePanel !== 'graph'}>
			<h2 class="text-lg font-semibold">Plan View</h2>
			<GraphModeSelector
				graphMode={graphMode}
				on:select={(event) => (graphModeOverride = event.detail.graphMode)}
			/>
			<div class="mt-3">
				<CaiplPlanGraphView
					nodes={planGraph.nodes}
					edges={planGraph.edges}
					selectedNodeId={selectedGraphNodeId}
					graphMode={graphMode}
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

		<div class="space-y-4 md:block" class:hidden={mobilePanel !== 'insights'}>
			<DecisionSurface
				decisions={pendingDecisions}
				loading={loading}
				selectedDecisionId={selectedDecisionId}
				selectedOptionId={selectedOptionId}
				on:selectDecision={handleSelectDecision}
				on:selectOption={handleSelectOption}
				on:resolve={handleDecisionResolve}
			/>

			<FormSurface option={selectedOption as CaiplDecisionOption | null} loading={loading} on:submit={handleFormSubmit} />

			<NotebookPanel
				notebook={notebook}
				on:inspectNode={(event) => (selectedGraphNodeId = event.detail.nodeId)}
			/>
		</div>
	</div>
</section>
