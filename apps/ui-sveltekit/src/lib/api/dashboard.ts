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
	requester?: string;
	created_at?: string;
}

interface CustomerRow {
	customer_id: string;
	state?: string;
	status?: string;
	customer_name?: string;
	email?: string;
	created_at?: string;
}

interface ApprovalJournalRow extends JournalRow {
	description?: string;
	created_at?: string;
	fiscal_period_id?: string;
	period_id?: string;
	fiscal_period?: string;
}

export interface ApprovalAttentionItem {
	id: string;
	entityType: 'o2c_customer' | 'p2p_requisition' | 'r2r_journal';
	ownerLabel: string;
	stateLabel: string;
	createdAt: string;
}

function normalizeLifecycleToken(value: string | undefined): string {
	return (value ?? '')
		.trim()
		.toLowerCase()
		.replace(/[\s_-]+/g, '');
}

function normalizeLabel(value: string): string {
	return value
		.trim()
		.replace(/[_-]+/g, ' ')
		.toLowerCase()
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

function sortByCreatedAtDesc(left: string, right: string): number {
	const leftTime = Date.parse(left);
	const rightTime = Date.parse(right);

	if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
		return 0;
	}

	if (Number.isNaN(leftTime)) {
		return 1;
	}

	if (Number.isNaN(rightTime)) {
		return -1;
	}

	return rightTime - leftTime;
}

export async function getApprovalAttentionItems(actor: ActorContext, limit = 12): Promise<ApprovalAttentionItem[]> {
	const [customerResult, requisitionResult, journalResult] = await Promise.all([
		queryTable<CustomerRow>('o2c_customer', actor),
		queryTable<RequisitionRow>('p2p_requisition', actor),
		queryTable<ApprovalJournalRow>('r2r_journal', actor)
	]);

	const customerActivations = (customerResult.data ?? [])
		.filter(isDraftCustomer)
		.map((customer) => ({
			id: customer.customer_id,
			entityType: 'o2c_customer' as const,
			ownerLabel: customer.customer_name || customer.email || 'n/a',
			stateLabel: normalizeLabel(customer.status || customer.state || 'Draft'),
			createdAt: customer.created_at ?? ''
		}));

	const submittedRequisitions = (requisitionResult.data ?? [])
		.filter(isSubmittedRequisition)
		.map((requisition) => ({
			id: requisition.requisition_id,
			entityType: 'p2p_requisition' as const,
			ownerLabel: requisition.requester ?? 'n/a',
			stateLabel: normalizeLabel(requisition.state || requisition.status || 'Submitted'),
			createdAt: requisition.created_at ?? ''
		}));

	const pendingJournals = (journalResult.data ?? [])
		.filter(isPendingJournal)
		.map((journal) => ({
			id: journal.journal_id,
			entityType: 'r2r_journal' as const,
			ownerLabel: journal.description || journal.fiscal_period_id || journal.period_id || journal.fiscal_period || 'n/a',
			stateLabel: normalizeLabel(journal.state || journal.status || 'Pending'),
			createdAt: journal.created_at ?? ''
		}));

	return [...customerActivations, ...submittedRequisitions, ...pendingJournals]
		.sort((a, b) => sortByCreatedAtDesc(a.createdAt, b.createdAt))
		.slice(0, limit);
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
