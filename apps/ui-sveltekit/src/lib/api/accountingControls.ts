import { fetchHubJson, postHubJson } from '$lib/api/hub';
import type { ActorContext } from '$lib/stores/actorStore';

export interface ContractorAccrual {
	accrualId: string;
	timesheetId: string;
	contractorId: string;
	supplierId: string | null;
	projectId: string;
	currency: string;
	accruedAmount: number;
	matchedAmount: number;
	availableAmount: number;
	status: string;
	glJournalId: string;
	supplierInvoiceId: string | null;
}

export interface SupplierInvoiceAccountingRow {
	supplier_invoice_id: string;
	supplier_id: string | null;
	state: string;
	amount_due: number;
	amount_paid: number;
	currency_code: string | null;
	accounting_journal_id: string | null;
	reversal_journal_id: string | null;
}

export interface ReconciliationCurrencyBalance {
	currencyCode: string;
	balance: number;
	documentCount: number;
}

export interface ReconciliationControl {
	accountCode: string;
	glBalance: number;
	ledgerCurrency: string;
	subledgerByCurrency: ReconciliationCurrencyBalance[];
	comparable: boolean;
	difference: number | null;
	foreignCurrencyDocumentCount: number;
}

export interface LedgerReconciliation {
	ledgerId: string;
	ledgerName: string;
	legalEntityId: string | null;
	legalEntityName: string | null;
	currencyCode: string;
	accountsReceivable: ReconciliationControl;
	accountsPayable: ReconciliationControl;
	unbilledReceivables: ReconciliationControl;
}

export interface TaxTransactionLine {
	taxable_amount: number;
	tax_amount: number;
}

export function getContractorAccruals(actor: ActorContext) {
	return fetchHubJson<{ data: ContractorAccrual[] }>('/api/hub/timesheets/contractor-accruals', actor);
}

export function matchContractorAccruals(
	actor: ActorContext,
	supplierInvoiceId: string,
	allocations: Array<{ accrualId: string; amount: number }>
) {
	return postHubJson<{ supplier_invoice_id: string }>(
		`/api/hub/p2p/supplier-invoices/${encodeURIComponent(supplierInvoiceId)}/timesheet-accruals`,
		actor,
		{ allocations }
	);
}

export function getArApReconciliation(actor: ActorContext) {
	return fetchHubJson<{ data: LedgerReconciliation[] }>('/api/hub/r2r/reconciliation/ar-ap', actor);
}

export function getInvoiceTaxLines(actor: ActorContext, supplierInvoiceId: string) {
	return fetchHubJson<{ data: TaxTransactionLine[] }>(
		`/api/hub/r2r/tax/transaction-lines/${encodeURIComponent(supplierInvoiceId)}`,
		actor
	);
}

export function cancelSupplierInvoice(actor: ActorContext, supplierInvoiceId: string) {
	return postHubJson<SupplierInvoiceAccountingRow>(
		`/api/hub/p2p/supplier-invoices/${encodeURIComponent(supplierInvoiceId)}/cancel`,
		actor,
		{}
	);
}