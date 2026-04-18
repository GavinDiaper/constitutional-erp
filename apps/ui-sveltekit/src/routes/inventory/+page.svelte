<script lang="ts">
	import { onMount } from 'svelte';
	import { actorStore } from '$lib/stores/actorStore';
	import {
		createInventoryOrganization,
		createInventorySku,
		listInventoryMovements,
		listInventoryOnHand,
		listInventoryOrganizations,
		listInventorySkus,
		postInventoryMovement,
		type InventoryMovement,
		type InventoryOnHand,
		type InventoryOrganization,
		type InventorySku
	} from '$lib/api/inventory';

	let loading = false;
	let errorMessage = '';
	let infoMessage = '';

	let skus: InventorySku[] = [];
	let organizations: InventoryOrganization[] = [];
	let onHandRows: InventoryOnHand[] = [];
	let movements: InventoryMovement[] = [];

	let skuCode = '';
	let skuDescription = '';
	let skuCategory = '';
	const unitOptions = ['Each', 'Bag', 'Case', 'Gallon', 'LB', 'Quart', 'Tub', 'Box', 'Can'];
	let skuUom = 'Each';
	let skuValuationMethod: 'standard' | 'moving_average' = 'standard';
	let skuStandardCost = '0';

	let organizationName = '';
	let organizationLedgerId = '';

	let movementSkuId = '';
	let movementOrganizationId = '';
	let movementType: 'receipt' | 'issue' | 'adjustment' | 'cost_update' = 'receipt';
	let movementQuantity = '1';
	let movementUnitCost = '0';
	let movementReason = '';
	let movementReferenceType = '';
	let movementReferenceId = '';
	let movementCorrelationKey = '';

	onMount(() => {
		void refreshAll();
	});

	async function refreshAll(): Promise<void> {
		loading = true;
		errorMessage = '';

		try {
			const [skuRes, orgRes, onHandRes, movementRes] = await Promise.all([
				listInventorySkus($actorStore),
				listInventoryOrganizations($actorStore),
				listInventoryOnHand($actorStore),
				listInventoryMovements($actorStore)
			]);

			skus = skuRes.data ?? [];
			organizations = orgRes.data ?? [];
			onHandRows = onHandRes.data ?? [];
			movements = movementRes.data ?? [];

			if (!movementSkuId && skus.length > 0) {
				movementSkuId = skus[0].sku_id;
			}
			if (!movementOrganizationId && organizations.length > 0) {
				movementOrganizationId = organizations[0].organization_id;
			}
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to load inventory data.';
		} finally {
			loading = false;
		}
	}

	async function onCreateSku(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		errorMessage = '';
		infoMessage = '';

		try {
			await createInventorySku($actorStore, {
				skuCode,
				description: skuDescription,
				category: skuCategory || undefined,
				uom: skuUom,
				valuationMethod: skuValuationMethod,
				standardCost: Number(skuStandardCost)
			});

			infoMessage = `SKU ${skuCode} created.`;
			skuCode = '';
			skuDescription = '';
			skuCategory = '';
			skuStandardCost = '0';
			await refreshAll();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to create SKU.';
		}
	}

	async function onCreateOrganization(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		errorMessage = '';
		infoMessage = '';

		try {
			await createInventoryOrganization($actorStore, {
				name: organizationName,
				ledgerId: organizationLedgerId || undefined
			});

			infoMessage = `Organization ${organizationName} created.`;
			organizationName = '';
			organizationLedgerId = '';
			await refreshAll();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to create organization.';
		}
	}

	async function onPostMovement(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		errorMessage = '';
		infoMessage = '';

		try {
			const movement = await postInventoryMovement($actorStore, {
				skuId: movementSkuId,
				organizationId: movementOrganizationId,
				movementType,
				quantity: Number(movementQuantity),
				unitCost: Number(movementUnitCost),
				reason: movementReason || undefined,
				referenceType: movementReferenceType || undefined,
				referenceId: movementReferenceId || undefined,
				correlationKey: movementCorrelationKey || undefined
			});

			infoMessage = `Movement posted: ${movement.movement_id}`;
			movementReason = '';
			movementReferenceType = '';
			movementReferenceId = '';
			movementCorrelationKey = '';
			await refreshAll();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to post movement.';
		}
	}
</script>

