<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import Tabs from '$lib/components/shared/Tabs.svelte';
	import { queryTable } from '$lib/api/query';
	import { actorStore } from '$lib/stores/actorStore';

	type OperationKey =
		| 'create-customer'
		| 'create-quote'
		| 'create-payment'
		| 'create-supplier'
		| 'create-requisition'
		| 'create-purchase-order'
		| 'create-goods-receipt'
		| 'create-supplier-invoice'
		| 'create-ap-payment'
		| 'create-employee'
		| 'create-journal';

	type DomainTab = 'O2C' | 'P2P' | 'R2R' | 'H2R';

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

	interface PurchaseOrderRow {
		po_id: string;
		state?: string;
	}

	interface GoodsReceiptRow {
		receipt_id: string;
		state?: string;
		po_id?: string;
	}

	interface SupplierInvoiceRow {
		supplier_invoice_id: string;
		state?: string;
		receipt_id?: string;
	}

	interface InvoiceRow {
		invoice_id: string;
		state?: string;
		order_id?: string;
		amount_due?: number | string;
		amount_paid?: number | string;
	}

	interface OrderRow {
		order_id: string;
		state?: string;
		quote_id?: string;
	}

	interface FiscalPeriodRow {
		fiscal_period_id: string;
		period_number?: number;
		state?: string;
	}

	interface AccountRow {
		account_id: string;
		account_code?: string;
		account_name?: string;
		ledger_id?: string | null;
	}

	interface LegalEntityRow {
		legal_entity_id: string;
		name?: string;
	}

	interface LedgerRow {
		ledger_id: string;
		name?: string;
		legal_entity_id?: string | null;
	}

	let activeTab: DomainTab = 'O2C';
	const tabs: DomainTab[] = ['O2C', 'P2P', 'R2R', 'H2R'];

	let runningKey: OperationKey | null = null;
	let errorMessage = '';
	let lastResult: CreateResult | null = null;

	let customers: CustomerRow[] = [];
	let suppliers: SupplierRow[] = [];
	let approvedRequisitions: RequisitionRow[] = [];
	let purchaseOrders: PurchaseOrderRow[] = [];
	let goodsReceipts: GoodsReceiptRow[] = [];
	let supplierInvoices: SupplierInvoiceRow[] = [];
	let orders: OrderRow[] = [];
	let invoices: InvoiceRow[] = [];
	let fiscalPeriods: FiscalPeriodRow[] = [];
	let accounts: AccountRow[] = [];
	let legalEntities: LegalEntityRow[] = [];
	let ledgers: LedgerRow[] = [];

	$: filteredLedgers = journalForm.legalEntityId
		? ledgers.filter((ledger) => ledger.legal_entity_id === journalForm.legalEntityId)
		: ledgers;

	$: filteredAccounts = journalForm.ledgerId
		? accounts.filter((account) => (account.ledger_id ?? '') === journalForm.ledgerId)
		: accounts;

	$: openFiscalPeriods = fiscalPeriods.filter((period) => (period.state ?? '').toLowerCase() === 'open');

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
		legalEntityId: '',
		currencyCode: 'USD',
		lineSku: '',
		lineQuantity: 1,
		lineUnitPrice: 0,
		lineTaxTreatment: ''
	};

	let paymentForm = {
		invoiceId: '',
		amount: 0,
		currencyCode: 'USD',
		method: 'bank-transfer',
		paymentDate: ''
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
		legalEntityId: '',
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

	let goodsReceiptForm = {
		poId: ''
	};

	let supplierInvoiceForm = {
		receiptId: '',
		invoiceDate: '',
		dueDate: '',
		currencyCode: 'USD'
	};

	let apPaymentForm = {
		supplierInvoiceId: '',
		amount: 0,
		currencyCode: 'USD',
		method: 'bank-transfer'
	};

	let employeeForm = {
		name: '',
		email: '',
		autoActivate: true
	};

	let journalForm = {
		legalEntityId: '',
		ledgerId: '',
		fiscalPeriodId: '',
		description: '',
		debitAccountId: '',
		creditAccountId: '',
		amount: 0,
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
			const [
				customerResult,
				supplierResult,
				requisitionResult,
				poResult,
				receiptResult,
				supplierInvoiceResult,
				orderResult,
				invoiceResult,
				periodResult,
				accountResult,
				legalEntityResult,
				ledgerResult
			] = await Promise.all([
				queryTable<CustomerRow>('o2c_customer', $actorStore),
				queryTable<SupplierRow>('p2p_supplier', $actorStore),
				queryTable<RequisitionRow>('p2p_requisition', $actorStore),
				queryTable<PurchaseOrderRow>('p2p_purchase_order', $actorStore),
				queryTable<GoodsReceiptRow>('p2p_goods_receipt', $actorStore),
				queryTable<SupplierInvoiceRow>('p2p_supplier_invoice', $actorStore),
				queryTable<OrderRow>('o2c_sales_order', $actorStore),
				queryTable<InvoiceRow>('o2c_invoice', $actorStore),
				queryTable<FiscalPeriodRow>('r2r_fiscal_period', $actorStore),
				queryTable<AccountRow>('r2r_account', $actorStore),
				queryTable<LegalEntityRow>('r2r_legal_entity', $actorStore),
				queryTable<LedgerRow>('r2r_ledger', $actorStore)
			]);

			customers = customerResult.data ?? [];
			suppliers = supplierResult.data ?? [];
			approvedRequisitions = (requisitionResult.data ?? []).filter((item) => (item.state ?? '').toLowerCase() === 'approved');
			purchaseOrders = poResult.data ?? [];
			goodsReceipts = receiptResult.data ?? [];
			supplierInvoices = supplierInvoiceResult.data ?? [];
			orders = orderResult.data ?? [];
			invoices = invoiceResult.data ?? [];
			fiscalPeriods = periodResult.data ?? [];
			accounts = accountResult.data ?? [];
			legalEntities = legalEntityResult.data ?? [];
			ledgers = ledgerResult.data ?? [];

			if (!paymentForm.invoiceId && invoices.length > 0) {
				paymentForm.invoiceId = invoices[0].invoice_id;
			}

			if (!purchaseOrderForm.supplierId && suppliers.length > 0) {
				purchaseOrderForm.supplierId = suppliers[0].supplier_id;
			}

			if (!goodsReceiptForm.poId && purchaseOrders.length > 0) {
				goodsReceiptForm.poId = purchaseOrders[0].po_id;
			}

			if (!supplierInvoiceForm.receiptId && goodsReceipts.length > 0) {
				supplierInvoiceForm.receiptId = goodsReceipts[0].receipt_id;
			}

			if (!apPaymentForm.supplierInvoiceId && supplierInvoices.length > 0) {
				apPaymentForm.supplierInvoiceId = supplierInvoices[0].supplier_invoice_id;
			}

			if (!requisitionForm.legalEntityId && legalEntities.length > 0) {
				requisitionForm.legalEntityId = legalEntities[0].legal_entity_id;
			}

			if (!journalForm.legalEntityId && legalEntities.length > 0) {
				journalForm.legalEntityId = legalEntities[0].legal_entity_id;
			}

			if (!journalForm.ledgerId && filteredLedgers.length > 0) {
				journalForm.ledgerId = filteredLedgers[0].ledger_id;
			}

			if (!journalForm.fiscalPeriodId && openFiscalPeriods.length > 0) {
				journalForm.fiscalPeriodId = openFiscalPeriods[0].fiscal_period_id;
			}

			if (!journalForm.debitAccountId && filteredAccounts.length > 0) {
				journalForm.debitAccountId = filteredAccounts[0].account_id;
			}

			if (!journalForm.creditAccountId && filteredAccounts.length > 1) {
				journalForm.creditAccountId = filteredAccounts[1].account_id;
			} else if (!journalForm.creditAccountId && filteredAccounts.length === 1) {
				journalForm.creditAccountId = filteredAccounts[0].account_id;
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

	function invoiceLabel(invoice: InvoiceRow): string {
		const state = invoice.state ? ` / ${invoice.state}` : '';
		return `${invoice.invoice_id}${state}`;
	}

	function isOpenInvoice(invoice: InvoiceRow): boolean {
		const state = (invoice.state ?? '').trim().toLowerCase();
		if (['cancelled', 'paid', 'reconciled', 'writtenoff', 'fullypaid'].includes(state)) {
			return false;
		}

		const amountDue = typeof invoice.amount_due === 'string' ? Number(invoice.amount_due) : (invoice.amount_due ?? 0);
		const amountPaid = typeof invoice.amount_paid === 'string' ? Number(invoice.amount_paid) : (invoice.amount_paid ?? 0);
		if (Number.isFinite(amountDue) && amountDue > 0) {
			return (Number.isFinite(amountPaid) ? amountPaid : 0) < amountDue;
		}

		return true;
	}

	function receiptLabel(receipt: GoodsReceiptRow): string {
		const state = receipt.state ? ` / ${receipt.state}` : '';
		const po = receipt.po_id ? ` / PO ${receipt.po_id}` : '';
		return `${receipt.receipt_id}${state}${po}`;
	}

	function supplierInvoiceLabel(invoice: SupplierInvoiceRow): string {
		const state = invoice.state ? ` / ${invoice.state}` : '';
		return `${invoice.supplier_invoice_id}${state}`;
	}

	function accountLabel(account: AccountRow): string {
		const code = account.account_code ?? account.account_id;
		return account.account_name ? `${code} - ${account.account_name}` : code;
	}

	function legalEntityLabel(entity: LegalEntityRow): string {
		return entity.name ? `${entity.name} (${entity.legal_entity_id})` : entity.legal_entity_id;
	}

	function ledgerLabel(ledger: LedgerRow): string {
		return ledger.name ? `${ledger.name} (${ledger.ledger_id})` : ledger.ledger_id;
	}

	$: if (journalForm.legalEntityId && !filteredLedgers.some((ledger) => ledger.ledger_id === journalForm.ledgerId)) {
		journalForm.ledgerId = filteredLedgers[0]?.ledger_id ?? '';
	}

	$: if (journalForm.ledgerId && !filteredAccounts.some((account) => account.account_id === journalForm.debitAccountId)) {
		journalForm.debitAccountId = filteredAccounts[0]?.account_id ?? '';
	}

	$: if (journalForm.ledgerId && !filteredAccounts.some((account) => account.account_id === journalForm.creditAccountId)) {
		journalForm.creditAccountId = filteredAccounts[1]?.account_id ?? filteredAccounts[0]?.account_id ?? '';
	}

	$: if (!journalForm.fiscalPeriodId && openFiscalPeriods.length > 0) {
		journalForm.fiscalPeriodId = openFiscalPeriods[0].fiscal_period_id;
	}

	function setActiveTab(tab: string): void {
		if (tab === 'O2C' || tab === 'P2P' || tab === 'R2R' || tab === 'H2R') {
			activeTab = tab;
		}
	}
</script>

<section class="glass-panel p-6">
	<h2 class="text-2xl font-semibold">Create New Entity</h2>
	<p class="muted mt-2 text-sm">Create transactional entities by domain with full payload control and prerequisite checks.</p>

	<div class="mt-4">
		<Tabs {tabs} selected={activeTab} onSelect={setActiveTab} />
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

	{#if activeTab === 'O2C'}
		<div class="mt-5 grid gap-3 xl:grid-cols-2">
			<div class="rounded-lg border border-white/15 bg-white/5 p-4 xl:col-span-2">
				<h3 class="text-lg font-semibold">Orders And Invoices</h3>
				<p class="muted mt-1 text-sm">
					O2C invoices are workflow-derived, not direct-create entities. Accept a quote to create a sales order, move the order to Shipped, then generate and post the invoice from its process page.
				</p>
				<div class="mt-3 flex flex-wrap gap-2">
					<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white" href={resolve('/canvas/o2c/orders/open')}>
						Open Orders ({orders.length})
					</a>
					<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white" href={resolve('/canvas/o2c/invoices/open')}>
						Open Invoices ({invoices.filter(isOpenInvoice).length})
					</a>
				</div>
				<p class="muted mt-2 text-xs">
					After converting a quote or generating an invoice, the Canvas now opens the newly created order or invoice automatically.
				</p>
			</div>

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
					<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={quoteForm.legalEntityId}>
						<option value="">Select legal entity</option>
						{#each legalEntities as entity (entity.legal_entity_id)}
							<option value={entity.legal_entity_id}>{legalEntityLabel(entity)}</option>
						{/each}
					</select>
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Currency (USD)" bind:value={quoteForm.currencyCode} />
					<div class="grid grid-cols-3 gap-2">
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="SKU (optional)" bind:value={quoteForm.lineSku} />
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="number" min="1" step="1" placeholder="Qty" bind:value={quoteForm.lineQuantity} />
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Unit price" bind:value={quoteForm.lineUnitPrice} />
					</div>
					<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={quoteForm.lineTaxTreatment}>
						<option value="">No tax</option>
						<option value="Standard Rate (5%)">Standard Rate (5%)</option>
						<option value="Zero-Rated Supplies (0%)">Zero-Rated Supplies (0%)</option>
						<option value="Exempt Supplies">Exempt Supplies</option>
					</select>
				</div>
				<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null || !quoteForm.legalEntityId} on:click={() => runOperation('create-quote', quoteForm)}>
					{runningKey === 'create-quote' ? 'Creating...' : 'Create Quote'}
				</button>
			</div>

			<div class="rounded-lg border border-white/15 bg-white/5 p-4">
				<h3 class="text-lg font-semibold">Create Payment</h3>
				<p class="muted mt-1 text-xs">Requires a posted invoice. Create now auto-applies cash to AR and posts accounting entries.</p>
				<div class="mt-3 grid gap-2">
					<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={paymentForm.invoiceId}>
						<option value="">Select invoice</option>
						{#each invoices as invoice (invoice.invoice_id)}
							<option value={invoice.invoice_id}>{invoiceLabel(invoice)}</option>
						{/each}
					</select>
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="number" min="0.01" step="0.01" placeholder="Amount" bind:value={paymentForm.amount} />
					<div class="grid grid-cols-2 gap-2">
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Currency (USD)" bind:value={paymentForm.currencyCode} />
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Method" bind:value={paymentForm.method} />
					</div>
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="date" bind:value={paymentForm.paymentDate} />
				</div>
				{#if invoices.length === 0}
					<p class="muted mt-2 text-xs">No invoices found. Create and post an invoice before registering payment.</p>
				{/if}
				<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null || invoices.length === 0 || !paymentForm.invoiceId} on:click={() => runOperation('create-payment', paymentForm)}>
					{runningKey === 'create-payment' ? 'Creating...' : 'Create Payment'}
				</button>
			</div>
		</div>
	{/if}

	{#if activeTab === 'P2P'}
		<div class="mt-5 grid gap-3 xl:grid-cols-2">
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
					<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={requisitionForm.legalEntityId}>
						<option value="">Select legal entity</option>
						{#each legalEntities as entity (entity.legal_entity_id)}
							<option value={entity.legal_entity_id}>{legalEntityLabel(entity)}</option>
						{/each}
					</select>
					<div class="grid grid-cols-2 gap-2">
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Currency (USD)" bind:value={requisitionForm.currencyCode} />
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="date" bind:value={requisitionForm.neededByDate} />
					</div>
				</div>
				<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null || !requisitionForm.legalEntityId} on:click={() => runOperation('create-requisition', requisitionForm)}>
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
				{#if suppliers.length === 0}
					<p class="muted mt-2 text-xs">No suppliers found. Create a supplier first.</p>
				{/if}
				<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null || suppliers.length === 0 || !purchaseOrderForm.supplierId} on:click={() => runOperation('create-purchase-order', purchaseOrderForm)}>
					{runningKey === 'create-purchase-order' ? 'Creating...' : 'Create Purchase Order'}
				</button>
			</div>

			<div class="rounded-lg border border-white/15 bg-white/5 p-4">
				<h3 class="text-lg font-semibold">Create Goods Receipt</h3>
				<p class="muted mt-1 text-xs">Requires an existing purchase order.</p>
				<div class="mt-3 grid gap-2">
					<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={goodsReceiptForm.poId}>
						<option value="">Select purchase order</option>
						{#each purchaseOrders as po (po.po_id)}
							<option value={po.po_id}>{po.po_id} {po.state ? `(${po.state})` : ''}</option>
						{/each}
					</select>
				</div>
				{#if purchaseOrders.length === 0}
					<p class="muted mt-2 text-xs">No purchase orders found. Create or convert a requisition first.</p>
				{/if}
				<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null || purchaseOrders.length === 0 || !goodsReceiptForm.poId} on:click={() => runOperation('create-goods-receipt', goodsReceiptForm)}>
					{runningKey === 'create-goods-receipt' ? 'Creating...' : 'Create Goods Receipt'}
				</button>
			</div>

			<div class="rounded-lg border border-white/15 bg-white/5 p-4">
				<h3 class="text-lg font-semibold">Create Supplier Invoice</h3>
				<p class="muted mt-1 text-xs">Requires an existing goods receipt.</p>
				<div class="mt-3 grid gap-2">
					<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={supplierInvoiceForm.receiptId}>
						<option value="">Select receipt</option>
						{#each goodsReceipts as receipt (receipt.receipt_id)}
							<option value={receipt.receipt_id}>{receiptLabel(receipt)}</option>
						{/each}
					</select>
					<div class="grid grid-cols-2 gap-2">
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="date" placeholder="Invoice date" bind:value={supplierInvoiceForm.invoiceDate} />
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="date" placeholder="Due date" bind:value={supplierInvoiceForm.dueDate} />
					</div>
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Currency (USD)" bind:value={supplierInvoiceForm.currencyCode} />
				</div>
				{#if goodsReceipts.length === 0}
					<p class="muted mt-2 text-xs">No goods receipts found. Create a goods receipt first.</p>
				{/if}
				<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null || goodsReceipts.length === 0 || !supplierInvoiceForm.receiptId} on:click={() => runOperation('create-supplier-invoice', supplierInvoiceForm)}>
					{runningKey === 'create-supplier-invoice' ? 'Creating...' : 'Create Supplier Invoice'}
				</button>
			</div>

			<div class="rounded-lg border border-white/15 bg-white/5 p-4">
				<h3 class="text-lg font-semibold">Create AP Payment</h3>
				<p class="muted mt-1 text-xs">Requires an existing supplier invoice.</p>
				<div class="mt-3 grid gap-2">
					<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={apPaymentForm.supplierInvoiceId}>
						<option value="">Select supplier invoice</option>
						{#each supplierInvoices as invoice (invoice.supplier_invoice_id)}
							<option value={invoice.supplier_invoice_id}>{supplierInvoiceLabel(invoice)}</option>
						{/each}
					</select>
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="number" min="0.01" step="0.01" placeholder="Amount" bind:value={apPaymentForm.amount} />
					<div class="grid grid-cols-2 gap-2">
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Currency (USD)" bind:value={apPaymentForm.currencyCode} />
						<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Method" bind:value={apPaymentForm.method} />
					</div>
				</div>
				{#if supplierInvoices.length === 0}
					<p class="muted mt-2 text-xs">No supplier invoices found. Create a supplier invoice first.</p>
				{/if}
				<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null || supplierInvoices.length === 0 || !apPaymentForm.supplierInvoiceId} on:click={() => runOperation('create-ap-payment', apPaymentForm)}>
					{runningKey === 'create-ap-payment' ? 'Creating...' : 'Create AP Payment'}
				</button>
			</div>
		</div>
	{/if}

	{#if activeTab === 'R2R'}
		<div class="mt-5 grid gap-3 xl:grid-cols-2">
			<div class="rounded-lg border border-white/15 bg-white/5 p-4">
				<h3 class="text-lg font-semibold">Create Journal</h3>
				<p class="muted mt-1 text-xs">Select legal entity and ledger first, then provide both sides of the entry.</p>
				<div class="mt-3 grid gap-2">
					<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={journalForm.legalEntityId}>
						<option value="">Select legal entity</option>
						{#each legalEntities as entity (entity.legal_entity_id)}
							<option value={entity.legal_entity_id}>{legalEntityLabel(entity)}</option>
						{/each}
					</select>
					<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={journalForm.ledgerId} disabled={filteredLedgers.length === 0}>
						<option value="">Select ledger</option>
						{#each filteredLedgers as ledger (ledger.ledger_id)}
							<option value={ledger.ledger_id}>{ledgerLabel(ledger)}</option>
						{/each}
					</select>
					<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={journalForm.fiscalPeriodId}>
						<option value="">Select open fiscal period</option>
						{#each openFiscalPeriods as period (period.fiscal_period_id)}
							<option value={period.fiscal_period_id}>{period.fiscal_period_id}</option>
						{/each}
					</select>
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Description" bind:value={journalForm.description} />
					<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={journalForm.debitAccountId}>
						<option value="">Select debit account</option>
						{#each filteredAccounts as account (account.account_id)}
							<option value={account.account_id}>{accountLabel(account)}</option>
						{/each}
					</select>
					<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={journalForm.creditAccountId}>
						<option value="">Select credit account</option>
						{#each filteredAccounts as account (account.account_id)}
							<option value={account.account_id}>{accountLabel(account)}</option>
						{/each}
					</select>
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Amount" bind:value={journalForm.amount} />
					<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Line memo" bind:value={journalForm.memo} />
				</div>
				{#if legalEntities.length === 0 || ledgers.length === 0 || openFiscalPeriods.length === 0 || filteredAccounts.length === 0}
					<p class="muted mt-2 text-xs">Journals require legal entities, ledgers, open fiscal periods, and ledger-linked accounts from setup/admin.</p>
				{/if}
				<button class="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60" disabled={runningKey !== null || !journalForm.legalEntityId || !journalForm.ledgerId || !journalForm.fiscalPeriodId || !journalForm.debitAccountId || !journalForm.creditAccountId || openFiscalPeriods.length === 0 || filteredAccounts.length === 0} on:click={() => runOperation('create-journal', journalForm)}>
					{runningKey === 'create-journal' ? 'Creating...' : 'Create Journal'}
				</button>
			</div>
		</div>
	{/if}

	{#if activeTab === 'H2R'}
		<div class="mt-5 grid gap-3 xl:grid-cols-2">
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
		</div>
	{/if}

</section>
