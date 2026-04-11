<script lang="ts">
	import JsonFieldValue from '$lib/components/canvas/JsonFieldValue.svelte';
	export let attributes: Record<string, unknown> = {};

	const lineFieldKeys = new Set([
		'quoteLineId',
		'quote_line_id',
		'sku',
		'requisitionLineId',
		'poLineId',
		'description',
		'quantity',
		'unitPrice',
		'unit_price',
		'lineTotal',
		'line_total',
		'removedLineTotal'
	]);

	$: entityTypeValue = typeof attributes.__entityType === 'string' ? attributes.__entityType : '';
	$: lineRows = Array.isArray(attributes.__lines)
		? (attributes.__lines.filter((item) => typeof item === 'object' && item !== null) as Array<Record<string, unknown>>)
		: [];
	$: normalizedEntityType = entityTypeValue.toLowerCase();
	$: supportsLineLayout =
		normalizedEntityType === 'o2c_quote' ||
		normalizedEntityType === 'o2c_invoice' ||
		normalizedEntityType === 'invoice' ||
		normalizedEntityType === 'ar-invoice' ||
		normalizedEntityType === 'quote' ||
		normalizedEntityType === 'p2p_requisition' ||
		normalizedEntityType === 'p2p_purchase_order' ||
		normalizedEntityType === 'r2r_journal' ||
		normalizedEntityType === 'requisition' ||
		normalizedEntityType === 'purchase-order' ||
		normalizedEntityType === 'purchaseorder' ||
		normalizedEntityType === 'journal';
	$: hasStructuredLines = supportsLineLayout && lineRows.length > 0;
	$: isJournalLineLayout = normalizedEntityType === 'r2r_journal' || normalizedEntityType === 'journal';
	$: isInvoiceLayout = normalizedEntityType === 'o2c_invoice' || normalizedEntityType === 'invoice' || normalizedEntityType === 'ar-invoice';
	$: headerEntries = Object.entries(attributes).filter(([key]) => {
		if (key.startsWith('__')) return false;
		if (key === 'total_amount' || key === 'totalAmount') return false;
		if (isInvoiceLayout && ['order_amount', 'orderAmount', 'tax_amount', 'taxAmount', 'total_payable', 'totalPayable', 'amount_due', 'amountDue'].includes(key)) return false;
		if (!hasStructuredLines) return true;
		return !lineFieldKeys.has(key);
	});
	$: lineTotals = lineRows.map((line) => asNumber(line.line_total ?? line.lineTotal)).filter((value): value is number => value !== null);
	$: computedLineTotal = lineTotals.length > 0 ? lineTotals.reduce((sum, value) => sum + value, 0) : null;
	$: totalDebit =
		lineRows
			.map((line) => asNumber(line.debit_amount ?? line.debitAmount))
			.filter((value): value is number => value !== null)
			.reduce((sum, value) => sum + value, 0);
	$: totalCredit =
		lineRows
			.map((line) => asNumber(line.credit_amount ?? line.creditAmount))
			.filter((value): value is number => value !== null)
			.reduce((sum, value) => sum + value, 0);
	$: totalAmount =
		asNumber(attributes.total_amount) ??
		asNumber(attributes.totalAmount) ??
		computedLineTotal;
	$: orderAmount = asNumber(attributes.order_amount ?? attributes.orderAmount);
	$: taxAmount = asNumber(attributes.tax_amount ?? attributes.taxAmount);
	$: totalPayable = asNumber(attributes.total_payable ?? attributes.totalPayable ?? attributes.amount_due ?? attributes.amountDue);
	$: hasLineTaxDetails = lineRows.some((line) => line.tax_code_id || line.tax_amount !== undefined || line.taxAmount !== undefined);

	function formatLabel(key: string): string {
		return key
			.replace(/_/g, ' ')
			.replace(/([a-z])([A-Z])/g, '$1 $2')
			.replace(/\s+/g, ' ')
			.trim()
			.replace(/\b\w/g, (char) => char.toUpperCase());
	}

	function asNumber(value: unknown): number | null {
		if (typeof value === 'number' && Number.isFinite(value)) {
			return value;
		}
		if (typeof value === 'string' && value.trim() !== '') {
			const parsed = Number(value);
			return Number.isFinite(parsed) ? parsed : null;
		}
		return null;
	}

	function formatCurrency(value: unknown): string {
		const numeric = asNumber(value);
		return numeric === null ? String(value ?? '') : numeric.toFixed(2);
	}

	function formatValue(value: unknown): string {
		if (value === null || value === undefined) {
			return '';
		}

		if (typeof value === 'object') {
			try {
				return JSON.stringify(value);
			} catch (error) {
				const detail = error instanceof Error ? error.message : 'unknown serialization error';
				return `[unserializable object: ${detail}]`;
			}
		}

		return String(value);
	}
</script>