<section class="space-y-6">
	<header class="glass-panel p-5">
		<h1 class="text-2xl font-semibold">Inventory Console</h1>
		<p class="mt-2 text-sm opacity-80">
			Manage foundational inventory entities and post movements for constitutional inventory flows.
		</p>
	</header>

	{#if errorMessage}
		<p class="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{errorMessage}</p>
	{/if}
	{#if infoMessage}
		<p class="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{infoMessage}</p>
	{/if}

	<div class="grid gap-4 lg:grid-cols-3">
		<form class="glass-panel space-y-3 p-4" on:submit={onCreateSku}>
			<h2 class="text-base font-semibold">Create SKU</h2>
			<input class="w-full rounded bg-black/20 p-2" bind:value={skuCode} placeholder="SKU code" required />
			<input class="w-full rounded bg-black/20 p-2" bind:value={skuDescription} placeholder="Description" required />
			<input class="w-full rounded bg-black/20 p-2" bind:value={skuCategory} placeholder="Category" />
			<select class="w-full rounded bg-black/20 p-2" bind:value={skuUom}>
				{#each unitOptions as unit}
					<option value={unit}>{unit}</option>
				{/each}
			</select>
			<select class="w-full rounded bg-black/20 p-2" bind:value={skuValuationMethod}>
				<option value="standard">Standard</option>
				<option value="moving_average">Moving Average</option>
			</select>
			<input class="w-full rounded bg-black/20 p-2" bind:value={skuStandardCost} type="number" min="0" step="0.01" />
			<button class="rounded bg-sky-600 px-3 py-2 text-sm font-semibold" type="submit">Create SKU</button>
		</form>

		<form class="glass-panel space-y-3 p-4" on:submit={onCreateOrganization}>
			<h2 class="text-base font-semibold">Create Organization</h2>
			<input class="w-full rounded bg-black/20 p-2" bind:value={organizationName} placeholder="Warehouse name" required />
			<input class="w-full rounded bg-black/20 p-2" bind:value={organizationLedgerId} placeholder="Ledger ID (optional)" />
			<button class="rounded bg-cyan-600 px-3 py-2 text-sm font-semibold" type="submit">Create Organization</button>
		</form>

		<form class="glass-panel space-y-3 p-4" on:submit={onPostMovement}>
			<h2 class="text-base font-semibold">Post Movement</h2>
			<select class="w-full rounded bg-black/20 p-2" bind:value={movementSkuId} required>
				<option value="" disabled>Select SKU</option>
				{#each skus as sku}
					<option value={sku.sku_id}>{sku.sku_code} ({sku.valuation_method})</option>
				{/each}
			</select>
			<select class="w-full rounded bg-black/20 p-2" bind:value={movementOrganizationId} required>
				<option value="" disabled>Select Organization</option>
				{#each organizations as org}
					<option value={org.organization_id}>{org.name}</option>
				{/each}
			</select>
			<select class="w-full rounded bg-black/20 p-2" bind:value={movementType}>
				<option value="receipt">Receipt</option>
				<option value="issue">Issue</option>
				<option value="adjustment">Adjustment</option>
				<option value="cost_update">Cost Update</option>
			</select>
			<input class="w-full rounded bg-black/20 p-2" bind:value={movementQuantity} type="number" step="0.01" />
			<input class="w-full rounded bg-black/20 p-2" bind:value={movementUnitCost} type="number" step="0.01" min="0" />
			<input class="w-full rounded bg-black/20 p-2" bind:value={movementReason} placeholder="Reason" />
			<input class="w-full rounded bg-black/20 p-2" bind:value={movementReferenceType} placeholder="Reference type" />
			<input class="w-full rounded bg-black/20 p-2" bind:value={movementReferenceId} placeholder="Reference ID" />
			<input class="w-full rounded bg-black/20 p-2" bind:value={movementCorrelationKey} placeholder="Correlation key" />
			<button class="rounded bg-indigo-600 px-3 py-2 text-sm font-semibold" type="submit">Post Movement</button>
		</form>
	</div>

	<div class="grid gap-4 xl:grid-cols-2">
		<section class="glass-panel p-4">
			<div class="mb-2 flex items-center justify-between">
				<h2 class="text-base font-semibold">On Hand</h2>
				<button class="rounded bg-white/10 px-2 py-1 text-xs" on:click={() => refreshAll()} disabled={loading}>Refresh</button>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<thead>
						<tr class="border-b border-white/10">
							<th class="py-1">SKU</th>
							<th class="py-1">Org</th>
							<th class="py-1">Qty</th>
							<th class="py-1">Value</th>
							<th class="py-1">Avg</th>
						</tr>
					</thead>
					<tbody>
						{#if onHandRows.length === 0}
							<tr><td class="py-2 opacity-70" colspan="5">No inventory on hand yet.</td></tr>
						{:else}
							{#each onHandRows as row}
								<tr class="border-b border-white/5">
									<td class="py-1">{row.sku_id}</td>
									<td class="py-1">{row.organization_id}</td>
									<td class="py-1">{row.quantity_on_hand}</td>
									<td class="py-1">{row.inventory_value}</td>
									<td class="py-1">{row.moving_average_cost}</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</section>

		<section class="glass-panel p-4">
			<h2 class="mb-2 text-base font-semibold">Recent Movements</h2>
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<thead>
						<tr class="border-b border-white/10">
							<th class="py-1">Movement</th>
							<th class="py-1">Type</th>
							<th class="py-1">SKU</th>
							<th class="py-1">Qty</th>
							<th class="py-1">Total</th>
						</tr>
					</thead>
					<tbody>
						{#if movements.length === 0}
							<tr><td class="py-2 opacity-70" colspan="5">No movements posted yet.</td></tr>
						{:else}
							{#each movements as movement}
								<tr class="border-b border-white/5">
									<td class="py-1">{movement.movement_id}</td>
									<td class="py-1">{movement.movement_type}</td>
									<td class="py-1">{movement.sku_id}</td>
									<td class="py-1">{movement.quantity}</td>
									<td class="py-1">{movement.total_cost}</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</section>
	</div>
</section>
