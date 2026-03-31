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
}

export function isDraftQuote(quote: O2CQuote): boolean {
	return (quote.state ?? '').toLowerCase() === 'draft';
}

export function isApprovedPo(order: PurchaseOrderRow): boolean {
	return (order.state ?? '').toLowerCase() === 'approved';
}

export function isPendingJournal(journal: JournalRow): boolean {
	const state = (journal.state ?? '').toLowerCase();
	if (!state) {
		return true;
	}

	return !['posted', 'closed', 'locked'].includes(state);
}

export function isActiveEmployee(employee: EmployeeRow): boolean {
	return (employee.state ?? '').toLowerCase() === 'active';
}

export async function getDashboardSummary(actor: ActorContext): Promise<DashboardSummary> {
	const [quoteResult, poResult, journalResult, employeeResult] = await Promise.all([
		getO2CQuotes(actor),
		queryTable<PurchaseOrderRow>('p2p_purchase_order', actor),
		queryTable<JournalRow>('r2r_journal', actor),
		queryTable<EmployeeRow>('h2r_employee', actor)
	]);

	return {
		draftQuotes: (quoteResult.data ?? []).filter(isDraftQuote).length,
		approvedPos: (poResult.data ?? []).filter(isApprovedPo).length,
		pendingJournals: (journalResult.data ?? []).filter(isPendingJournal).length,
		activeEmployees: (employeeResult.data ?? []).filter(isActiveEmployee).length
	};
}
