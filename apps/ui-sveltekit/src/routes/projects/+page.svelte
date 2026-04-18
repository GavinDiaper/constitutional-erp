<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { actorStore } from '$lib/stores/actorStore';
	import { projectStore, projectStatusBadge, loadProject, clearProjectStore } from '$lib/stores/projectStore';
	import { listProjects, createProject, activateProject } from '$lib/api/projects';
	import type { Project, ProjectFilter } from '$lib/types/projects';

	let loading = false;
	let errorMessage = '';
	let successMessage = '';

	let projects: Project[] = [];
	let selectedProjectId: string | null = null;

	// Filter state
	let filterStatus: string = '';
	let filterBudgetMin = '';
	let filterBudgetMax = '';
	let filterDateFrom = '';
	let filterDateTo = '';

	// Create project form
	let showCreateForm = false;
	let newProjectName = '';
	let newProjectDescription = '';
	let newProjectType: 'Internal' | 'Capital' | 'Billable' | 'Service' = 'Internal';
	let newProjectBudget = '10000';
	let newProjectStartDate = new Date().toISOString().split('T')[0];
	let newProjectEndDate = '';
	let newProjectManagerId = '';
	let newProjectOrganizationId = '';
	let newProjectWIPAccountId = 'ACCT-WIP-001';
	let newProjectCloseAccountId = 'ACCT-CLOSE-001';

	const statusOptions = ['Draft', 'Active', 'OnHold', 'Completed', 'Cancelled'];
	const typeOptions: Array<'Internal' | 'Capital' | 'Billable' | 'Service'> = ['Internal', 'Capital', 'Billable', 'Service'];

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

	function getDashboardCounts() {
		return {
			draft: projects.filter((p) => p.status === 'Draft').length,
			active: projects.filter((p) => p.status === 'Active').length,
			completed: projects.filter((p) => p.status === 'Completed').length,
			total: projects.length
		};
	}

	async function refreshProjects() {
		loading = true;
		errorMessage = '';
		try {
			const actor = $actorStore;
			const response = await listProjects(actor);
			projects = response.data;
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to load projects';
		} finally {
			loading = false;
		}
	}

	async function handleCreateProject() {
		loading = true;
		errorMessage = '';
		successMessage = '';
		try {
			const actor = $actorStore;
			const newProject = await createProject(actor, {
				name: newProjectName,
				description: newProjectDescription || undefined,
				projectType: newProjectType,
				budgetAmount: parseFloat(newProjectBudget),
				startDate: newProjectStartDate,
				endDate: newProjectEndDate || undefined,
				projectManagerId: newProjectManagerId,
				organizationId: newProjectOrganizationId,
				defaultWIPAccountId: newProjectWIPAccountId,
				defaultCloseAccountId: newProjectCloseAccountId
			});

			projects = [...projects, newProject];
			successMessage = `Project "${newProject.name}" created successfully!`;
			showCreateForm = false;

			// Reset form
			newProjectName = '';
			newProjectDescription = '';
			newProjectBudget = '10000';
			newProjectStartDate = new Date().toISOString().split('T')[0];
			newProjectEndDate = '';
			newProjectManagerId = '';
			newProjectOrganizationId = '';
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to create project';
		} finally {
			loading = false;
		}
	}

	async function handleSelectProject(projectId: string) {
		selectedProjectId = projectId;
		await loadProject(projectId);
	}

	function navigateToProjectDetail(projectId: string) {
		void goto(resolve(`/canvas/projects/${projectId}`));
	}

	async function handleActivateProject(projectId: string) {
		loading = true;
		errorMessage = '';
		try {
			const actor = $actorStore;
			const updated = await activateProject(actor, projectId);
			projects = projects.map((p) => (p.projectId === projectId ? updated.data : p));
			successMessage = `Project activated successfully!`;
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to activate project';
		} finally {
			loading = false;
		}
	}

	function applyFilters() {
		const filter: ProjectFilter = {
			status: filterStatus || undefined,
			budgetMin: filterBudgetMin ? parseFloat(filterBudgetMin) : undefined,
			budgetMax: filterBudgetMax ? parseFloat(filterBudgetMax) : undefined,
			dateFrom: filterDateFrom || undefined,
			dateTo: filterDateTo || undefined
		};

		// Apply filtering locally
		return projects.filter((p) => {
			if (filter.status && p.status !== filter.status) return false;
			if (filter.budgetMin !== undefined && p.budgetAmount < filter.budgetMin) return false;
			if (filter.budgetMax !== undefined && p.budgetAmount > filter.budgetMax) return false;
			if (filter.dateFrom && p.startDate < filter.dateFrom) return false;
			if (filter.dateTo && p.startDate > filter.dateTo) return false;
			return true;
		});
	}

	onMount(() => {
		void refreshProjects();
	});

	$: filteredProjects = applyFilters();
	$: dashboardCounts = getDashboardCounts();
