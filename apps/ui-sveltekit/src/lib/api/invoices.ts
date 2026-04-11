import { fetchHubJson } from '$lib/api/hub';
import type { ActorContext } from '$lib/stores/actorStore';

export interface O2CInvoice {
	invoice_id: string;
	state?: string;
	order_id?: string;
	amount_due?: number | string;
	amount_paid?: number | string;
	currency_code?: string;
	_links?: Record<string, { href?: string; method?: string }>;
}

export function getO2CInvoices(actor: ActorContext): Promise<{ data: O2CInvoice[] }> {
	return fetchHubJson<{ data: O2CInvoice[] }>('/api/hub/o2c/invoices', actor);
}