<section class="glass-panel p-4">
	<h3 class="text-lg font-semibold">Entity Overview</h3>
	{#if Object.keys(attributes).length === 0}
		<p class="muted mt-2 text-sm">No attributes available.</p>
	{:else if hasStructuredLines}
		<div class="mt-3 space-y-3">
			{#if isInvoiceLayout}
				<div class="rounded-md border border-emerald-300/35 bg-emerald-500/10 p-3">
					<p class="text-xs uppercase tracking-[0.16em] text-emerald-100/85">Invoice Totals</p>
					<div class="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
						<div class="rounded border border-emerald-200/30 bg-emerald-950/20 p-2">
							<p class="text-[11px] uppercase tracking-[0.12em] text-emerald-100/70">Order Amount</p>
							<p class="mt-1 text-sm font-semibold">{formatCurrency(orderAmount ?? 0)}</p>
						</div>
						<div class="rounded border border-emerald-200/30 bg-emerald-950/20 p-2">
							<p class="text-[11px] uppercase tracking-[0.12em] text-emerald-100/70">Tax Amount</p>
							<p class="mt-1 text-sm font-semibold">{formatCurrency(taxAmount ?? 0)}</p>
						</div>
						<div class="rounded border border-emerald-200/30 bg-emerald-950/20 p-2">
							<p class="text-[11px] uppercase tracking-[0.12em] text-emerald-100/70">Total Payable</p>
							<p class="mt-1 text-sm font-semibold">{formatCurrency(totalPayable ?? 0)}</p>
						</div>
					</div>
				</div>
			{/if}

			<div>
				<p class="text-xs uppercase tracking-[0.16em] dark:text-white/65 text-slate-600">Header</p>
				{#if headerEntries.length === 0}
					<p class="muted mt-1 text-sm">No header attributes available.</p>
				{:else}
					<dl class="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
						{#each headerEntries as [key, value] (key)}
							<div class="rounded-md border border-white/10 bg-white/5 p-3">
								<dt class="text-xs uppercase tracking-[0.16em] dark:text-white/65 text-slate-600">{formatLabel(key)}</dt>
								<dd class="mt-1 text-sm"><JsonFieldValue {value} /></dd>
							</div>
						{/each}
					</dl>
				{/if}
			</div>

			<div>
				<p class="text-xs uppercase tracking-[0.16em] dark:text-white/65 text-slate-600">Lines</p>
				<div class="mt-2 overflow-x-auto rounded-md border border-white/15 bg-white/5">
					{#if isJournalLineLayout}
						<table class="min-w-full text-sm">
							<thead class="text-left dark:text-white/70 text-slate-700">
								<tr>
									<th class="px-3 py-2">Account</th>
									<th class="px-3 py-2 text-right">Debit</th>
									<th class="px-3 py-2 text-right">Credit</th>
									<th class="px-3 py-2">Memo</th>
								</tr>
							</thead>
							<tbody>
								{#each lineRows as line, index (`${String(line.journal_line_id ?? index)}`)}
									<tr class="border-t border-white/10">
										<td class="px-3 py-2">{String(line.account_id ?? line.accountId ?? '')}</td>
										<td class="px-3 py-2 text-right">{formatCurrency(line.debit_amount ?? line.debitAmount ?? 0)}</td>
										<td class="px-3 py-2 text-right">{formatCurrency(line.credit_amount ?? line.creditAmount ?? 0)}</td>
										<td class="px-3 py-2">{String(line.memo ?? '')}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{:else}
						<table class="min-w-full text-sm">
							<thead class="text-left dark:text-white/70 text-slate-700">
								<tr>
									<th class="px-3 py-2">Description</th>
									<th class="px-3 py-2 text-right">Quantity</th>
									<th class="px-3 py-2 text-right">Unit Price</th>
									{#if hasLineTaxDetails}
										<th class="px-3 py-2">Tax Code</th>
										<th class="px-3 py-2 text-right">Tax Amount</th>
									{/if}
									<th class="px-3 py-2 text-right">Line Total</th>
								</tr>
							</thead>
							<tbody>
								{#each lineRows as line, index (`${String(line.quote_line_id ?? line.requisition_line_id ?? line.po_line_id ?? index)}`)}
									<tr class="border-t border-white/10">
										<td class="px-3 py-2">{String(line.description ?? line.sku ?? '')}</td>
										<td class="px-3 py-2 text-right">{String(line.quantity ?? '')}</td>
										<td class="px-3 py-2 text-right">{formatCurrency(line.unit_price ?? line.unitPrice ?? '')}</td>
										{#if hasLineTaxDetails}
											<td class="px-3 py-2">{String(line.tax_code_id ?? line.taxCodeId ?? '—')}</td>
											<td class="px-3 py-2 text-right">{formatCurrency(line.tax_amount ?? line.taxAmount ?? 0)}</td>
										{/if}
										<td class="px-3 py-2 text-right">{formatCurrency(line.line_total ?? line.lineTotal ?? '')}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</div>
			</div>

			<div class="rounded-md border border-white/15 bg-white/5 p-3">
				{#if isJournalLineLayout}
					<div class="flex items-center justify-between">
						<span class="text-xs uppercase tracking-[0.16em] dark:text-white/65 text-slate-600">Total Debit</span>
						<span class="text-base font-semibold">{formatCurrency(totalDebit)}</span>
					</div>
					<div class="mt-1 flex items-center justify-between">
						<span class="text-xs uppercase tracking-[0.16em] dark:text-white/65 text-slate-600">Total Credit</span>
						<span class="text-base font-semibold">{formatCurrency(totalCredit)}</span>
					</div>
				{:else}
					<div class="flex items-center justify-between">
						<span class="text-xs uppercase tracking-[0.16em] dark:text-white/65 text-slate-600">Total</span>
						<span class="text-base font-semibold">{formatCurrency(totalAmount ?? '')}</span>
					</div>
				{/if}
			</div>
		</div>
	{:else}
		<dl class="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
			{#each Object.entries(attributes).filter(([key]) => !key.startsWith('__')) as [key, value] (key)}
				<div class="rounded-md border border-white/10 bg-white/5 p-3">
					<dt class="text-xs uppercase tracking-[0.16em] dark:text-white/65 text-slate-600">{formatLabel(key)}</dt>
				<dd class="mt-1 text-sm"><JsonFieldValue {value} /></dd>
				</div>
			{/each}
		</dl>
	{/if}
</section>
