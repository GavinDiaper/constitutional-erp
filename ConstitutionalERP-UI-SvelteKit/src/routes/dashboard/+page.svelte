<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		getDashboardSummary,
		isActiveEmployee,
		isPendingJournal,
		isSubmittedRequisition
	} from '$lib/api/dashboard';
	import { getO2CQuotes, type O2CQuote } from '$lib/api/quotes';
	import { queryTable } from '$lib/api/query';
	import Card from '$lib/components/shared/Card.svelte';
	import Badge from '$lib/components/shared/Badge.svelte';
	import { actorStore } from '$lib/stores/actorStore';
	import { dashboardStore } from '$lib/stores/dashboardStore';

	const cards = [
		{ key: 'draftQuotes', label: 'Draft Quotes', href: resolve('/canvas/o2c/quotes/drafts') },
		{ key: 'draftRequisitions', label: 'Draft Requisitions', href: resolve('/canvas/p2p/requisitions/drafts') },
		{ key: 'submittedRequisitions', label: 'Submitted Requisitions', href: resolve('/canvas/p2p/requisitions/submitted') },
		{ key: 'approvedPos', label: 'Approved POs', href: resolve('/canvas/p2p/purchase-orders/approved') },
		{ key: 'pendingJournals', label: 'Pending Journals', href: resolve('/canvas/r2r/journals/pending') },
		{ key: 'activeEmployees', label: 'Active Employees', href: resolve('/canvas/h2r/employees/active') }
	] as const;

	interface PurchaseOrderRow {
		po_id: string;
		state?: string;
		total_amount?: number | string;
		amount?: number | string;
		created_at?: string;
		order_date?: string;
		document_date?: string;
	}

	interface JournalRow {
		journal_id: string;
		state?: string;
		description?: string;
		created_at?: string;
		fiscal_period_id?: string;
		period_id?: string;
		fiscal_period?: string;
		total_amount?: number | string;
		amount?: number | string;
		total_debit?: number | string;
		debit_total?: number | string;
	}

	interface RequisitionRow {
		requisition_id: string;
		state?: string;
		requester?: string;
		created_at?: string;
	}

	interface EmployeeRow {
		employee_id: string;
		state?: string;
		status?: string;
		employment_status?: string;
		lifecycle_state?: string;
		process_state?: string;
		active?: boolean | number | string;
	}

	interface ChartSlice {
		label: string;
		value: number;
		color: string;
	}

	interface ApprovalQueueItem {
		id: string;
		entityType: 'p2p_requisition' | 'r2r_journal';
		ownerLabel: string;
		stateLabel: string;
		href: string;
		createdAt: string;
	}

	let loadingSummary = false;
	let chartErrorMessage = '';

	let quoteStatusData: ChartSlice[] = [];
	let employeeStatusData: ChartSlice[] = [];
	let journalsByPeriod: Array<{ label: string; total: number }> = [];
	let poValueByState: Array<{ label: string; total: number }> = [];
	let approvalQueueItems: ApprovalQueueItem[] = [];

	const palette = ['#22d3ee', '#38bdf8', '#f59e0b', '#34d399', '#f87171', '#a78bfa', '#f472b6', '#60a5fa'];

	$: quoteStatusTotal = quoteStatusData.reduce((sum, item) => sum + item.value, 0);
	$: employeeStatusTotal = employeeStatusData.reduce((sum, item) => sum + item.value, 0);
	$: quoteStatusConic = buildConicGradient(quoteStatusData);
	$: employeeStatusConic = buildConicGradient(employeeStatusData);
	$: maxJournalValue = journalsByPeriod.reduce((max, item) => Math.max(max, item.total), 0);
	$: maxPoValue = poValueByState.reduce((max, item) => Math.max(max, item.total), 0);

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void loadDashboardData();
		});

		void loadDashboardData();

		return () => {
			unsubscribeActor();
		};
	});

	async function loadDashboardData(): Promise<void> {
		loadingSummary = true;
		chartErrorMessage = '';

		try {
			const [summary, quoteResult, requisitionResult, poResult, journalResult, employeeResult] = await Promise.all([
				getDashboardSummary($actorStore),
				getO2CQuotes($actorStore),
				queryTable<RequisitionRow>('p2p_requisition', $actorStore),
				queryTable<PurchaseOrderRow>('p2p_purchase_order', $actorStore),
				queryTable<JournalRow>('r2r_journal', $actorStore),
				queryTable<EmployeeRow>('h2r_employee', $actorStore)
			]);

			dashboardStore.set(summary);

			quoteStatusData = aggregateStates(
				(quoteResult.data ?? []).map((quote) => quote.state),
				'Unknown'
			);
			employeeStatusData = aggregateStates((employeeResult.data ?? []).map(resolveEmployeeStatus), 'Unknown');
			journalsByPeriod = aggregateJournalsByPeriod(journalResult.data ?? []);
			poValueByState = aggregatePoValueByState(poResult.data ?? []);
			approvalQueueItems = buildApprovalQueue(requisitionResult.data ?? [], journalResult.data ?? []);
		} catch (error) {
			chartErrorMessage = error instanceof Error ? error.message : 'Unable to load dashboard analytics.';
		} finally {
			loadingSummary = false;
		}
	}

	function buildApprovalQueue(
		requisitions: RequisitionRow[],
		journals: JournalRow[]
	): ApprovalQueueItem[] {
		const submittedRequisitions = requisitions
			.filter(isSubmittedRequisition)
			.map((requisition) => ({
				id: requisition.requisition_id,
				entityType: 'p2p_requisition' as const,
				ownerLabel: requisition.requester ?? 'n/a',
				stateLabel: normalizeLabel(requisition.state || 'Submitted'),
				href: resolve(`/canvas/p2p_requisition/${requisition.requisition_id}`),
				createdAt: requisition.created_at ?? ''
			}));

		const pendingJournals = journals
			.filter(isPendingJournal)
			.map((journal) => ({
				id: journal.journal_id,
				entityType: 'r2r_journal' as const,
				ownerLabel:
					journal.description ||
					journal.fiscal_period_id ||
					journal.period_id ||
					journal.fiscal_period ||
					'n/a',
				stateLabel: normalizeLabel(journal.state || 'Pending'),
				href: resolve(`/canvas/r2r_journal/${journal.journal_id}`),
				createdAt: journal.created_at ?? ''
			}));

		return [...submittedRequisitions, ...pendingJournals]
			.sort((a, b) => sortByCreatedAtDesc(a.createdAt, b.createdAt))
			.slice(0, 12);
	}

	function sortByCreatedAtDesc(left: string, right: string): number {
		const leftTime = Date.parse(left);
		const rightTime = Date.parse(right);

		if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
			return 0;
		}

		if (Number.isNaN(leftTime)) {
			return 1;
		}

		if (Number.isNaN(rightTime)) {
			return -1;
		}

		return rightTime - leftTime;
	}

	function aggregateStates(values: Array<string | undefined>, fallback: string): ChartSlice[] {
		const counts = new Map<string, number>();

		for (const value of values) {
			const label = normalizeLabel(value || fallback);
			counts.set(label, (counts.get(label) ?? 0) + 1);
		}

		return Array.from(counts.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 8)
			.map(([label, value], index) => ({ label, value, color: palette[index % palette.length] }));
	}

	function aggregateJournalsByPeriod(rows: JournalRow[]): Array<{ label: string; total: number }> {
		const totals = new Map<string, number>();

		for (const row of rows) {
			const period = normalizeLabel(
				row.fiscal_period_id || row.period_id || row.fiscal_period || fallbackByState(row.state, 'Unassigned')
			);
			const amount =
				toNumber(row.total_amount) ||
				toNumber(row.amount) ||
				toNumber(row.total_debit) ||
				toNumber(row.debit_total);

			totals.set(period, (totals.get(period) ?? 0) + amount);
		}

		return Array.from(totals.entries())
			.map(([label, total]) => ({ label, total }))
			.sort((a, b) => b.total - a.total)
			.slice(0, 8);
	}

	function aggregatePoValueByState(rows: PurchaseOrderRow[]): Array<{ label: string; total: number }> {
		const currentYear = new Date().getFullYear();
		const filteredByYear = rows.filter((row) => {
			const candidateDate = row.created_at || row.order_date || row.document_date;
			if (!candidateDate) {
				return true;
			}

			const parsed = new Date(candidateDate);
			return Number.isNaN(parsed.getTime()) ? true : parsed.getFullYear() === currentYear;
		});

		const totals = new Map<string, number>();
		for (const row of filteredByYear) {
			const state = normalizeLabel(row.state || 'Unknown');
			const amount = toNumber(row.total_amount) || toNumber(row.amount);
			totals.set(state, (totals.get(state) ?? 0) + amount);
		}

		return Array.from(totals.entries())
			.map(([label, total]) => ({ label, total }))
			.sort((a, b) => b.total - a.total)
			.slice(0, 8);
	}

	function resolveEmployeeStatus(employee: EmployeeRow): string {
		if (isActiveEmployee(employee)) {
			return 'Active';
		}

		return (
			employee.state ||
			employee.status ||
			employee.employment_status ||
			employee.lifecycle_state ||
			employee.process_state ||
			'Unknown'
		);
	}

	function normalizeLabel(value: string): string {
		return value
			.trim()
			.replace(/[_-]+/g, ' ')
			.toLowerCase()
			.replace(/\b\w/g, (character) => character.toUpperCase());
	}

	function fallbackByState(value: string | undefined, fallback: string): string {
		return value && value.trim() ? value : fallback;
	}

	function toNumber(value: number | string | undefined): number {
		if (typeof value === 'number' && Number.isFinite(value)) {
			return value;
		}

		if (typeof value === 'string' && value.trim()) {
			const parsed = Number(value);
			return Number.isFinite(parsed) ? parsed : 0;
		}

		return 0;
	}

	function buildConicGradient(slices: ChartSlice[]): string {
		const total = slices.reduce((sum, item) => sum + item.value, 0);
		if (!total) {
			return '#1e293b';
		}

		let cursor = 0;
		const segments = slices.map((slice) => {
			const start = (cursor / total) * 100;
			cursor += slice.value;
			const end = (cursor / total) * 100;
			return `${slice.color} ${start}% ${end}%`;
		});

		return `conic-gradient(${segments.join(', ')})`;
	}

	function percentage(value: number, total: number): string {
		if (!total) {
			return '0%';
		}

		return `${Math.round((value / total) * 100)}%`;
	}

	function formatCurrency(value: number): string {
		return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
	}
