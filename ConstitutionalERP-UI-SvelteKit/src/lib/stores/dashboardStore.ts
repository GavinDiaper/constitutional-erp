import { writable } from 'svelte/store';

export interface DashboardSummary {
	draftQuotes: number;
	approvedPos: number;
	pendingJournals: number;
	activeEmployees: number;
}

export const dashboardStore = writable<DashboardSummary>({
	draftQuotes: 11,
	approvedPos: 9,
	pendingJournals: 4,
	activeEmployees: 57
});
