import { postHubJson } from '$lib/api/hub';
import type { ActorContext } from '$lib/stores/actorStore';

export interface OrderLineWbsMapping {
	orderLineId: string;
	orderId: string;
	projectId: string;
	contractVersionId: string;
	wbsId: string;
	wbsElementId: string;
}

export function convertServiceQuote(
	actor: ActorContext,
	quoteId: string,
	contractVersionId: string
): Promise<{ data: Record<string, unknown> }> {
	return postHubJson(`/api/hub/o2c/quotes/${encodeURIComponent(quoteId)}/convert`, actor, {
		contractVersionId
	});
}

export function assignOrderLineWbs(
	actor: ActorContext,
	orderId: string,
	orderLineId: string,
	payload: { projectId: string; wbsElementId: string }
): Promise<{ data: OrderLineWbsMapping }> {
	return postHubJson(
		`/api/hub/o2c/orders/${encodeURIComponent(orderId)}/lines/${encodeURIComponent(orderLineId)}/wbs-mapping`,
		actor,
		payload
	);
}