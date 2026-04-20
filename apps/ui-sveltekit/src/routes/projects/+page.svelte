<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { createInventoryOrganization } from '$lib/api/inventory';
	import { queryTable } from '$lib/api/query';
	import { actorStore } from '$lib/stores/actorStore';
	import { projectStore, projectStatusBadge, loadProject, clearProjectStore } from '$lib/stores/projectStore';
	import { createProject, activateProject } from '$lib/api/projects';
	import type { Project, ProjectFilter } from '$lib/types/projects';

	export let data: {
		initialProjects: Project[];
		initialOrganizations: OrganizationRow[];
		initialManagers: EmployeeRow[];
	};

	interface OrganizationRow {
		organization_id: string;
		organization_name?: string;
		name?: string;
	}

	interface EmployeeRow {
		employee_id: string;
		first_name?: string;
		last_name?: string;
		display_name?: string;
		full_name?: string;
	}

	interface ProjectTableRow {
		project_id: string;
		name: string;
		project_type?: string;
		status?: string;
		budget_amount?: number;
		actual_cost_amount?: number;
		default_wip_account_id?: string;
		default_close_account_id?: string;
		start_date?: string;
		end_date?: string;
		project_manager_id?: string;
		organization_id?: string;
		created_at?: string;
		created_by?: string;
		version?: number;
		last_event_at?: string;
		wip_material_balance?: number;
		wip_labor_balance?: number;
		wip_total_balance?: number;
	}

	let loading = false;
	let errorMessage = '';
	let successMessage = '';

	let projects: Project[] = data.initialProjects ?? [];
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
	let organizationOptions: OrganizationRow[] = data.initialOrganizations ?? [];
	let managerOptions: EmployeeRow[] = data.initialManagers ?? [];

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

	function normalizeLifecycleToken(value: string | undefined): string {
		return (value ?? '')
			.trim()
			.toLowerCase()
			.replace(/[\s_-]+/g, '');
	}

	function isDraftStatus(status: string): boolean {
		return normalizeLifecycleToken(status) === 'draft';
	}

	function isActiveStatus(status: string): boolean {
		return ['active', 'activated', 'ongoing', 'inprogress'].includes(normalizeLifecycleToken(status));
	}

	function isCompletedStatus(status: string): boolean {
		return ['completed', 'closed'].includes(normalizeLifecycleToken(status));
	}

	function getDashboardCounts() {
		return {
			draft: projects.filter((p) => isDraftStatus(p.status)).length,
			active: projects.filter((p) => isActiveStatus(p.status)).length,
			completed: projects.filter((p) => isCompletedStatus(p.status)).length,
			total: projects.length
		};
	}

	function mapProjectRow(row: ProjectTableRow): Project {
		return {
			projectId: row.project_id,
			name: row.name,
			description: undefined,
			customerId: undefined,
			contractId: undefined,
			wbsId: undefined,
			projectType: (row.project_type as Project['projectType']) ?? 'Internal',
			status: (row.status as Project['status']) ?? 'Draft',
			budgetAmount: row.budget_amount ?? 0,
			actualCostAmount: row.actual_cost_amount ?? 0,
			revenueAmount: undefined,
			defaultWIPAccountId: row.default_wip_account_id ?? 'ACCT-WIP-001',
			defaultCloseAccountId: row.default_close_account_id ?? 'ACCT-CLOSE-001',
			startDate: row.start_date ?? '',
			endDate: row.end_date,
			projectManagerId: row.project_manager_id ?? '',
			organizationId: row.organization_id ?? '',
			createdAt: row.created_at ?? new Date().toISOString(),
			createdBy: row.created_by ?? 'system',
			version: row.version ?? 1,
			lastEventAt: row.last_event_at ?? row.created_at ?? new Date().toISOString(),
			wipMaterialBalance: row.wip_material_balance ?? 0,
			wipLaborBalance: row.wip_labor_balance ?? 0,
			wipTotalBalance: row.wip_total_balance ?? 0,
			closedFGCost: undefined,
			closedExpenseCost: undefined
		};
	}

	async function refreshProjects() {
		loading = true;
		errorMessage = '';
		try {
			const actor = $actorStore;
			const response = await queryTable<ProjectTableRow>('proj_project', actor, 500, 0);
			projects = (response.data ?? []).map(mapProjectRow);
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to load projects';
		} finally {
			loading = false;
		}
	}

	async function loadCreateProjectOptions() {
		try {
			const actor = $actorStore;
			const [organizationResponse, employeeResponse] = await Promise.all([
				queryTable<OrganizationRow>('inv_organization', actor),
				queryTable<EmployeeRow>('h2r_employee', actor)
			]);

			organizationOptions = organizationResponse.data ?? [];
			managerOptions = employeeResponse.data ?? [];

			if (organizationOptions.length === 0) {
				const organization = await createInventoryOrganization(actor, {
					name: 'Projects Default Organization'
				});
				organizationOptions = [
					{
						organization_id: organization.organization_id,
						name: organization.name
					}
				];
			}

			if (!newProjectOrganizationId && organizationOptions.length > 0) {
				newProjectOrganizationId = organizationOptions[0].organization_id;
			}

			if (!newProjectManagerId) {
				newProjectManagerId = managerOptions[0]?.employee_id ?? actor.actorId;
			}
		} catch {
			if (!newProjectManagerId) {
				newProjectManagerId = $actorStore.actorId;
			}
		}
	}

	async function handleCreateProject() {
		loading = true;
		errorMessage = '';
		successMessage = '';
		try {
			if (!newProjectName.trim()) {
				throw new Error('Project name is required');
			}

			if (!newProjectManagerId.trim()) {
				throw new Error('Project manager is required');
			}

			if (!newProjectOrganizationId.trim()) {
				throw new Error('Organization is required');
			}

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

			await refreshProjects();
			successMessage = `Project "${newProject.name}" created successfully!`;
			showCreateForm = false;

			// Reset form
			newProjectName = '';
			newProjectDescription = '';
			newProjectBudget = '10000';
			newProjectStartDate = new Date().toISOString().split('T')[0];
			newProjectEndDate = '';
			newProjectManagerId = managerOptions[0]?.employee_id ?? actor.actorId;
			newProjectOrganizationId = organizationOptions[0]?.organization_id ?? '';
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
		const unsubscribeActor = actorStore.subscribe(() => {
			selectedProjectId = null;
			clearProjectStore();
			void refreshProjects();
			void loadCreateProjectOptions();
		});

		return () => {
			unsubscribeActor();
			clearProjectStore();
		};
	});

	$: filteredProjects = applyFilters();
	$: dashboardCounts = getDashboardCounts();
	$: if (!newProjectOrganizationId && organizationOptions.length > 0) {
		newProjectOrganizationId = organizationOptions[0].organization_id;
	}
	$: if (!newProjectManagerId) {
		newProjectManagerId = managerOptions[0]?.employee_id ?? $actorStore.actorId;
	}
