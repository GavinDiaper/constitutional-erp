import { fetchHubJson } from '$lib/api/hub';
import type { ActorContext } from '$lib/stores/actorStore';

export interface TrialBalanceRow {
	trial_balance_row_id: string;
	fiscal_period_id: string;
	account_id: string;
	debit_total: number;
	credit_total: number;
	created_at?: string;
}

export interface TrialBalanceResponse {
	data: TrialBalanceRow[];
}

export function getTrialBalance(fiscalPeriodId: string, actor: ActorContext): Promise<TrialBalanceResponse> {
	return fetchHubJson<TrialBalanceResponse>(`/api/hub/r2r/trial-balance/${fiscalPeriodId}`, actor);
}
