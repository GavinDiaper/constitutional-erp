<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { isActiveEmployee, isApprovedPo, isDraftQuote, isPendingJournal } from '$lib/api/dashboard';
	import { getO2CQuotes, type O2CQuote } from '$lib/api/quotes';
	import { queryTable } from '$lib/api/query';
	import { actorStore } from '$lib/stores/actorStore';

	interface PurchaseOrderRow {
		po_id: string;
		state?: string;
		supplier_id?: string;
	}

	interface JournalRow {
		journal_id: string;
		state?: string;
		description?: string;
	}

	interface EmployeeRow {
		employee_id: string;
		state?: string;
		name?: string;
	}

	let loading = false;
	let errorMessage = '';
	let filterText = '';

	let draftQuotes: O2CQuote[] = [];
	let approvedPurchaseOrders: PurchaseOrderRow[] = [];
	let pendingJournals: JournalRow[] = [];
	let activeEmployees: EmployeeRow[] = [];

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void loadLandingData();
		});

		void loadLandingData();

		return () => {
			unsubscribeActor();
		};
	});

	async function loadLandingData(): Promise<void> {
		loading = true;
		errorMessage = '';

		try {
			const [quotesResult, poResult, journalsResult, employeeResult] = await Promise.all([
				getO2CQuotes($actorStore),
				queryTable<PurchaseOrderRow>('p2p_purchase_order', $actorStore),
				queryTable<JournalRow>('r2r_journal', $actorStore),
				queryTable<EmployeeRow>('h2r_employee', $actorStore)
			]);

			draftQuotes = (quotesResult.data ?? []).filter(isDraftQuote);
			approvedPurchaseOrders = (poResult.data ?? []).filter(isApprovedPo);
			pendingJournals = (journalsResult.data ?? []).filter(isPendingJournal);
			activeEmployees = (employeeResult.data ?? []).filter(isActiveEmployee);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load Canvas entities.';
		} finally {
			loading = false;
		}
	}

	function match(value: string | undefined): boolean {
		if (!filterText.trim()) {
			return true;
		}

		return (value ?? '').toLowerCase().includes(filterText.trim().toLowerCase());
	}

	$: filteredQuotes = draftQuotes.filter((quote) => match(quote.quote_id) || match(quote.customer_id));
	$: filteredPurchaseOrders = approvedPurchaseOrders.filter((po) => match(po.po_id) || match(po.supplier_id));
	$: filteredJournals = pendingJournals.filter((journal) => match(journal.journal_id) || match(journal.description));
	$: filteredEmployees = activeEmployees.filter((employee) => match(employee.employee_id) || match(employee.name));
</script>

<section class="glass-panel p-6">
	<h2 class="text-2xl font-semibold">Canvas Landing</h2>
	<p class="muted mt-2 text-sm">
		Find and select real entities to inspect state transitions, governance constraints, and event activity.
	</p>

	<div class="mt-4 flex flex-wrap items-center gap-3">
		<input
			type="text"
			class="w-full max-w-md rounded-md border border-white/30 bg-[#112946] px-3 py-2 text-sm text-white"
			placeholder="Find by ID or name (quote, PO, journal, employee)"
			bind:value={filterText}
		/>
		{#if loading}
			<span class="muted text-xs">Loading entities...</span>
		{/if}
	</div>

	{#if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{/if}

	<div class="mt-5 grid gap-4 lg:grid-cols-2">
		<section class="rounded-lg border border-white/15 bg-white/5 p-4">
			<div class="mb-3 flex items-center justify-between gap-3">
				<h3 class="text-lg font-semibold">O2C Draft Quotes</h3>
				<a class="text-xs text-white/80 underline" href={resolve('/canvas/o2c/quotes/drafts')}>View all</a>
			</div>
			<ul class="space-y-2 text-sm">
				{#if filteredQuotes.length === 0}
					<li class="muted">No matching draft quotes.</li>
				{:else}
					{#each filteredQuotes.slice(0, 8) as quote (quote.quote_id)}
						<li>
							<a class="block rounded border border-white/10 px-3 py-2 hover:bg-white/10" href={resolve(`/canvas/o2c_quote/${quote.quote_id}`)}>
								<span class="font-semibold">{quote.quote_id}</span>
								<span class="muted ml-2 text-xs">{quote.customer_id ?? 'n/a'}</span>
							</a>
						</li>
					{/each}
				{/if}
			</ul>
		</section>

		<section class="rounded-lg border border-white/15 bg-white/5 p-4">
			<div class="mb-3 flex items-center justify-between gap-3">
				<h3 class="text-lg font-semibold">P2P Approved POs</h3>
				<a class="text-xs text-white/80 underline" href={resolve('/canvas/p2p/purchase-orders/approved')}>View all</a>
			</div>
			<ul class="space-y-2 text-sm">
				{#if filteredPurchaseOrders.length === 0}
					<li class="muted">No matching approved purchase orders.</li>
				{:else}
					{#each filteredPurchaseOrders.slice(0, 8) as po (po.po_id)}
						<li>
							<a class="block rounded border border-white/10 px-3 py-2 hover:bg-white/10" href={resolve(`/canvas/p2p_purchase_order/${po.po_id}`)}>
								<span class="font-semibold">{po.po_id}</span>
								<span class="muted ml-2 text-xs">{po.supplier_id ?? 'n/a'}</span>
							</a>
						</li>
					{/each}
				{/if}
			</ul>
		</section>

		<section class="rounded-lg border border-white/15 bg-white/5 p-4">
			<div class="mb-3 flex items-center justify-between gap-3">
				<h3 class="text-lg font-semibold">GL Pending Journals</h3>
				<a class="text-xs text-white/80 underline" href={resolve('/canvas/r2r/journals/pending')}>View all</a>
			</div>
			<ul class="space-y-2 text-sm">
				{#if filteredJournals.length === 0}
					<li class="muted">No matching pending journals.</li>
				{:else}
					{#each filteredJournals.slice(0, 8) as journal (journal.journal_id)}
						<li>
							<a class="block rounded border border-white/10 px-3 py-2 hover:bg-white/10" href={resolve(`/canvas/r2r_journal/${journal.journal_id}`)}>
								<span class="font-semibold">{journal.journal_id}</span>
								<span class="muted ml-2 text-xs">{journal.state ?? 'unknown'}</span>
							</a>
						</li>
					{/each}
				{/if}
			</ul>
		</section>

		<section class="rounded-lg border border-white/15 bg-white/5 p-4">
			<div class="mb-3 flex items-center justify-between gap-3">
				<h3 class="text-lg font-semibold">HCM Active Employees</h3>
				<a class="text-xs text-white/80 underline" href={resolve('/canvas/h2r/employees/active')}>View all</a>
			</div>
			<ul class="space-y-2 text-sm">
				{#if filteredEmployees.length === 0}
					<li class="muted">No matching active employees.</li>
				{:else}
					{#each filteredEmployees.slice(0, 8) as employee (employee.employee_id)}
						<li>
							<a class="block rounded border border-white/10 px-3 py-2 hover:bg-white/10" href={resolve(`/canvas/h2r_employee/${employee.employee_id}`)}>
								<span class="font-semibold">{employee.employee_id}</span>
								<span class="muted ml-2 text-xs">{employee.name ?? 'n/a'}</span>
							</a>
						</li>
					{/each}
				{/if}
			</ul>
		</section>
	</div>
</section>
