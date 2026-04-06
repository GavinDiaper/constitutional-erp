<script lang="ts">
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
	$: headerEntries = Object.entries(attributes).filter(([key]) => {
		if (key.startsWith('__')) return false;
		if (key === 'total_amount' || key === 'totalAmount') return false;
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
			<div>
				<p class="text-xs uppercase tracking-[0.16em] text-white/65">Header</p>
				{#if headerEntries.length === 0}
					<p class="muted mt-1 text-sm">No header attributes available.</p>
				{:else}
					<dl class="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
						{#each headerEntries as [key, value] (key)}
							<div class="rounded-md border border-white/10 bg-white/5 p-3">
								<dt class="text-xs uppercase tracking-[0.16em] text-white/65">{formatLabel(key)}</dt>
								<dd class="mt-1 text-sm">{formatValue(value)}</dd>
							</div>
						{/each}
					</dl>
				{/if}
			</div>

			<div>
				<p class="text-xs uppercase tracking-[0.16em] text-white/65">Lines</p>
				<div class="mt-2 overflow-x-auto rounded-md border border-white/15 bg-white/5">
					{#if isJournalLineLayout}
						<table class="min-w-full text-sm">
							<thead class="text-left text-white/70">
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
							<thead class="text-left text-white/70">
								<tr>
									<th class="px-3 py-2">Description</th>
									<th class="px-3 py-2 text-right">Quantity</th>
									<th class="px-3 py-2 text-right">Unit Price</th>
									<th class="px-3 py-2 text-right">Line Total</th>
								</tr>
							</thead>
							<tbody>
								{#each lineRows as line, index (`${String(line.quote_line_id ?? line.requisition_line_id ?? line.po_line_id ?? index)}`)}
									<tr class="border-t border-white/10">
										<td class="px-3 py-2">{String(line.description ?? '')}</td>
										<td class="px-3 py-2 text-right">{String(line.quantity ?? '')}</td>
										<td class="px-3 py-2 text-right">{formatCurrency(line.unit_price ?? line.unitPrice ?? '')}</td>
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
						<span class="text-xs uppercase tracking-[0.16em] text-white/65">Total Debit</span>
						<span class="text-base font-semibold">{formatCurrency(totalDebit)}</span>
					</div>
					<div class="mt-1 flex items-center justify-between">
						<span class="text-xs uppercase tracking-[0.16em] text-white/65">Total Credit</span>
						<span class="text-base font-semibold">{formatCurrency(totalCredit)}</span>
					</div>
				{:else}
					<div class="flex items-center justify-between">
						<span class="text-xs uppercase tracking-[0.16em] text-white/65">Total</span>
						<span class="text-base font-semibold">{formatCurrency(totalAmount ?? '')}</span>
					</div>
				{/if}
			</div>
		</div>
	{:else}
		<dl class="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
			{#each Object.entries(attributes).filter(([key]) => !key.startsWith('__')) as [key, value] (key)}
				<div class="rounded-md border border-white/10 bg-white/5 p-3">
					<dt class="text-xs uppercase tracking-[0.16em] text-white/65">{formatLabel(key)}</dt>
					<dd class="mt-1 text-sm">{formatValue(value)}</dd>
				</div>
			{/each}
		</dl>
	{/if}
</section>
