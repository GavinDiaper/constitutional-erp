import { getO2CQuotes, type O2CQuote } from '$lib/api/quotes';
import { queryTable } from '$lib/api/query';
import type { ActorContext } from '$lib/stores/actorStore';
import type { DashboardSummary } from '$lib/stores/dashboardStore';

interface PurchaseOrderRow {
	po_id: string;
	state?: string;
}

interface JournalRow {
	journal_id: string;
	state?: string;
}

interface EmployeeRow {
	employee_id: string;
	state?: string;
	status?: string;
	employment_status?: string;
	lifecycle_state?: string;
	process_state?: string;
	active?: boolean | number | string;
}

interface RequisitionRow {
	requisition_id: string;
	state?: string;
}

interface InvoiceRow {
	invoice_id: string;
	state?: string;
	amount_due?: number | string;
	amount_paid?: number | string;
}

export function isDraftQuote(quote: O2CQuote): boolean {
	return (quote.state ?? '').toLowerCase() === 'draft';
}

export function isApprovedPo(order: PurchaseOrderRow): boolean {
	return (order.state ?? '').toLowerCase() === 'approved';
}

export function isDraftRequisition(requisition: RequisitionRow): boolean {
	return (requisition.state ?? '').toLowerCase() === 'draft';
}

export function isSubmittedRequisition(requisition: RequisitionRow): boolean {
	return (requisition.state ?? '').toLowerCase() === 'submitted';
}

export function isPendingJournal(journal: JournalRow): boolean {
	const state = (journal.state ?? '').toLowerCase();
	if (!state) {
		return true;
	}

	return !['posted', 'closed', 'locked'].includes(state);
}

export function isActiveEmployee(employee: EmployeeRow): boolean {
	if (employee.active === true || employee.active === 1 || String(employee.active ?? '').toLowerCase() === 'true') {
		return true;
	}

	const candidateStates = [
		employee.state,
		employee.status,
		employee.employment_status,
		employee.lifecycle_state,
		employee.process_state
	]
		.filter((value): value is string => Boolean(value))
		.map((value) => value.trim().toLowerCase());

	return candidateStates.some((value) => ['active', 'activated', 'enabled'].includes(value));
}

export function isOpenInvoice(invoice: InvoiceRow): boolean {
	const state = (invoice.state ?? '').trim().toLowerCase();
	if (['cancelled', 'paid', 'reconciled', 'writtenoff', 'fullypaid'].includes(state)) {
		return false;
	}

	const amountDue = toNumber(invoice.amount_due);
	const amountPaid = toNumber(invoice.amount_paid);
	if (amountDue > 0) {
		return amountPaid < amountDue;
	}

	return true;
}

export async function getDashboardSummary(actor: ActorContext): Promise<DashboardSummary> {
	const [quoteResult, invoiceResult, requisitionResult, poResult, journalResult, employeeResult] = await Promise.all([
		getO2CQuotes(actor),
		queryTable<InvoiceRow>('o2c_invoice', actor),
		queryTable<RequisitionRow>('p2p_requisition', actor),
		queryTable<PurchaseOrderRow>('p2p_purchase_order', actor),
		queryTable<JournalRow>('r2r_journal', actor),
		queryTable<EmployeeRow>('h2r_employee', actor)
	]);

	return {
		draftQuotes: (quoteResult.data ?? []).filter(isDraftQuote).length,
		openInvoices: (invoiceResult.data ?? []).filter(isOpenInvoice).length,
		draftRequisitions: (requisitionResult.data ?? []).filter(isDraftRequisition).length,
		submittedRequisitions: (requisitionResult.data ?? []).filter(isSubmittedRequisition).length,
		approvedPos: (poResult.data ?? []).filter(isApprovedPo).length,
		pendingJournals: (journalResult.data ?? []).filter(isPendingJournal).length,
		activeEmployees: (employeeResult.data ?? []).filter(isActiveEmployee).length
	};
}

function toNumber(value: number | string | undefined): number {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}

	return 0;
}
