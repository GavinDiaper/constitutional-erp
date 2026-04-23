<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		CaiplVersionMismatch,
		createCaiplSession,
		getCaiplSession,
		resolveCaiplDecision,
		sendCaiplTurn,
		type CaiplDecisionPoint,
		type CaiplInteractionTurn,
		type CaiplPlanGraph,
		type CaiplSession,
		type SessionSnapshotResponse
	} from '$lib/api/caipl';
	import { actorStore } from '$lib/stores/actorStore';

	interface PageData {
		sessionId: string | null;
	}

	export let data: PageData;

	let session: CaiplSession | null = null;
	let turns: CaiplInteractionTurn[] = [];
	let decisions: CaiplDecisionPoint[] = [];
	let planGraph: CaiplPlanGraph = { nodes: [], edges: [] };
	let loading = false;
	let errorMessage = '';
	let turnText = '';
	let goalText = 'Plan and execute a constitutional ERP workflow';

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
	}

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
		action: 'confirm' | 'reject' | 'amend' | 'retry' | 'escalate'
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
				decisionVersion: decision.version
			});

			decisions = decisions.map((entry) =>
				entry.id === response.updatedDecision.id ? response.updatedDecision : entry
			);
			turns = [...turns, ...response.newTurns];
			session = response.session;
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
			<ul class="mt-3 space-y-2 text-sm">
				{#if planGraph.nodes.length === 0}
					<li class="ui-muted">No graph nodes yet.</li>
				{:else}
					{#each planGraph.nodes as node (node.id)}
						<li class="item-card rounded-md p-2">
							<p class="font-semibold">{node.label}</p>
							<p class="ui-muted text-xs">{node.type} | {node.status}</p>
						</li>
					{/each}
				{/if}
			</ul>
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
</section>
