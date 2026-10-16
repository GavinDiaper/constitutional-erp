<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { queryTable } from '$lib/api/query';
	import { actorStore } from '$lib/stores/actorStore';
	import { ApprovalPendingError } from '$lib/api/mesh';
	import {
		approveContractVersion,
		createContract,
		createContractAmendment,
		getContract,
		listContracts,
		type Contract,
		type ContractDetail,
		type ContractVersionInput
	} from '$lib/api/contracts';

	interface CustomerRow {
		customer_id: string;
		customer_name: string;
		status?: string;
	}

	interface Deliverable {
		name: string;
		amount: number | null;
	}

	let contracts: Contract[] = [];
	let customers: CustomerRow[] = [];
	let filterCustomerId = '';
	let loading = false;
	let error = '';
	let notice = '';

	let showCreate = false;
	let formCustomerId = '';
	let formName = '';
	let formReference = '';
	let formValue: number | null = null;
	let formCurrency = 'USD';
	let formFrom = '';
	let formUntil = '';
	let formDeliverables: Deliverable[] = [{ name: '', amount: null }];
	let submitting = false;

	let selected: ContractDetail | null = null;
	let amendMode = false;

	$: customerName = (id: string) => customers.find((c) => c.customer_id === id)?.customer_name ?? id;

	async function refresh() {
		loading = true;
		error = '';
		try {
			contracts = (await listContracts($actorStore, filterCustomerId || undefined)).data ?? [];
			if (selected) selected = (await getContract($actorStore, selected.contract_id)).data;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load contracts';
		} finally {
			loading = false;
		}
	}

	onMount(async () => {
		try {
			customers = ((await queryTable<CustomerRow>('o2c_customer', $actorStore)).data ?? []).filter(
				(c) => c.status !== 'Inactive'
			);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load customers';
		}
		await refresh();
	});

	function buildVersion(): ContractVersionInput {
		if (formValue === null || formValue < 0) throw new Error('Contract value must be a non-negative number');
		if (!/^[A-Z]{3}$/.test(formCurrency)) throw new Error('Currency must be a 3-letter uppercase code');
		if (!formFrom) throw new Error('Effective from date is required');
		const deliverables = formDeliverables
			.filter((d) => d.name.trim())
			.map((d) => ({ name: d.name.trim(), amount: d.amount ?? 0 }));
		return {
			contractValue: formValue,
			currencyCode: formCurrency,
			effectiveFrom: formFrom,
			effectiveUntil: formUntil || undefined,
			sowSnapshot: { deliverables }
		};
	}

	function resetForm() {
		formCustomerId = '';
		formName = '';
		formReference = '';
		formValue = null;
		formCurrency = 'USD';
		formFrom = '';
		formUntil = '';
		formDeliverables = [{ name: '', amount: null }];
	}

	async function submitCreate() {
		submitting = true;
		error = '';
		notice = '';
		try {
			if (!formCustomerId) throw new Error('Select a customer');
			if (!formName.trim()) throw new Error('Name is required');
			const version = buildVersion();
			await createContract($actorStore, {
				customerId: formCustomerId,
				name: formName.trim(),
				externalReference: formReference.trim() || undefined,
				version
			});
			notice = 'Draft contract created. Approve it to make it available for Service projects.';
			showCreate = false;
			resetForm();
			await refresh();
		} catch (e) {
			if (e instanceof ApprovalPendingError) {
				notice = e.message;
				showCreate = false;
				resetForm();
			} else {
				error = e instanceof Error ? e.message : 'Failed to create contract';
			}
		} finally {
			submitting = false;
		}
	}

	async function openContract(id: string) {
		error = '';
		amendMode = false;
		try {
			selected = (await getContract($actorStore, id)).data;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load contract';
		}
	}

	async function approve(versionNumber: number) {
		if (!selected) return;
		error = '';
		notice = '';
		try {
			await approveContractVersion($actorStore, selected.contract_id, versionNumber);
			notice = `Version ${versionNumber} approved.`;
			await refresh();
		} catch (e) {
			if (e instanceof ApprovalPendingError) {
				notice = e.message;
			} else {
				error = e instanceof Error ? e.message : 'Failed to approve version';
			}
		}
	}

	async function startAmend() {
		const current = selected?.versions.find((v) => v.version_number === selected?.current_version);
		if (current) {
			formValue = current.contract_value;
			formCurrency = current.currency_code;
			formFrom = current.effective_from;
			formUntil = current.effective_until ?? '';
			try {
				const sow = JSON.parse(current.sow_snapshot ?? '{}') as { deliverables?: Deliverable[] };
				formDeliverables = sow.deliverables?.length ? sow.deliverables : [{ name: '', amount: null }];
			} catch {
				formDeliverables = [{ name: '', amount: null }];
			}
		}
		amendMode = true;
	}

	async function submitAmend() {
		if (!selected) return;
		submitting = true;
		error = '';
		notice = '';
		try {
			await createContractAmendment($actorStore, selected.contract_id, buildVersion());
			notice = 'Draft amendment created.';
			amendMode = false;
			await refresh();
		} catch (e) {
			if (e instanceof ApprovalPendingError) {
				notice = e.message;
				amendMode = false;
			} else {
				error = e instanceof Error ? e.message : 'Failed to create amendment';
			}
		} finally {
			submitting = false;
		}
	}

	function parseDeliverables(snapshot: string | null): Deliverable[] {
		try {
			return (JSON.parse(snapshot ?? '{}') as { deliverables?: Deliverable[] }).deliverables ?? [];
		} catch {
			return [];
		}
	}
