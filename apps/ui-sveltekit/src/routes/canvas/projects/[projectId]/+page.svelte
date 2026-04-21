<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { actorStore } from '$lib/stores/actorStore';
	import {
		projectStore,
		projectStatusBadge,
		loadProject,
		clearProjectStore,
		updateCurrentProject
	} from '$lib/stores/projectStore';
	import {
		getProjectById,
		activateProject,
		holdProject,
		resumeProject,
		completeProject,
		cancelProject,
		assignBomToProject,
		postLaborCost,
		createProjectFinishedItem,
		getProjectProcurementPreview,
		generateProjectRequisitionLines
	} from '$lib/api/projects';
	import type { Project, ProjectProcurementPreview } from '$lib/types/projects';

	let activeTab: 'overview' | 'boms' | 'labor' | 'finished' | 'linked' = 'overview';
	let loading = false;
	let errorMessage = '';
	let successMessage = '';

	// Form states
	let newBomId = '';
	let newBomQuantity = '1';

	let newResourceId = '';
	let newHours = '8';
	let newRate = '100';
	let newCostElementId = '';

	let newSkuId = '';
	let newFGQuantity = '1';
	let newUnitCost = '';

	let showTransitionMenu = false;
	let selectedTransition: 'activate' | 'hold' | 'resume' | 'complete' | 'cancel' | null = null;
	let transitionReason = '';
	let transitionCompletionType: 'FG_Conversion' | 'Expense_Close' = 'FG_Conversion';
	let procurementPreview: ProjectProcurementPreview | null = null;
	let procurementPreviewLoading = false;
	let procurementGenerateLoading = false;
	let procurementPreviewAttempted = false;
	let procurementPreviewProjectId = '';

	$: projectId = $page.params.projectId || '';

	function getStatusColor(status: string): string {
		const colors: Record<string, string> = {
			Draft: 'bg-gray-200 text-gray-800',
			Active: 'bg-green-200 text-green-800',
			OnHold: 'bg-yellow-200 text-yellow-800',
			Completed: 'bg-blue-200 text-blue-800',
			Cancelled: 'bg-red-200 text-red-800'
		};
		return colors[status] || 'bg-gray-100 text-gray-900';
	}

	function getNextActions(): Array<{ name: string; action: 'activate' | 'hold' | 'resume' | 'complete' | 'cancel' }> {
		const status = $projectStore.currentProject?.status;
		const actions: Array<{ name: string; action: 'activate' | 'hold' | 'resume' | 'complete' | 'cancel' }> = [];

		if (status === 'Draft') {
			actions.push({ name: 'Activate', action: 'activate' });
		} else if (status === 'Active') {
			actions.push({ name: 'Hold', action: 'hold' });
			actions.push({ name: 'Complete', action: 'complete' });
			actions.push({ name: 'Cancel', action: 'cancel' });
		} else if (status === 'OnHold') {
			actions.push({ name: 'Resume', action: 'resume' });
			actions.push({ name: 'Cancel', action: 'cancel' });
		}

		return actions;
	}

	function asCurrency(amount: number, currencyCode = 'USD'): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: currencyCode,
			maximumFractionDigits: 2
		}).format(amount);
	}

	async function handleTransition(project: Project | null) {
		if (!project || !selectedTransition) return;

		loading = true;
		errorMessage = '';
		successMessage = '';

		try {
			const actor = $actorStore;
			let updated;

			switch (selectedTransition) {
				case 'activate':
					updated = await activateProject(actor, project.projectId);
					break;
				case 'hold':
					updated = await holdProject(actor, project.projectId, transitionReason);
					break;
				case 'resume':
					updated = await resumeProject(actor, project.projectId);
					break;
				case 'complete':
					updated = await completeProject(actor, project.projectId, transitionCompletionType);
					break;
				case 'cancel':
					updated = await cancelProject(actor, project.projectId, transitionReason);
					break;
				default:
					return;
			}

			projectStore.update((state) => ({
				...state,
				currentProject: updated.data
			}));

			successMessage = `Project ${selectedTransition}d successfully!`;
			showTransitionMenu = false;
			selectedTransition = null;
			transitionReason = '';
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to transition project';
		} finally {
			loading = false;
		}
	}

	async function handleAssignBom() {
		if (!$projectStore.currentProject || !newBomId) return;

		loading = true;
		errorMessage = '';
		successMessage = '';

		try {
			const actor = $actorStore;
			await assignBomToProject(actor, $projectStore.currentProject.projectId, {
				bomId: newBomId,
				quantityPlanned: parseFloat(newBomQuantity)
			});

			successMessage = 'BOM assigned successfully!';
			newBomId = '';
			newBomQuantity = '1';

			// Reload to get updated assignments
			await loadProject($projectStore.currentProject.projectId);
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to assign BOM';
		} finally {
			loading = false;
		}
	}

	async function handlePostLabor() {
		if (!$projectStore.currentProject || !newResourceId) return;

		loading = true;
		errorMessage = '';
		successMessage = '';

		try {
			const actor = $actorStore;
			await postLaborCost(actor, $projectStore.currentProject.projectId, {
				resourceId: newResourceId,
				hours: parseFloat(newHours),
				rate: parseFloat(newRate),
				costElementId: newCostElementId || undefined
			});

			successMessage = 'Labor entry posted successfully!';
			newResourceId = '';
			newHours = '8';
			newRate = '100';
			newCostElementId = '';

			// Reload to get updated entries
			await loadProject($projectStore.currentProject.projectId);
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to post labor cost';
		} finally {
			loading = false;
		}
	}

	async function handleCreateFinishedItem() {
		if (!$projectStore.currentProject || !newSkuId) return;

		loading = true;
		errorMessage = '';
		successMessage = '';

		try {
			const actor = $actorStore;
			await createProjectFinishedItem(actor, $projectStore.currentProject.projectId, {
				skuId: newSkuId,
				organizationId: $projectStore.currentProject.organizationId,
				quantity: parseFloat(newFGQuantity),
				unitCost: newUnitCost ? parseFloat(newUnitCost) : undefined
			});

			successMessage = 'Finished item created successfully!';
			newSkuId = '';
			newFGQuantity = '1';
			newUnitCost = '';

			// Reload to get updated finished items
			await loadProject($projectStore.currentProject.projectId);
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to create finished item';
		} finally {
			loading = false;
		}
	}

	async function handleLoadProcurementPreview() {
		if (!$projectStore.currentProject) return;

		procurementPreviewAttempted = true;
		procurementPreviewProjectId = $projectStore.currentProject.projectId;
		procurementPreviewLoading = true;
		errorMessage = '';

		try {
			const actor = $actorStore;
			const response = await getProjectProcurementPreview(actor, $projectStore.currentProject.projectId);
			procurementPreview = response.data;
		} catch (err) {
			const detail = err instanceof Error ? err.message : 'Failed to load procurement preview';
			errorMessage = detail.toLowerCase().includes('404')
				? 'Procurement preview endpoint is not available in the running backend yet. Restart Foundation ERP service to load the new routes, then click Preview Procurement Gaps again.'
				: detail;
		} finally {
			procurementPreviewLoading = false;
		}
	}

	async function handleGenerateRequisitionLines() {
		if (!$projectStore.currentProject) return;

		procurementGenerateLoading = true;
		errorMessage = '';
		successMessage = '';

		try {
			const actor = $actorStore;
			const response = await generateProjectRequisitionLines(actor, $projectStore.currentProject.projectId);
			const result = response.data;
			successMessage = `Generated ${result.generatedLineCount} requisition lines in ${result.requisitionId}.`;
			procurementPreview = result.preview;
			await loadProject($projectStore.currentProject.projectId);
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to generate requisition lines';
		} finally {
			procurementGenerateLoading = false;
		}
	}

	$: if (
		activeTab === 'linked' &&
		$projectStore.currentProject &&
		!procurementPreview &&
		!procurementPreviewLoading &&
		!procurementPreviewAttempted
	) {
		void handleLoadProcurementPreview();
	}

	$: if (projectId && projectId !== procurementPreviewProjectId) {
		procurementPreview = null;
		procurementPreviewAttempted = false;
		procurementPreviewProjectId = projectId;
	}

	onMount(() => {
		if (projectId) {
			void loadProject(projectId);
		}

		return () => {
			clearProjectStore();
		};
	});
