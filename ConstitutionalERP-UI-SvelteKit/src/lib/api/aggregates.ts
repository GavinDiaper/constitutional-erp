import { fetchHubJson } from '$lib/api/hub';
import type { ActorContext } from '$lib/stores/actorStore';
import type { McpFunctionSummary } from '$lib/types/hub';

// Maps `${lowercaseDomain}|${PascalCaseEntity}` → FoundationERP query table + primary key field.
const ENTITY_TABLE: Record<string, { table: string; pk: string }> = {
	'o2c|Customer':        { table: 'o2c_customer',        pk: 'customer_id' },
	'o2c|Quote':           { table: 'o2c_quote',           pk: 'quote_id' },
	'o2c|Order':           { table: 'o2c_sales_order',     pk: 'order_id' },
	'o2c|SalesOrder':      { table: 'o2c_sales_order',     pk: 'order_id' },
	'o2c|Shipment':        { table: 'o2c_shipment',        pk: 'shipment_id' },
	'o2c|ArInvoice':       { table: 'o2c_invoice',         pk: 'invoice_id' },
	'o2c|ARInvoice':       { table: 'o2c_invoice',         pk: 'invoice_id' },
	'o2c|ArPayment':       { table: 'o2c_payment',         pk: 'payment_id' },
	'o2c|ARPayment':       { table: 'o2c_payment',         pk: 'payment_id' },
	'p2p|Requisition':     { table: 'p2p_requisition',     pk: 'requisition_id' },
	'p2p|Supplier':        { table: 'p2p_supplier',        pk: 'supplier_id' },
	'p2p|PurchaseOrder':   { table: 'p2p_purchase_order',  pk: 'po_id' },
	'p2p|GoodsReceipt':    { table: 'p2p_goods_receipt',   pk: 'receipt_id' },
	'p2p|SupplierInvoice': { table: 'p2p_supplier_invoice',pk: 'supplier_invoice_id' },
	'p2p|ApPayment':       { table: 'p2p_ap_payment',      pk: 'ap_payment_id' },
	'p2p|APPayment':       { table: 'p2p_ap_payment',      pk: 'ap_payment_id' },
	'r2r|Ledger':          { table: 'r2r_ledger',          pk: 'ledger_id' },
	'r2r|Account':         { table: 'r2r_account',         pk: 'account_id' },
	'r2r|FiscalYear':      { table: 'r2r_fiscal_year',     pk: 'fiscal_year_id' },
	'r2r|FiscalPeriod':    { table: 'r2r_fiscal_period',   pk: 'fiscal_period_id' },
	'r2r|Journal':         { table: 'r2r_journal',         pk: 'journal_id' },
	'h2r|Employee':        { table: 'h2r_employee',        pk: 'employee_id' },
	'h2r|Position':        { table: 'h2r_position',        pk: 'position_id' },
	'h2r|Assignment':      { table: 'h2r_assignment',      pk: 'assignment_id' },
	'h2r|Credential':      { table: 'h2r_credential',      pk: 'credential_id' },
	'h2r|AuthorityRule':   { table: 'h2r_authority_rule',  pk: 'rule_id' }
};

const ID_LIMIT = 25;

interface QueryResponse {
	data: Record<string, unknown>[];
}

/**
 * Fetches live aggregate instance IDs for every entity type that has at least one
 * non-create action in the MCP catalog. The returned map key is `${lowercaseDomain}|${PascalCaseEntity}`.
 */
export async function fetchAggregateIds(
	functions: McpFunctionSummary[],
	actor: ActorContext
): Promise<Map<string, string[]>> {
	// Only fetch IDs for entity types that have non-create actions (others only appear via create paths).
	const pairs = new Set<string>();
	for (const fn of functions) {
		if (fn.domain && fn.entity && fn.action && fn.action !== 'create' && fn.operationType !== 'create') {
			pairs.add(`${fn.domain.toLowerCase()}|${fn.entity}`);
		}
	}

	const result = new Map<string, string[]>();

	await Promise.all(
		Array.from(pairs).map(async (key) => {
			const mapping = ENTITY_TABLE[key];
			if (!mapping) {
				console.warn(`[aggregates] Unknown aggregate lookup key: ${key}`);
				result.set(key, []);
				return;
			}

			try {
				const response = await fetchHubJson<QueryResponse>(
					`/api/hub/query/${mapping.table}?limit=${ID_LIMIT}`,
					actor
				);
				const ids = (response.data ?? [])
					.map((row) => {
						const val = row[mapping.pk];
						return typeof val === 'string' ? val : undefined;
					})
					.filter((id): id is string => id !== undefined);
				result.set(key, ids);
			} catch (error) {
				console.warn(`[aggregates] Failed to load aggregate IDs for ${key}: ${error instanceof Error ? error.message : 'unknown error'}`);
				result.set(key, []);
			}
		})
	);

	return result;
}
