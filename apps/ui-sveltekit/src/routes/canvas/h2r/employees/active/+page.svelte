<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { isActiveEmployee } from '$lib/api/dashboard';
	import { queryTable } from '$lib/api/query';
	import { actorStore } from '$lib/stores/actorStore';

	interface EmployeeRow {
		employee_id: string;
		name?: string;
		email?: string;
		state?: string;
		status?: string;
		employment_status?: string;
		lifecycle_state?: string;
		process_state?: string;
		active?: boolean | number | string;
	}

	let loading = false;
	let errorMessage = '';
	let activeEmployees: EmployeeRow[] = [];

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void loadActiveEmployees();
		});

		return () => {
			unsubscribeActor();
		};
	});

	async function loadActiveEmployees(): Promise<void> {
		loading = true;
		errorMessage = '';

		try {
			const result = await queryTable<EmployeeRow>('h2r_employee', $actorStore);
			activeEmployees = (result.data ?? []).filter(isActiveEmployee);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load active employees.';
		} finally {
			loading = false;
		}
	}

	function resolveLifecycleState(employee: EmployeeRow): string {
		if (employee.active === true || employee.active === 1 || String(employee.active ?? '').toLowerCase() === 'true') {
			return 'active';
		}

		return (
			employee.state ??
			employee.status ??
			employee.employment_status ??
			employee.lifecycle_state ??
			employee.process_state ??
			'unknown'
		);
	}
</script>

<section class="glass-panel p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-2xl font-semibold">Active Employees</h2>
			<p class="muted mt-1 text-sm">Showing employees currently in active state.</p>
		</div>
		<span class="rounded-full dark:bg-white/10 bg-slate-500/10 px-3 py-1 text-xs font-semibold dark:text-white text-slate-900">
			{activeEmployees.length} active employees
		</span>
	</div>

	{#if loading}
		<p class="mt-4 text-sm">Loading active employees...</p>
	{:else if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{:else if activeEmployees.length === 0}
		<p class="mt-4 text-sm">No active employees found.</p>
	{:else}
		<div class="mt-4 overflow-x-auto">
			<table class="min-w-full text-left text-sm">
				<thead>
					<tr class="border-b dark:border-white/15 border-slate-200 text-xs uppercase tracking-[0.15em] dark:text-white/70 text-slate-600">
						<th class="px-3 py-2">Employee</th>
						<th class="px-3 py-2">Name</th>
						<th class="px-3 py-2">Email</th>
						<th class="px-3 py-2">State</th>
						<th class="px-3 py-2">Process</th>
					</tr>
				</thead>
				<tbody>
					{#each activeEmployees as employee (employee.employee_id)}
						<tr class="border-b dark:border-white/10 border-slate-200 align-top">
							<td class="px-3 py-3 font-semibold">{employee.employee_id}</td>
							<td class="px-3 py-3">{employee.name ?? 'n/a'}</td>
							<td class="px-3 py-3">{employee.email ?? 'n/a'}</td>
							<td class="px-3 py-3">{resolveLifecycleState(employee)}</td>
							<td class="px-3 py-3">
								<a class="rounded-md border dark:border-white/35 border-slate-300 px-2 py-1 text-xs dark:text-white text-slate-900" href={resolve(`/canvas/h2r_employee/${employee.employee_id}`)}>
									Open Process
								</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>
