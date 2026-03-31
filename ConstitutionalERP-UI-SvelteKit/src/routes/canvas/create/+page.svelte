<script lang="ts">
	import { resolve } from '$app/paths';

	type OperationKey =
		| 'create-customer'
		| 'create-quote'
		| 'create-supplier'
		| 'create-requisition'
		| 'create-employee'
		| 'create-journal';

	interface CreateOperation {
		key: OperationKey;
		title: string;
		description: string;
	}

	interface CreateResult {
		operation: string;
		entityType?: string;
		entityId?: string;
		data: unknown;
	}

	const operations: CreateOperation[] = [
		{
			key: 'create-customer',
			title: 'Create Customer',
			description: 'Bootstrap O2C customer records.'
		},
		{
			key: 'create-quote',
			title: 'Create Quote',
			description: 'Create O2C quote (auto-creates customer if needed).'
		},
		{
			key: 'create-supplier',
			title: 'Create Supplier',
			description: 'Bootstrap P2P supplier records.'
		},
		{
			key: 'create-requisition',
			title: 'Create Requisition',
			description: 'Create a Draft requisition with default requester.'
		},
		{
			key: 'create-employee',
			title: 'Create Employee',
			description: 'Create an Active employee record.'
		},
		{
			key: 'create-journal',
			title: 'Create Journal',
			description: 'Create Draft journal in first available fiscal period.'
		}
	];

	let runningKey: OperationKey | null = null;
	let errorMessage = '';
	let lastResult: CreateResult | null = null;

	async function runOperation(operation: CreateOperation): Promise<void> {
		runningKey = operation.key;
		errorMessage = '';

		try {
			const response = await fetch(resolve(`/api/hub/bootstrap/${operation.key}`), {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				}
			});

			if (!response.ok) {
				const text = await response.text();
				throw new Error(text || 'Create operation failed.');
			}

			lastResult = (await response.json()) as CreateResult;
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Create operation failed.';
			lastResult = null;
		} finally {
			runningKey = null;
		}
	}

</script>

<section class="glass-panel p-6">
	<h2 class="text-2xl font-semibold">Create New Entity</h2>
	<p class="muted mt-2 text-sm">Use one-click bootstrap actions to create new ERP entities.</p>

	<div class="mt-5 grid gap-3 md:grid-cols-2">
		{#each operations as operation (operation.key)}
			<div class="rounded-lg border border-white/15 bg-white/5 p-4">
				<h3 class="text-lg font-semibold">{operation.title}</h3>
				<p class="muted mt-1 text-sm">{operation.description}</p>
				<button
					type="button"
					class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
					on:click={() => runOperation(operation)}
					disabled={runningKey !== null}
				>
					{runningKey === operation.key ? 'Creating...' : operation.title}
				</button>
			</div>
		{/each}
	</div>

	{#if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{/if}

	{#if lastResult}
		<div class="mt-4 rounded-md border border-emerald-500/45 bg-emerald-500/10 p-4 text-sm">
			<p class="font-semibold">{lastResult.operation} completed.</p>
			{#if lastResult.entityType && lastResult.entityId}
				<p class="mt-1">Created {lastResult.entityType} / {lastResult.entityId}</p>
			{/if}
			<div class="mt-3 flex flex-wrap gap-2">
				{#if lastResult.entityType && lastResult.entityId}
					<a
						class="rounded-md border border-white/35 px-3 py-2 text-xs text-white"
						href={resolve(`/canvas/${lastResult.entityType}/${lastResult.entityId}`)}
					>
						Open Process
					</a>
				{/if}
				<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white" href={resolve('/')}>
					Back to Dashboard
				</a>
			</div>
		</div>
	{/if}
</section>
