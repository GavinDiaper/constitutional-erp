<script lang="ts">
	import { onMount } from 'svelte';
	import { actorStore } from '$lib/stores/actorStore';
	import { queryTable } from '$lib/api/query';
	import {
		commitTimesheetImport,
		downloadTimesheetImportTemplate,
		listTimesheetImportHistory,
		previewTimesheetImport,
		type TimesheetImportBatch,
		type TimesheetImportHistoryItem
	} from '$lib/api/timesheetImports';

	interface OrganizationRow {
		organization_id: string;
		name: string;
	}

	let organizations: OrganizationRow[] = [];
	let organizationId = '';
	let selectedFile: File | null = null;
	let preview: TimesheetImportBatch | null = null;
	let history: TimesheetImportHistoryItem[] = [];
	let loading = false;
	let pageError = '';
	let pageMessage = '';

	onMount(() => {
		const unsubscribe = actorStore.subscribe(() => {
			void loadOrganizations();
		});
		return unsubscribe;
	});

	async function loadOrganizations(): Promise<void> {
		pageError = '';
		try {
			const response = await queryTable<OrganizationRow>('inv_organization', $actorStore, 500, 0);
			organizations = response.data ?? [];
			if (!organizationId && organizations.length > 0) {
				organizationId = organizations[0].organization_id;
			}
			if (organizationId) await loadHistory();
		} catch (error) {
			pageError = error instanceof Error ? error.message : 'Failed to load organizations';
		}
	}

	async function loadHistory(): Promise<void> {
		if (!organizationId) {
			history = [];
			return;
		}
		try {
			history = (await listTimesheetImportHistory($actorStore, organizationId)).data ?? [];
		} catch (error) {
			pageError = error instanceof Error ? error.message : 'Failed to load import history';
		}
	}

	async function downloadTemplate(): Promise<void> {
		pageError = '';
		try {
			const blob = await downloadTimesheetImportTemplate($actorStore);
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = 'timesheet-template.csv';
			link.click();
			URL.revokeObjectURL(url);
		} catch (error) {
			pageError = error instanceof Error ? error.message : 'Failed to download the CSV template';
		}
	}

	function handleFileChange(event: Event): void {
		selectedFile = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
		preview = null;
		pageMessage = '';
		pageError = '';
	}

	async function validateFile(): Promise<void> {
		if (!selectedFile || !organizationId) {
			pageError = 'Choose an organization and CSV file first.';
			return;
		}
		if (selectedFile.size > 2_000_000) {
			pageError = 'CSV files must be 2 MB or smaller.';
			return;
		}
		loading = true;
		pageError = '';
		pageMessage = '';
		try {
			const result = await previewTimesheetImport($actorStore, {
				organizationId,
				sourceFilename: selectedFile.name,
				csvText: await selectedFile.text()
			});
			preview = result.data;
			pageMessage = result.data.status === 'Validated'
				? `${result.data.validRowCount} rows validated. No timesheets have been created yet.`
				: `Found ${result.data.errorRowCount} invalid row(s). Correct the file and validate again.`;
			await loadHistory();
		} catch (error) {
			pageError = error instanceof Error ? error.message : 'CSV validation failed';
		} finally {
			loading = false;
		}
	}

	async function commitBatch(): Promise<void> {
		if (!preview || preview.status !== 'Validated' || preview.errorRowCount > 0) return;
		loading = true;
		pageError = '';
		pageMessage = '';
		try {
			const result = await commitTimesheetImport($actorStore, preview.importBatchId);
			preview = result.data;
			pageMessage = `Created ${result.data.timesheetIds.length} Draft timesheet(s). Submit each through the normal approval workflow.`;
			await loadHistory();
		} catch (error) {
			pageError = error instanceof Error ? error.message : 'CSV import commit failed';
		} finally {
			loading = false;
		}
	}

	$: previewTotalCost = preview?.rows.reduce((sum, row) => sum + row.lineCost, 0) ?? 0;
</script>

<svelte:head>
	<title>Timesheet CSV Imports | ConstitutionalERP</title>
</svelte:head>

