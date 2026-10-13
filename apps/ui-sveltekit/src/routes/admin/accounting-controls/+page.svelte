<script lang="ts">
	import { onMount } from 'svelte';
	import { queryTable } from '$lib/api/query';
	import {
		cancelSupplierInvoice,
		getArApReconciliation,
		getContractorAccruals,
		getInvoiceTaxLines,
		matchContractorAccruals,
		type ContractorAccrual,
		type LedgerReconciliation,
		type SupplierInvoiceAccountingRow
	} from '$lib/api/accountingControls';
	import { actorStore } from '$lib/stores/actorStore';

	interface SupplierInvoice extends SupplierInvoiceAccountingRow {}

	let supplierInvoices: SupplierInvoice[] = [];
	let contractorAccruals: ContractorAccrual[] = [];
	let reconciliationRows: LedgerReconciliation[] = [];
	let selectedInvoiceId = '';
	let allocationAmounts: Record<string, string> = {};
	let invoiceBaseAmount = 0;
	let loading = false;
	let submitting = false;
	let pageError = '';
	let pageMessage = '';

	$: eligibleInvoices = supplierInvoices.filter((invoice) => ['Draft', 'Validated'].includes(invoice.state));
	$: selectedInvoice = supplierInvoices.find((invoice) => invoice.supplier_invoice_id === selectedInvoiceId) ?? null;
	$: availableAccruals = contractorAccruals.filter((accrual) =>
		accrual.supplierId === selectedInvoice?.supplier_id &&
		(!selectedInvoice?.currency_code || accrual.currency === selectedInvoice.currency_code) &&
		accrual.availableAmount > 0.005
	);
	$: allocations = availableAccruals
		.map((accrual) => ({ accrualId: accrual.accrualId, amount: Number(allocationAmounts[accrual.accrualId] ?? 0) }))
		.filter((allocation) => Number.isFinite(allocation.amount) && allocation.amount > 0);
	$: allocationTotal = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
	$: allocationMatchesInvoice = allocations.length > 0 && Math.abs(allocationTotal - invoiceBaseAmount) < 0.005;

	onMount(() => {
		const unsubscribe = actorStore.subscribe(() => void loadData());
		return unsubscribe;
	});

	async function loadData(): Promise<void> {
		loading = true;
		pageError = '';
		try {
			const [invoiceResult, accrualResult, reconciliationResult] = await Promise.all([
				queryTable<SupplierInvoice>('p2p_supplier_invoice', $actorStore, 500, 0),
				getContractorAccruals($actorStore),
				getArApReconciliation($actorStore)
			]);
			const nextInvoices = invoiceResult.data ?? [];
			supplierInvoices = nextInvoices;
			contractorAccruals = accrualResult.data ?? [];
			reconciliationRows = reconciliationResult.data ?? [];
			const nextEligibleInvoices = nextInvoices.filter((invoice) => ['Draft', 'Validated'].includes(invoice.state));
			if (!nextEligibleInvoices.some((invoice) => invoice.supplier_invoice_id === selectedInvoiceId)) {
				selectedInvoiceId = nextEligibleInvoices[0]?.supplier_invoice_id ?? '';
				allocationAmounts = {};
			}
			if (selectedInvoiceId) await loadInvoiceBasis(selectedInvoiceId);
		} catch (error) {
			pageError = error instanceof Error ? error.message : 'Unable to load accounting controls.';
		} finally {
			loading = false;
		}
	}

	async function selectInvoice(invoiceId: string): Promise<void> {
		selectedInvoiceId = invoiceId;
		allocationAmounts = {};
		invoiceBaseAmount = 0;
		pageError = '';
		if (invoiceId) await loadInvoiceBasis(invoiceId);
	}

	async function loadInvoiceBasis(invoiceId: string): Promise<void> {
		const invoice = supplierInvoices.find((row) => row.supplier_invoice_id === invoiceId);
		if (!invoice) return;
		try {
			const taxLines = await getInvoiceTaxLines($actorStore, invoiceId);
			const baseAmount = taxLines.data.length > 0
				? taxLines.data.reduce((sum, line) => sum + Number(line.taxable_amount), 0)
				: Number(invoice.amount_due);
			if (selectedInvoiceId === invoiceId) invoiceBaseAmount = baseAmount;
		} catch (error) {
			pageError = error instanceof Error ? error.message : 'Unable to calculate invoice base amount.';
		}
	}

	function setAllocation(accrualId: string, value: string): void {
		allocationAmounts = { ...allocationAmounts, [accrualId]: value };
	}

	async function submitMatch(): Promise<void> {
		if (!selectedInvoice || !allocationMatchesInvoice) return;
		submitting = true;
		pageError = '';
		pageMessage = '';
		try {
			await matchContractorAccruals($actorStore, selectedInvoice.supplier_invoice_id, allocations);
			pageMessage = `Accrual allocation saved for ${selectedInvoice.supplier_invoice_id}.`;
			allocationAmounts = {};
			await loadData();
		} catch (error) {
			pageError = error instanceof Error ? error.message : 'Unable to match contractor accruals.';
		} finally {
			submitting = false;
		}
	}

	async function cancelInvoice(invoice: SupplierInvoice): Promise<void> {
		if (invoice.amount_paid > 0 || !window.confirm(`Cancel supplier invoice ${invoice.supplier_invoice_id}?`)) return;
		pageError = '';
		pageMessage = '';
		try {
			const result = await cancelSupplierInvoice($actorStore, invoice.supplier_invoice_id);
			pageMessage = result.reversal_journal_id
				? `Invoice cancelled. Reversal journal ${result.reversal_journal_id} posted.`
				: 'Invoice cancelled.';
			await loadData();
		} catch (error) {
			pageError = error instanceof Error ? error.message : 'Unable to cancel supplier invoice.';
		}
	}

	function amount(value: number, currency: string): string {
		return `${Number(value ?? 0).toFixed(2)} ${currency}`;
	}

	function difference(control: { difference: number | null; comparable: boolean; foreignCurrencyDocumentCount: number }): string {
		if (!control.comparable) return `Not comparable · ${control.foreignCurrencyDocumentCount} foreign-currency open`;
		return Number(control.difference ?? 0).toFixed(2);
	}
