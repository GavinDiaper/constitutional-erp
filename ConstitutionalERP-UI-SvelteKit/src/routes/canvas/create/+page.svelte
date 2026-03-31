<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { queryTable } from '$lib/api/query';
	import { actorStore } from '$lib/stores/actorStore';

	type OperationKey =
		| 'create-customer'
		| 'create-quote'
		| 'create-supplier'
		| 'create-requisition'
		| 'create-purchase-order'
		| 'create-employee'
		| 'create-journal';

	interface CreateResult {
		operation: string;
		entityType?: string;
		entityId?: string;
		data: unknown;
	}

	interface CustomerRow {
		customer_id: string;
		customer_name?: string;
	}

	interface SupplierRow {
		supplier_id: string;
		supplier_name?: string;
	}

	interface RequisitionRow {
		requisition_id: string;
		state?: string;
	}

	interface FiscalPeriodRow {
		fiscal_period_id: string;
		period_number?: number;
	}

	interface AccountRow {
		account_id: string;
		account_code?: string;
		account_name?: string;
	}

	let runningKey: OperationKey | null = null;
	let errorMessage = '';
	let lastResult: CreateResult | null = null;

	let customers: CustomerRow[] = [];
	let suppliers: SupplierRow[] = [];
	let approvedRequisitions: RequisitionRow[] = [];
	let fiscalPeriods: FiscalPeriodRow[] = [];
	let accounts: AccountRow[] = [];

	let customerForm = {
		customerName: '',
		email: '',
		billingAddress: '',
		shippingAddress: ''
	};

	let quoteForm = {
		customerId: '',
		customerName: '',
		customerEmail: '',
		currencyCode: 'USD',
		lineSku: '',
		lineQuantity: 1,
		lineUnitPrice: 0
	};

	let supplierForm = {
		supplierName: '',
		email: '',
		paymentTerms: 'NET30',
		taxId: '',
		currencyCode: 'USD'
	};

	let requisitionForm = {
		requester: '',
		department: '',
		currencyCode: 'USD',
		neededByDate: ''
	};

	let purchaseOrderForm = {
		supplierId: '',
		requisitionId: '',
		totalAmount: 0,
		currencyCode: 'USD',
		deliveryAddress: ''
	};

	let employeeForm = {
		name: '',
		email: '',
		autoActivate: true
	};

	let journalForm = {
		fiscalPeriodId: '',
		description: '',
		accountId: '',
		debitAmount: 0,
		creditAmount: 0,
		memo: ''
	};

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void loadLookups();
		});

		void loadLookups();

		return () => {
			unsubscribeActor();
		};
	});

	async function loadLookups(): Promise<void> {
		try {
			const [customerResult, supplierResult, requisitionResult, periodResult, accountResult] = await Promise.all([
				queryTable<CustomerRow>('o2c_customer', $actorStore),
				queryTable<SupplierRow>('p2p_supplier', $actorStore),
				queryTable<RequisitionRow>('p2p_requisition', $actorStore),
				queryTable<FiscalPeriodRow>('r2r_fiscal_period', $actorStore),
				queryTable<AccountRow>('r2r_account', $actorStore)
			]);

			customers = customerResult.data ?? [];
			suppliers = supplierResult.data ?? [];
			approvedRequisitions = (requisitionResult.data ?? []).filter((item) => (item.state ?? '').toLowerCase() === 'approved');
			fiscalPeriods = periodResult.data ?? [];
			accounts = accountResult.data ?? [];

			if (!journalForm.fiscalPeriodId && fiscalPeriods.length > 0) {
				journalForm.fiscalPeriodId = fiscalPeriods[0].fiscal_period_id;
			}

			if (!purchaseOrderForm.supplierId && suppliers.length > 0) {
				purchaseOrderForm.supplierId = suppliers[0].supplier_id;
			}

			if (!journalForm.accountId && accounts.length > 0) {
				journalForm.accountId = accounts[0].account_id;
			}
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load create-form lookups.';
		}
	}

	async function runOperation(operation: OperationKey, payload: Record<string, unknown>): Promise<void> {
		runningKey = operation;
		errorMessage = '';

		try {
			const response = await fetch(resolve(`/api/hub/bootstrap/${operation}`), {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify(payload)
			});

			if (!response.ok) {
				const text = await response.text();
				throw new Error(text || 'Create operation failed.');
			}

			lastResult = (await response.json()) as CreateResult;
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Create operation failed.';
			lastResult = null;
		} finally {
			runningKey = null;
		}
	}

	function customerLabel(customer: CustomerRow): string {
		return customer.customer_name ? `${customer.customer_name} (${customer.customer_id})` : customer.customer_id;
	}

	function supplierLabel(supplier: SupplierRow): string {
		return supplier.supplier_name ? `${supplier.supplier_name} (${supplier.supplier_id})` : supplier.supplier_id;
	}

	function accountLabel(account: AccountRow): string {
		const code = account.account_code ?? account.account_id;
		return account.account_name ? `${code} - ${account.account_name}` : code;
	}
