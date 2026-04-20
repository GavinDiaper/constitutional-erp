<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import { getO2CQuotes, type O2CQuote } from '$lib/api/quotes';
	import { queryTable } from '$lib/api/query';
	import { actorStore } from '$lib/stores/actorStore';

	type DomainTab = 'o2c' | 'p2p' | 'r2r' | 'hcm';
	type EntityKey =
		| 'o2c_quote'
		| 'o2c_customer'
		| 'o2c_sales_order'
		| 'o2c_invoice'
		| 'p2p_requisition'
		| 'p2p_purchase_order'
		| 'p2p_supplier'
		| 'r2r_journal'
		| 'h2r_employee';

	interface EntityListItem {
		id: string;
		state: string;
		secondary: string;
		href: string;
	}

	interface EntitySection {
		key: EntityKey;
		title: string;
		description: string;
		items: EntityListItem[];
	}

	interface PurchaseOrderRow {
		po_id: string;
		state?: string;
		supplier_id?: string;
		created_at?: string;
	}

	interface JournalRow {
		journal_id: string;
		state?: string;
		description?: string;
		created_at?: string;
	}

	interface EmployeeRow {
		employee_id: string;
		state?: string;
		status?: string;
		employment_status?: string;
		name?: string;
		created_at?: string;
	}

	interface RequisitionRow {
		requisition_id: string;
		state?: string;
		requester?: string;
		created_at?: string;
	}

	interface CustomerRow {
		customer_id: string;
		status?: string;
		customer_name?: string;
		created_at?: string;
	}

	interface SalesOrderRow {
		order_id: string;
		state?: string;
		customer_id?: string;
		quote_id?: string;
		created_at?: string;
	}

	interface InvoiceRow {
		invoice_id: string;
		state?: string;
		order_id?: string;
		order_amount?: number | string;
		tax_amount?: number | string;
		total_payable?: number | string;
		amount_due?: number | string;
		created_at?: string;
	}

	function asMoney(value: number | string | undefined): string {
		const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
		if (!Number.isFinite(numeric)) {
			return '0.00';
		}
		return numeric.toFixed(2);
	}

	interface SupplierRow {
		supplier_id: string;
		status?: string;
		supplier_name?: string;
		created_at?: string;
	}

	let loading = false;
	let errorMessage = '';
	let filterText = '';
	let activeTab: DomainTab = 'o2c';
	let stateFilterByEntity: Partial<Record<EntityKey, string>> = {};

	let draftQuotes: O2CQuote[] = [];
	let customers: CustomerRow[] = [];
	let salesOrders: SalesOrderRow[] = [];
	let invoices: InvoiceRow[] = [];
	let requisitions: RequisitionRow[] = [];
	let approvedPurchaseOrders: PurchaseOrderRow[] = [];
	let suppliers: SupplierRow[] = [];
	let journals: JournalRow[] = [];
	let employees: EmployeeRow[] = [];

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void loadLandingData();
		});

		return () => {
			unsubscribeActor();
		};
	});

	async function loadLandingData(): Promise<void> {
		loading = true;
		errorMessage = '';

		try {
			const [quotesResult, customerResult, salesOrderResult, invoiceResult, requisitionResult, poResult, supplierResult, journalsResult, employeeResult] = await Promise.all([
				getO2CQuotes($actorStore),
				queryTable<CustomerRow>('o2c_customer', $actorStore),
				queryTable<SalesOrderRow>('o2c_sales_order', $actorStore),
				queryTable<InvoiceRow>('o2c_invoice', $actorStore),
				queryTable<RequisitionRow>('p2p_requisition', $actorStore),
				queryTable<PurchaseOrderRow>('p2p_purchase_order', $actorStore),
				queryTable<SupplierRow>('p2p_supplier', $actorStore),
				queryTable<JournalRow>('r2r_journal', $actorStore),
				queryTable<EmployeeRow>('h2r_employee', $actorStore)
			]);

			draftQuotes = quotesResult.data ?? [];
			customers = customerResult.data ?? [];
			salesOrders = salesOrderResult.data ?? [];
			invoices = invoiceResult.data ?? [];
			requisitions = requisitionResult.data ?? [];
			approvedPurchaseOrders = poResult.data ?? [];
			suppliers = supplierResult.data ?? [];
			journals = journalsResult.data ?? [];
			employees = employeeResult.data ?? [];
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load Canvas entities.';
		} finally {
			loading = false;
		}
	}

	function match(value: string | undefined, textFilter: string): boolean {
		const normalizedFilter = textFilter.trim().toLowerCase();
		if (!normalizedFilter) {
			return true;
		}

		return (value ?? '').toLowerCase().includes(normalizedFilter);
	}

	function normalizeState(raw: string | undefined, fallback = 'Unknown'): string {
		const source = (raw ?? '').trim();
		if (!source) {
			return fallback;
		}

		return source
			.replace(/[_-]+/g, ' ')
			.toLowerCase()
			.replace(/\b\w/g, (character) => character.toUpperCase());
	}

	function toTimestamp(raw: string | undefined): number {
		if (!raw) {
			return 0;
		}
		const parsed = Date.parse(raw);
		return Number.isNaN(parsed) ? 0 : parsed;
	}

	function buildItems<T>(
		rows: T[],
		getId: (row: T) => string,
		getState: (row: T) => string,
		getSecondary: (row: T) => string,
		entityType: EntityKey,
		getCreatedAt: (row: T) => string | undefined
	): EntityListItem[] {
		const items: Array<EntityListItem & { createdAt: number }> = [];

		for (const row of rows) {
				const id = getId(row);
				if (!id) {
					continue;
				}

				const state = normalizeState(getState(row));
				const secondary = getSecondary(row);
				const href = String(resolve(`/canvas/${entityType}/${id}`));

				items.push({
					id,
					state,
					secondary,
					href,
					createdAt: toTimestamp(getCreatedAt(row))
				});
		}

		return items.sort((left, right) => right.createdAt - left.createdAt).map(({ createdAt, ...item }) => item);
	}

	$: quoteItems = buildItems(
		draftQuotes,
		(row) => String(row.quote_id ?? ''),
		(row) => String(row.state ?? ''),
		(row) => String(row.customer_id ?? ''),
		'o2c_quote',
		() => undefined
	);

	$: customerItems = buildItems(
		customers,
		(row) => String(row.customer_id ?? ''),
		(row) => String(row.status ?? ''),
		(row) => String(row.customer_name ?? ''),
		'o2c_customer',
		(row) => row.created_at as string | undefined
	);

	$: salesOrderItems = buildItems(
		salesOrders,
		(row) => String(row.order_id ?? ''),
		(row) => String(row.state ?? ''),
		(row) => String(row.quote_id ?? row.customer_id ?? ''),
		'o2c_sales_order',
		(row) => row.created_at as string | undefined
	);

	$: invoiceItems = buildItems(
		invoices,
		(row) => String(row.invoice_id ?? ''),
		(row) => String(row.state ?? ''),
		(row) => {
			const subtotal = asMoney(row.order_amount);
			const tax = asMoney(row.tax_amount);
			const payable = asMoney(row.total_payable ?? row.amount_due);
			return `${String(row.order_id ?? '')} • Order ${subtotal} • Tax ${tax} • Payable ${payable}`;
		},
		'o2c_invoice',
		(row) => row.created_at as string | undefined
	);

	$: requisitionItems = buildItems(
		requisitions,
		(row) => String(row.requisition_id ?? ''),
		(row) => String(row.state ?? ''),
		(row) => String(row.requester ?? ''),
		'p2p_requisition',
		(row) => row.created_at as string | undefined
	);

	$: purchaseOrderItems = buildItems(
		approvedPurchaseOrders,
		(row) => String(row.po_id ?? ''),
		(row) => String(row.state ?? ''),
		(row) => String(row.supplier_id ?? ''),
		'p2p_purchase_order',
		(row) => row.created_at as string | undefined
	);

	$: supplierItems = buildItems(
		suppliers,
		(row) => String(row.supplier_id ?? ''),
		(row) => String(row.status ?? ''),
		(row) => String(row.supplier_name ?? ''),
		'p2p_supplier',
		(row) => row.created_at as string | undefined
	);

	$: journalItems = buildItems(
		journals,
		(row) => String(row.journal_id ?? ''),
		(row) => String(row.state ?? ''),
		(row) => String(row.description ?? ''),
		'r2r_journal',
		(row) => row.created_at as string | undefined
	);

	$: employeeItems = buildItems(
		employees,
		(row) => String(row.employee_id ?? ''),
		(row) => String(row.state ?? row.status ?? row.employment_status ?? ''),
		(row) => String(row.name ?? ''),
		'h2r_employee',
		(row) => row.created_at as string | undefined
	);

	$: sectionsByTab = {
		o2c: [
			{
				key: 'o2c_quote',
				title: 'Quotes',
				description: 'All quote states including Draft, Sent, Accepted, and Rejected.',
				items: quoteItems
			},
			{
				key: 'o2c_customer',
				title: 'Customers',
				description: 'Customer lifecycle and activation states.',
				items: customerItems
			},
			{
				key: 'o2c_sales_order',
				title: 'Sales Orders',
				description: 'Order progression from Draft through Shipped, Invoiced, and Closed.',
				items: salesOrderItems
			},
			{
				key: 'o2c_invoice',
				title: 'AR Invoices',
				description: 'Generated invoices with posting and payment follow-on actions.',
				items: invoiceItems
			}
		],
		p2p: [
			{
				key: 'p2p_requisition',
				title: 'Requisitions',
				description: 'Draft, Submitted, Approved, Rejected, and other requisition states.',
				items: requisitionItems
			},
			{
				key: 'p2p_purchase_order',
				title: 'Purchase Orders',
				description: 'Full PO state coverage from Draft through Closed.',
				items: purchaseOrderItems
			},
			{
				key: 'p2p_supplier',
				title: 'Suppliers',
				description: 'Supplier state and status coverage.',
				items: supplierItems
			}
		],
		r2r: [
			{
				key: 'r2r_journal',
				title: 'Journals',
				description: 'Draft, Posted, Reversed, and related journal states.',
				items: journalItems
			}
		],
		hcm: [
			{
				key: 'h2r_employee',
				title: 'Employees',
				description: 'Candidate, Active, Leave, Terminated, and related statuses.',
				items: employeeItems
			}
		]
	} satisfies Record<DomainTab, EntitySection[]>;

	function stateCounts(items: EntityListItem[]): Array<{ state: string; count: number }> {
		const counts = new SvelteMap<string, number>();
		for (const item of items) {
			counts.set(item.state, (counts.get(item.state) ?? 0) + 1);
		}

		return Array.from(counts.entries())
			.map(([state, count]) => ({ state, count }))
			.sort((left, right) => right.count - left.count || left.state.localeCompare(right.state));
	}

	function filteredItems(items: EntityListItem[], selectedState: string, textFilter: string): EntityListItem[] {
		return items.filter((item) => {
			const matchesText =
				match(item.id, textFilter) || match(item.secondary, textFilter) || match(item.state, textFilter);
			const matchesState = !selectedState || item.state === selectedState;
			return matchesText && matchesState;
		});
	}

	function setStateFilter(entity: EntityKey, state: string): void {
		stateFilterByEntity = { ...stateFilterByEntity, [entity]: state };
	}