</script>

<div class="space-y-6 p-4">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-semibold">Service Contracts</h1>
			<p class="ui-muted text-sm">
				Contracts must be Active with an Approved version before a Service project can use them.
				<a class="underline" href={resolve('/projects')}>Go to Projects</a>
			</p>
		</div>
		<button class="btn-primary rounded-md px-3 py-1.5 text-sm" on:click={() => (showCreate = !showCreate)}>
			{showCreate ? 'Cancel' : 'New Contract'}
		</button>
	</div>

	{#if error}<p class="text-sm text-red-600">{error}</p>{/if}
	{#if notice}<p class="text-sm text-green-600">{notice}</p>{/if}

	{#if showCreate}
		<form class="space-y-3 rounded-md border p-4" on:submit|preventDefault={submitCreate}>
			<h2 class="font-medium">New Contract (Draft)</h2>
			<div class="grid gap-3 md:grid-cols-2">
				<div>
					<label for="c-customer" class="mb-1 block text-sm font-medium">Customer</label>
					<select id="c-customer" bind:value={formCustomerId} class="input-base w-full">
						<option value="">Select a customer</option>
						{#each customers as c (c.customer_id)}
							<option value={c.customer_id}>{c.customer_name} ({c.customer_id})</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="c-name" class="mb-1 block text-sm font-medium">Name</label>
					<input id="c-name" class="input-base w-full" bind:value={formName} />
				</div>
				<div>
					<label for="c-ref" class="mb-1 block text-sm font-medium">External reference</label>
					<input id="c-ref" class="input-base w-full" bind:value={formReference} />
				</div>
				<div>
					<label for="c-value" class="mb-1 block text-sm font-medium">Contract value</label>
					<input id="c-value" type="number" min="0" class="input-base w-full" bind:value={formValue} />
				</div>
				<div>
					<label for="c-cur" class="mb-1 block text-sm font-medium">Currency</label>
					<input id="c-cur" maxlength="3" class="input-base w-full" bind:value={formCurrency} />
				</div>
				<div></div>
				<div>
					<label for="c-from" class="mb-1 block text-sm font-medium">Effective from</label>
					<input id="c-from" type="date" class="input-base w-full" bind:value={formFrom} />
				</div>
				<div>
					<label for="c-until" class="mb-1 block text-sm font-medium">Effective until</label>
					<input id="c-until" type="date" class="input-base w-full" bind:value={formUntil} />
				</div>
			</div>
			<div>
				<p class="mb-1 text-sm font-medium">SoW deliverables / milestones</p>
				{#each formDeliverables as d, i (i)}
					<div class="mb-2 flex gap-2">
						<input class="input-base flex-1" placeholder="Deliverable" bind:value={d.name} />
						<input class="input-base w-40" type="number" min="0" placeholder="Amount" bind:value={d.amount} />
						<button
							type="button"
							class="btn-ghost rounded-md px-2 text-xs"
							on:click={() => (formDeliverables = formDeliverables.filter((_, j) => j !== i))}>Remove</button
						>
					</div>
				{/each}
				<button
					type="button"
					class="btn-ghost rounded-md px-2 py-1 text-xs"
					on:click={() => (formDeliverables = [...formDeliverables, { name: '', amount: null }])}
					>Add deliverable</button
				>
			</div>
			<button class="btn-primary rounded-md px-3 py-1.5 text-sm" disabled={submitting}>
				{submitting ? 'Creating...' : 'Create draft'}
			</button>
		</form>
	{/if}

	<div class="flex items-center gap-2">
		<label for="f-customer" class="text-sm">Customer</label>
		<select id="f-customer" class="input-base" bind:value={filterCustomerId} on:change={refresh}>
			<option value="">All</option>
			{#each customers as c (c.customer_id)}
				<option value={c.customer_id}>{c.customer_name}</option>
			{/each}
		</select>
	</div>

	<table class="w-full text-left text-sm">
		<thead>
			<tr><th>Contract</th><th>Customer</th><th>Reference</th><th>Status</th><th>Current version</th><th></th></tr>
		</thead>
		<tbody>
			{#each contracts as c (c.contract_id)}
				<tr class="border-t">
					<td class="py-2">{c.name} <span class="ui-muted">({c.contract_id})</span></td>
					<td>{customerName(c.customer_id)}</td>
					<td>{c.external_reference ?? '—'}</td>
					<td>{c.status}</td>
					<td>{c.current_version ?? '—'}</td>
					<td><button class="btn-ghost rounded-md px-2 text-xs" on:click={() => openContract(c.contract_id)}>View</button></td>
				</tr>
			{/each}
			{#if !loading && contracts.length === 0}
				<tr><td colspan="6" class="ui-muted py-4">No contracts found.</td></tr>
			{/if}
		</tbody>
	</table>

	{#if selected}
		<section class="space-y-3 rounded-md border p-4">
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-medium">{selected.name} · {selected.status}</h2>
				<div class="flex gap-2">
					{#if selected.status === 'Active' && !selected.versions.some((v) => v.status === 'Draft')}
						<button class="btn-ghost rounded-md px-2 text-xs" on:click={startAmend}>New amendment</button>
					{/if}
					<button class="btn-ghost rounded-md px-2 text-xs" on:click={() => (selected = null)}>Close</button>
				</div>
			</div>

			{#if amendMode}
				<form class="space-y-2 rounded-md border p-3" on:submit|preventDefault={submitAmend}>
					<div class="grid gap-2 md:grid-cols-4">
						<input type="number" min="0" class="input-base" placeholder="Value" bind:value={formValue} />
						<input maxlength="3" class="input-base" bind:value={formCurrency} />
						<input type="date" class="input-base" bind:value={formFrom} />
						<input type="date" class="input-base" bind:value={formUntil} />
					</div>
					{#each formDeliverables as d, i (i)}
						<div class="flex gap-2">
							<input class="input-base flex-1" placeholder="Deliverable" bind:value={d.name} />
							<input class="input-base w-40" type="number" min="0" bind:value={d.amount} />
							<button
								type="button"
								class="btn-ghost rounded-md px-2 text-xs"
								on:click={() => (formDeliverables = formDeliverables.filter((_, j) => j !== i))}>Remove</button
							>
						</div>
					{/each}
					<button
						type="button"
						class="btn-ghost rounded-md px-2 py-1 text-xs"
						on:click={() => (formDeliverables = [...formDeliverables, { name: '', amount: null }])}
						>Add deliverable</button
					>
					<div class="flex gap-2">
						<button class="btn-primary rounded-md px-3 py-1 text-sm" disabled={submitting}>Create draft amendment</button>
						<button type="button" class="btn-ghost rounded-md px-3 py-1 text-sm" on:click={() => (amendMode = false)}>Cancel</button>
					</div>
				</form>
			{/if}

			{#each selected.versions as v (v.version_number)}
				<div class="rounded-md border p-3 text-sm">
					<div class="flex items-center justify-between">
						<strong>Version {v.version_number} · {v.status}</strong>
						{#if v.status === 'Draft'}
							{@const gov = v.approval_governance}
							<div class="flex items-center gap-2">
								{#if gov}
									<span class="ui-muted text-xs">{gov.riskLevel} risk · indicative approver tier {gov.requiredTier}+ (decided by governance)</span>
								{/if}
								<button
									class="btn-primary rounded-md px-2 py-1 text-xs"
									on:click={() => approve(v.version_number)}>Approve</button
								>
							</div>
						{/if}
					</div>
					<p>
						{v.contract_value} {v.currency_code} · {v.effective_from} → {v.effective_until ?? 'open-ended'}
					</p>
					{#each parseDeliverables(v.sow_snapshot) as d, i (i)}
						<p class="ui-muted">• {d.name}{d.amount ? ` — ${d.amount}` : ''}</p>
					{/each}
				</div>
			{/each}
		</section>
	{/if}
</div>
