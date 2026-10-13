import { proxyHubRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
	return proxyHubRequest(
		`/p2p/supplier-invoices/${encodeURIComponent(params.supplierInvoiceId)}/cancel`,
		request.headers,
		'POST',
		{}
	);
};