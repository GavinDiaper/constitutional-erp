import { proxyHubGet } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request }) => {
	const mappedRoute = mapEntityTypeToRoute(params.entityType, params.entityId);
	return proxyHubGet(mappedRoute, request.headers);
};

function mapEntityTypeToRoute(entityType: string, entityId: string): string {
	const routeByEntityType: Record<string, string> = {
		o2c_quote: `/o2c/quotes/${entityId}`,
		o2c_customer: `/o2c/customers/${entityId}`,
		o2c_sales_order: `/o2c/orders/${entityId}`,
		o2c_invoice: `/o2c/invoices/${entityId}`,
		o2c_payment: `/o2c/payments/${entityId}`,
		p2p_purchase_order: `/p2p/purchase-orders/${entityId}`,
		p2p_requisition: `/p2p/requisitions/${entityId}`,
		p2p_supplier: `/p2p/suppliers/${entityId}`,
		r2r_journal: `/r2r/journals/${entityId}`,
		h2r_employee: `/h2r/employees/${entityId}`
	};

	return routeByEntityType[entityType] ?? `/process/${entityType}/${entityId}`;
}
