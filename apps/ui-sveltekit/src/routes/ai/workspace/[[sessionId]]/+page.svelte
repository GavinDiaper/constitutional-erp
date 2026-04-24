<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		CaiplVersionMismatch,
		createCaiplSession,
		getCaiplSession,
		resolveCaiplDecision,
		sendCaiplTurn,
		type CaiplArtefact,
		type CaiplGraphDelta,
		type CaiplNotebookDelta,
		type CaiplDecisionPoint,
		type CaiplInteractionTurn,
		type CaiplPlanGraph as CaiplPlanGraphModel,
		type CaiplSession,
		type SessionSnapshotResponse
	} from '$lib/api/caipl';
	import CaiplPlanGraph from '$lib/components/ai/CaiplPlanGraph.svelte';
	import { actorStore } from '$lib/stores/actorStore';

	interface PageData {
		sessionId: string | null;
	}

	export let data: PageData;

	let session: CaiplSession | null = null;
	let turns: CaiplInteractionTurn[] = [];
	let decisions: CaiplDecisionPoint[] = [];
	let planGraph: CaiplPlanGraphModel = { nodes: [], edges: [] };
	let notebook: CaiplArtefact[] = [];
	let loading = false;
	let errorMessage = '';
	let turnText = '';
	let goalText = 'Plan and execute a constitutional ERP workflow';
	let selectedDecisionId = '';
	let controlNote = '';
	let showEventLog = false;
	let selectedGraphNodeId: string | null = null;

	$: routeSessionId = data.sessionId;

	$: if (routeSessionId && !loading && (!session || session.id !== routeSessionId)) {
		void hydrateSession(routeSessionId);
	}

	async function hydrateSession(sessionId: string): Promise<void> {
		loading = true;
		errorMessage = '';
		try {
			const snapshot = await getCaiplSession($actorStore, sessionId);
			applySnapshot(snapshot);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load CAIPL session';
		} finally {
			loading = false;
		}
	}

	function applySnapshot(snapshot: SessionSnapshotResponse): void {
		session = snapshot.session;
		turns = snapshot.turns;
		decisions = snapshot.decisions;
		planGraph = snapshot.planGraph;
		notebook = snapshot.notebook;
		if (!selectedDecisionId && decisions.length > 0) {
			selectedDecisionId = decisions[0].id;
		}
		if (!selectedGraphNodeId && planGraph.nodes.length > 0) {
			selectedGraphNodeId = planGraph.nodes[0].id;
		}
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

	$: selectedDecision = decisions.find((item) => item.id === selectedDecisionId) ?? decisions[0] ?? null;
	$: selectedGraphNode =
		(selectedGraphNodeId ? planGraph.nodes.find((node) => node.id === selectedGraphNodeId) : null) ??
		planGraph.nodes[0] ??
		null;

	async function handleCreateSession(): Promise<void> {
		loading = true;
		errorMessage = '';
		try {
			const result = await createCaiplSession($actorStore, {
				userId: $actorStore.actorId,
				currentGoal: goalText.trim() || 'Start planning'
			});
			session = result.session;
			turns = result.initialTurns;
			decisions = result.decisions;
			planGraph = result.planGraph;
			await goto(`/ai/workspace/${result.session.id}`);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to create session';
		} finally {
			loading = false;
		}
	}

	async function handleSendTurn(): Promise<void> {
		if (!session || !turnText.trim()) {
			return;
		}

		loading = true;
		errorMessage = '';
		try {
			const response = await sendCaiplTurn($actorStore, session.id, {
				actor: 'user',
				messageText: turnText.trim(),
				sessionVersion: session.version
			});
			turns = [...turns, ...response.newTurns];
			decisions = response.decisionPoints;
			applyGraphDelta(response.graphDelta);
			applyNotebookDelta(response.notebookDelta);
			session = response.session;
			turnText = '';
		} catch (error) {
			await handleVersionMismatch(error);
		} finally {
			loading = false;
		}
	}

	async function handleResolveDecision(
		decision: CaiplDecisionPoint,
		action: 'confirm' | 'reject' | 'amend' | 'retry' | 'escalate',
		note?: string
	): Promise<void> {
		if (!session) {
			return;
		}

		loading = true;
		errorMessage = '';
		try {
			const response = await resolveCaiplDecision($actorStore, decision.id, {
				action,
				actorId: $actorStore.actorId,
				sessionVersion: session.version,
				decisionVersion: decision.version,
				note
			});

			decisions = decisions.map((entry) =>
				entry.id === response.updatedDecision.id ? response.updatedDecision : entry
			);
			turns = [...turns, ...response.newTurns];
			applyGraphDelta(response.graphDelta);
			applyNotebookDelta(response.notebookDelta);
			session = response.session;
			controlNote = '';
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

	function formatArtefactContent(content: Record<string, unknown> | string): string {
		if (typeof content === 'string') {
			return content;
		}

		return JSON.stringify(content, null, 2);
	}

	function handleGraphSelect(event: CustomEvent<{ nodeId: string }>): void {
		selectedGraphNodeId = event.detail.nodeId;
	}
</script>

<section class="page-shell space-y-4">
	<header class="glass-panel p-4">
		<h1 class="text-2xl font-semibold">AI Workspace (CAIPL)</h1>
		<p class="muted mt-1 text-sm">
			Conversational planning and constitutional execution workspace.
		</p>

		<div class="mt-4 flex flex-wrap gap-2">
			<input
				class="input-base min-w-[280px] flex-1"
				bind:value={goalText}
				placeholder="Goal for this session"
			/>
			<button class="ui-soft-button px-4 py-2 text-sm" on:click={handleCreateSession} disabled={loading}>
				{loading ? 'Working...' : 'Create Session'}
			</button>
		</div>

		{#if session}
			<p class="mt-2 text-xs ui-muted">Session: {session.id} | Version: {session.version}</p>
		{/if}
		{#if errorMessage}
			<p class="mt-3 rounded-md border border-red-500/45 bg-red-500/10 p-2 text-sm text-red-200">
				{errorMessage}
			</p>
		{/if}

		<div class="mt-4 section-card p-3">
			<p class="text-sm font-semibold">How To Use This Page</p>
			<ol class="mt-2 list-decimal space-y-1 pl-5 text-xs ui-muted">
				<li>Create a session by entering a business goal and pressing <strong>Create Session</strong>.</li>
				<li>Start your conversation in the left panel by describing what outcome you want.</li>
				<li>When decisions appear, use <strong>Confirm</strong>, <strong>Reject</strong>, or <strong>Amend</strong>.</li>
				<li>Click nodes in the graph to inspect step details and current status.</li>
				<li>Read generated notes and updates in the Notebook panel.</li>
			</ol>
			<p class="mt-2 text-xs ui-muted">
				Starter prompts: "Plan a purchase approval workflow", "Prepare month-end close tasks", "Create a project procurement sequence".
			</p>
		</div>

		<div class="mt-4 section-card p-3">
			<p class="text-sm font-semibold">Constitutional Controls</p>
			{#if selectedDecision}
				<p class="ui-muted mt-1 text-xs">
					Selected decision: {selectedDecision.id} ({selectedDecision.status})
				</p>
				<div class="mt-2 flex flex-wrap gap-2">
					<select class="input-base text-xs" bind:value={selectedDecisionId}>
						{#each decisions as item (item.id)}
							<option value={item.id}>{item.type} [{item.status}]</option>
						{/each}
					</select>
					<input
						class="input-base min-w-[220px] flex-1 text-xs"
						bind:value={controlNote}
						placeholder="Optional amendment/rejection note"
					/>
					<button class="ui-soft-button px-2 py-1 text-xs" on:click={() => handleResolveDecision(selectedDecision, 'confirm', controlNote)} disabled={loading}>Confirm</button>
					<button class="ui-soft-button px-2 py-1 text-xs" on:click={() => handleResolveDecision(selectedDecision, 'reject', controlNote)} disabled={loading}>Reject</button>
					<button class="ui-soft-button px-2 py-1 text-xs" on:click={() => handleResolveDecision(selectedDecision, 'amend', controlNote)} disabled={loading}>Amend</button>
					<button class="ui-soft-button px-2 py-1 text-xs" on:click={() => (showEventLog = !showEventLog)}>
						{showEventLog ? 'Hide Log' : 'View Log'}
					</button>
				</div>
			{:else}
				<p class="ui-muted mt-1 text-xs">No active decision selected.</p>
			{/if}
		</div>
	</header>

	<div class="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
		<section class="glass-panel p-4">
			<h2 class="text-lg font-semibold">Conversation</h2>
			<div class="mt-3 max-h-[360px] space-y-2 overflow-auto">
				{#if turns.length === 0}
					<p class="ui-muted text-sm">No turns yet.</p>
				{:else}
					{#each turns as turn (turn.id)}
						<article class="item-card rounded-md p-2 text-sm">
							<p class="font-semibold uppercase tracking-wide">{turn.actor}</p>
							<p class="mt-1">{turn.messageText}</p>
							<p class="ui-muted mt-1 text-xs">{new Date(turn.createdAt).toLocaleString()}</p>
						</article>
					{/each}
				{/if}
			</div>

			<div class="mt-3 flex gap-2">
				<input class="input-base flex-1" bind:value={turnText} placeholder="Type your message" />
				<button class="ui-soft-button px-3 py-2 text-sm" on:click={handleSendTurn} disabled={!session || loading}>
					Send
				</button>
			</div>
		</section>

		<section class="glass-panel p-4">
			<h2 class="text-lg font-semibold">Plan Graph</h2>
			<div class="mt-3">
				<CaiplPlanGraph
					nodes={planGraph.nodes}
					edges={planGraph.edges}
					selectedNodeId={selectedGraphNodeId}
					on:select={handleGraphSelect}
				/>
			</div>
			{#if selectedGraphNode}
				<div class="mt-3 rounded-md border dark:border-white/20 border-slate-300 p-2 text-xs">
					<p class="font-semibold">Selected Node: {selectedGraphNode.label}</p>
					<p class="ui-muted mt-1">Type: {selectedGraphNode.type} | Status: {selectedGraphNode.status}</p>
					<pre class="mt-2 overflow-auto whitespace-pre-wrap text-[11px]">{JSON.stringify(selectedGraphNode.metadata, null, 2)}</pre>
				</div>
			{:else}
				<p class="mt-3 ui-muted text-xs">Nodes become selectable once a session has graph data.</p>
			{/if}
		</section>

		<section class="glass-panel p-4">
			<h2 class="text-lg font-semibold">Decisions</h2>
			<div class="mt-3 space-y-3 text-sm">
				{#if decisions.length === 0}
					<p class="ui-muted">No decision points.</p>
				{:else}
					{#each decisions as decision (decision.id)}
						<article class="item-card rounded-md p-3">
							<p class="font-semibold">{decision.type}</p>
							<p class="ui-muted mt-1 text-xs">
								Status: {decision.status} | Version: {decision.version}
							</p>
							<div class="mt-2 flex flex-wrap gap-2">
								<button
									class="ui-soft-button px-2 py-1 text-xs"
									on:click={() => handleResolveDecision(decision, 'confirm')}
									disabled={loading}
								>
									Confirm
								</button>
								<button
									class="ui-soft-button px-2 py-1 text-xs"
									on:click={() => handleResolveDecision(decision, 'amend')}
									disabled={loading}
								>
									Amend
								</button>
								<button
									class="ui-soft-button px-2 py-1 text-xs"
									on:click={() => handleResolveDecision(decision, 'reject')}
									disabled={loading}
								>
									Reject
								</button>
								<button
									class="ui-soft-button px-2 py-1 text-xs"
									on:click={() => handleResolveDecision(decision, 'escalate')}
									disabled={loading}
								>
									Escalate
								</button>
							</div>
						</article>
					{/each}
				{/if}
			</div>
		</section>
	</div>

	<div class="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
		<section class="glass-panel p-4">
			<h2 class="text-lg font-semibold">Notebook</h2>
			<div class="mt-3 max-h-[260px] space-y-2 overflow-auto">
				{#if notebook.length === 0}
					<p class="ui-muted text-sm">No artefacts yet.</p>
				{:else}
					{#each notebook as artefact (artefact.id)}
						<article class="item-card rounded-md p-2 text-xs">
							<p class="font-semibold uppercase tracking-wide">{artefact.type}</p>
							<p class="ui-muted mt-1">Linked node: {artefact.linkedNodeId}</p>
							<pre class="mt-2 overflow-auto whitespace-pre-wrap text-[11px]">{formatArtefactContent(artefact.content)}</pre>
						</article>
					{/each}
				{/if}
			</div>
		</section>

		{#if showEventLog}
			<section class="glass-panel p-4">
				<h2 class="text-lg font-semibold">Event Log</h2>
				<div class="mt-3 max-h-[260px] space-y-2 overflow-auto text-xs">
					{#each turns.filter((turn) => turn.actor === 'system') as eventTurn (eventTurn.id)}
						<article class="item-card rounded-md p-2">
							<p class="font-semibold">{eventTurn.messageText}</p>
							<p class="ui-muted mt-1">{new Date(eventTurn.createdAt).toLocaleString()}</p>
						</article>
					{:else}
						<p class="ui-muted">No system log events yet.</p>
					{/each}
				</div>
			</section>
		{/if}
	</div>
</section>