</script>

<svelte:head>
	<title>Accounting Controls</title>
</svelte:head>

<div class="space-y-6">
	<header class="border-b border-slate-300 pb-4 dark:border-white/15">
		<h1 class="text-2xl font-semibold">Accounting Controls</h1>
		<p class="muted mt-1 text-sm">Contractor accrual matching and AR/AP control-account reconciliation.</p>
	</header>

	{#if pageError}
		<p class="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-800 dark:text-red-200" role="alert">{pageError}</p>
	{:else if pageMessage}
		<p class="rounded-md border border-emerald-600/40 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200" role="status">{pageMessage}</p>
	{/if}

	<section class="space-y-4 border-b border-slate-300 pb-6 dark:border-white/15">
		<div class="flex flex-wrap items-end justify-between gap-3">
			<div>
				<h2 class="text-lg font-semibold">Contractor Accrual Matching</h2>
				<p class="muted mt-1 text-sm">Allocate approved contractor costs to a Draft or Validated supplier invoice.</p>
			</div>
			<label class="min-w-72">
				<span class="mb-1 block text-xs font-medium">Supplier invoice</span>
				<select class="input-base w-full" value={selectedInvoiceId} on:change={(event) => void selectInvoice((event.currentTarget as HTMLSelectElement).value)}>
					<option value="">Select supplier invoice</option>
					{#each eligibleInvoices as invoice (invoice.supplier_invoice_id)}
						<option value={invoice.supplier_invoice_id}>{invoice.supplier_invoice_id} · {invoice.state} · {amount(Number(invoice.amount_due), invoice.currency_code ?? '')}</option>
					{/each}
				</select>
			</label>
		</div>

		{#if selectedInvoice}
			<div class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
				<span>Invoice: <strong>{amount(invoiceBaseAmount, selectedInvoice.currency_code ?? '')}</strong> base</span>
				<span>Allocated: <strong>{amount(allocationTotal, selectedInvoice.currency_code ?? '')}</strong></span>
				<span class={allocationMatchesInvoice ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}>
					{allocationMatchesInvoice ? 'Balanced to invoice base' : 'Allocation total must equal invoice base'}
				</span>
			</div>
			<div class="overflow-x-auto">
				<table class="ui-table w-full text-left text-sm">
					<thead class="ui-table-compact-head">
						<tr><th>Accrual</th><th>Project</th><th>Currency</th><th>Accrued</th><th>Already matched</th><th>Available</th><th>Allocate</th></tr>
					</thead>
					<tbody>
						{#each availableAccruals as accrual (accrual.accrualId)}
							<tr class="ui-table-compact-row">
								<td>{accrual.accrualId}<div class="muted text-xs">{accrual.contractorId} · {accrual.timesheetId}</div></td>
								<td>{accrual.projectId}</td>
								<td>{accrual.currency}</td>
								<td>{amount(accrual.accruedAmount, accrual.currency)}</td>
								<td>{amount(accrual.matchedAmount, accrual.currency)}</td>
								<td>{amount(accrual.availableAmount, accrual.currency)}</td>
								<td><input class="input-base w-32" type="number" min="0" max={accrual.availableAmount} step="0.01" value={allocationAmounts[accrual.accrualId] ?? ''} aria-label={`Allocate from accrual ${accrual.accrualId}`} on:input={(event) => setAllocation(accrual.accrualId, (event.currentTarget as HTMLInputElement).value)} /></td>
							</tr>
						{:else}
							<tr><td colspan="7" class="py-4 text-center text-sm text-slate-500 dark:text-white/60">No available contractor accruals match this supplier and currency.</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
			<button type="button" class="ui-soft-button inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50" disabled={loading || submitting || !allocationMatchesInvoice} on:click={() => void submitMatch()}>
				{submitting ? 'Saving allocation…' : 'Save allocation'}
			</button>
		{:else if eligibleInvoices.length === 0}
			<p class="muted text-sm">No Draft or Validated supplier invoices are available.</p>
		{/if}
	</section>

	<section class="space-y-4 border-b border-slate-300 pb-6 dark:border-white/15">
		<div>
			<h2 class="text-lg font-semibold">AR / AP Reconciliation</h2>
			<p class="muted mt-1 text-sm">Control balances are compared in ledger currency; open foreign-currency items are marked non-comparable.</p>
		</div>
		<div class="overflow-x-auto">
			<table class="ui-table w-full text-left text-sm">
				<thead class="ui-table-compact-head">
					<tr><th>Legal entity / ledger</th><th>Control account</th><th>GL balance</th><th>Subledger by currency</th><th>Difference</th></tr>
				</thead>
				<tbody>
					{#each reconciliationRows as row (row.ledgerId)}
						{#each [
							{ label: 'Accounts receivable', control: row.accountsReceivable },
							{ label: 'Accounts payable', control: row.accountsPayable },
							{ label: 'Unbilled receivable', control: row.unbilledReceivables }
						] as item (`${row.ledgerId}-${item.label}`)}
							<tr class="ui-table-compact-row">
								<td>{row.legalEntityName ?? row.ledgerName}<div class="muted text-xs">{row.ledgerId} · {row.currencyCode}</div></td>
								<td>{item.label}<div class="muted text-xs">{item.control.accountCode}</div></td>
								<td>{amount(item.control.glBalance, row.currencyCode)}</td>
								<td>{#each item.control.subledgerByCurrency as balance (balance.currencyCode)}<div>{amount(balance.balance, balance.currencyCode)} <span class="muted text-xs">({balance.documentCount} open)</span></div>{:else}<span class="muted">0.00 {row.currencyCode}</span>{/each}</td>
								<td class={item.control.comparable && Math.abs(item.control.difference ?? 0) < 0.005 ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}>{item.control.comparable ? amount(item.control.difference ?? 0, row.currencyCode) : difference(item.control)}</td>
							</tr>
						{/each}
					{:else}
						<tr><td colspan="5" class="py-4 text-center text-sm text-slate-500 dark:text-white/60">No ledgers available.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section class="space-y-3">
		<h2 class="text-lg font-semibold">Supplier Invoice Accounting References</h2>
		<div class="overflow-x-auto">
			<table class="ui-table w-full text-left text-sm">
				<thead class="ui-table-compact-head"><tr><th>Invoice</th><th>Supplier</th><th>State</th><th>Due</th><th>Paid</th><th>Posting journal</th><th>Reversal journal</th><th>Action</th></tr></thead>
				<tbody>
					{#each supplierInvoices as invoice (invoice.supplier_invoice_id)}
						<tr class="ui-table-compact-row">
							<td>{invoice.supplier_invoice_id}</td><td>{invoice.supplier_id ?? '—'}</td><td>{invoice.state}</td>
							<td>{amount(Number(invoice.amount_due), invoice.currency_code ?? '')}</td><td>{amount(Number(invoice.amount_paid), invoice.currency_code ?? '')}</td>
							<td>{invoice.accounting_journal_id ?? '—'}</td><td>{invoice.reversal_journal_id ?? '—'}</td>
							<td>{#if ['Draft', 'Validated', 'Posted'].includes(invoice.state) && Number(invoice.amount_paid) <= 0}<button type="button" class="text-red-700 underline decoration-red-700/40 underline-offset-2 dark:text-red-300" on:click={() => void cancelInvoice(invoice)}>Cancel</button>{:else}—{/if}</td>
						</tr>
					{:else}
						<tr><td colspan="8" class="py-4 text-center text-sm text-slate-500 dark:text-white/60">No supplier invoices found.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>