</script>

<div class="container mx-auto px-4 py-8 text-slate-900 dark:text-white">
	{#if $projectStore.loading && !$projectStore.currentProject}
		<div class="text-center py-12">
			<p class="text-slate-600 dark:text-white/70">Loading project...</p>
		</div>
	{:else if $projectStore.error && !$projectStore.currentProject}
		<div class="bg-red-100 border border-red-400 text-red-700 dark:bg-red-950/40 dark:border-red-500/50 dark:text-red-200 px-4 py-3 rounded">
			{$projectStore.error}
		</div>
	{:else if $projectStore.currentProject}
		<div class="mb-8">
			<div class="flex justify-between items-center mb-4">
				<div>
					<h1 class="text-3xl font-bold">{$projectStore.currentProject.name}</h1>
					<p class="text-slate-600 dark:text-white/70 mt-2">{$projectStore.currentProject.description || 'No description'}</p>
				</div>
				<div class="flex gap-4">
					<span class="px-4 py-2 rounded text-xs font-semibold {getStatusColor($projectStore.currentProject.status)}">
						{$projectStore.currentProject.status}
					</span>
					<button
						on:click={() => (showTransitionMenu = !showTransitionMenu)}
						class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
					>
						Actions
					</button>
				</div>
			</div>

			{#if showTransitionMenu}
				<div class="bg-slate-50 border border-slate-300 dark:bg-white/5 dark:border-white/15 rounded-lg p-4 mb-4">
					<h3 class="font-semibold mb-3">Project Actions</h3>
					<div class="space-y-2">
						{#each getNextActions() as action}
							<button
								on:click={() => {
									selectedTransition = action.action;
									showTransitionMenu = false;
								}}
								class="block w-full text-left px-3 py-2 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-sm"
							>
								{action.name}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			{#if selectedTransition}
				<div class="bg-blue-50 border border-blue-300 dark:bg-blue-950/35 dark:border-blue-700 rounded-lg p-4 mb-4">
					<h3 class="font-semibold mb-3">
						Confirm {selectedTransition === 'activate' ? 'Activation' : selectedTransition === 'hold' ? 'Hold' : selectedTransition === 'resume' ? 'Resume' : selectedTransition === 'complete' ? 'Completion' : 'Cancellation'}
					</h3>

					{#if selectedTransition === 'hold' || selectedTransition === 'cancel'}
						<div class="mb-3">
							<label for="reason" class="block text-sm font-medium mb-1">Reason</label>
							<textarea id="reason" bind:value={transitionReason} class="w-full rounded border border-slate-300 dark:border-white/25 bg-[var(--input-bg)] px-3 py-2 text-sm text-slate-900 dark:text-white" rows="2"></textarea>
						</div>
					{/if}

					{#if selectedTransition === 'complete'}
						<div class="mb-3">
							<label for="compType" class="block text-sm font-medium mb-1">Completion Type</label>
							<select id="compType" bind:value={transitionCompletionType} class="w-full rounded border border-slate-300 dark:border-white/25 bg-[var(--input-bg)] px-3 py-2 text-sm text-slate-900 dark:text-white">
								<option value="FG_Conversion">Finished Good Conversion</option>
								<option value="Expense_Close">Expense Close</option>
							</select>
						</div>
					{/if}

					<div class="flex gap-2">
						<button
							on:click={() => handleTransition($projectStore.currentProject)}
							class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm"
							disabled={loading}
						>
							Confirm
						</button>
						<button
							on:click={() => {
								selectedTransition = null;
								transitionReason = '';
							}}
							class="bg-slate-500 hover:bg-slate-600 text-white px-4 py-2 rounded text-sm"
						>
							Cancel
						</button>
					</div>
				</div>
			{/if}
		</div>

		{#if errorMessage}
			<div class="bg-red-100 border border-red-400 text-red-700 dark:bg-red-950/40 dark:border-red-500/50 dark:text-red-200 px-4 py-3 rounded mb-4">
				{errorMessage}
			</div>
		{/if}

		{#if successMessage}
			<div class="bg-green-100 border border-green-400 text-green-700 dark:bg-green-950/40 dark:border-green-500/50 dark:text-green-200 px-4 py-3 rounded mb-4">
				{successMessage}
			</div>
		{/if}

		<!-- Project Summary -->
		<div class="grid grid-cols-4 gap-4 mb-8">
			<div class="bg-blue-50 border border-blue-200 dark:bg-blue-950/35 dark:border-blue-700 rounded-lg p-4">
				<div class="text-xs text-slate-500 dark:text-white/60 mb-1">Budget Amount</div>
				<div class="text-2xl font-bold">${$projectStore.currentProject.budgetAmount.toFixed(2)}</div>
			</div>
			<div class="bg-purple-50 border border-purple-200 dark:bg-purple-950/35 dark:border-purple-700 rounded-lg p-4">
				<div class="text-xs text-slate-500 dark:text-white/60 mb-1">Actual Cost</div>
				<div class="text-2xl font-bold">${$projectStore.currentProject.actualCostAmount.toFixed(2)}</div>
			</div>
			<div class="bg-green-50 border border-green-200 dark:bg-green-950/35 dark:border-green-700 rounded-lg p-4">
				<div class="text-xs text-slate-500 dark:text-white/60 mb-1">WIP Total</div>
				<div class="text-2xl font-bold">${$projectStore.currentProject.wipTotalBalance.toFixed(2)}</div>
			</div>
			<div class="bg-orange-50 border border-orange-200 dark:bg-orange-950/35 dark:border-orange-700 rounded-lg p-4">
				<div class="text-xs text-slate-500 dark:text-white/60 mb-1">Budget Remaining</div>
				<div class="text-2xl font-bold">
					${(
						$projectStore.currentProject.budgetAmount - $projectStore.currentProject.wipTotalBalance
					).toFixed(2)}
				</div>
			</div>
		</div>

		<!-- Tabs -->
		<div class="border-b border-slate-300 dark:border-white/15 mb-6">
			<div class="flex gap-4">
				{#each (['overview', 'boms', 'labor', 'finished', 'linked'] as const) as tab}
					<button
						on:click={() => (activeTab = tab)}
						class={`px-4 py-2 border-b-2 font-medium text-sm ${
							activeTab === tab
								? 'border-blue-600 text-blue-600'
								: 'border-transparent text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white'
						}`}
					>
						{tab === 'overview'
							? 'Overview'
							: tab === 'boms'
								? 'BOM Assignments'
								: tab === 'labor'
									? 'Labor Entries'
									: tab === 'finished'
										? 'Finished Items'
										: 'Demand & Supply'}
					</button>
				{/each}
			</div>
		</div>

		<!-- Overview Tab -->
		{#if activeTab === 'overview'}
			<div class="bg-slate-50 border border-slate-300 dark:bg-white/5 dark:border-white/15 rounded-lg p-6">
				<h2 class="text-lg font-semibold mb-4">Project Overview</h2>
				<div class="grid grid-cols-2 gap-6">
					<div>
						<div class="text-sm text-slate-500 dark:text-white/60">Project ID</div>
						<div class="font-semibold">{$projectStore.currentProject.projectId}</div>
					</div>
					<div>
						<div class="text-sm text-slate-500 dark:text-white/60">Project Type</div>
						<div class="font-semibold">{$projectStore.currentProject.projectType}</div>
					</div>
					<div>
						<div class="text-sm text-slate-500 dark:text-white/60">Start Date</div>
						<div class="font-semibold">{$projectStore.currentProject.startDate.split('T')[0]}</div>
					</div>
					<div>
						<div class="text-sm text-slate-500 dark:text-white/60">End Date</div>
						<div class="font-semibold">{$projectStore.currentProject.endDate?.split('T')[0] || 'N/A'}</div>
					</div>
					<div>
						<div class="text-sm text-slate-500 dark:text-white/60">Manager ID</div>
						<div class="font-semibold">{$projectStore.currentProject.projectManagerId}</div>
					</div>
					<div>
						<div class="text-sm text-slate-500 dark:text-white/60">Organization ID</div>
						<div class="font-semibold">{$projectStore.currentProject.organizationId}</div>
					</div>
				</div>

				{#if $projectStore.wipSummary}
					<div class="mt-8 pt-8 border-t border-slate-300 dark:border-white/15">
						<h3 class="text-md font-semibold mb-4">WIP Summary</h3>
						<div class="grid grid-cols-3 gap-4">
							<div class="bg-white border border-slate-200 dark:bg-white/5 dark:border-white/15 rounded p-4">
								<div class="text-xs text-slate-500 dark:text-white/60 mb-2">Material Balance</div>
								<div class="text-2xl font-bold text-blue-600">${$projectStore.wipSummary.wipMaterialBalance.toFixed(2)}</div>
							</div>
							<div class="bg-white border border-slate-200 dark:bg-white/5 dark:border-white/15 rounded p-4">
								<div class="text-xs text-slate-500 dark:text-white/60 mb-2">Labor Balance</div>
								<div class="text-2xl font-bold text-purple-600">${$projectStore.wipSummary.wipLaborBalance.toFixed(2)}</div>
							</div>
							<div class="bg-white border border-slate-200 dark:bg-white/5 dark:border-white/15 rounded p-4">
								<div class="text-xs text-slate-500 dark:text-white/60 mb-2">Overhead Balance</div>
								<div class="text-2xl font-bold text-orange-600">${$projectStore.wipSummary.wipOverheadBalance.toFixed(2)}</div>
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- BOM Assignments Tab -->
		{#if activeTab === 'boms'}
			<div>
				<div class="bg-slate-50 border border-slate-300 dark:bg-white/5 dark:border-white/15 rounded-lg p-6 mb-6">
					<h3 class="text-lg font-semibold mb-4">Assign New BOM</h3>
					<div class="grid grid-cols-3 gap-4">
						<div>
							<label for="bomId" class="block text-sm font-medium mb-1">BOM ID</label>
							<input id="bomId" type="text" bind:value={newBomId} class="w-full rounded border border-slate-300 dark:border-white/25 bg-[var(--input-bg)] px-3 py-2 text-slate-900 dark:text-white" placeholder="bom-001" />
						</div>
						<div>
							<label for="bomQty" class="block text-sm font-medium mb-1">Quantity Planned</label>
							<input id="bomQty" type="number" bind:value={newBomQuantity} class="w-full rounded border border-slate-300 dark:border-white/25 bg-[var(--input-bg)] px-3 py-2 text-slate-900 dark:text-white" placeholder="1" />
						</div>
						<div class="flex items-end">
							<button
								on:click={handleAssignBom}
								class="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
								disabled={loading || !newBomId}
							>
								Assign
							</button>
						</div>
					</div>
				</div>

				<div class="overflow-x-auto">
					<table class="min-w-full border-collapse border border-slate-300 dark:border-white/15">
						<thead class="bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white/75">
							<tr>
								<th class="border border-slate-300 dark:border-white/15 px-4 py-2 text-left">BOM ID</th>
								<th class="border border-slate-300 dark:border-white/15 px-4 py-2 text-right">Quantity Planned</th>
								<th class="border border-slate-300 dark:border-white/15 px-4 py-2 text-left">Status</th>
								<th class="border border-slate-300 dark:border-white/15 px-4 py-2 text-left">Created At</th>
							</tr>
						</thead>
						<tbody>
							{#each $projectStore.bomAssignments as assignment (assignment.assignmentId)}
								<tr class="hover:bg-slate-50 dark:hover:bg-white/5">
									<td class="border border-slate-300 dark:border-white/15 px-4 py-2">{assignment.bomId}</td>
									<td class="border border-slate-300 dark:border-white/15 px-4 py-2 text-right">{assignment.quantityPlanned}</td>
									<td class="border border-slate-300 dark:border-white/15 px-4 py-2">
										<span class="px-2 py-1 rounded text-xs font-semibold {assignment.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
											{assignment.status}
										</span>
									</td>
									<td class="border border-slate-300 dark:border-white/15 px-4 py-2 text-sm">{assignment.createdAt.split('T')[0]}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				{#if $projectStore.bomAssignments.length === 0}
					<div class="text-center py-8 text-slate-500 dark:text-white/60">
						No BOM assignments yet. Create one above to get started.
					</div>
				{/if}
			</div>
		{/if}

		<!-- Labor Entries Tab -->
		{#if activeTab === 'labor'}
			<div>
				<div class="bg-slate-50 border border-slate-300 dark:bg-white/5 dark:border-white/15 rounded-lg p-6 mb-6">
					<h3 class="text-lg font-semibold mb-4">Post Labor Entry</h3>
					<div class="grid grid-cols-5 gap-4">
						<div>
							<label for="resourceId" class="block text-sm font-medium mb-1">Resource ID</label>
							<input id="resourceId" type="text" bind:value={newResourceId} class="w-full rounded border border-slate-300 dark:border-white/25 bg-[var(--input-bg)] px-3 py-2 text-slate-900 dark:text-white" placeholder="emp-001" />
						</div>
						<div>
							<label for="hours" class="block text-sm font-medium mb-1">Hours</label>
							<input id="hours" type="number" bind:value={newHours} class="w-full rounded border border-slate-300 dark:border-white/25 bg-[var(--input-bg)] px-3 py-2 text-slate-900 dark:text-white" placeholder="8" />
						</div>
						<div>
							<label for="rate" class="block text-sm font-medium mb-1">Rate</label>
							<input id="rate" type="number" bind:value={newRate} class="w-full rounded border border-slate-300 dark:border-white/25 bg-[var(--input-bg)] px-3 py-2 text-slate-900 dark:text-white" placeholder="100" />
						</div>
						<div>
							<label for="costElem" class="block text-sm font-medium mb-1">Cost Element</label>
							<input id="costElem" type="text" bind:value={newCostElementId} class="w-full rounded border border-slate-300 dark:border-white/25 bg-[var(--input-bg)] px-3 py-2 text-slate-900 dark:text-white" placeholder="(optional)" />
						</div>
						<div class="flex items-end">
							<button
								on:click={handlePostLabor}
								class="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
								disabled={loading || !newResourceId}
							>
								Post
							</button>
						</div>
					</div>
				</div>

				<div class="overflow-x-auto">
					<table class="min-w-full border-collapse border border-slate-300 dark:border-white/15">
						<thead class="bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white/75">
							<tr>
								<th class="border border-slate-300 dark:border-white/15 px-4 py-2 text-left">Resource ID</th>
								<th class="border border-slate-300 dark:border-white/15 px-4 py-2 text-right">Hours</th>
								<th class="border border-slate-300 dark:border-white/15 px-4 py-2 text-right">Rate</th>
								<th class="border border-slate-300 dark:border-white/15 px-4 py-2 text-right">Total Cost</th>
								<th class="border border-slate-300 dark:border-white/15 px-4 py-2 text-left">Posted At</th>
							</tr>
						</thead>
						<tbody>
							{#each $projectStore.laborEntries as entry (entry.entryId)}
								<tr class="hover:bg-slate-50 dark:hover:bg-white/5">
									<td class="border border-slate-300 dark:border-white/15 px-4 py-2">{entry.resourceId}</td>
									<td class="border border-slate-300 dark:border-white/15 px-4 py-2 text-right">{entry.hours}</td>
									<td class="border border-slate-300 dark:border-white/15 px-4 py-2 text-right">${entry.rate.toFixed(2)}</td>
									<td class="border border-slate-300 dark:border-white/15 px-4 py-2 text-right font-semibold">${entry.totalCost.toFixed(2)}</td>
									<td class="border border-slate-300 dark:border-white/15 px-4 py-2 text-sm">{entry.postedAt.split('T')[0]}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				{#if $projectStore.laborEntries.length === 0}
					<div class="text-center py-8 text-slate-500 dark:text-white/60">
						No labor entries yet. Post one above to get started.
					</div>
				{/if}
			</div>
		{/if}

		<!-- Finished Items Tab -->
		{#if activeTab === 'finished'}
			<div>
				<div class="bg-slate-50 border border-slate-300 dark:bg-white/5 dark:border-white/15 rounded-lg p-6 mb-6">
					<h3 class="text-lg font-semibold mb-4">Create Finished Item</h3>
					<div class="grid grid-cols-4 gap-4">
						<div>
							<label for="skuId" class="block text-sm font-medium mb-1">SKU ID</label>
							<input id="skuId" type="text" bind:value={newSkuId} class="w-full rounded border border-slate-300 dark:border-white/25 bg-[var(--input-bg)] px-3 py-2 text-slate-900 dark:text-white" placeholder="sku-001" />
						</div>
						<div>
							<label for="fgQty" class="block text-sm font-medium mb-1">Quantity</label>
							<input id="fgQty" type="number" bind:value={newFGQuantity} class="w-full rounded border border-slate-300 dark:border-white/25 bg-[var(--input-bg)] px-3 py-2 text-slate-900 dark:text-white" placeholder="1" />
						</div>
						<div>
							<label for="unitCost" class="block text-sm font-medium mb-1">Unit Cost (optional)</label>
							<input id="unitCost" type="number" bind:value={newUnitCost} class="w-full rounded border border-slate-300 dark:border-white/25 bg-[var(--input-bg)] px-3 py-2 text-slate-900 dark:text-white" placeholder="auto-calculated" />
						</div>
						<div class="flex items-end">
							<button
								on:click={handleCreateFinishedItem}
								class="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
								disabled={loading || !newSkuId}
							>
								Create
							</button>
						</div>
					</div>
				</div>

				<div class="overflow-x-auto">
					<table class="min-w-full border-collapse border border-slate-300 dark:border-white/15">
						<thead class="bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white/75">
							<tr>
								<th class="border border-slate-300 dark:border-white/15 px-4 py-2 text-left">SKU ID</th>
								<th class="border border-slate-300 dark:border-white/15 px-4 py-2 text-right">Quantity</th>
								<th class="border border-slate-300 dark:border-white/15 px-4 py-2 text-right">Unit Cost</th>
								<th class="border border-slate-300 dark:border-white/15 px-4 py-2 text-right">Total WIP Cost</th>
								<th class="border border-slate-300 dark:border-white/15 px-4 py-2 text-left">Created At</th>
							</tr>
						</thead>
						<tbody>
							{#each $projectStore.finishedItems as item (item.finishedItemId)}
								<tr class="hover:bg-slate-50 dark:hover:bg-white/5">
									<td class="border border-slate-300 dark:border-white/15 px-4 py-2">{item.skuId}</td>
									<td class="border border-slate-300 dark:border-white/15 px-4 py-2 text-right">{item.quantity}</td>
									<td class="border border-slate-300 dark:border-white/15 px-4 py-2 text-right">${item.unitCost.toFixed(2)}</td>
									<td class="border border-slate-300 dark:border-white/15 px-4 py-2 text-right font-semibold">${item.totalWipCost.toFixed(2)}</td>
									<td class="border border-slate-300 dark:border-white/15 px-4 py-2 text-sm">{item.createdAt.split('T')[0]}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				{#if $projectStore.finishedItems.length === 0}
					<div class="text-center py-8 text-slate-500 dark:text-white/60">
						No finished items yet. Create one above to get started.
					</div>
				{/if}
			</div>
		{/if}

		{#if activeTab === 'linked'}
			<div class="space-y-6">
				<div class="bg-slate-50 border border-slate-300 dark:bg-white/5 dark:border-white/15 rounded-lg p-6">
					<h2 class="text-lg font-semibold mb-2">Project Demand And Supply Links</h2>
					<p class="text-sm text-slate-600 dark:text-white/70">
						Procurements and customer orders linked with this project appear here using the shared <span class="font-semibold">projectId</span> reference.
					</p>
					<div class="mt-4 flex flex-wrap items-center gap-2">
						<button
							on:click={handleLoadProcurementPreview}
							class="bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90 text-white px-3 py-2 rounded text-sm font-semibold"
							disabled={procurementPreviewLoading || procurementGenerateLoading}
						>
							{procurementPreviewLoading ? 'Loading Preview...' : 'Preview Procurement Gaps'}
						</button>
						<button
							on:click={handleGenerateRequisitionLines}
							class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm font-semibold"
							disabled={procurementPreviewLoading || procurementGenerateLoading}
						>
							{procurementGenerateLoading ? 'Generating...' : 'Generate Requisition Lines'}
						</button>
					</div>

					{#if procurementPreview}
						<div class="mt-4 grid gap-3 sm:grid-cols-3">
							<div class="rounded border border-slate-200 dark:border-white/15 bg-white dark:bg-white/5 px-3 py-2">
								<p class="text-[11px] text-slate-500 dark:text-white/60">Required Quantity</p>
								<p class="text-sm font-semibold">{procurementPreview.totalRequiredQuantity}</p>
							</div>
							<div class="rounded border border-slate-200 dark:border-white/15 bg-white dark:bg-white/5 px-3 py-2">
								<p class="text-[11px] text-slate-500 dark:text-white/60">Shortage Quantity</p>
								<p class="text-sm font-semibold">{procurementPreview.totalShortageQuantity}</p>
							</div>
							<div class="rounded border border-slate-200 dark:border-white/15 bg-white dark:bg-white/5 px-3 py-2">
								<p class="text-[11px] text-slate-500 dark:text-white/60">Shortage Lines</p>
								<p class="text-sm font-semibold">{procurementPreview.shortageLineCount} / {procurementPreview.lineCount}</p>
							</div>
						</div>

						{#if procurementPreview.lines.length > 0}
							<div class="mt-4 overflow-x-auto">
								<table class="min-w-full border-collapse border border-slate-300 dark:border-white/15 text-xs">
									<thead class="bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white/75">
										<tr>
											<th class="border border-slate-300 dark:border-white/15 px-2 py-2 text-left">SKU</th>
											<th class="border border-slate-300 dark:border-white/15 px-2 py-2 text-right">Required</th>
											<th class="border border-slate-300 dark:border-white/15 px-2 py-2 text-right">On Hand</th>
											<th class="border border-slate-300 dark:border-white/15 px-2 py-2 text-right">Shortage</th>
											<th class="border border-slate-300 dark:border-white/15 px-2 py-2 text-right">Suggested Unit Cost</th>
										</tr>
									</thead>
									<tbody>
										{#each procurementPreview.lines as line (line.skuId + '-' + line.organizationId + '-' + line.quantityUom)}
											<tr class={line.shortageQuantity > 0 ? 'bg-amber-50 dark:bg-amber-900/15' : ''}>
												<td class="border border-slate-300 dark:border-white/15 px-2 py-2">{line.skuId}</td>
												<td class="border border-slate-300 dark:border-white/15 px-2 py-2 text-right">{line.requiredQuantity} {line.quantityUom}</td>
												<td class="border border-slate-300 dark:border-white/15 px-2 py-2 text-right">{line.onHandQuantity}</td>
												<td class="border border-slate-300 dark:border-white/15 px-2 py-2 text-right font-semibold">{line.shortageQuantity}</td>
												<td class="border border-slate-300 dark:border-white/15 px-2 py-2 text-right">{asCurrency(line.suggestedUnitPrice)}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					{/if}
				</div>

				<div class="grid gap-6 xl:grid-cols-3">
					<section class="bg-white border border-slate-300 dark:bg-white/5 dark:border-white/15 rounded-lg p-5">
						<div class="flex items-center justify-between mb-4 gap-3">
							<div>
								<h3 class="text-base font-semibold">Linked Requisitions</h3>
								<p class="text-xs text-slate-500 dark:text-white/60">Project procurement demand.</p>
							</div>
							<span class="text-xs font-semibold rounded-full bg-blue-100 text-blue-800 px-2 py-1">{$projectStore.requisitions.length}</span>
						</div>
						{#if $projectStore.requisitions.length === 0}
							<p class="text-sm text-slate-500 dark:text-white/60">No requisitions linked yet.</p>
						{:else}
							<div class="space-y-3">
								{#each $projectStore.requisitions as requisition (requisition.requisitionId)}
									<a class="block rounded border border-slate-200 dark:border-white/15 px-3 py-3 hover:bg-slate-50 dark:hover:bg-white/10" href={resolve(`/canvas/p2p_requisition/${requisition.requisitionId}`)}>
										<div class="flex items-center justify-between gap-3">
											<span class="font-semibold text-sm">{requisition.requisitionId}</span>
											<span class="text-[11px] rounded bg-slate-100 px-2 py-1">{requisition.state}</span>
										</div>
										<p class="mt-1 text-xs text-slate-600 dark:text-white/70">Requester: {requisition.requester}</p>
										<p class="mt-1 text-xs text-slate-600 dark:text-white/70">{asCurrency(requisition.totalAmount, requisition.currencyCode ?? 'USD')}</p>
									</a>
								{/each}
							</div>
						{/if}
					</section>

					<section class="bg-white border border-slate-300 dark:bg-white/5 dark:border-white/15 rounded-lg p-5">
						<div class="flex items-center justify-between mb-4 gap-3">
							<div>
								<h3 class="text-base font-semibold">Linked Purchase Orders</h3>
								<p class="text-xs text-slate-500 dark:text-white/60">Supplier commitments for the project.</p>
							</div>
							<span class="text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 px-2 py-1">{$projectStore.purchaseOrders.length}</span>
						</div>
						{#if $projectStore.purchaseOrders.length === 0}
							<p class="text-sm text-slate-500 dark:text-white/60">No purchase orders linked yet.</p>
						{:else}
							<div class="space-y-3">
								{#each $projectStore.purchaseOrders as po (po.poId)}
									<a class="block rounded border border-slate-200 dark:border-white/15 px-3 py-3 hover:bg-slate-50 dark:hover:bg-white/10" href={resolve(`/canvas/p2p_purchase_order/${po.poId}`)}>
										<div class="flex items-center justify-between gap-3">
											<span class="font-semibold text-sm">{po.poId}</span>
											<span class="text-[11px] rounded bg-slate-100 px-2 py-1">{po.state}</span>
										</div>
										<p class="mt-1 text-xs text-slate-600 dark:text-white/70">Supplier: {po.supplierId}</p>
										<p class="mt-1 text-xs text-slate-600 dark:text-white/70">{asCurrency(po.totalAmount, po.currencyCode ?? 'USD')}</p>
									</a>
								{/each}
							</div>
						{/if}
					</section>

					<section class="bg-white border border-slate-300 dark:bg-white/5 dark:border-white/15 rounded-lg p-5">
						<div class="flex items-center justify-between mb-4 gap-3">
							<div>
								<h3 class="text-base font-semibold">Linked Sales Orders</h3>
								<p class="text-xs text-slate-500 dark:text-white/60">Customer orders tied to project delivery.</p>
							</div>
							<span class="text-xs font-semibold rounded-full bg-amber-100 text-amber-800 px-2 py-1">{$projectStore.salesOrders.length}</span>
						</div>
						{#if $projectStore.salesOrders.length === 0}
							<p class="text-sm text-slate-500 dark:text-white/60">No sales orders linked yet.</p>
						{:else}
							<div class="space-y-3">
								{#each $projectStore.salesOrders as order (order.orderId)}
									<a class="block rounded border border-slate-200 dark:border-white/15 px-3 py-3 hover:bg-slate-50 dark:hover:bg-white/10" href={resolve(`/canvas/o2c_sales_order/${order.orderId}`)}>
										<div class="flex items-center justify-between gap-3">
											<span class="font-semibold text-sm">{order.orderId}</span>
											<span class="text-[11px] rounded bg-slate-100 px-2 py-1">{order.state}</span>
										</div>
										<p class="mt-1 text-xs text-slate-600 dark:text-white/70">Customer: {order.customerId}</p>
										<p class="mt-1 text-xs text-slate-600 dark:text-white/70">{asCurrency(order.totalAmount, order.currencyCode)}</p>
									</a>
								{/each}
							</div>
						{/if}
					</section>
				</div>
			</div>
		{/if}
	{:else}
		<div class="text-center py-12">
			<p class="text-slate-600 dark:text-white/70">No project found.</p>
			<a href="/projects" class="text-blue-600 hover:underline mt-4 inline-block">Back to Projects</a>
		</div>
	{/if}
</div>
