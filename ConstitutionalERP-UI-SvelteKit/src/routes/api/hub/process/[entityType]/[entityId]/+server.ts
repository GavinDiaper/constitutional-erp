import { proxyHubGet, proxyIhGet } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request }) => {
	const mappedRoute = mapEntityTypeToRoute(params.entityType, params.entityId);
	if (mappedRoute.startsWith('/process/')) {
		return proxyIhGet(mappedRoute, request.headers);
	}
	return proxyHubGet(mappedRoute, request.headers);
};

function mapEntityTypeToRoute(entityType: string, entityId: string): string {
	const routeByEntityType: Record<string, string> = {
		o2c_quote: `/process/quote/${entityId}`,
		o2c_sales_order: `/process/sales-order/${entityId}`,
		o2c_invoice: `/process/ar-invoice/${entityId}`,
		o2c_payment: `/process/ar-payment/${entityId}`,
		p2p_purchase_order: `/process/purchase-order/${entityId}`,
		p2p_requisition: `/process/requisition/${entityId}`,
		p2p_goods_receipt: `/process/goods-receipt/${entityId}`,
		p2p_supplier_invoice: `/process/supplier-invoice/${entityId}`,
		p2p_ap_payment: `/process/ap-payment/${entityId}`,
		p2p_supplier: `/process/supplier/${entityId}`,
		r2r_journal: `/process/journal/${entityId}`,
		h2r_employee: `/process/employee/${entityId}`,
		o2c_customer: `/o2c/customers/${entityId}`
	};

	return routeByEntityType[entityType] ?? `/process/${entityType}/${entityId}`;
}
