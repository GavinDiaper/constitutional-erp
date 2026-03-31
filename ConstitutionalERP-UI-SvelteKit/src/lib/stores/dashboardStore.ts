import { writable } from 'svelte/store';

export interface DashboardSummary {
	draftQuotes: number;
	draftRequisitions: number;
	submittedRequisitions: number;
	approvedPos: number;
	pendingJournals: number;
	activeEmployees: number;
}

export const dashboardStore = writable<DashboardSummary>({
	draftQuotes: 0,
	draftRequisitions: 0,
	submittedRequisitions: 0,
	approvedPos: 0,
	pendingJournals: 0,
	activeEmployees: 0
});