</script>

<div class="glass-panel p-6 md:p-8">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-3xl font-semibold">Constitutional Canvas</h1>
			<p class="muted mt-2 max-w-2xl text-sm">
				Process-first operational cockpit for O2C, P2P, R2R, and H2R stateful execution.
			</p>
		</div>
		<Badge text="Phase 1" tone="danger" />
	</div>

	<div class="grid-auto-fit mt-6">
		{#each cards as card (card.key)}
			<Card title={card.label} value={$dashboardStore[card.key]} href={card.href} />
		{/each}
	</div>

	{#if loadingSummary}
		<p class="muted mt-3 text-xs">Refreshing live dashboard counts...</p>
	{/if}

	{#if chartErrorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{chartErrorMessage}</p>
	{/if}

	<section class="mt-8 rounded-lg border border-white/15 bg-white/5 p-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h2 class="text-lg font-semibold">Approval Queue</h2>
				<p class="muted mt-1 text-xs">Submitted requisitions and pending journals requiring operator attention.</p>
			</div>
			<span class="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
				{approvalQueueItems.length} items
			</span>
		</div>

		{#if approvalQueueItems.length === 0}
			<p class="muted mt-3 text-sm">No items currently waiting in the approval queue.</p>
		{:else}
			<ul class="mt-3 grid gap-2 md:grid-cols-2">
				{#each approvalQueueItems as item (item.entityType + '-' + item.id)}
					<li>
						<a class="block rounded-md border border-white/15 bg-white/5 px-3 py-2 hover:bg-white/10" href={item.href}>
							<div class="flex items-center justify-between gap-2">
								<p class="font-semibold">{item.id}</p>
								<span class="text-[11px] uppercase tracking-[0.12em] text-white/65">{item.entityType === 'p2p_requisition' ? 'Requisition' : 'Journal'}</span>
							</div>
							<p class="muted mt-1 text-xs">{item.ownerLabel}</p>
							<p class="mt-1 text-xs text-white/85">State: {item.stateLabel}</p>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<div class="mt-8 grid gap-4 lg:grid-cols-2">
		<section class="rounded-lg border border-white/15 bg-white/5 p-4">
			<h2 class="text-lg font-semibold">Quotes By Status</h2>
			<div class="mt-4 flex items-center gap-4">
				<div class="h-36 w-36 rounded-full border border-white/20" style={`background: ${quoteStatusConic}`}></div>
				<ul class="space-y-2 text-sm">
					{#if quoteStatusData.length === 0}
						<li class="muted">No quote status data available.</li>
					{:else}
						{#each quoteStatusData as slice (slice.label)}
							<li class="flex items-center justify-between gap-3">
								<span class="inline-flex items-center gap-2">
									<span class="h-2.5 w-2.5 rounded-full" style={`background:${slice.color}`}></span>
									{slice.label}
								</span>
								<span class="muted text-xs">{slice.value} ({percentage(slice.value, quoteStatusTotal)})</span>
							</li>
						{/each}
					{/if}
				</ul>
			</div>
		</section>

		<section class="rounded-lg border border-white/15 bg-white/5 p-4">
			<h2 class="text-lg font-semibold">Employees By Status</h2>
			<div class="mt-4 flex items-center gap-4">
				<div class="h-36 w-36 rounded-full border border-white/20" style={`background: ${employeeStatusConic}`}></div>
				<ul class="space-y-2 text-sm">
					{#if employeeStatusData.length === 0}
						<li class="muted">No employee status data available.</li>
					{:else}
						{#each employeeStatusData as slice (slice.label)}
							<li class="flex items-center justify-between gap-3">
								<span class="inline-flex items-center gap-2">
									<span class="h-2.5 w-2.5 rounded-full" style={`background:${slice.color}`}></span>
									{slice.label}
								</span>
								<span class="muted text-xs">{slice.value} ({percentage(slice.value, employeeStatusTotal)})</span>
							</li>
						{/each}
					{/if}
				</ul>
			</div>
		</section>

		<section class="rounded-lg border border-white/15 bg-white/5 p-4">
			<h2 class="text-lg font-semibold">Journals Sum By Period</h2>
			<div class="mt-4 space-y-2">
				{#if journalsByPeriod.length === 0}
					<p class="muted text-sm">No journal period totals available.</p>
				{:else}
					{#each journalsByPeriod as item (item.label)}
						<div class="space-y-1">
							<div class="flex items-center justify-between text-xs text-white/85">
								<span>{item.label}</span>
								<span>{formatCurrency(item.total)}</span>
							</div>
							<div class="h-2 rounded bg-white/10">
								<div
									class="h-2 rounded bg-gradient-to-r from-cyan-400 to-sky-500"
									style={`width:${maxJournalValue ? Math.max((item.total / maxJournalValue) * 100, 3) : 0}%`}
								></div>
							</div>
						</div>
					{/each}
				{/if}
			</div>
		</section>

		<section class="rounded-lg border border-white/15 bg-white/5 p-4">
			<h2 class="text-lg font-semibold">PO Value By State (FY)</h2>
			<div class="mt-4 space-y-2">
				{#if poValueByState.length === 0}
					<p class="muted text-sm">No purchase order value data available.</p>
				{:else}
					{#each poValueByState as item (item.label)}
						<div class="space-y-1">
							<div class="flex items-center justify-between text-xs text-white/85">
								<span>{item.label}</span>
								<span>{formatCurrency(item.total)}</span>
							</div>
							<div class="h-2 rounded bg-white/10">
								<div
									class="h-2 rounded bg-gradient-to-r from-amber-400 to-orange-500"
									style={`width:${maxPoValue ? Math.max((item.total / maxPoValue) * 100, 3) : 0}%`}
								></div>
							</div>
						</div>
					{/each}
				{/if}
			</div>
		</section>
	</div>

	<div class="mt-8 flex flex-wrap gap-3">
		<a class="rounded-md bg-white px-4 py-2 font-semibold text-slate-900" href={resolve('/canvas')}>
			Open Canvas
		</a>
		<a class="rounded-md border border-white/35 px-4 py-2 text-white" href={resolve('/canvas/create')}>
			Create New Entity
		</a>
	</div>
</div>
