<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { getO2CQuotes, type O2CQuote } from '$lib/api/quotes';
	import { queryTable } from '$lib/api/query';
	import { actorStore } from '$lib/stores/actorStore';

	type DomainTab = 'o2c' | 'p2p' | 'r2r' | 'hcm';
	type EntityKey = 'o2c_quote' | 'o2c_customer' | 'p2p_requisition' | 'p2p_purchase_order' | 'p2p_supplier' | 'r2r_journal' | 'h2r_employee';

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
	let requisitions: RequisitionRow[] = [];
	let approvedPurchaseOrders: PurchaseOrderRow[] = [];
	let suppliers: SupplierRow[] = [];
	let journals: JournalRow[] = [];
	let employees: EmployeeRow[] = [];

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
			const [quotesResult, customerResult, requisitionResult, poResult, supplierResult, journalsResult, employeeResult] = await Promise.all([
				getO2CQuotes($actorStore),
				queryTable<CustomerRow>('o2c_customer', $actorStore),
				queryTable<RequisitionRow>('p2p_requisition', $actorStore),
				queryTable<PurchaseOrderRow>('p2p_purchase_order', $actorStore),
				queryTable<SupplierRow>('p2p_supplier', $actorStore),
				queryTable<JournalRow>('r2r_journal', $actorStore),
				queryTable<EmployeeRow>('h2r_employee', $actorStore)
			]);

			draftQuotes = quotesResult.data ?? [];
			customers = customerResult.data ?? [];
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
		const counts = new Map<string, number>();
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

	<div class="mt-4 flex flex-wrap items-center gap-3">
		<input
			type="text"
			class="w-full max-w-md rounded-md border border-white/30 bg-[#112946] px-3 py-2 text-sm text-white"
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
			class={`rounded-md border px-3 py-1 text-xs font-semibold ${activeTab === 'o2c' ? 'border-white bg-white/20 text-white' : 'border-white/25 text-white/80 hover:bg-white/10'}`}
			on:click={() => (activeTab = 'o2c')}
		>
			O2C
		</button>
		<button
			type="button"
			class={`rounded-md border px-3 py-1 text-xs font-semibold ${activeTab === 'p2p' ? 'border-white bg-white/20 text-white' : 'border-white/25 text-white/80 hover:bg-white/10'}`}
			on:click={() => (activeTab = 'p2p')}
		>
			P2P
		</button>
		<button
			type="button"
			class={`rounded-md border px-3 py-1 text-xs font-semibold ${activeTab === 'r2r' ? 'border-white bg-white/20 text-white' : 'border-white/25 text-white/80 hover:bg-white/10'}`}
			on:click={() => (activeTab = 'r2r')}
		>
			R2R
		</button>
		<button
			type="button"
			class={`rounded-md border px-3 py-1 text-xs font-semibold ${activeTab === 'hcm' ? 'border-white bg-white/20 text-white' : 'border-white/25 text-white/80 hover:bg-white/10'}`}
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
			<div class="rounded-lg border border-white/15 bg-white/5 p-4">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h3 class="text-lg font-semibold">{section.title}</h3>
						<p class="muted mt-1 text-xs">{section.description}</p>
					</div>
					<span class="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
						{section.items.length} total
					</span>
				</div>

				<div class="mt-3 flex flex-wrap gap-2 text-xs">
					<button
						type="button"
						class={`rounded-md border px-2 py-1 ${!stateFilterByEntity[section.key] ? 'border-white bg-white/20 text-white' : 'border-white/25 text-white/80 hover:bg-white/10'}`}
						on:click={() => setStateFilter(section.key, '')}
					>
						View all
					</button>
					{#each stateCounts(section.items) as stateEntry (stateEntry.state)}
						<button
							type="button"
							class={`rounded-md border px-2 py-1 ${stateFilterByEntity[section.key] === stateEntry.state ? 'border-white bg-white/20 text-white' : 'border-white/25 text-white/80 hover:bg-white/10'}`}
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
								<a class="block rounded border border-white/10 px-3 py-2 hover:bg-white/10" href={item.href}>
									<div class="flex items-center justify-between gap-3">
										<span class="font-semibold">{item.id}</span>
										<span class="rounded bg-white/10 px-2 py-0.5 text-[11px] text-white/85">{item.state}</span>
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
