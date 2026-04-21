<script lang="ts">
	import { onMount } from 'svelte';
	import { actorStore } from '$lib/stores/actorStore';
	import {
		activateInventoryBom,
		createInventoryBom,
		createInventoryBomComponent,
		createInventoryOrganization,
		createInventorySku,
		listInventoryBoms,
		listInventoryBomComponents,
		listInventoryMovements,
		listInventoryOnHand,
		listInventoryOrganizations,
		listInventorySkus,
		postInventoryMovement,
		type InventoryBomHeader,
		type InventoryBomComponent,
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
	let boms: InventoryBomHeader[] = [];
	let bomComponents: InventoryBomComponent[] = [];

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

	let bomSkuId = '';
	let bomOrganizationId = '';
	let bomRevision = 'A';
	let bomDescription = '';
	let bomProjectEligible = true;
	let bomCostingProfile = 'Standard';
	let selectedBomId = '';
	let activatingBomId = '';

	let componentBomId = '';
	let componentSkuId = '';
	let componentLineNumber = '';
	let componentDescription = '';
	let componentQuantity = '1';
	let componentQuantityUom = 'Each';
	let componentScrapPercentage = '0';
	let componentStandardCost = '0';
	let componentIsPhantom = false;

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
			if (!bomSkuId && skus.length > 0) {
				bomSkuId = skus[0].sku_id;
			}
			if (!bomOrganizationId && organizations.length > 0) {
				bomOrganizationId = organizations[0].organization_id;
			}

			await refreshBoms();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to load inventory data.';
		} finally {
			loading = false;
		}
	}

	async function refreshBoms(): Promise<void> {
		if (!bomOrganizationId) {
			boms = [];
			selectedBomId = '';
			componentBomId = '';
			bomComponents = [];
			return;
		}

		const bomRes = await listInventoryBoms($actorStore, { organizationId: bomOrganizationId, limit: 100, offset: 0 });
		boms = bomRes.data ?? [];

		if (boms.length === 0) {
			selectedBomId = '';
			componentBomId = '';
			bomComponents = [];
			return;
		}

		if (!selectedBomId || !boms.some((bom) => bom.bomId === selectedBomId)) {
			selectedBomId = boms[0].bomId;
		}
		if (!componentBomId || !boms.some((bom) => bom.bomId === componentBomId)) {
			componentBomId = selectedBomId;
		}

		await refreshBomComponents();
	}

	async function refreshBomComponents(): Promise<void> {
		if (!selectedBomId) {
			bomComponents = [];
			return;
		}

		const componentRes = await listInventoryBomComponents($actorStore, selectedBomId);
		bomComponents = componentRes.data ?? [];
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

	async function onCreateBom(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		errorMessage = '';
		infoMessage = '';

		try {
			const created = await createInventoryBom($actorStore, {
				skuId: bomSkuId,
				organizationId: bomOrganizationId,
				revision: bomRevision,
				description: bomDescription || undefined,
				projectEligible: bomProjectEligible,
				costingProfile: bomCostingProfile || undefined
			});

			infoMessage = `BoM ${created.data.bomId} created in Draft status.`;
			bomRevision = 'A';
			bomDescription = '';
			await refreshBoms();
			selectedBomId = created.data.bomId;
			componentBomId = created.data.bomId;
			await refreshBomComponents();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to create BoM.';
		}
	}

	async function onAddBomComponent(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		errorMessage = '';
		infoMessage = '';

		try {
			if (!componentBomId) {
				throw new Error('Select a BoM to add a component.');
			}

			const created = await createInventoryBomComponent($actorStore, componentBomId, {
				componentSkuId,
				componentLineNumber: componentLineNumber ? Number(componentLineNumber) : undefined,
				componentDescription: componentDescription || undefined,
				quantity: Number(componentQuantity),
				quantityUom: componentQuantityUom,
				scrapPercentage: Number(componentScrapPercentage),
				isPhantom: componentIsPhantom,
				standardCost: Number(componentStandardCost)
			});

			infoMessage = `BoM component ${created.data.componentId} added.`;
			componentLineNumber = '';
			componentDescription = '';
			componentQuantity = '1';
			componentScrapPercentage = '0';
			componentStandardCost = '0';
			componentIsPhantom = false;

			selectedBomId = componentBomId;
			await refreshBomComponents();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to add BoM component.';
		}
	}

	async function onActivateBom(bomId: string): Promise<void> {
		errorMessage = '';
		infoMessage = '';
		activatingBomId = bomId;

		try {
			const activated = await activateInventoryBom($actorStore, bomId);
			infoMessage = `BoM ${activated.data.bomId} activated.`;
			await refreshBoms();
			if (selectedBomId === bomId) {
				await refreshBomComponents();
			}
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to activate BoM.';
		} finally {
			activatingBomId = '';
		}
	}

	function onSelectedBomChanged(): void {
		componentBomId = selectedBomId;
		void refreshBomComponents();
	}
</script>

<section class="space-y-6 text-slate-900 dark:text-white">
	<header class="glass-panel p-5">
		<h1 class="text-2xl font-semibold">Inventory Console</h1>
		<p class="mt-2 text-sm ui-muted">
			Manage foundational inventory entities and post movements for constitutional inventory flows.
		</p>
	</header>

	{#if errorMessage}
		<p class="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-200">{errorMessage}</p>
	{/if}
	{#if infoMessage}
		<p class="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-200">{infoMessage}</p>
	{/if}

	<div class="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
		<form class="glass-panel space-y-3 p-4" on:submit={onCreateSku}>
			<h2 class="text-base font-semibold">Create SKU</h2>
			<input class="input-base w-full" bind:value={skuCode} placeholder="SKU code" required />
			<input class="input-base w-full" bind:value={skuDescription} placeholder="Description" required />
			<input class="input-base w-full" bind:value={skuCategory} placeholder="Category" />
			<select class="input-base w-full" bind:value={skuUom}>
				{#each unitOptions as unit}
					<option value={unit}>{unit}</option>
				{/each}
			</select>
			<select class="input-base w-full" bind:value={skuValuationMethod}>
				<option value="standard">Standard</option>
				<option value="moving_average">Moving Average</option>
			</select>
			<input class="input-base w-full" bind:value={skuStandardCost} type="number" min="0" step="0.01" />
			<button class="rounded bg-sky-600 px-3 py-2 text-sm font-semibold" type="submit">Create SKU</button>
		</form>

		<form class="glass-panel space-y-3 p-4" on:submit={onCreateOrganization}>
			<h2 class="text-base font-semibold">Create Organization</h2>
			<input class="input-base w-full" bind:value={organizationName} placeholder="Warehouse name" required />
			<input class="input-base w-full" bind:value={organizationLedgerId} placeholder="Ledger ID (optional)" />
			<button class="rounded bg-cyan-600 px-3 py-2 text-sm font-semibold" type="submit">Create Organization</button>
		</form>

		<form class="glass-panel space-y-3 p-4" on:submit={onPostMovement}>
			<h2 class="text-base font-semibold">Post Movement</h2>
			<select class="input-base w-full" bind:value={movementSkuId} required>
				<option value="" disabled>Select SKU</option>
				{#each skus as sku}
					<option value={sku.sku_id}>{sku.sku_code} ({sku.valuation_method})</option>
				{/each}
			</select>
			<select class="input-base w-full" bind:value={movementOrganizationId} required>
				<option value="" disabled>Select Organization</option>
				{#each organizations as org}
					<option value={org.organization_id}>{org.name}</option>
				{/each}
			</select>
			<select class="input-base w-full" bind:value={movementType}>
				<option value="receipt">Receipt</option>
				<option value="issue">Issue</option>
				<option value="adjustment">Adjustment</option>
				<option value="cost_update">Cost Update</option>
			</select>
			<input class="input-base w-full" bind:value={movementQuantity} type="number" step="0.01" />
			<input class="input-base w-full" bind:value={movementUnitCost} type="number" step="0.01" min="0" />
			<input class="input-base w-full" bind:value={movementReason} placeholder="Reason" />
			<input class="input-base w-full" bind:value={movementReferenceType} placeholder="Reference type" />
			<input class="input-base w-full" bind:value={movementReferenceId} placeholder="Reference ID" />
			<input class="input-base w-full" bind:value={movementCorrelationKey} placeholder="Correlation key" />
			<button class="rounded bg-indigo-600 px-3 py-2 text-sm font-semibold" type="submit">Post Movement</button>
		</form>

		<form class="glass-panel space-y-3 p-4" on:submit={onCreateBom}>
			<h2 class="text-base font-semibold">Create BoM</h2>
			<select class="input-base w-full" bind:value={bomSkuId} required>
				<option value="" disabled>Select Parent SKU</option>
				{#each skus as sku}
					<option value={sku.sku_id}>{sku.sku_code}</option>
				{/each}
			</select>
			<select class="input-base w-full" bind:value={bomOrganizationId} on:change={() => refreshBoms()} required>
				<option value="" disabled>Select Organization</option>
				{#each organizations as org}
					<option value={org.organization_id}>{org.name}</option>
				{/each}
			</select>
			<input class="input-base w-full" bind:value={bomRevision} placeholder="Revision (e.g. A)" required />
			<input class="input-base w-full" bind:value={bomDescription} placeholder="Description (optional)" />
			<input class="input-base w-full" bind:value={bomCostingProfile} placeholder="Costing profile" />
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={bomProjectEligible} />
				<span>Project Eligible</span>
			</label>
			<button class="rounded bg-emerald-600 px-3 py-2 text-sm font-semibold" type="submit" disabled={!bomSkuId || !bomOrganizationId}>Create BoM</button>
		</form>
	</div>

	<div class="grid gap-4 xl:grid-cols-2">
		<section class="glass-panel p-4">
			<div class="mb-2 flex items-center justify-between">
				<h2 class="text-base font-semibold">On Hand</h2>
				<button class="ui-soft-button px-2 py-1 text-xs" on:click={() => refreshAll()} disabled={loading}>Refresh</button>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<thead>
						<tr class="ui-table-compact-head">
							<th class="py-1">SKU</th>
							<th class="py-1">Org</th>
							<th class="py-1">Qty</th>
							<th class="py-1">Value</th>
							<th class="py-1">Avg</th>
						</tr>
					</thead>
					<tbody>
						{#if onHandRows.length === 0}
							<tr><td class="py-2 ui-muted" colspan="5">No inventory on hand yet.</td></tr>
						{:else}
							{#each onHandRows as row}
								<tr class="ui-table-compact-row">
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
						<tr class="ui-table-compact-head">
							<th class="py-1">Movement</th>
							<th class="py-1">Type</th>
							<th class="py-1">SKU</th>
							<th class="py-1">Qty</th>
							<th class="py-1">Total</th>
						</tr>
					</thead>
					<tbody>
						{#if movements.length === 0}
							<tr><td class="py-2 ui-muted" colspan="5">No movements posted yet.</td></tr>
						{:else}
							{#each movements as movement}
								<tr class="ui-table-compact-row">
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

	<section class="glass-panel p-4">
		<div class="mb-2 flex items-center justify-between gap-3">
			<h2 class="text-base font-semibold">BoM Headers</h2>
			<div class="flex items-center gap-2">
				<select class="input-base" bind:value={bomOrganizationId} on:change={() => refreshBoms()}>
					<option value="" disabled>Select Organization</option>
					{#each organizations as org}
						<option value={org.organization_id}>{org.name}</option>
					{/each}
				</select>
				<button class="ui-soft-button px-2 py-1 text-xs" on:click={() => refreshBoms()} disabled={loading || !bomOrganizationId}>Refresh</button>
			</div>
		</div>

		<div class="mb-3 flex items-center gap-2">
			<p class="text-xs text-slate-500 dark:text-white/60">Selected BoM</p>
			<select class="input-base" bind:value={selectedBomId} on:change={onSelectedBomChanged}>
				<option value="" disabled>Select BoM</option>
				{#each boms as bom}
					<option value={bom.bomId}>{bom.bomId} ({bom.skuId}/{bom.revision})</option>
				{/each}
			</select>
		</div>

		<div class="overflow-x-auto">
			<table class="w-full text-left text-sm">
				<thead>
					<tr class="ui-table-compact-head">
						<th class="py-1">BoM</th>
						<th class="py-1">Parent SKU</th>
						<th class="py-1">Revision</th>
						<th class="py-1">Status</th>
						<th class="py-1">Project Eligible</th>
						<th class="py-1">Created</th>
						<th class="py-1 text-center">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#if boms.length === 0}
						<tr><td class="py-2 ui-muted" colspan="7">No BoMs found for the selected organization.</td></tr>
					{:else}
						{#each boms as bom}
							<tr class="ui-table-compact-row">
								<td class="py-1">{bom.bomId}</td>
								<td class="py-1">{bom.skuId}</td>
								<td class="py-1">{bom.revision}</td>
								<td class="py-1">{bom.status}</td>
								<td class="py-1">{bom.projectEligible ? 'Yes' : 'No'}</td>
								<td class="py-1">{bom.createdAt.split('T')[0]}</td>
								<td class="py-1 text-center">
									{#if bom.status === 'Draft'}
										<button
											on:click={() => onActivateBom(bom.bomId)}
											class="text-green-600 hover:text-green-800 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
											disabled={loading || activatingBomId === bom.bomId}
										>
											{activatingBomId === bom.bomId ? 'Activating...' : 'Activate'}
										</button>
									{:else}
										<span class="ui-muted text-xs">-</span>
									{/if}
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</section>

	<section class="glass-panel p-4">
		<div class="mb-3 flex items-center justify-between gap-3">
			<h2 class="text-base font-semibold">Add BoM Component</h2>
			<button class="ui-soft-button px-2 py-1 text-xs" on:click={() => refreshBomComponents()} disabled={!selectedBomId}>Refresh Components</button>
		</div>

		<form class="grid gap-3 md:grid-cols-4" on:submit={onAddBomComponent}>
			<select class="input-base w-full" bind:value={componentBomId} required>
				<option value="" disabled>Select BoM</option>
				{#each boms as bom}
					<option value={bom.bomId}>{bom.bomId} ({bom.skuId}/{bom.revision})</option>
				{/each}
			</select>

			<select class="input-base w-full" bind:value={componentSkuId} required>
				<option value="" disabled>Select Component SKU</option>
				{#each skus as sku}
					<option value={sku.sku_id}>{sku.sku_code}</option>
				{/each}
			</select>

			<input class="input-base w-full" bind:value={componentLineNumber} type="number" placeholder="Line # (optional)" />
			<input class="input-base w-full" bind:value={componentDescription} placeholder="Component description (optional)" />

			<input class="input-base w-full" bind:value={componentQuantity} type="number" step="0.0001" min="0" placeholder="Quantity" required />
			<input class="input-base w-full" bind:value={componentQuantityUom} placeholder="Quantity UoM" required />
			<input class="input-base w-full" bind:value={componentScrapPercentage} type="number" step="0.01" min="0" placeholder="Scrap %" />
			<input class="input-base w-full" bind:value={componentStandardCost} type="number" step="0.01" min="0" placeholder="Standard cost" />

			<label class="flex items-center gap-2 text-sm md:col-span-2">
				<input type="checkbox" bind:checked={componentIsPhantom} />
				<span>Phantom Component</span>
			</label>

			<div class="md:col-span-2 md:flex md:justify-end">
				<button class="rounded bg-emerald-700 px-3 py-2 text-sm font-semibold text-white" type="submit" disabled={!componentBomId || !componentSkuId}>Add Component</button>
			</div>
		</form>

		<div class="mt-4 overflow-x-auto">
			<table class="w-full text-left text-sm">
				<thead>
					<tr class="ui-table-compact-head">
						<th class="py-1">Component ID</th>
						<th class="py-1">BoM</th>
						<th class="py-1">Component SKU</th>
						<th class="py-1">Line</th>
						<th class="py-1">Qty</th>
						<th class="py-1">UoM</th>
						<th class="py-1">Scrap %</th>
						<th class="py-1">Cost</th>
					</tr>
				</thead>
				<tbody>
					{#if !selectedBomId}
						<tr><td class="py-2 ui-muted" colspan="8">Select a BoM to view components.</td></tr>
					{:else if bomComponents.length === 0}
						<tr><td class="py-2 ui-muted" colspan="8">No components found for selected BoM.</td></tr>
					{:else}
						{#each bomComponents as component}
							<tr class="ui-table-compact-row">
								<td class="py-1">{component.componentId}</td>
								<td class="py-1">{component.bomId}</td>
								<td class="py-1">{component.componentSkuId}</td>
								<td class="py-1">{component.componentLineNumber}</td>
								<td class="py-1">{component.quantity}</td>
								<td class="py-1">{component.quantityUom}</td>
								<td class="py-1">{component.scrapPercentage}</td>
								<td class="py-1">{component.standardCost}</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</section>
</section>
