import type { ActorContext } from '$lib/stores/actorStore';

export interface InventorySku {
	sku_id: string;
	sku_code: string;
	description: string;
	category?: string | null;
	uom: string;
	valuation_method: 'standard' | 'moving_average';
	standard_cost: number;
}

export interface InventoryOrganization {
	organization_id: string;
	name: string;
	ledger_id?: string | null;
	inventory_asset_account_code: string;
	cogs_account_code: string;
}

export interface InventoryOnHand {
	on_hand_id: string;
	sku_id: string;
	organization_id: string;
	quantity_on_hand: number;
	inventory_value: number;
	moving_average_cost: number;
	updated_at: string;
}

export interface InventoryMovement {
	movement_id: string;
	sku_id: string;
	organization_id: string;
	movement_type: 'receipt' | 'issue' | 'adjustment' | 'cost_update';
	quantity: number;
	unit_cost: number;
	total_cost: number;
	reason?: string | null;
	reference_type?: string | null;
	reference_id?: string | null;
	correlation_key?: string | null;
	created_at: string;
}

export interface InventoryBomHeader {
	bomId: string;
	skuId: string;
	organizationId: string;
	revision: string;
	description?: string;
	status: 'Draft' | 'Active' | 'Inactive';
	projectEligible: boolean;
	costingProfile: string;
	createdBy: string;
	createdAt: string;
	effectiveDate?: string;
	endDate?: string;
	version: number;
}

export interface InventoryBomComponent {
	componentId: string;
	bomId: string;
	componentSkuId?: string;
	componentLineNumber: number;
	componentDescription?: string;
	componentType: 'Material' | 'LaborCostElement' | 'OtherCostElement';
	quantity: number;
	quantityUom: string;
	scrapPercentage: number;
	isPhantom: boolean;
	standardCost: number;
	costElementId?: string;
	createdBy: string;
	createdAt: string;
	version: number;
}

interface DataResponse<T> {
	data: T;
}

interface DataListResponse<T> {
	data: T[];
}

export function listInventorySkus(actor: ActorContext): Promise<DataListResponse<InventorySku>> {
	return requestHubJson<DataListResponse<InventorySku>>('/api/hub/inv/skus', actor, 'GET');
}

export function createInventorySku(
	actor: ActorContext,
	payload: {
		skuCode: string;
		description: string;
		category?: string;
		uom: string;
		valuationMethod: 'standard' | 'moving_average';
		standardCost?: number;
	}
): Promise<InventorySku> {
	return requestHubJson<InventorySku>('/api/hub/inv/skus', actor, 'POST', payload);
}

export function listInventoryOrganizations(actor: ActorContext): Promise<DataListResponse<InventoryOrganization>> {
	return requestHubJson<DataListResponse<InventoryOrganization>>('/api/hub/inv/organizations', actor, 'GET');
}

export function createInventoryOrganization(
	actor: ActorContext,
	payload: { name: string; ledgerId?: string }
): Promise<InventoryOrganization> {
	return requestHubJson<InventoryOrganization>('/api/hub/inv/organizations', actor, 'POST', payload);
}

export function listInventoryOnHand(
	actor: ActorContext,
	filters: { skuId?: string; organizationId?: string } = {}
): Promise<DataListResponse<InventoryOnHand>> {
	const params = new URLSearchParams();
	if (filters.skuId) {
		params.set('skuId', filters.skuId);
	}
	if (filters.organizationId) {
		params.set('organizationId', filters.organizationId);
	}
	const suffix = params.toString() ? `?${params.toString()}` : '';
	return requestHubJson<DataListResponse<InventoryOnHand>>(`/api/hub/inv/on-hand${suffix}`, actor, 'GET');
}

export function listInventoryMovements(actor: ActorContext): Promise<DataListResponse<InventoryMovement>> {
	return requestHubJson<DataListResponse<InventoryMovement>>('/api/hub/inv/movements', actor, 'GET');
}

export function postInventoryMovement(
	actor: ActorContext,
	payload: {
		skuId: string;
		organizationId: string;
		movementType: 'receipt' | 'issue' | 'adjustment' | 'cost_update';
		quantity: number;
		unitCost?: number;
		reason?: string;
		referenceType?: string;
		referenceId?: string;
		correlationKey?: string;
	}
): Promise<InventoryMovement> {
	return requestHubJson<InventoryMovement>('/api/hub/inv/movements', actor, 'POST', payload);
}

export function listInventoryBoms(
	actor: ActorContext,
	filters: { organizationId: string; limit?: number; offset?: number }
): Promise<DataListResponse<InventoryBomHeader>> {
	const params = new URLSearchParams();
	params.set('organizationId', filters.organizationId);
	if (typeof filters.limit === 'number') {
		params.set('limit', String(filters.limit));
	}
	if (typeof filters.offset === 'number') {
		params.set('offset', String(filters.offset));
	}
	return requestHubJson<DataListResponse<InventoryBomHeader>>(`/api/hub/inv/boms?${params.toString()}`, actor, 'GET');
}

export function createInventoryBom(
	actor: ActorContext,
	payload: {
		skuId: string;
		organizationId: string;
		revision: string;
		description?: string;
		projectEligible?: boolean;
		costingProfile?: string;
		effectiveDate?: string;
		endDate?: string;
	}
): Promise<DataResponse<InventoryBomHeader>> {
	return requestHubJson<DataResponse<InventoryBomHeader>>('/api/hub/inv/boms', actor, 'POST', payload);
}

export function listInventoryBomComponents(
	actor: ActorContext,
	bomId: string
): Promise<DataListResponse<InventoryBomComponent>> {
	return requestHubJson<DataListResponse<InventoryBomComponent>>(
		`/api/hub/inv/boms/${encodeURIComponent(bomId)}/components`,
		actor,
		'GET'
	);
}

export function createInventoryBomComponent(
	actor: ActorContext,
	bomId: string,
	payload: {
		componentSkuId: string;
		componentLineNumber?: number;
		componentDescription?: string;
		quantity: number;
		quantityUom: string;
		scrapPercentage?: number;
		isPhantom?: boolean;
		standardCost?: number;
		costElementId?: string;
	}
): Promise<DataResponse<InventoryBomComponent>> {
	return requestHubJson<DataResponse<InventoryBomComponent>>(
		`/api/hub/inv/boms/${encodeURIComponent(bomId)}/components`,
		actor,
		'POST',
		payload
	);
}

async function requestHubJson<T>(
	path: string,
	actor: ActorContext,
	method: 'GET' | 'POST',
	body?: unknown
): Promise<T> {
	const response = await fetch(path, {
		method,
		headers: {
			'x-actor-id': actor.actorId,
			'x-actor-tier': String(actor.authorityTier),
			...(method === 'POST' ? { 'content-type': 'application/json' } : {})
		},
		body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined
	});

	if (!response.ok) {
		const contentType = response.headers.get('content-type') ?? '';
		if (contentType.includes('application/json')) {
			const problem = (await response.json()) as Record<string, unknown>;
			const detail = typeof problem.detail === 'string' ? problem.detail : `Request failed (${response.status})`;
			throw new Error(detail);
		}

		const detail = await response.text();
		throw new Error(detail || `Request failed (${response.status})`);
	}

	return (await response.json()) as T;
}
