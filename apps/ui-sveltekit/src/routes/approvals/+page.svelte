<script lang="ts">
	import { onMount } from 'svelte';
	import {
		approveApprovalTask,
		listMyApprovalTasks,
		rejectApprovalTask,
		type ApprovalTaskSummary
	} from '$lib/api/mesh';
	import { actorStore } from '$lib/stores/actorStore';

	let tasks: ApprovalTaskSummary[] = [];
	let loading = false;
	let error = '';
	let notice = '';
	let lastActorId = '';

	async function refresh() {
		loading = true;
		error = '';
		try {
			tasks = await listMyApprovalTasks($actorStore);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load approvals';
		} finally {
			loading = false;
		}
	}

	async function decide(task: ApprovalTaskSummary, decision: 'approve' | 'reject') {
		error = '';
		notice = '';
		try {
			if (decision === 'approve') {
				await approveApprovalTask($actorStore, task.task_id);
				notice = `Task ${task.task_id} approved and executed.`;
			} else {
				await rejectApprovalTask($actorStore, task.task_id);
				notice = `Task ${task.task_id} rejected.`;
			}
			await refresh();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to record decision';
		}
	}

	onMount(refresh);

	$: if ($actorStore.actorId !== lastActorId) {
		lastActorId = $actorStore.actorId;
		void refresh();
	}
</script>

<section class="space-y-4 p-4">
	<div>
		<h1 class="text-xl font-semibold">Approvals</h1>
		<p class="ui-muted text-sm">
			Actions that governance routed to an approver. Acting as <strong>{$actorStore.actorId}</strong>.
		</p>
	</div>

	{#if error}<p class="text-sm text-red-600">{error}</p>{/if}
	{#if notice}<p class="text-sm text-green-600">{notice}</p>{/if}
	{#if loading}<p class="ui-muted text-sm">Loading…</p>{/if}

	{#if !loading && tasks.length === 0}
		<p class="ui-muted text-sm">No approval tasks are assigned to you.</p>
	{/if}

	<div class="space-y-2">
		{#each tasks as task (task.task_id)}
			<div class="flex items-center justify-between rounded-md border p-3 text-sm">
				<div>
					<strong>{task.action}</strong>
					{task.resource_type ?? ''}
					{task.resource_id}
					<span class="ui-muted">
						· {task.domain} · requested by {task.requested_by} · tier {task.escalated_to_tier ??
							task.required_tier ??
							'?'}+ · {task.status}
					</span>
				</div>
				{#if task.status === 'PENDING'}
					<div class="flex gap-2">
						<button class="btn-primary rounded-md px-2 py-1 text-xs" on:click={() => decide(task, 'approve')}>
							Approve
						</button>
						<button class="btn-ghost rounded-md px-2 py-1 text-xs" on:click={() => decide(task, 'reject')}>
							Reject
						</button>
					</div>
				{/if}
			</div>
		{/each}
	</div>
</section>