</script>

<section class="glass-panel p-6">
	<h2 class="text-2xl font-semibold">Create New Entity</h2>
	<p class="muted mt-2 text-sm">Fill in business fields and create entities with real payloads instead of fixed bootstrap defaults.</p>

	<div class="mt-5 grid gap-3 xl:grid-cols-2">
		<div class="rounded-lg border border-white/15 bg-white/5 p-4">
			<h3 class="text-lg font-semibold">Create Customer</h3>
			<div class="mt-3 grid gap-2">
				<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Company name" bind:value={customerForm.customerName} />
				<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Email" bind:value={customerForm.email} />
				<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Billing address" bind:value={customerForm.billingAddress} />
				<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Shipping address" bind:value={customerForm.shippingAddress} />
			</div>
			<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null} on:click={() => runOperation('create-customer', customerForm)}>
				{runningKey === 'create-customer' ? 'Creating...' : 'Create Customer'}
			</button>
		</div>

		<div class="rounded-lg border border-white/15 bg-white/5 p-4">
			<h3 class="text-lg font-semibold">Create Quote</h3>
			<p class="muted mt-1 text-xs">Pick an existing customer or enter a new company name.</p>
			<div class="mt-3 grid gap-2">
				<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={quoteForm.customerId}>
					<option value="">Create from new company</option>
					{#each customers as customer (customer.customer_id)}
						<option value={customer.customer_id}>{customerLabel(customer)}</option>
					{/each}
				</select>
				{#if !quoteForm.customerId}
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Company name" bind:value={quoteForm.customerName} />
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Company email" bind:value={quoteForm.customerEmail} />
				{/if}
				<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Currency (USD)" bind:value={quoteForm.currencyCode} />
				<div class="grid grid-cols-3 gap-2">
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="SKU (optional)" bind:value={quoteForm.lineSku} />
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="number" min="1" step="1" placeholder="Qty" bind:value={quoteForm.lineQuantity} />
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Unit price" bind:value={quoteForm.lineUnitPrice} />
				</div>
			</div>
			<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null} on:click={() => runOperation('create-quote', quoteForm)}>
				{runningKey === 'create-quote' ? 'Creating...' : 'Create Quote'}
			</button>
		</div>

		<div class="rounded-lg border border-white/15 bg-white/5 p-4">
			<h3 class="text-lg font-semibold">Create Supplier</h3>
			<div class="mt-3 grid gap-2">
				<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Supplier name" bind:value={supplierForm.supplierName} />
				<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Email" bind:value={supplierForm.email} />
				<div class="grid grid-cols-2 gap-2">
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Payment terms" bind:value={supplierForm.paymentTerms} />
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Tax ID" bind:value={supplierForm.taxId} />
				</div>
				<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Currency (USD)" bind:value={supplierForm.currencyCode} />
			</div>
			<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null} on:click={() => runOperation('create-supplier', supplierForm)}>
				{runningKey === 'create-supplier' ? 'Creating...' : 'Create Supplier'}
			</button>
		</div>

		<div class="rounded-lg border border-white/15 bg-white/5 p-4">
			<h3 class="text-lg font-semibold">Create Requisition</h3>
			<p class="muted mt-1 text-xs">Requisition amount is derived later through PO conversion in this API model.</p>
			<div class="mt-3 grid gap-2">
				<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Requester" bind:value={requisitionForm.requester} />
				<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Department" bind:value={requisitionForm.department} />
				<div class="grid grid-cols-2 gap-2">
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Currency (USD)" bind:value={requisitionForm.currencyCode} />
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="date" bind:value={requisitionForm.neededByDate} />
				</div>
			</div>
			<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null} on:click={() => runOperation('create-requisition', requisitionForm)}>
				{runningKey === 'create-requisition' ? 'Creating...' : 'Create Requisition'}
			</button>
		</div>

		<div class="rounded-lg border border-white/15 bg-white/5 p-4">
			<h3 class="text-lg font-semibold">Create Purchase Order</h3>
			<p class="muted mt-1 text-xs">Choose supplier and optional approved requisition, then set amount.</p>
			<div class="mt-3 grid gap-2">
				<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={purchaseOrderForm.supplierId}>
					<option value="">Select supplier</option>
					{#each suppliers as supplier (supplier.supplier_id)}
						<option value={supplier.supplier_id}>{supplierLabel(supplier)}</option>
					{/each}
				</select>
				<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={purchaseOrderForm.requisitionId}>
					<option value="">No requisition link</option>
					{#each approvedRequisitions as requisition (requisition.requisition_id)}
						<option value={requisition.requisition_id}>{requisition.requisition_id}</option>
					{/each}
				</select>
				<div class="grid grid-cols-2 gap-2">
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Total amount" bind:value={purchaseOrderForm.totalAmount} />
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Currency (USD)" bind:value={purchaseOrderForm.currencyCode} />
				</div>
				<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Delivery address" bind:value={purchaseOrderForm.deliveryAddress} />
			</div>
			<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null} on:click={() => runOperation('create-purchase-order', purchaseOrderForm)}>
				{runningKey === 'create-purchase-order' ? 'Creating...' : 'Create Purchase Order'}
			</button>
		</div>

		<div class="rounded-lg border border-white/15 bg-white/5 p-4">
			<h3 class="text-lg font-semibold">Create Employee</h3>
			<div class="mt-3 grid gap-2">
				<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Employee full name" bind:value={employeeForm.name} />
				<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Employee email" bind:value={employeeForm.email} />
				<label class="flex items-center gap-2 text-xs text-white/80">
					<input type="checkbox" bind:checked={employeeForm.autoActivate} />
					Auto-activate employee after create
				</label>
			</div>
			<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null} on:click={() => runOperation('create-employee', employeeForm)}>
				{runningKey === 'create-employee' ? 'Creating...' : 'Create Employee'}
			</button>
		</div>

		<div class="rounded-lg border border-white/15 bg-white/5 p-4">
			<h3 class="text-lg font-semibold">Create Journal</h3>
			<p class="muted mt-1 text-xs">Optional first line lets you set journal amount at creation time.</p>
			<div class="mt-3 grid gap-2">
				<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={journalForm.fiscalPeriodId}>
					<option value="">Select fiscal period</option>
					{#each fiscalPeriods as period (period.fiscal_period_id)}
						<option value={period.fiscal_period_id}>{period.fiscal_period_id}</option>
					{/each}
				</select>
				<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Description" bind:value={journalForm.description} />
				<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={journalForm.accountId}>
					<option value="">No opening line</option>
					{#each accounts as account (account.account_id)}
						<option value={account.account_id}>{accountLabel(account)}</option>
					{/each}
				</select>
				<div class="grid grid-cols-2 gap-2">
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Debit amount" bind:value={journalForm.debitAmount} />
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Credit amount" bind:value={journalForm.creditAmount} />
				</div>
				<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Line memo" bind:value={journalForm.memo} />
			</div>
			<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null} on:click={() => runOperation('create-journal', journalForm)}>
				{runningKey === 'create-journal' ? 'Creating...' : 'Create Journal'}
			</button>
		</div>
	</div>

	{#if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{/if}

	{#if lastResult}
		<div class="mt-4 rounded-md border border-emerald-500/45 bg-emerald-500/10 p-4 text-sm">
			<p class="font-semibold">{lastResult.operation} completed.</p>
			{#if lastResult.entityType && lastResult.entityId}
				<p class="mt-1">Created {lastResult.entityType} / {lastResult.entityId}</p>
			{/if}
			<div class="mt-3 flex flex-wrap gap-2">
				{#if lastResult.entityType && lastResult.entityId}
					<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white" href={resolve(`/canvas/${lastResult.entityType}/${lastResult.entityId}`)}>
						Open Process
					</a>
				{/if}
				<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white" href={resolve('/dashboard')}>
					Back to Dashboard
				</a>
			</div>
		</div>
	{/if}
</section>