<section class="space-y-5 text-slate-900 dark:text-white">
	<header>
		<h1 class="text-2xl font-semibold">Timesheet CSV Imports</h1>
		<p class="mt-1 text-sm text-slate-600 dark:text-white/65">Validate employee and contractor time, calculate stored rates, and create Draft timesheets for approval.</p>
	</header>

	{#if pageError}
		<div role="alert" class="rounded border border-red-400 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/50 dark:bg-red-950/40 dark:text-red-200">{pageError}</div>
	{/if}
	{#if pageMessage}
		<div role="status" class="rounded border border-emerald-500/40 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{pageMessage}</div>
	{/if}

	<section class="section-card space-y-4 p-5">
		<div class="flex flex-wrap items-end gap-4">
			<div class="min-w-56 flex-1">
				<label for="organization" class="mb-1 block text-sm font-medium">Organization</label>
				<select id="organization" bind:value={organizationId} on:change={() => void loadHistory()} class="input-base w-full">
					<option value="">Select an organization</option>
					{#each organizations as organization (organization.organization_id)}
						<option value={organization.organization_id}>{organization.name} ({organization.organization_id})</option>
					{/each}
				</select>
			</div>
			<button type="button" class="btn-ghost rounded-md px-3 py-2 text-sm" on:click={() => void downloadTemplate()}>
				Download CSV template
			</button>
			<div class="min-w-64 flex-1">
				<label for="timesheetCsv" class="mb-1 block text-sm font-medium">CSV file</label>
				<input id="timesheetCsv" type="file" accept=".csv,text/csv" class="input-base w-full" on:change={handleFileChange} />
				{#if selectedFile}
					<p class="mt-1 text-xs text-slate-500 dark:text-white/60">{selectedFile.name} · {(selectedFile.size / 1024).toFixed(1)} KB</p>
				{/if}
			</div>
			<button type="button" class="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50" on:click={() => void validateFile()} disabled={loading || !selectedFile || !organizationId}>
				{loading ? 'Working...' : 'Validate CSV'}
			</button>
		</div>
	</section>

	{#if preview}
		<section class="section-card space-y-4 p-5">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 class="text-lg font-semibold">Preview · {preview.sourceFilename}</h2>
					<p class="mt-1 text-sm text-slate-600 dark:text-white/65">Status: {preview.status} · {preview.validRowCount}/{preview.rowCount} valid · Estimated labor cost {previewTotalCost.toFixed(2)}</p>
				</div>
				<button type="button" class="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50" on:click={() => void commitBatch()} disabled={loading || preview.status !== 'Validated' || preview.errorRowCount > 0}>
					Commit Draft Timesheets
				</button>
			</div>

			{#if preview.errors.length > 0}
				<div class="overflow-x-auto">
					<table class="ui-table w-full text-sm">
						<thead><tr class="ui-table-compact-head"><th>Row</th><th>Field</th><th>Error</th></tr></thead>
						<tbody>
							{#each preview.errors as rowError, errorIndex (`${rowError.rowNumber}-${errorIndex}`)}
								<tr class="ui-table-compact-row"><td>{rowError.rowNumber}</td><td>{rowError.field ?? '—'}</td><td>{rowError.message}</td></tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			{#if preview.rows.length > 0}
				<div class="overflow-x-auto">
					<table class="ui-table w-full text-sm">
						<thead><tr class="ui-table-compact-head"><th>Row</th><th>Resource</th><th>Work date</th><th>Project / Task</th><th>Hours</th><th>Stored rate</th><th>Line cost</th><th>Activity</th></tr></thead>
						<tbody>
							{#each preview.rows as row (row.rowNumber)}
								<tr class="ui-table-compact-row">
									<td>{row.rowNumber}</td><td>{row.resourceType}: {row.resourceId}</td><td>{row.workDate}</td>
									<td>{row.projectId ?? '—'}{row.taskId ? ` / ${row.taskId}` : ''}</td><td>{row.hours}</td>
									<td>{row.hourlyRate.toFixed(2)}</td><td>{row.lineCost.toFixed(2)}</td><td>{row.description ?? '—'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	{/if}

	<section class="section-card space-y-3 p-5">
		<div class="flex items-center justify-between gap-3">
			<h2 class="text-lg font-semibold">Recent imports</h2>
			<button type="button" class="btn-ghost rounded-md px-3 py-1.5 text-xs" on:click={() => void loadHistory()} disabled={!organizationId}>Refresh</button>
		</div>
		<div class="overflow-x-auto">
			<table class="ui-table w-full text-sm">
				<thead><tr class="ui-table-compact-head"><th>File</th><th>Status</th><th>Rows</th><th>Errors</th><th>Timesheets</th><th>Created</th></tr></thead>
				<tbody>
					{#each history as batch (batch.importBatchId)}
						<tr class="ui-table-compact-row">
							<td>{batch.sourceFilename}</td><td>{batch.status}</td><td>{batch.validRowCount}/{batch.rowCount}</td>
							<td>{batch.errorRowCount}</td><td>{JSON.parse(batch.timesheetIdsJson).length}</td><td>{batch.createdAt}</td>
						</tr>
					{:else}
						<tr class="ui-table-compact-row"><td colspan="6">No imports for this organization.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</section>