</script>

<div class="container mx-auto px-4 py-8">
	<div class="mb-8">
		<h1 class="text-3xl font-bold mb-2">Projects</h1>
		<p class="text-gray-600">Manage internal manufacturing projects, WIP costing, and finished item creation.</p>
	</div>

	<!-- Dashboard Cards -->
	<div class="grid grid-cols-4 gap-4 mb-8">
		<div class="bg-blue-50 border border-blue-200 rounded-lg p-6">
			<div class="text-3xl font-bold text-blue-600">{dashboardCounts.total}</div>
			<div class="text-gray-600">Total Projects</div>
		</div>
		<div class="bg-green-50 border border-green-200 rounded-lg p-6">
			<div class="text-3xl font-bold text-green-600">{dashboardCounts.active}</div>
			<div class="text-gray-600">Active</div>
		</div>
		<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
			<div class="text-3xl font-bold text-yellow-600">{dashboardCounts.draft}</div>
			<div class="text-gray-600">Draft</div>
		</div>
		<div class="bg-blue-100 border border-blue-300 rounded-lg p-6">
			<div class="text-3xl font-bold text-blue-700">{dashboardCounts.completed}</div>
			<div class="text-gray-600">Completed</div>
		</div>
	</div>

	<!-- Messages -->
	{#if errorMessage}
		<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
			{errorMessage}
		</div>
	{/if}

	{#if successMessage}
		<div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
			{successMessage}
		</div>
	{/if}

	<!-- Action Bar -->
	<div class="mb-6 flex gap-4 items-center">
		<button
			on:click={() => (showCreateForm = !showCreateForm)}
			class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
			disabled={loading}
		>
			{showCreateForm ? 'Cancel' : 'Create Project'}
		</button>
		<button
			on:click={() => void refreshProjects()}
			class="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
			disabled={loading}
		>
			{loading ? 'Loading...' : 'Refresh'}
		</button>
	</div>

	<!-- Create Project Form -->
	{#if showCreateForm}
		<div class="bg-gray-50 border border-gray-300 rounded-lg p-6 mb-8">
			<h2 class="text-xl font-semibold mb-4">Create New Project</h2>
			<div class="grid grid-cols-2 gap-4">
				<div>
					<label for="name" class="block text-sm font-medium mb-1">Name</label>
					<input id="name" type="text" bind:value={newProjectName} class="border rounded w-full px-3 py-2" placeholder="Project name" />
				</div>
				<div>
					<label for="type" class="block text-sm font-medium mb-1">Type</label>
					<select id="type" bind:value={newProjectType} class="border rounded w-full px-3 py-2">
						{#each typeOptions as type}
							<option value={type}>{type}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="description" class="block text-sm font-medium mb-1">Description</label>
					<input id="description" type="text" bind:value={newProjectDescription} class="border rounded w-full px-3 py-2" placeholder="Description (optional)" />
				</div>
				<div>
					<label for="budget" class="block text-sm font-medium mb-1">Budget Amount</label>
					<input id="budget" type="number" bind:value={newProjectBudget} class="border rounded w-full px-3 py-2" placeholder="10000" />
				</div>
				<div>
					<label for="startDate" class="block text-sm font-medium mb-1">Start Date</label>
					<input id="startDate" type="date" bind:value={newProjectStartDate} class="border rounded w-full px-3 py-2" />
				</div>
				<div>
					<label for="endDate" class="block text-sm font-medium mb-1">End Date (optional)</label>
					<input id="endDate" type="date" bind:value={newProjectEndDate} class="border rounded w-full px-3 py-2" />
				</div>
				<div>
					<label for="manager" class="block text-sm font-medium mb-1">Project Manager ID</label>
					<input id="manager" type="text" bind:value={newProjectManagerId} class="border rounded w-full px-3 py-2" placeholder="emp-001" />
				</div>
				<div>
					<label for="org" class="block text-sm font-medium mb-1">Organization ID</label>
					<input id="org" type="text" bind:value={newProjectOrganizationId} class="border rounded w-full px-3 py-2" placeholder="org-001" />
				</div>
			</div>
			<button
				on:click={handleCreateProject}
				class="mt-4 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded"
				disabled={loading || !newProjectName}
			>
				Create
			</button>
		</div>
	{/if}

	<!-- Filters -->
	<div class="bg-gray-50 border border-gray-300 rounded-lg p-4 mb-6">
		<h3 class="text-sm font-semibold mb-3">Filters</h3>
		<div class="grid grid-cols-5 gap-3">
			<select bind:value={filterStatus} class="border rounded px-2 py-1 text-sm">
				<option value="">All Statuses</option>
				{#each statusOptions as status}
					<option value={status}>{status}</option>
				{/each}
			</select>
			<input type="number" bind:value={filterBudgetMin} placeholder="Min Budget" class="border rounded px-2 py-1 text-sm" />
			<input type="number" bind:value={filterBudgetMax} placeholder="Max Budget" class="border rounded px-2 py-1 text-sm" />
			<input type="date" bind:value={filterDateFrom} class="border rounded px-2 py-1 text-sm" />
			<input type="date" bind:value={filterDateTo} class="border rounded px-2 py-1 text-sm" />
		</div>
	</div>

	<!-- Projects Table -->
	<div class="overflow-x-auto">
		<table class="min-w-full border-collapse border border-gray-300">
			<thead class="bg-gray-100">
				<tr>
					<th class="border border-gray-300 px-4 py-2 text-left">Name</th>
					<th class="border border-gray-300 px-4 py-2 text-left">Type</th>
					<th class="border border-gray-300 px-4 py-2 text-left text-center">Status</th>
					<th class="border border-gray-300 px-4 py-2 text-right">Budget</th>
					<th class="border border-gray-300 px-4 py-2 text-right">WIP Balance</th>
					<th class="border border-gray-300 px-4 py-2 text-left">Start Date</th>
					<th class="border border-gray-300 px-4 py-2 text-center">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each filteredProjects as project (project.projectId)}
					<tr class={selectedProjectId === project.projectId ? 'bg-blue-50' : 'hover:bg-gray-50 cursor-pointer'} on:click={() => navigateToProjectDetail(project.projectId)}>
						<td class="border border-gray-300 px-4 py-2">
							<button
								on:click|stopPropagation={() => handleSelectProject(project.projectId)}
								class="text-blue-600 hover:underline font-medium"
							>
								{project.name}
							</button>
						</td>
						<td class="border border-gray-300 px-4 py-2 text-sm">{project.projectType}</td>
						<td class="border border-gray-300 px-4 py-2 text-center">
							<span class="px-2 py-1 rounded text-xs font-semibold {getStatusColor(project.status)}">
								{project.status}
							</span>
						</td>
						<td class="border border-gray-300 px-4 py-2 text-right">${project.budgetAmount.toFixed(2)}</td>
						<td class="border border-gray-300 px-4 py-2 text-right">${project.wipTotalBalance.toFixed(2)}</td>
						<td class="border border-gray-300 px-4 py-2 text-sm">{project.startDate.split('T')[0]}</td>
						<td class="border border-gray-300 px-4 py-2 text-center" on:click|stopPropagation>
							{#if project.status === 'Draft'}
								<button
									on:click={() => handleActivateProject(project.projectId)}
									class="text-green-600 hover:text-green-800 text-xs font-semibold"
									disabled={loading}
								>
									Activate
								</button>
							{:else if project.status === 'Active'}
								<button
									on:click={() => navigateToProjectDetail(project.projectId)}
									class="text-blue-600 hover:text-blue-800 text-xs font-semibold"
								>
									View
								</button>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if filteredProjects.length === 0}
		<div class="text-center py-8 text-gray-500">
			{projects.length === 0 ? 'No projects yet. Create one to get started!' : 'No projects match your filters.'}
		</div>
	{/if}

	<!-- Detail View (if selected) -->
	{#if selectedProjectId && $projectStore.currentProject}
		<div class="mt-8 border-t pt-8">
			<h2 class="text-2xl font-bold mb-4">Project Details</h2>
			<div class="grid grid-cols-2 gap-6 bg-gray-50 border border-gray-300 rounded-lg p-6">
				<div>
					<div class="text-sm text-gray-500">Project ID</div>
					<div class="font-semibold">{$projectStore.currentProject.projectId}</div>
				</div>
				<div>
					<div class="text-sm text-gray-500">Status</div>
					<div class="font-semibold {getStatusColor($projectStore.currentProject.status)}">
						{$projectStore.currentProject.status}
					</div>
				</div>
				<div>
					<div class="text-sm text-gray-500">Budget Amount</div>
					<div class="font-semibold">${$projectStore.currentProject.budgetAmount.toFixed(2)}</div>
				</div>
				<div>
					<div class="text-sm text-gray-500">WIP Total Balance</div>
					<div class="font-semibold">${$projectStore.currentProject.wipTotalBalance.toFixed(2)}</div>
				</div>
				<div>
					<div class="text-sm text-gray-500">WIP Material</div>
					<div class="font-semibold">${$projectStore.currentProject.wipMaterialBalance.toFixed(2)}</div>
				</div>
				<div>
					<div class="text-sm text-gray-500">WIP Labor</div>
					<div class="font-semibold">${$projectStore.currentProject.wipLaborBalance.toFixed(2)}</div>
				</div>
				<div class="col-span-2">
					<div class="text-sm text-gray-500 mb-2">Description</div>
					<div class="font-semibold">{$projectStore.currentProject.description || 'N/A'}</div>
				</div>
			</div>

			<!-- WIP Summary -->
			{#if $projectStore.wipSummary}
				<div class="mt-6">
					<h3 class="text-lg font-semibold mb-4">WIP Summary</h3>
					<div class="grid grid-cols-3 gap-4">
						<div class="bg-blue-50 border border-blue-200 rounded p-4">
							<div class="text-xs text-gray-500 mb-1">Material Balance</div>
							<div class="text-2xl font-bold text-blue-600">${$projectStore.wipSummary.wipMaterialBalance.toFixed(2)}</div>
						</div>
						<div class="bg-purple-50 border border-purple-200 rounded p-4">
							<div class="text-xs text-gray-500 mb-1">Labor Balance</div>
							<div class="text-2xl font-bold text-purple-600">${$projectStore.wipSummary.wipLaborBalance.toFixed(2)}</div>
						</div>
						<div class="bg-green-50 border border-green-200 rounded p-4">
							<div class="text-xs text-gray-500 mb-1">Total Balance</div>
							<div class="text-2xl font-bold text-green-600">${$projectStore.wipSummary.wipTotalBalance.toFixed(2)}</div>
						</div>
					</div>
				</div>
			{/if}

			{#if $projectStore.loading}
				<div class="mt-4 text-center text-gray-500">Loading details...</div>
			{/if}

			{#if $projectStore.error}
				<div class="mt-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
					{$projectStore.error}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	:global(body) {
		font-family: system-ui, -apple-system, sans-serif;
	}
</style>