</script>

<section class="glass-panel p-6">
	<h2 class="text-2xl font-semibold">Canvas Landing</h2>
	<p class="muted mt-2 text-sm">
		Explore all entities by domain and state, then jump directly into each process.
	</p>
	<div class="w-full max-w-md rounded-md border dark:border-white/30 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm dark:text-white text-slate-900">
		Need a joined-up cross-domain flow for manufacturing?
		<a class="ml-2 font-semibold dark:text-white text-slate-900 underline underline-offset-2" href={resolve('/canvas/business-flows/baked-bread')}>
			Open Baked Bread Profit Flow
		</a>
	</div>
<!-- 	<div class="mt-3 rounded-lg border border-emerald-300/35 bg-emerald-500/5 p-3 text-xs text-emerald-100">
		Domain process flows have moved to Diagram Explorer.
		<a class="ml-2 font-semibold text-emerald-100 underline decoration-emerald-200/80 underline-offset-2" href={resolve('/diagrams/process-flows')}>
			Open Domain Process Flows
		</a>
	</div> -->

	<div class="mt-4 flex flex-wrap items-center gap-3">
		<input
			type="text"
			class="w-full max-w-md rounded-md border dark:border-white/30 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm dark:text-white text-slate-900"
			placeholder="Find by ID, state, or name"
			bind:value={filterText}
		/>
		{#if loading}
			<span class="muted text-xs">Loading entities...</span>
		{/if}
	</div>

	<div class="mt-4 flex flex-wrap gap-2">
		<button
			type="button"
			class={`rounded-md border px-3 py-1 text-xs font-semibold ${activeTab === 'o2c' ? 'dark:border-white border-slate-700 dark:bg-white/20 bg-slate-500/20 dark:text-white text-slate-900' : 'dark:border-white/25 border-slate-300 dark:text-white/80 text-slate-700 dark:hover:bg-white/10 hover:bg-slate-500/10'}`}
			on:click={() => (activeTab = 'o2c')}
		>
			O2C
		</button>
		<button
			type="button"
			class={`rounded-md border px-3 py-1 text-xs font-semibold ${activeTab === 'p2p' ? 'dark:border-white border-slate-700 dark:bg-white/20 bg-slate-500/20 dark:text-white text-slate-900' : 'dark:border-white/25 border-slate-300 dark:text-white/80 text-slate-700 dark:hover:bg-white/10 hover:bg-slate-500/10'}`}
			on:click={() => (activeTab = 'p2p')}
		>
			P2P
		</button>
		<button
			type="button"
			class={`rounded-md border px-3 py-1 text-xs font-semibold ${activeTab === 'r2r' ? 'dark:border-white border-slate-700 dark:bg-white/20 bg-slate-500/20 dark:text-white text-slate-900' : 'dark:border-white/25 border-slate-300 dark:text-white/80 text-slate-700 dark:hover:bg-white/10 hover:bg-slate-500/10'}`}
			on:click={() => (activeTab = 'r2r')}
		>
			R2R
		</button>
		<button
			type="button"
			class={`rounded-md border px-3 py-1 text-xs font-semibold ${activeTab === 'hcm' ? 'dark:border-white border-slate-700 dark:bg-white/20 bg-slate-500/20 dark:text-white text-slate-900' : 'dark:border-white/25 border-slate-300 dark:text-white/80 text-slate-700 dark:hover:bg-white/10 hover:bg-slate-500/10'}`}
			on:click={() => (activeTab = 'hcm')}
		>
			HCM
		</button>
	</div>

	{#if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{/if}

	<div class="mt-5 space-y-4">
		{#each sectionsByTab[activeTab] as section (section.key)}
			{@const visibleItems = filteredItems(section.items, stateFilterByEntity[section.key] ?? '', filterText)}
			<div class="rounded-lg border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-4">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h3 class="text-lg font-semibold">{section.title}</h3>
						<p class="muted mt-1 text-xs">{section.description}</p>
					</div>
					<span class="rounded-full dark:bg-white/10 bg-slate-500/10 px-3 py-1 text-xs font-semibold dark:text-white text-slate-900">
						{section.items.length} total
					</span>
				</div>

				<div class="mt-3 flex flex-wrap gap-2 text-xs">
					<button
						type="button"
						class={`rounded-md border px-2 py-1 ${!stateFilterByEntity[section.key] ? 'dark:border-white border-slate-700 dark:bg-white/20 bg-slate-500/20 dark:text-white text-slate-900' : 'dark:border-white/25 border-slate-300 dark:text-white/80 text-slate-700 dark:hover:bg-white/10 hover:bg-slate-500/10'}`}
						on:click={() => setStateFilter(section.key, '')}
					>
						View all
					</button>
					{#each stateCounts(section.items) as stateEntry (stateEntry.state)}
						<button
							type="button"
							class={`rounded-md border px-2 py-1 ${stateFilterByEntity[section.key] === stateEntry.state ? 'dark:border-white border-slate-700 dark:bg-white/20 bg-slate-500/20 dark:text-white text-slate-900' : 'dark:border-white/25 border-slate-300 dark:text-white/80 text-slate-700 dark:hover:bg-white/10 hover:bg-slate-500/10'}`}
							on:click={() => setStateFilter(section.key, stateEntry.state)}
						>
							View {stateEntry.state} ({stateEntry.count})
						</button>
					{/each}
				</div>

				<ul class="mt-3 space-y-2 text-sm">
					{#if visibleItems.length === 0}
						<li class="muted">No matching entities for this view.</li>
					{:else}
						{#each visibleItems as item (item.id)}
							<li>
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
								<a class="block rounded border dark:border-white/10 border-slate-200 px-3 py-2 dark:hover:bg-white/10 hover:bg-slate-500/10" href={item.href}>
									<div class="flex items-center justify-between gap-3">
										<span class="font-semibold">{item.id}</span>
										<span class="rounded dark:bg-white/10 bg-slate-500/10 px-2 py-0.5 text-[11px] dark:text-white/85 text-slate-700">{item.state}</span>
									</div>
									<p class="muted mt-1 text-xs">{item.secondary || 'n/a'}</p>
								</a>
							</li>
						{/each}
					{/if}
				</ul>
			</div>
		{/each}
	</div>
</section>