</script>

<div class="container mx-auto px-4 py-8 text-slate-900 dark:text-white">
	<div class="mb-8">
		<h1 class="text-3xl font-bold mb-2">Projects</h1>
		<p class="ui-muted">Manage internal manufacturing projects, WIP costing, and finished item creation.</p>
	</div>

	<!-- Dashboard Cards -->
	<div class="grid grid-cols-4 gap-4 mb-8">
		<div class="bg-blue-50 border border-blue-200 dark:bg-blue-950/35 dark:border-blue-700 rounded-lg p-6">
			<div class="text-3xl font-bold text-blue-600">{dashboardCounts.total}</div>
			<div class="ui-muted">Total Projects</div>
		</div>
		<div class="bg-green-50 border border-green-200 dark:bg-green-950/35 dark:border-green-700 rounded-lg p-6">
			<div class="text-3xl font-bold text-green-600">{dashboardCounts.active}</div>
			<div class="ui-muted">Active</div>
		</div>
		<div class="bg-yellow-50 border border-yellow-200 dark:bg-yellow-950/35 dark:border-yellow-700 rounded-lg p-6">
			<div class="text-3xl font-bold text-yellow-600">{dashboardCounts.draft}</div>
			<div class="ui-muted">Draft</div>
		</div>
		<div class="bg-blue-100 border border-blue-300 dark:bg-indigo-950/35 dark:border-indigo-700 rounded-lg p-6">
			<div class="text-3xl font-bold text-blue-700">{dashboardCounts.completed}</div>
			<div class="ui-muted">Completed</div>
		</div>
	</div>

	<!-- Messages -->
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
		<div class="section-card p-6 mb-8">
			<h2 class="text-xl font-semibold mb-4">Create New Project</h2>
			<div class="grid grid-cols-2 gap-4">
				<div>
					<label for="name" class="block text-sm font-medium mb-1">Name</label>
					<input id="name" type="text" bind:value={newProjectName} class="input-base w-full" placeholder="Project name" />
				</div>
				<div>
					<label for="type" class="block text-sm font-medium mb-1">Type</label>
					<select id="type" bind:value={newProjectType} class="input-base w-full">
						{#each typeOptions as type}
							<option value={type}>{type}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="description" class="block text-sm font-medium mb-1">Description</label>
					<input id="description" type="text" bind:value={newProjectDescription} class="input-base w-full" placeholder="Description (optional)" />
				</div>
				<div>
					<label for="budget" class="block text-sm font-medium mb-1">Budget Amount</label>
					<input id="budget" type="number" bind:value={newProjectBudget} class="input-base w-full" placeholder="10000" />
				</div>
				<div>
					<label for="startDate" class="block text-sm font-medium mb-1">Start Date</label>
					<input id="startDate" type="date" bind:value={newProjectStartDate} class="input-base w-full" />
				</div>
				<div>
					<label for="endDate" class="block text-sm font-medium mb-1">End Date (optional)</label>
					<input id="endDate" type="date" bind:value={newProjectEndDate} class="input-base w-full" />
				</div>
				<div>
					<label for="manager" class="block text-sm font-medium mb-1">Project Manager ID</label>
					{#if managerOptions.length > 0}
						<select id="manager" bind:value={newProjectManagerId} class="input-base w-full">
							{#each managerOptions as manager}
								<option value={manager.employee_id}>
									{manager.display_name || manager.full_name || [manager.first_name, manager.last_name].filter(Boolean).join(' ') || manager.employee_id}
								</option>
							{/each}
						</select>
					{:else}
						<input id="manager" type="text" bind:value={newProjectManagerId} class="input-base w-full" placeholder="principal.system" />
					{/if}
				</div>
				<div>
					<label for="org" class="block text-sm font-medium mb-1">Organization ID</label>
					{#if organizationOptions.length > 0}
						<select id="org" bind:value={newProjectOrganizationId} class="input-base w-full">
							{#each organizationOptions as organization}
								<option value={organization.organization_id}>
									{organization.organization_name || organization.name || organization.organization_id}
								</option>
							{/each}
						</select>
					{:else}
						<input id="org" type="text" bind:value={newProjectOrganizationId} class="input-base w-full" placeholder="Select a valid organization" />
					{/if}
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
	<div class="section-card p-4 mb-6">
		<h3 class="text-sm font-semibold mb-3">Filters</h3>
		<div class="grid grid-cols-5 gap-3">
			<select bind:value={filterStatus} class="input-base text-sm px-2 py-1">
				<option value="">All Statuses</option>
				{#each statusOptions as status}
					<option value={status}>{status}</option>
				{/each}
			</select>
			<input type="number" bind:value={filterBudgetMin} placeholder="Min Budget" class="input-base text-sm px-2 py-1" />
			<input type="number" bind:value={filterBudgetMax} placeholder="Max Budget" class="input-base text-sm px-2 py-1" />
			<input type="date" bind:value={filterDateFrom} class="input-base text-sm px-2 py-1" />
			<input type="date" bind:value={filterDateTo} class="input-base text-sm px-2 py-1" />
		</div>
	</div>

	<!-- Projects Table -->
	<div class="overflow-x-auto">
		<table class="min-w-full ui-table">
			<thead>
				<tr>
					<th class="px-4 py-2 text-left">Name</th>
					<th class="px-4 py-2 text-left">Type</th>
					<th class="px-4 py-2 text-left text-center">Status</th>
					<th class="px-4 py-2 text-right">Budget</th>
					<th class="px-4 py-2 text-right">WIP Balance</th>
					<th class="px-4 py-2 text-left">Start Date</th>
					<th class="px-4 py-2 text-center">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each filteredProjects as project (project.projectId)}
					<tr class={selectedProjectId === project.projectId ? 'bg-blue-50 dark:bg-blue-950/30' : 'ui-table-row-hover cursor-pointer'} on:click={() => navigateToProjectDetail(project.projectId)}>
						<td class="px-4 py-2">
							<button
								on:click|stopPropagation={() => handleSelectProject(project.projectId)}
								class="text-blue-600 hover:underline font-medium"
							>
								{project.name}
							</button>
						</td>
						<td class="px-4 py-2 text-sm">{project.projectType}</td>
						<td class="px-4 py-2 text-center">
							<span class="px-2 py-1 rounded text-xs font-semibold {getStatusColor(project.status)}">
								{project.status}
							</span>
						</td>
						<td class="px-4 py-2 text-right">${project.budgetAmount.toFixed(2)}</td>
						<td class="px-4 py-2 text-right">${project.wipTotalBalance.toFixed(2)}</td>
						<td class="px-4 py-2 text-sm">{project.startDate.split('T')[0]}</td>
						<td class="px-4 py-2 text-center" on:click|stopPropagation>
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
		<div class="text-center py-8 ui-muted">
			{projects.length === 0 ? 'No projects yet. Create one to get started!' : 'No projects match your filters.'}
		</div>
	{/if}

	<!-- Detail View (if selected) -->
	{#if selectedProjectId && $projectStore.currentProject}
		<div class="mt-8 border-t pt-8">
			<h2 class="text-2xl font-bold mb-4">Project Details</h2>
			<div class="grid grid-cols-2 gap-6 section-card p-6">
				<div>
					<div class="text-sm ui-muted">Project ID</div>
					<div class="font-semibold">{$projectStore.currentProject.projectId}</div>
				</div>
				<div>
					<div class="text-sm ui-muted">Status</div>
					<div class="font-semibold {getStatusColor($projectStore.currentProject.status)}">
						{$projectStore.currentProject.status}
					</div>
				</div>
				<div>
					<div class="text-sm ui-muted">Budget Amount</div>
					<div class="font-semibold">${$projectStore.currentProject.budgetAmount.toFixed(2)}</div>
				</div>
				<div>
					<div class="text-sm ui-muted">WIP Total Balance</div>
					<div class="font-semibold">${$projectStore.currentProject.wipTotalBalance.toFixed(2)}</div>
				</div>
				<div>
					<div class="text-sm ui-muted">WIP Material</div>
					<div class="font-semibold">${$projectStore.currentProject.wipMaterialBalance.toFixed(2)}</div>
				</div>
				<div>
					<div class="text-sm ui-muted">WIP Labor</div>
					<div class="font-semibold">${$projectStore.currentProject.wipLaborBalance.toFixed(2)}</div>
				</div>
				<div class="col-span-2">
					<div class="text-sm ui-muted mb-2">Description</div>
					<div class="font-semibold">{$projectStore.currentProject.description || 'N/A'}</div>
				</div>
			</div>

			<!-- WIP Summary -->
			{#if $projectStore.wipSummary}
				<div class="mt-6">
					<h3 class="text-lg font-semibold mb-4">WIP Summary</h3>
					<div class="grid grid-cols-3 gap-4">
						<div class="bg-blue-50 border border-blue-200 dark:bg-blue-950/35 dark:border-blue-700 rounded p-4">
							<div class="text-xs ui-muted mb-1">Material Balance</div>
							<div class="text-2xl font-bold text-blue-600">${$projectStore.wipSummary.wipMaterialBalance.toFixed(2)}</div>
						</div>
						<div class="bg-purple-50 border border-purple-200 dark:bg-purple-950/35 dark:border-purple-700 rounded p-4">
							<div class="text-xs ui-muted mb-1">Labor Balance</div>
							<div class="text-2xl font-bold text-purple-600">${$projectStore.wipSummary.wipLaborBalance.toFixed(2)}</div>
						</div>
						<div class="bg-green-50 border border-green-200 dark:bg-green-950/35 dark:border-green-700 rounded p-4">
							<div class="text-xs ui-muted mb-1">Total Balance</div>
							<div class="text-2xl font-bold text-green-600">${$projectStore.wipSummary.wipTotalBalance.toFixed(2)}</div>
						</div>
					</div>
				</div>
			{/if}

			{#if $projectStore.loading}
				<div class="mt-4 text-center ui-muted">Loading details...</div>
			{/if}

			{#if $projectStore.error}
				<div class="mt-4 bg-red-100 border border-red-400 text-red-700 dark:bg-red-950/40 dark:border-red-500/50 dark:text-red-200 px-4 py-3 rounded">
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
