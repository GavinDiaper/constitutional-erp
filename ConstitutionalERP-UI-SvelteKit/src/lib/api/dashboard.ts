import { getO2CQuotes, type O2CQuote } from '$lib/api/quotes';
import { getO2CInvoices, type O2CInvoice } from '$lib/api/invoices';
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
	status?: string;
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
	status?: string;
}

interface CustomerRow {
	customer_id: string;
	state?: string;
	status?: string;
}

function normalizeLifecycleToken(value: string | undefined): string {
	return (value ?? '')
		.trim()
		.toLowerCase()
		.replace(/[\s_-]+/g, '');
}

export function isDraftQuote(quote: O2CQuote): boolean {
	return (quote.state ?? '').toLowerCase() === 'draft';
}

export function isApprovedPo(order: PurchaseOrderRow): boolean {
	return (order.state ?? '').toLowerCase() === 'approved';
}

export function isDraftRequisition(requisition: RequisitionRow): boolean {
	const lifecycle = normalizeLifecycleToken(requisition.state ?? requisition.status);
	return lifecycle === 'draft';
}

export function isSubmittedRequisition(requisition: RequisitionRow): boolean {
	const lifecycle = normalizeLifecycleToken(requisition.state ?? requisition.status);
	return ['submitted', 'pendingapproval', 'awaitingapproval', 'inreview'].includes(lifecycle);
}

export function isDraftCustomer(customer: CustomerRow): boolean {
	const lifecycle = normalizeLifecycleToken(customer.status ?? customer.state);
	return lifecycle === 'draft';
}

export function isPendingJournal(journal: JournalRow): boolean {
	const lifecycle = normalizeLifecycleToken(journal.state ?? journal.status);
	if (!lifecycle) {
		return true;
	}

	if (['posted', 'closed', 'locked', 'cancelled', 'canceled', 'reversed'].includes(lifecycle)) {
		return false;
	}

	return ['draft', 'pending', 'pendingapproval', 'awaitingapproval', 'readytopost', 'unposted'].includes(lifecycle);
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

export function isOpenInvoice(invoice: O2CInvoice): boolean {
	return (invoice.state ?? '').trim().toLowerCase() !== 'paid';
}

export async function getDashboardSummary(actor: ActorContext): Promise<DashboardSummary> {
	const [quoteResult, invoiceResult, requisitionResult, poResult, journalResult, employeeResult] = await Promise.all([
		getO2CQuotes(actor),
		getO2CInvoices(actor),
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
