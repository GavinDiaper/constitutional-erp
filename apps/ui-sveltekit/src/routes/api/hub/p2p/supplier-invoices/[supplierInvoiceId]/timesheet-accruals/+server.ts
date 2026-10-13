import { proxyHubRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
	const body = await request.json();
	return proxyHubRequest(
		`/p2p/supplier-invoices/${encodeURIComponent(params.supplierInvoiceId)}/timesheet-accruals`,
		request.headers,
		'POST',
		body
	);
};