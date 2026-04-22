import { fetchHubJson } from '$lib/api/hub';
import type { ActorContext } from '$lib/stores/actorStore';

export interface O2CQuote {
	quote_id: string;
	state: string;
	customer_id?: string;
	project_id?: string;
	total_amount?: number;
	currency_code?: string;
	_links?: Record<string, { href?: string; method?: string }>;
}

export function getO2CQuotes(actor: ActorContext): Promise<{ data: O2CQuote[] }> {
	return fetchHubJson<{ data: O2CQuote[] }>('/api/hub/o2c/quotes', actor);
}
