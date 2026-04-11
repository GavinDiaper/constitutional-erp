import { proxyHubGet } from '$lib/server/hubProxy';

export async function GET({ params, request }: { params: { quoteId: string }; request: Request }) {
	return proxyHubGet(`/o2c/quotes/${params.quoteId}/tax-options`, request.headers);
}
