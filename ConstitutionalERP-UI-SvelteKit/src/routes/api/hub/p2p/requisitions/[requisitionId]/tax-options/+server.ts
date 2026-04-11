import { proxyHubGet } from '$lib/server/hubProxy';

export async function GET({ params, request }: { params: { requisitionId: string }; request: Request }) {
	return proxyHubGet(`/p2p/requisitions/${params.requisitionId}/tax-options`, request.headers);
}