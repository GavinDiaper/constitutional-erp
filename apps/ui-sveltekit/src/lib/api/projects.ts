import type { ActorContext } from '$lib/stores/actorStore';
import type {
	Project,
	ProjectWIP,
	BomAssignment,
	LaborEntry,
	FinishedItem,
	ProjectRequisition,
	ProjectPurchaseOrder,
	ProjectSalesOrder,
	ProjectProcurementPreview,
	ProjectRequisitionGenerationResult
} from '$lib/types/projects';

interface DataResponse<T> {
	data: T;
}

interface DataListResponse<T> {
	data: T[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function unwrapData<T>(payload: unknown): T {
	const record = asRecord(payload);
	if (record && 'data' in record) {
		return record.data as T;
	}

	return payload as T;
}

function unwrapList<T>(payload: unknown): DataListResponse<T> {
	const data = unwrapData<unknown>(payload);
	if (Array.isArray(data)) {
		return { data: data as T[] };
	}

	return { data: [] };
}

/**
 * Create a new project in Draft status
 */
export function createProject(
	actor: ActorContext,
	payload: {
		projectId?: string;
		name: string;
		description?: string;
		projectType: 'Internal' | 'Capital' | 'Billable' | 'Service';
		customerId?: string;
		contractId?: string;
		wbsId?: string;
		budgetAmount: number;
		defaultWIPAccountId: string;
		defaultCloseAccountId: string;
		startDate: string;
		endDate?: string;
		projectManagerId: string;
		organizationId: string;
	}
): Promise<Project> {
	return requestHubJson<unknown>('/api/hub/proj', actor, 'POST', payload).then((response) =>
		unwrapData<Project>(response)
	);
}

/**
 * List all projects with optional pagination
 */
export function listProjects(
	actor: ActorContext,
	filters: { limit?: number; offset?: number } = {}
): Promise<DataListResponse<Project>> {
	const params = new URLSearchParams();
	if (filters.limit) {
		params.set('limit', String(filters.limit));
	}
	if (filters.offset) {
		params.set('offset', String(filters.offset));
	}
	const suffix = params.toString() ? `?${params.toString()}` : '';
	return requestHubJson<unknown>(`/api/hub/proj${suffix}`, actor, 'GET').then((response) =>
		unwrapList<Project>(response)
	);
}

/**
 * Retrieve a project by ID
 */
export function getProjectById(actor: ActorContext, projectId: string): Promise<DataResponse<Project>> {
	return requestHubJson<DataResponse<Project>>(`/api/hub/proj/${projectId}`, actor, 'GET');
}

/**
 * Retrieve Project WIP summary
 */
export function getProjectWIPSummary(
	actor: ActorContext,
	projectId: string
): Promise<DataResponse<ProjectWIP>> {
	return requestHubJson<DataResponse<ProjectWIP>>(`/api/hub/proj/${projectId}/wip`, actor, 'GET');
}

/**
 * Transition project from Draft → Active
 */
export function activateProject(actor: ActorContext, projectId: string): Promise<DataResponse<Project>> {
	return requestHubJson<DataResponse<Project>>(`/api/hub/proj/${projectId}/activate`, actor, 'POST');
}

/**
 * Transition project from Active → OnHold
 */
export function holdProject(
	actor: ActorContext,
	projectId: string,
	holdReason: string
): Promise<DataResponse<Project>> {
	return requestHubJson<DataResponse<Project>>(
		`/api/hub/proj/${projectId}/hold`,
		actor,
		'POST',
		{ holdReason }
	);
}

/**
 * Transition project from OnHold → Active
 */
export function resumeProject(actor: ActorContext, projectId: string): Promise<DataResponse<Project>> {
	return requestHubJson<DataResponse<Project>>(`/api/hub/proj/${projectId}/resume`, actor, 'POST');
}

/**
 * Transition project to Completed
 */
export function completeProject(
	actor: ActorContext,
	projectId: string,
	completionType: 'FG_Conversion' | 'Expense_Close',
	closeAccountId?: string
): Promise<DataResponse<Project>> {
	return requestHubJson<DataResponse<Project>>(
		`/api/hub/proj/${projectId}/complete`,
		actor,
		'POST',
		{ completionType, closeAccountId }
	);
}

/**
 * Transition project to Cancelled
 */
export function cancelProject(
	actor: ActorContext,
	projectId: string,
	cancellationReason: string,
	forceCancel?: boolean
): Promise<DataResponse<Project>> {
	return requestHubJson<DataResponse<Project>>(
		`/api/hub/proj/${projectId}/cancel`,
		actor,
		'POST',
		{ cancellationReason, forceCancel }
	);
}

/**
 * Assign a BOM to a project
 */
export function assignBomToProject(
	actor: ActorContext,
	projectId: string,
	payload: {
		bomId: string;
		wbsId?: string;
		quantityPlanned: number;
	}
): Promise<DataResponse<BomAssignment>> {
	return requestHubJson<DataResponse<BomAssignment>>(
		`/api/hub/proj/${projectId}/bom-assignments`,
		actor,
		'POST',
		payload
	);
}

/**
 * List all BOM assignments for a project
 */
export function listProjectBomAssignments(
	actor: ActorContext,
	projectId: string
): Promise<DataListResponse<BomAssignment>> {
	return requestHubJson<DataListResponse<BomAssignment>>(
		`/api/hub/proj/${projectId}/bom-assignments`,
		actor,
		'GET'
	);
}

/**
 * Post labor cost to a project
 */
export function postLaborCost(
	actor: ActorContext,
	projectId: string,
	payload: {
		wbsId?: string;
		resourceId: string;
		hours: number;
		rate: number;
		costElementId?: string;
	}
): Promise<DataResponse<LaborEntry>> {
	return requestHubJson<DataResponse<LaborEntry>>(
		`/api/hub/proj/${projectId}/labor-entries`,
		actor,
		'POST',
		payload
	);
}

/**
 * List labor entries for a project
 */
export function listLaborEntries(
	actor: ActorContext,
	projectId: string
): Promise<DataListResponse<LaborEntry>> {
	return requestHubJson<DataListResponse<LaborEntry>>(
		`/api/hub/proj/${projectId}/labor-entries`,
		actor,
		'GET'
	);
}

/**
 * Create a finished item from project WIP
 */
export function createProjectFinishedItem(
	actor: ActorContext,
	projectId: string,
	payload: {
		skuId: string;
		organizationId: string;
		quantity: number;
		unitCost?: number;
	}
): Promise<DataResponse<FinishedItem>> {
	return requestHubJson<DataResponse<FinishedItem>>(
		`/api/hub/proj/${projectId}/finished-items`,
		actor,
		'POST',
		payload
	);
}

/**
 * List finished items for a project
 */
export function listProjectFinishedItems(
	actor: ActorContext,
	projectId: string
): Promise<DataListResponse<FinishedItem>> {
	return requestHubJson<DataListResponse<FinishedItem>>(
		`/api/hub/proj/${projectId}/finished-items`,
		actor,
		'GET'
	);
}

export function listProjectRequisitions(
	actor: ActorContext,
	projectId: string
): Promise<DataListResponse<ProjectRequisition>> {
	return requestHubJson<DataListResponse<ProjectRequisition>>(
		`/api/hub/proj/${projectId}/requisitions`,
		actor,
		'GET'
	);
}

export function listProjectPurchaseOrders(
	actor: ActorContext,
	projectId: string
): Promise<DataListResponse<ProjectPurchaseOrder>> {
	return requestHubJson<DataListResponse<ProjectPurchaseOrder>>(
		`/api/hub/proj/${projectId}/purchase-orders`,
		actor,
		'GET'
	);
}

export function listProjectSalesOrders(
	actor: ActorContext,
	projectId: string
): Promise<DataListResponse<ProjectSalesOrder>> {
	return requestHubJson<DataListResponse<ProjectSalesOrder>>(
		`/api/hub/proj/${projectId}/sales-orders`,
		actor,
		'GET'
	);
}

export function getProjectProcurementPreview(
	actor: ActorContext,
	projectId: string
): Promise<DataResponse<ProjectProcurementPreview>> {
	return requestHubJson<DataResponse<ProjectProcurementPreview>>(
		`/api/hub/proj/${projectId}/procurement-preview`,
		actor,
		'GET'
	);
}

export function generateProjectRequisitionLines(
	actor: ActorContext,
	projectId: string,
	payload: {
		requisitionId?: string;
		requester?: string;
		department?: string;
		currencyCode?: string;
		neededByDate?: string;
		legalEntityId?: string;
	} = {}
): Promise<DataResponse<ProjectRequisitionGenerationResult>> {
	return requestHubJson<DataResponse<ProjectRequisitionGenerationResult>>(
		`/api/hub/proj/${projectId}/generate-requisition-lines`,
		actor,
		'POST',
		payload
	);
}

/**
 * Internal helper: requestHubJson
 * Handles authentication and error formatting for Hub JSON requests
 */
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
			const detail =
				typeof problem.detail === 'string'
					? problem.detail
					: typeof problem.error === 'string'
						? problem.error
						: typeof problem.message === 'string'
							? problem.message
							: `Request failed (${response.status})`;
			throw new Error(detail);
		}

		const detail = await response.text();
		throw new Error(detail || `Request failed (${response.status})`);
	}

	return (await response.json()) as T;
}
