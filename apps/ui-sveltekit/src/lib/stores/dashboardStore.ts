import { writable } from 'svelte/store';

export interface DashboardSummary {
	draftQuotes: number;
	openInvoices: number;
	draftRequisitions: number;
	submittedRequisitions: number;
	approvedPos: number;
	pendingJournals: number;
	activeEmployees: number;
	draftProjects: number;
	activeProjects: number;
	completedProjects: number;
}

export const dashboardStore = writable<DashboardSummary>({
	draftQuotes: 0,
	openInvoices: 0,
	draftRequisitions: 0,
	submittedRequisitions: 0,
	approvedPos: 0,
	pendingJournals: 0,
	activeEmployees: 0,
	draftProjects: 0,
	activeProjects: 0,
	completedProjects: 0
});
